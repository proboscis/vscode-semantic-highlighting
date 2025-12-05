import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getRustBinaryPath, analyzeFile, analyzeSource, HighlighterOutput } from './highlighter';
import { createDecorations, clearDecorationCache, DecorationEntry } from './colors';
import { SettingsPanel } from './settingsPanel';

let outputChannel: vscode.OutputChannel;
let binaryPath: string;
let decorationCache: Map<string, vscode.TextEditorDecorationType>;
let pendingDecorations: Map<string, DecorationEntry[]>;
let debounceTimers: Map<string, NodeJS.Timeout>;

function getConfig() {
  return vscode.workspace.getConfiguration('pythonSemanticHighlighter');
}

function isEnabled(): boolean {
  return getConfig().get('enable', true);
}

function getDebounceMs(): number {
  return getConfig().get('debounceMs', 150);
}

async function highlightDocument(
  document: vscode.TextDocument,
  editor: vscode.TextEditor
): Promise<void> {
  if (!isEnabled()) {
    return;
  }

  if (document.languageId !== 'python') {
    return;
  }

  const filePath = document.uri.fsPath;
  const documentKey = document.uri.toString();
  const isNotebookCell = document.uri.scheme === 'vscode-notebook-cell';
  const isUntitled = document.isUntitled;
  const fileExists = !isNotebookCell && !isUntitled && fs.existsSync(filePath);

  outputChannel.appendLine(`Analyzing: ${isNotebookCell ? 'notebook cell' : filePath}`);
  const startTime = Date.now();

  try {
    let result: HighlighterOutput | null;
    
    if (fileExists) {
      // File exists on disk - use file path
      result = await analyzeFile(filePath, binaryPath);
    } else {
      // Notebook cell, untitled, or unsaved - use document content via stdin
      const source = document.getText();
      if (!source.trim()) {
        return; // Empty document
      }
      result = await analyzeSource(source, binaryPath);
    }
    
    if (!result) {
      outputChannel.appendLine(`Analysis failed for ${isNotebookCell ? 'notebook cell' : filePath}`);
      return;
    }

    const elapsed = Date.now() - startTime;
    outputChannel.appendLine(`Analysis completed in ${elapsed}ms, found ${result.symbols.length} symbols`);

    // Cache the result
    analysisCache.set(documentKey, { result, timestamp: Date.now() });

    // Apply decorations to ALL visible editors showing this document
    for (const visibleEditor of vscode.window.visibleTextEditors) {
      if (visibleEditor.document.uri.toString() === documentKey) {
        applyDecorations(visibleEditor, result);
      }
    }
  } catch (error) {
    outputChannel.appendLine(`Error analyzing ${isNotebookCell ? 'notebook cell' : filePath}: ${error}`);
  }
}

function applyDecorations(
  editor: vscode.TextEditor,
  result: HighlighterOutput
): void {
  const documentKey = editor.document.uri.toString();

  // Clear previous decorations for this document
  const prevDecorations = pendingDecorations.get(documentKey);
  if (prevDecorations) {
    for (const entry of prevDecorations) {
      editor.setDecorations(entry.decorationType, []);
    }
  }

  // Create new decorations
  const decorations = createDecorations(result.symbols, decorationCache);
  pendingDecorations.set(documentKey, decorations);

  // Apply decorations
  for (const entry of decorations) {
    editor.setDecorations(entry.decorationType, entry.ranges);
  }

  outputChannel.appendLine(`Applied ${decorations.length} decoration types`);
}

function scheduleHighlight(document: vscode.TextDocument): void {
  const key = document.uri.toString();
  
  // Clear existing timer
  const existingTimer = debounceTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Schedule new highlight
  const timer = setTimeout(() => {
    debounceTimers.delete(key);
    // Apply to ALL visible editors showing this document (handles split views, peek)
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === key) {
        highlightDocument(document, editor);
      }
    }
  }, getDebounceMs());

  debounceTimers.set(key, timer);
}

// Cache for analysis results to avoid re-analyzing for multiple editors
let analysisCache: Map<string, { result: HighlighterOutput; timestamp: number }> = new Map();
const CACHE_TTL_MS = 5000; // 5 seconds

async function highlightEditorIfNeeded(editor: vscode.TextEditor): Promise<void> {
  if (!isEnabled()) {
    return;
  }

  const document = editor.document;
  if (document.languageId !== 'python') {
    return;
  }

  const key = document.uri.toString();
  
  // Check if we have cached analysis results
  const cached = analysisCache.get(key);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    // Use cached results
    applyDecorations(editor, cached.result);
    return;
  }

  // No cache or expired, schedule a highlight
  scheduleHighlight(document);
}

function clearDocumentDecorations(documentUri: string): void {
  const editor = vscode.window.visibleTextEditors.find(
    e => e.document.uri.toString() === documentUri
  );
  
  const decorations = pendingDecorations.get(documentUri);
  if (decorations && editor) {
    for (const entry of decorations) {
      editor.setDecorations(entry.decorationType, []);
    }
  }
  pendingDecorations.delete(documentUri);
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Python Semantic Highlighter');
  outputChannel.appendLine('Python Semantic Highlighter activating...');

  // Initialize state
  decorationCache = new Map();
  pendingDecorations = new Map();
  debounceTimers = new Map();

  // Get binary path
  binaryPath = getRustBinaryPath(context);
  outputChannel.appendLine(`Using binary: ${binaryPath}`);

  // Check if binary exists
  if (!fs.existsSync(binaryPath)) {
    const message = `Rust binary not found at ${binaryPath}. Please run 'cargo build --release' in rust-highlighter directory.`;
    outputChannel.appendLine(message);
    vscode.window.showWarningMessage(message);
  }

  // Register event handlers
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === 'python') {
        scheduleHighlight(editor.document);
      }
    })
  );

  // Handle visible editors change (for peek definition, split editors, etc.)
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      for (const editor of editors) {
        if (editor.document.languageId === 'python') {
          // Apply decorations to all visible Python editors
          highlightEditorIfNeeded(editor);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'python') {
        scheduleHighlight(event.document);
      }
    })
  );

  // Handle notebook cell changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeNotebookDocument((event) => {
      // Re-highlight all Python cells in the notebook when cells change
      for (const cell of event.notebook.getCells()) {
        if (cell.document.languageId === 'python') {
          const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === cell.document.uri.toString()
          );
          if (editor) {
            scheduleHighlight(cell.document);
          }
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === 'python') {
        // Immediate highlight on save
        const editor = vscode.window.visibleTextEditors.find(
          e => e.document.uri.toString() === document.uri.toString()
        );
        if (editor) {
          highlightDocument(document, editor);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      const key = document.uri.toString();
      clearDocumentDecorations(key);
      const timer = debounceTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(key);
      }
    })
  );

  // Configuration change handler
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('pythonSemanticHighlighter')) {
        outputChannel.appendLine('Configuration changed, refreshing decorations...');
        
        // First, clear all decorations from editors BEFORE disposing decoration types
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document.languageId === 'python') {
            const documentKey = editor.document.uri.toString();
            const prevDecorations = pendingDecorations.get(documentKey);
            if (prevDecorations) {
              for (const entry of prevDecorations) {
                editor.setDecorations(entry.decorationType, []);
              }
            }
          }
        }
        
        // Now safe to clear caches
        clearDecorationCache(decorationCache);
        analysisCache.clear();
        pendingDecorations.clear();
        
        // Re-highlight all visible Python editors
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document.languageId === 'python') {
            if (isEnabled()) {
              outputChannel.appendLine(`Re-highlighting: ${editor.document.uri.fsPath}`);
              highlightDocument(editor.document, editor);
            } else {
              clearDocumentDecorations(editor.document.uri.toString());
            }
          }
        }
      }
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('pythonSemanticHighlighter.refresh', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'python') {
        highlightDocument(editor.document, editor);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pythonSemanticHighlighter.toggle', () => {
      const config = getConfig();
      const current = config.get('enable', true);
      config.update('enable', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Python Semantic Highlighter: ${!current ? 'Enabled' : 'Disabled'}`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pythonSemanticHighlighter.openSettings', () => {
      SettingsPanel.createOrShow(context.extensionUri);
    })
  );

  // Highlight currently active Python editor
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && activeEditor.document.languageId === 'python') {
    scheduleHighlight(activeEditor.document);
  }

  // Highlight all visible Python editors (including notebook cells)
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.languageId === 'python') {
      scheduleHighlight(editor.document);
    }
  }

  // Highlight all open notebook Python cells
  for (const notebook of vscode.workspace.notebookDocuments) {
    for (const cell of notebook.getCells()) {
      if (cell.document.languageId === 'python') {
        const editor = vscode.window.visibleTextEditors.find(
          e => e.document.uri.toString() === cell.document.uri.toString()
        );
        if (editor) {
          scheduleHighlight(cell.document);
        }
      }
    }
  }

  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('Python Semantic Highlighter activated');
}

export function deactivate() {
  // Clear all timers
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();

  // Clear all decorations
  clearDecorationCache(decorationCache);
  pendingDecorations.clear();
}
