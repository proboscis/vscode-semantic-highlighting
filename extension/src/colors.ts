import * as vscode from 'vscode';
import { SymbolEntry } from './highlighter';

// Python keywords get fixed colors for global consistency
const KEYWORD_COLOR = '#CC7832'; // Orange (IntelliJ-style keyword color)

// Builtin functions get a distinct color
const BUILTIN_COLOR = '#8888C6';

// Python builtins that should have consistent colors
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
  // Common special names
  'None', 'True', 'False', 'Ellipsis', 'NotImplemented',
  '__name__', '__doc__', '__package__', '__loader__', '__spec__',
  '__annotations__', '__builtins__', '__file__', '__cached__',
  // Exception types
  'Exception', 'BaseException', 'ValueError', 'TypeError', 'KeyError',
  'IndexError', 'AttributeError', 'ImportError', 'RuntimeError', 'StopIteration',
  'OSError', 'IOError', 'FileNotFoundError', 'PermissionError', 'ZeroDivisionError',
]);

/**
 * Generate a hash code for a string
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
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
 * Generate a visually distinct color from a symbol name hash
 * Uses HSL color space for better distribution
 */
export function generateColorForSymbol(name: string, kind: string): string {
  // Keywords get a fixed color
  if (kind === 'keyword') {
    return KEYWORD_COLOR;
  }

  // Python builtins get a distinct color
  if (PYTHON_BUILTINS.has(name)) {
    return BUILTIN_COLOR;
  }

  const hash = hashCode(name);
  
  // Use different hue ranges for different symbol kinds to help distinguish them
  let hueOffset = 0;
  let saturation = 65;
  let lightness = 55;

  switch (kind) {
    case 'function':
      hueOffset = 0;
      saturation = 70;
      lightness = 60;
      break;
    case 'class':
      hueOffset = 60;
      saturation = 75;
      lightness = 55;
      break;
    case 'parameter':
      hueOffset = 120;
      saturation = 60;
      lightness = 60;
      break;
    case 'attribute':
      hueOffset = 180;
      saturation = 55;
      lightness = 58;
      break;
    case 'variable':
    default:
      hueOffset = 240;
      saturation = 65;
      lightness = 62;
      break;
  }

  // Generate hue from hash, distributed across 360 degrees
  const hue = ((hash % 360) + hueOffset) % 360;
  
  return hslToHex(hue, saturation, lightness);
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
  const rangesByColor = new Map<string, { color: string; ranges: vscode.Range[] }>();

  for (const symbol of symbols) {
    const color = generateColorForSymbol(symbol.name, symbol.kind);
    
    const ranges = symbol.occurrences.map(occ => {
      const startPos = new vscode.Position(occ.line, occ.column);
      const endPos = new vscode.Position(occ.line, occ.column + occ.length);
      return new vscode.Range(startPos, endPos);
    });

    // Group by color to minimize decoration types
    const key = color;
    const existing = rangesByColor.get(key);
    if (existing) {
      existing.ranges.push(...ranges);
    } else {
      rangesByColor.set(key, { color, ranges });
    }
  }

  // Create decoration types for each unique color
  for (const [key, { color, ranges }] of rangesByColor) {
    let decorationType = decorationCache.get(key);
    if (!decorationType) {
      decorationType = vscode.window.createTextEditorDecorationType({
        color: color,
      });
      decorationCache.set(key, decorationType);
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

