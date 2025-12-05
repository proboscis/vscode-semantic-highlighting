import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getRustBinaryPath, analyzeFile, HighlighterOutput } from './highlighter';
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
  
  // Check if file exists on disk (not untitled)
  if (!fs.existsSync(filePath)) {
    outputChannel.appendLine(`Skipping unsaved file: ${filePath}`);
    return;
  }

  outputChannel.appendLine(`Analyzing: ${filePath}`);
  const startTime = Date.now();

  try {
    const result = await analyzeFile(filePath, binaryPath);
    
    if (!result) {
      outputChannel.appendLine(`Analysis failed for ${filePath}`);
      return;
    }

    const elapsed = Date.now() - startTime;
    outputChannel.appendLine(`Analysis completed in ${elapsed}ms, found ${result.symbols.length} symbols`);

    // Apply decorations
    applyDecorations(editor, result);
  } catch (error) {
    outputChannel.appendLine(`Error analyzing ${filePath}: ${error}`);
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
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === key
    );
    if (editor) {
      highlightDocument(document, editor);
    }
  }, getDebounceMs());

  debounceTimers.set(key, timer);
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

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'python') {
        scheduleHighlight(event.document);
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
        // Clear decoration cache to force recreation with new colors
        clearDecorationCache(decorationCache);
        
        // Re-highlight all visible Python editors
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document.languageId === 'python') {
            if (isEnabled()) {
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

  // Highlight all visible Python editors
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.languageId === 'python') {
      scheduleHighlight(editor.document);
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
