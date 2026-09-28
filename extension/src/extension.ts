import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getRustBinaryPath, analyzeSource, sourceLanguageOf, HighlighterOutput, SourceLanguage } from './highlighter';
import { colorSymbols, createDecorations, clearDecorationCache, clearExcludedHueRangesCache, clearBuiltinsCache, setDebugOutputChannel, getExcludedHueRangesDebug, DecorationEntry } from './colors';
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

  const language = sourceLanguageOf(document);
  if (language === undefined) {
    return;
  }

  const filePath = document.uri.fsPath;
  const documentKey = document.uri.toString();
  const isNotebookCell = document.uri.scheme === 'vscode-notebook-cell';

  outputChannel.appendLine(`Analyzing: ${isNotebookCell ? 'notebook cell' : filePath}`);
  const startTime = Date.now();

  try {
    // Always use document.getText() to get the current editor content
    // This ensures unsaved changes are analyzed correctly
    const source = document.getText();
    if (!source.trim()) {
      return; // Empty document
    }
    const result = await analyzeSource(source, binaryPath, language);
    
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
  if (sourceLanguageOf(document) === undefined) {
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

/** One colored symbol occurrence returned by the public API (line / column in UTF-16 code units, like vscode.Position). */
export interface ColoredSpan {
  line: number;
  column: number;
  length: number;
  color: string;
}

/**
 * The public API returned from activate — lets another extension (doeff-runner's reading view) show source with exactly the
 * colors this extension paints in the editor: same analyzer, same settings, same whole-file round-robin order.
 */
export interface SemanticHighlighterApi {
  readonly apiVersion: 1;
  /** Colors of `source` as a whole file, or null when highlighting is disabled, the language is not handled, or analysis fails. */
  colorize(source: string, languageId: string): Promise<ColoredSpan[] | null>;
}

/** The analyzer language for a VS Code language id (the same mapping the editor uses through sourceLanguageOf). */
function analyzerLanguage(languageId: string): SourceLanguage | undefined {
  switch (languageId) {
    case 'python':
      return 'python';
    case 'hy':
      return 'hy';
    default:
      return undefined;
  }
}

/** Colorize a whole source for the public API (what applyDecorations would paint for the same text). */
async function colorize(source: string, languageId: string): Promise<ColoredSpan[] | null> {
  const language = analyzerLanguage(languageId);
  if (!isEnabled() || language === undefined || !source.trim()) {
    return null;
  }
  const result = await analyzeSource(source, binaryPath, language);
  if (!result) {
    return null;
  }
  const spans: ColoredSpan[] = [];
  for (const [color, occurrences] of colorSymbols(result.symbols)) {
    for (const occ of occurrences) {
      spans.push({ line: occ.line, column: occ.column, length: occ.length, color });
    }
  }
  return spans;
}

export function activate(context: vscode.ExtensionContext): SemanticHighlighterApi {
  outputChannel = vscode.window.createOutputChannel('Python Semantic Highlighter');
  outputChannel.appendLine('Python Semantic Highlighter activating...');
  
  // Set debug output channel for colors module
  setDebugOutputChannel(outputChannel);

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
  } else {
    // Ensure binary has execute permission on Unix systems
    if (process.platform !== 'win32') {
      try {
        const stats = fs.statSync(binaryPath);
        const mode = stats.mode;
        // Check if executable bit is set (user execute = 0o100)
        if ((mode & 0o100) === 0) {
          outputChannel.appendLine('Adding execute permission to binary...');
          fs.chmodSync(binaryPath, mode | 0o755);
          outputChannel.appendLine('Execute permission added successfully');
        }
      } catch (err) {
        outputChannel.appendLine(`Warning: Could not set execute permission: ${err}`);
      }
    }
  }

  // Register event handlers
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && sourceLanguageOf(editor.document) !== undefined) {
        scheduleHighlight(editor.document);
      }
    })
  );

  // Handle visible editors change (for peek definition, split editors, etc.)
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      for (const editor of editors) {
        if (sourceLanguageOf(editor.document) !== undefined) {
          // Apply decorations to all visible Python editors
          highlightEditorIfNeeded(editor);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (sourceLanguageOf(event.document) !== undefined) {
        scheduleHighlight(event.document);
      }
    })
  );

  // Handle notebook cell changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeNotebookDocument((event) => {
      // Re-highlight all Python cells in the notebook when cells change
      for (const cell of event.notebook.getCells()) {
        if (sourceLanguageOf(cell.document) !== undefined) {
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
      if (sourceLanguageOf(document) !== undefined) {
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
          if (sourceLanguageOf(editor.document) !== undefined) {
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
        clearExcludedHueRangesCache();
        clearBuiltinsCache();
        analysisCache.clear();
        pendingDecorations.clear();
        
        // Re-highlight all visible Python editors
        for (const editor of vscode.window.visibleTextEditors) {
          if (sourceLanguageOf(editor.document) !== undefined) {
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
      if (editor && sourceLanguageOf(editor.document) !== undefined) {
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

  context.subscriptions.push(
    vscode.commands.registerCommand('pythonSemanticHighlighter.debugExclusion', () => {
      const debug = getExcludedHueRangesDebug();
      outputChannel.show();
      outputChannel.appendLine('');
      outputChannel.appendLine('=== Hue Exclusion Debug Info ===');
      outputChannel.appendLine('');
      outputChannel.appendLine('Settings:');
      outputChannel.appendLine(`  Theme keyword hues: ${JSON.stringify(debug.themeKeywordHues)} (±${debug.themeKeywordHueRange}°)`);
      outputChannel.appendLine(`  Manual excluded ranges: ${JSON.stringify(debug.manualRanges)}`);
      outputChannel.appendLine(`  Exclude keyword hues: ${debug.excludeKeywordHues}`);
      if (debug.excludeKeywordHues && Object.keys(debug.keywordColors).length > 0) {
        outputChannel.appendLine(`  Keyword colors: ${JSON.stringify(debug.keywordColors)} (±${debug.keywordHueExclusionRange}°)`);
      }
      outputChannel.appendLine('');
      outputChannel.appendLine(`Final computed exclusion ranges: ${JSON.stringify(debug.ranges)}`);
      if (debug.ranges.length === 0) {
        outputChannel.appendLine('');
        outputChannel.appendLine('⚠️  WARNING: No exclusion ranges configured!');
        outputChannel.appendLine('   To exclude hues, set one of:');
        outputChannel.appendLine('   - themeKeywordHues: Add hue values (0-360) for your theme\'s keyword colors');
        outputChannel.appendLine('   - excludedHueRanges: Manually specify ranges like [[20,60], [200,240]]');
        outputChannel.appendLine('   - keywordColors: Set custom keyword colors (auto-excludes their hues)');
      }
      outputChannel.appendLine('');
      outputChannel.appendLine('Sample hues for first 10 variables (with full hue range [0,360]):');
      for (const sample of debug.sampleHues) {
        const status = sample.excluded ? '(raw hue was excluded, skipped)' : '';
        outputChannel.appendLine(`  Variable ${sample.index}: hue ${sample.hue}° ${status}`);
      }
      outputChannel.appendLine('');
      outputChannel.appendLine('================================');
    })
  );

  // Highlight currently active Python editor
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && sourceLanguageOf(activeEditor.document) !== undefined) {
    scheduleHighlight(activeEditor.document);
  }

  // Highlight all visible Python editors (including notebook cells)
  for (const editor of vscode.window.visibleTextEditors) {
    if (sourceLanguageOf(editor.document) !== undefined) {
      scheduleHighlight(editor.document);
    }
  }

  // Highlight all open notebook Python cells
  for (const notebook of vscode.workspace.notebookDocuments) {
    for (const cell of notebook.getCells()) {
      if (sourceLanguageOf(cell.document) !== undefined) {
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
  return { apiVersion: 1, colorize };
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
