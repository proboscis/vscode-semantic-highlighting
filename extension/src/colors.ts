import * as vscode from 'vscode';
import { SymbolEntry } from './highlighter';

// Symbol type mapping from rust output to our detailed categories
type SymbolCategory = 
  | 'keyword'
  | 'keyword.control'
  | 'keyword.async'
  | 'function.declaration'
  | 'function.call'
  | 'class.declaration'
  | 'class.reference'
  | 'parameter'
  | 'variable'
  | 'variable.self'
  | 'attribute'
  | 'decorator'
  | 'type_annotation'
  | 'builtin';

type ColorMode = 'semantic' | 'fixed' | 'inherit';

interface SymbolColorConfig {
  mode: ColorMode;
  color?: string;
  saturation?: number;
  lightness?: number;
}

interface ColorSettings {
  saturation: number;
  lightness: number;
  hueOffset: number;
}

// Python builtins that should be recognized
const PYTHON_BUILTINS = new Set([
  'abs', 'aiter', 'all', 'any', 'anext', 'ascii', 'bin', 'bool', 'breakpoint',
  'bytearray', 'bytes', 'callable', 'chr', 'classmethod', 'compile', 'complex',
  'delattr', 'dict', 'dir', 'divmod', 'enumerate', 'eval', 'exec', 'filter',
  'float', 'format', 'frozenset', 'getattr', 'globals', 'hasattr', 'hash',
  'help', 'hex', 'id', 'input', 'int', 'isinstance', 'issubclass', 'iter',
  'len', 'list', 'locals', 'map', 'max', 'memoryview', 'min', 'next', 'object',
  'oct', 'open', 'ord', 'pow', 'print', 'property', 'range', 'repr', 'reversed',
  'round', 'set', 'setattr', 'slice', 'sorted', 'staticmethod', 'str', 'sum',
  'super', 'tuple', 'type', 'vars', 'zip', '__import__',
  'None', 'True', 'False', 'Ellipsis', 'NotImplemented',
  '__name__', '__doc__', '__package__', '__loader__', '__spec__',
  '__annotations__', '__builtins__', '__file__', '__cached__',
  'Exception', 'BaseException', 'ValueError', 'TypeError', 'KeyError',
  'IndexError', 'AttributeError', 'ImportError', 'RuntimeError', 'StopIteration',
  'OSError', 'IOError', 'FileNotFoundError', 'PermissionError', 'ZeroDivisionError',
]);

// Async keywords
const ASYNC_KEYWORDS = new Set(['async', 'await']);

// Control flow keywords  
const CONTROL_KEYWORDS = new Set([
  'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 
  'return', 'yield', 'raise', 'try', 'except', 'finally', 'with', 'match', 'case'
]);

/**
 * Get configuration from VS Code settings
 */
function getConfig() {
  return vscode.workspace.getConfiguration('pythonSemanticHighlighter');
}

function getColorSettings(): ColorSettings {
  const config = getConfig();
  const settings = config.get<ColorSettings>('colorSettings', {
    saturation: 45,
    lightness: 65,
    hueOffset: 0
  });
  return settings;
}

function getSymbolColors(): Record<string, SymbolColorConfig> {
  const config = getConfig();
  return config.get<Record<string, SymbolColorConfig>>('symbolColors', {});
}

/**
 * Determine the detailed symbol category
 */
function getSymbolCategory(name: string, kind: string, isDeclaration: boolean = false): SymbolCategory {
  // Check for self
  if (name === 'self' || name === 'cls') {
    return 'variable.self';
  }

  // Check for builtins (only for variables, not type annotations)
  if (kind === 'variable' && PYTHON_BUILTINS.has(name)) {
    return 'builtin';
  }

  // Check for keywords
  if (kind === 'keyword') {
    if (ASYNC_KEYWORDS.has(name)) {
      return 'keyword.async';
    }
    if (CONTROL_KEYWORDS.has(name)) {
      return 'keyword.control';
    }
    return 'keyword';
  }

  // Map kinds from Rust output
  switch (kind) {
    case 'decorator':
      return 'decorator';
    case 'type_annotation':
      return 'type_annotation';
    case 'function':
      return isDeclaration ? 'function.declaration' : 'function.call';
    case 'class':
      return isDeclaration ? 'class.declaration' : 'class.reference';
    case 'parameter':
      return 'parameter';
    case 'attribute':
      return 'attribute';
    case 'variable':
    default:
      return 'variable';
  }
}

/**
 * Generate a hash code for a string
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Convert HSL to hex color string
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Generate a semantic color based on symbol name hash
 */
function generateSemanticColor(
  name: string, 
  category: SymbolCategory,
  globalSettings: ColorSettings,
  symbolConfig?: SymbolColorConfig
): string {
  const hash = hashCode(name);
  
  // Use symbol-specific settings or fall back to global
  const saturation = symbolConfig?.saturation ?? globalSettings.saturation;
  const lightness = symbolConfig?.lightness ?? globalSettings.lightness;
  
  // Add category-based hue offset for visual distinction
  let categoryHueOffset = 0;
  switch (category) {
    case 'function.declaration':
    case 'function.call':
      categoryHueOffset = 0;
      break;
    case 'class.declaration':
    case 'class.reference':
      categoryHueOffset = 40;
      break;
    case 'parameter':
      categoryHueOffset = 80;
      break;
    case 'attribute':
      categoryHueOffset = 120;
      break;
    case 'type_annotation':
      categoryHueOffset = 160;
      break;
    case 'variable':
    case 'variable.self':
      categoryHueOffset = 200;
      break;
    case 'decorator':
      categoryHueOffset = 280;
      break;
    default:
      categoryHueOffset = 0;
  }

  const hue = ((hash % 360) + globalSettings.hueOffset + categoryHueOffset) % 360;
  
  return hslToHex(hue, saturation, lightness);
}

/**
 * Get color for a symbol based on settings
 */
export function getColorForSymbol(
  name: string, 
  kind: string,
  isDeclaration: boolean = false
): string | null {
  const category = getSymbolCategory(name, kind, isDeclaration);
  const globalSettings = getColorSettings();
  const symbolColors = getSymbolColors();
  
  // Get config for this category, with fallback chain
  let config = symbolColors[category];
  
  // Fallback to parent category if not found
  if (!config) {
    const parentCategory = category.split('.')[0];
    config = symbolColors[parentCategory];
  }
  
  // Default to semantic mode if no config
  if (!config) {
    config = { mode: 'semantic' };
  }

  switch (config.mode) {
    case 'fixed':
      return config.color || null;
    
    case 'inherit':
      // Return null to skip decoration (let editor theme handle it)
      return null;
    
    case 'semantic':
    default:
      return generateSemanticColor(name, category, globalSettings, config);
  }
}

export interface DecorationEntry {
  decorationType: vscode.TextEditorDecorationType;
  ranges: vscode.Range[];
}

/**
 * Create decoration types and ranges for all symbols
 */
export function createDecorations(
  symbols: SymbolEntry[],
  decorationCache: Map<string, vscode.TextEditorDecorationType>
): DecorationEntry[] {
  const result: DecorationEntry[] = [];
  const rangesByColor = new Map<string, vscode.Range[]>();

  for (const symbol of symbols) {
    // Determine if this is a declaration (first occurrence for functions/classes)
    const isDeclaration = (symbol.kind === 'function' || symbol.kind === 'class');
    
    const color = getColorForSymbol(symbol.name, symbol.kind, isDeclaration);
    
    // Skip if color is null (inherit mode)
    if (!color) {
      continue;
    }
    
    const ranges = symbol.occurrences.map(occ => {
      const startPos = new vscode.Position(occ.line, occ.column);
      const endPos = new vscode.Position(occ.line, occ.column + occ.length);
      return new vscode.Range(startPos, endPos);
    });

    // Group by color
    const existing = rangesByColor.get(color);
    if (existing) {
      existing.push(...ranges);
    } else {
      rangesByColor.set(color, ranges);
    }
  }

  // Create decoration types for each unique color
  for (const [color, ranges] of rangesByColor) {
    let decorationType = decorationCache.get(color);
    if (!decorationType) {
      decorationType = vscode.window.createTextEditorDecorationType({
        color: color,
      });
      decorationCache.set(color, decorationType);
    }
    result.push({ decorationType, ranges });
  }

  return result;
}

/**
 * Clear all decorations from cache
 */
export function clearDecorationCache(
  cache: Map<string, vscode.TextEditorDecorationType>
): void {
  for (const decoration of cache.values()) {
    decoration.dispose();
  }
  cache.clear();
}
