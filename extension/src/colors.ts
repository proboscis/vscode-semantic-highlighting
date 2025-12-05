import * as vscode from 'vscode';
import { SymbolEntry } from './highlighter';

// Semantic categories that get hash-based coloring
type SemanticCategory = 
  | 'localVariable'
  | 'globalVariable'
  | 'parameter'
  | 'functionDef'
  | 'functionCall'
  | 'methodCall'
  | 'classDef'
  | 'classReference'
  | 'attribute'
  | 'typeAnnotation'
  | 'decorator'
  | 'self'
  | 'builtin';

interface SemanticCategoryConfig {
  enabled: boolean;
  hueRange: [number, number];
  saturation: [number, number];
  lightness: [number, number];
}

// Python builtins
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
  'Exception', 'BaseException', 'ValueError', 'TypeError', 'KeyError',
  'IndexError', 'AttributeError', 'ImportError', 'RuntimeError', 'StopIteration',
  'OSError', 'IOError', 'FileNotFoundError', 'PermissionError', 'ZeroDivisionError',
]);

/**
 * Get configuration from VS Code settings
 */
function getConfig() {
  return vscode.workspace.getConfiguration('pythonSemanticHighlighter');
}

function getSemanticCategories(): Record<string, SemanticCategoryConfig> {
  const config = getConfig();
  return config.get<Record<string, SemanticCategoryConfig>>('semanticCategories', {});
}

function getKeywordColors(): Record<string, string> {
  const config = getConfig();
  return config.get<Record<string, string>>('keywordColors', {});
}

/**
 * Map Rust output kind to semantic category
 */
function getSemanticCategory(name: string, kind: string): SemanticCategory | 'keyword' | null {
  // Check for self/cls first
  if (name === 'self' || name === 'cls') {
    return 'self';
  }

  // Keywords are handled separately
  if (kind === 'keyword') {
    return 'keyword';
  }

  // Check for builtins (only for variables)
  if (kind === 'variable' && PYTHON_BUILTINS.has(name)) {
    return 'builtin';
  }

  // Map kinds from Rust output
  switch (kind) {
    case 'decorator':
      return 'decorator';
    case 'type_annotation':
      return 'typeAnnotation';
    case 'function':
      // First occurrence is definition, others are calls
      // For now, treat all as functionCall (we can improve this later)
      return 'functionCall';
    case 'class':
      return 'classReference';
    case 'parameter':
      return 'parameter';
    case 'attribute':
      return 'attribute';
    case 'variable':
      // For now, treat as local variable (we can distinguish local/global later)
      return 'localVariable';
    default:
      return 'localVariable';
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
 * Generate a color from hash within the given HSV ranges
 */
function generateHashColor(
  name: string,
  hueRange: [number, number],
  saturationRange: [number, number],
  lightnessRange: [number, number]
): string {
  const hash = hashCode(name);
  
  // Use different parts of the hash for each component
  const hueHash = hash;
  const satHash = (hash >> 8) & 0xFFFF;
  const lightHash = (hash >> 16) & 0xFFFF;
  
  // Map hash to ranges
  const hueSpan = hueRange[1] - hueRange[0];
  const hue = hueRange[0] + (hueHash % Math.max(hueSpan, 1));
  
  const satSpan = saturationRange[1] - saturationRange[0];
  const saturation = saturationRange[0] + (satHash % Math.max(satSpan, 1));
  
  const lightSpan = lightnessRange[1] - lightnessRange[0];
  const lightness = lightnessRange[0] + (lightHash % Math.max(lightSpan, 1));
  
  return hslToHex(hue % 360, saturation, lightness);
}

/**
 * Get color for a symbol based on settings
 */
export function getColorForSymbol(name: string, kind: string): string | null {
  const category = getSemanticCategory(name, kind);
  
  if (!category) {
    return null;
  }
  
  // Handle keywords with fixed colors
  if (category === 'keyword') {
    const keywordColors = getKeywordColors();
    return keywordColors[name] || '#CC7832'; // Default keyword color
  }
  
  // Handle semantic categories
  const semanticCategories = getSemanticCategories();
  const config = semanticCategories[category];
  
  if (!config || !config.enabled) {
    return null; // Disabled or not configured - let editor theme handle it
  }
  
  return generateHashColor(
    name,
    config.hueRange,
    config.saturation,
    config.lightness
  );
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
    const color = getColorForSymbol(symbol.name, symbol.kind);
    
    // Skip if color is null (disabled or inherit mode)
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
