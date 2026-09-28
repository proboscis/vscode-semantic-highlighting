import * as vscode from 'vscode';
import { Occurrence, SymbolEntry } from './highlighter';

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
  | 'builtin'
  | 'kwargName'   // Keyword argument names in function calls: func(x=0)
  | 'import'      // Import statements: import os, from x import y
  | 'stringLiteral'      // Normal string literals: "hello", 'hello'
  | 'fstringLiteral'     // F-strings: f"hello {name}"
  | 'rawStringLiteral'   // Raw strings: r"hello\n"
  | 'byteStringLiteral'  // Byte strings: b"hello"
  | 'comment'            // Comments: # this is a comment
  | 'docstring';         // Docstrings: """This is a docstring"""

interface SemanticCategoryConfig {
  enabled: boolean;
  hueRange: [number, number];
  saturation: [number, number];
  lightness: [number, number];
}

// Default Python builtins
const DEFAULT_PYTHON_BUILTINS = [
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
];

// Cache for the computed builtins set
let cachedBuiltinsSet: Set<string> | null = null;

/**
 * Clear the builtins cache (call when settings change)
 */
export function clearBuiltinsCache(): void {
  cachedBuiltinsSet = null;
}

/**
 * Get the effective builtins set (default + additional - disabled)
 */
function getBuiltinsSet(): Set<string> {
  if (cachedBuiltinsSet !== null) {
    return cachedBuiltinsSet;
  }
  
  const config = getConfig();
  const additionalBuiltins = config.get<string[]>('additionalBuiltins', []);
  const disabledBuiltins = config.get<string[]>('disabledBuiltins', []);
  const disabledSet = new Set(disabledBuiltins);
  
  // Start with defaults, remove disabled, add additional
  const builtins = new Set<string>();
  for (const name of DEFAULT_PYTHON_BUILTINS) {
    if (!disabledSet.has(name)) {
      builtins.add(name);
    }
  }
  for (const name of additionalBuiltins) {
    builtins.add(name);
  }
  
  cachedBuiltinsSet = builtins;
  return builtins;
}

/**
 * Check if a name is a Python builtin
 */
function isBuiltin(name: string): boolean {
  return getBuiltinsSet().has(name);
}

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

function getExcludeKeywordHues(): boolean {
  const config = getConfig();
  return config.get<boolean>('excludeKeywordHues', true);
}

function getKeywordHueExclusionRange(): number {
  const config = getConfig();
  return config.get<number>('keywordHueExclusionRange', 20);
}

function getManualExcludedHueRanges(): [number, number][] {
  const config = getConfig();
  return config.get<[number, number][]>('excludedHueRanges', []);
}

function getThemeKeywordHues(): number[] {
  const config = getConfig();
  return config.get<number[]>('themeKeywordHues', []);
}

function getThemeKeywordHueRange(): number {
  const config = getConfig();
  return config.get<number>('themeKeywordHueRange', 25);
}

// Cache for excluded hue ranges to avoid recalculating on every color generation
let cachedExcludedRanges: [number, number][] | null = null;

// Debug output channel (set from extension.ts)
let debugOutputChannel: { appendLine: (msg: string) => void } | null = null;

/**
 * Set the output channel for debug logging
 */
export function setDebugOutputChannel(channel: { appendLine: (msg: string) => void }): void {
  debugOutputChannel = channel;
}

/**
 * Clear the excluded hue ranges cache (call when settings change)
 */
export function clearExcludedHueRangesCache(): void {
  cachedExcludedRanges = null;
  debugOutputChannel?.appendLine('Cleared excluded hue ranges cache');
}

/**
 * Get the current excluded hue ranges for debugging
 * Forces a cache refresh to show current settings
 */
export function getExcludedHueRangesDebug(): { 
  ranges: [number, number][], 
  themeKeywordHues: number[], 
  themeKeywordHueRange: number,
  manualRanges: [number, number][],
  keywordColors: Record<string, string>,
  excludeKeywordHues: boolean,
  keywordHueExclusionRange: number,
  sampleHues: { index: number, hue: number, excluded: boolean }[]
} {
  // Temporarily clear cache to get fresh values
  const prevCache = cachedExcludedRanges;
  cachedExcludedRanges = null;
  
  const ranges = getExcludedHueRanges();
  const themeKeywordHues = getThemeKeywordHues();
  const themeKeywordHueRange = getThemeKeywordHueRange();
  const manualRanges = getManualExcludedHueRanges();
  const keywordColors = getKeywordColors();
  const excludeKeywordHues = getExcludeKeywordHues();
  const keywordHueExclusionRange = getKeywordHueExclusionRange();
  
  // Generate sample hues to show what colors would be used
  const sampleHues: { index: number, hue: number, excluded: boolean }[] = [];
  for (let i = 0; i < 10; i++) {
    const t = vanDerCorput(i + 1);
    const rawHue = t * 360;
    const actualHue = getDistributedHue(i, [0, 360]);
    sampleHues.push({
      index: i,
      hue: Math.round(actualHue),
      excluded: isHueExcluded(rawHue)
    });
  }
  
  // Restore cache
  cachedExcludedRanges = prevCache;
  
  return { 
    ranges, 
    themeKeywordHues, 
    themeKeywordHueRange,
    manualRanges, 
    keywordColors,
    excludeKeywordHues,
    keywordHueExclusionRange,
    sampleHues
  };
}

/**
 * Get all excluded hue ranges combining keyword colors and manual settings
 * Ranges are normalized to [min, max] format where min < max
 * Handles hue wraparound (e.g., range crossing 360/0 boundary)
 */
function getExcludedHueRanges(): [number, number][] {
  if (cachedExcludedRanges !== null) {
    return cachedExcludedRanges;
  }

  const excludedRanges: [number, number][] = [];

  // Helper to add exclusion range with wraparound handling
  function addExclusionRange(hue: number, range: number): void {
    const minHue = hue - range;
    const maxHue = hue + range;

    if (minHue < 0) {
      excludedRanges.push([0, maxHue]);
      excludedRanges.push([360 + minHue, 360]);
    } else if (maxHue > 360) {
      excludedRanges.push([minHue, 360]);
      excludedRanges.push([0, maxHue - 360]);
    } else {
      excludedRanges.push([minHue, maxHue]);
    }
  }

  // Add manual excluded ranges
  const manualRanges = getManualExcludedHueRanges();
  debugOutputChannel?.appendLine(`Manual excluded ranges from settings: ${JSON.stringify(manualRanges)}`);
  for (const range of manualRanges) {
    if (Array.isArray(range) && range.length === 2) {
      const [start, end] = range;
      // Handle wraparound ranges (e.g., [350, 30] means 350-360 and 0-30)
      if (start > end) {
        excludedRanges.push([start, 360]);
        excludedRanges.push([0, end]);
        debugOutputChannel?.appendLine(`  Wraparound range [${start}, ${end}] split into [${start}, 360] and [0, ${end}]`);
      } else {
        excludedRanges.push([start, end]);
      }
    }
  }

  // Add theme keyword hues (user-specified hues for their theme's keywords)
  const themeKeywordHues = getThemeKeywordHues();
  const themeHueRange = getThemeKeywordHueRange();
  debugOutputChannel?.appendLine(`Theme keyword hues: ${JSON.stringify(themeKeywordHues)}, range: ±${themeHueRange}°`);
  for (const hue of themeKeywordHues) {
    if (typeof hue === 'number' && hue >= 0 && hue <= 360) {
      addExclusionRange(hue, themeHueRange);
    }
  }

  // Add keyword color hue ranges if enabled (from keywordColors setting)
  const excludeKeywordHuesEnabled = getExcludeKeywordHues();
  debugOutputChannel?.appendLine(`Exclude keyword hues enabled: ${excludeKeywordHuesEnabled}`);
  if (excludeKeywordHuesEnabled) {
    const keywordColors = getKeywordColors();
    const exclusionRange = getKeywordHueExclusionRange();
    debugOutputChannel?.appendLine(`Keyword colors: ${JSON.stringify(keywordColors)}, exclusion range: ±${exclusionRange}°`);

    for (const color of Object.values(keywordColors)) {
      if (color && color !== '') {
        const hsl = hexToHsl(color);
        if (hsl !== null) {
          debugOutputChannel?.appendLine(`  Adding exclusion for keyword color ${color} (hue: ${hsl.h}°)`);
          addExclusionRange(hsl.h, exclusionRange);
        }
      }
    }
  }

  cachedExcludedRanges = excludedRanges;
  
  // Debug log the final excluded ranges
  if (debugOutputChannel) {
    if (excludedRanges.length > 0) {
      debugOutputChannel.appendLine(`Final excluded hue ranges: ${JSON.stringify(excludedRanges)}`);
    } else {
      debugOutputChannel.appendLine(`No hue exclusion ranges configured`);
    }
  }
  
  return excludedRanges;
}

/**
 * Check if a hue value falls within any excluded range
 * @param hue - Hue value (0-360)
 * @returns true if hue should be excluded
 */
function isHueExcluded(hue: number): boolean {
  const excludedRanges = getExcludedHueRanges();
  
  // Normalize hue to 0-360
  hue = ((hue % 360) + 360) % 360;
  
  for (const [min, max] of excludedRanges) {
    if (hue >= min && hue <= max) {
      return true;
    }
  }
  
  return false;
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
  if (kind === 'variable' && isBuiltin(name)) {
    return 'builtin';
  }

  // Map kinds from Rust output
  switch (kind) {
    case 'decorator':
      return 'decorator';
    case 'type_annotation':
      return 'typeAnnotation';
    case 'function':
      // Function definition
      return 'functionDef';
    case 'function_call':
      return 'functionCall';
    case 'method_call':
      return 'methodCall';
    case 'class':
      return 'classReference';
    case 'parameter':
      return 'parameter';
    case 'attribute':
      return 'attribute';
    case 'kwarg_name':
      return 'kwargName';
    case 'import':
      return 'import';
    case 'string':
      return 'stringLiteral';
    case 'fstring':
      return 'fstringLiteral';
    case 'raw_string':
      return 'rawStringLiteral';
    case 'byte_string':
      return 'byteStringLiteral';
    case 'comment':
      return 'comment';
    case 'docstring':
      return 'docstring';
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

// Track variable indices for round-robin color assignment
let variableIndexMap: Map<string, number> = new Map();
let nextVariableIndex = 0;

/**
 * Reset variable index tracking (call when switching files)
 */
export function resetVariableIndices(): void {
  variableIndexMap.clear();
  nextVariableIndex = 0;
}

/**
 * Get or assign an index for a variable name (for round-robin distribution)
 */
function getVariableIndex(name: string): number {
  if (!variableIndexMap.has(name)) {
    variableIndexMap.set(name, nextVariableIndex++);
  }
  return variableIndexMap.get(name)!;
}

/**
 * Van der Corput sequence - generates values between 0 and 1 with maximum separation
 * Each new value is maximally distant from all previous values
 * 
 * Sequence: 0, 0.5, 0.25, 0.75, 0.125, 0.625, 0.375, 0.875, ...
 */
function vanDerCorput(n: number, base: number = 2): number {
  let result = 0;
  let fraction = 1 / base;
  
  while (n > 0) {
    result += (n % base) * fraction;
    n = Math.floor(n / base);
    fraction /= base;
  }
  
  return result;
}

/**
 * Get a hue value within range using maximum-separation strategy
 * Adjacent picks will be far apart in hue space
 * Automatically skips hues that fall within excluded ranges (keyword colors, etc.)
 * 
 * Example with range [0, 100] and indices 0,1,2,3,4,5,6,7:
 *   0 → 0, 1 → 50, 2 → 25, 3 → 75, 4 → 12.5, 5 → 62.5, 6 → 37.5, 7 → 87.5
 */
function getDistributedHue(index: number, hueRange: [number, number]): number {
  const rangeStart = hueRange[0];
  const rangeEnd = hueRange[1];
  const rangeSpan = rangeEnd - rangeStart;
  
  // Maximum attempts to find a non-excluded hue
  // This prevents infinite loops if most of the range is excluded
  const maxAttempts = 100;
  
  let currentIndex = index;
  let skippedCount = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Use van der Corput sequence for maximum separation
    // Add 1 to index so first value isn't always at the start
    const t = vanDerCorput(currentIndex + 1);
    const hue = rangeStart + (t * rangeSpan);
    
    // Check if this hue is excluded
    if (!isHueExcluded(hue)) {
      if (skippedCount > 0 && debugOutputChannel) {
        debugOutputChannel.appendLine(`Hue exclusion: skipped ${skippedCount} hues, used ${hue.toFixed(1)}°`);
      }
      return hue;
    }
    
    // Try next index in the sequence
    currentIndex++;
    skippedCount++;
  }
  
  // Fallback: if all attempts found excluded hues, return the original calculation
  // This ensures we always return a valid hue even if the entire range is excluded
  const t = vanDerCorput(index + 1);
  const fallbackHue = rangeStart + (t * rangeSpan);
  if (debugOutputChannel) {
    debugOutputChannel.appendLine(`WARNING: Hue exclusion fallback triggered!`);
    debugOutputChannel.appendLine(`  Category hueRange: [${rangeStart}, ${rangeEnd}] (span: ${rangeSpan}°)`);
    debugOutputChannel.appendLine(`  Tried ${maxAttempts} indices, all hues were excluded`);
    debugOutputChannel.appendLine(`  Using excluded hue ${fallbackHue.toFixed(1)}° as fallback`);
    debugOutputChannel.appendLine(`  Consider: widening the category's hueRange or narrowing exclusion ranges`);
  }
  return fallbackHue;
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
 * Convert hex color string to HSL values
 * @param hex - Hex color string (e.g., "#CC7832" or "CC7832")
 * @returns Object with h (0-360), s (0-100), l (0-100) or null if invalid
 */
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Validate hex format
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return null;
  }
  
  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / delta + 2) * 60;
        break;
      case b:
        h = ((r - g) / delta + 4) * 60;
        break;
    }
  }
  
  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * Generate a color from hash within the given HSV ranges
 */
function generateHashColor(
  name: string,
  hueRange: [number, number],
  saturationRange: [number, number],
  lightnessRange: [number, number],
  useRoundRobin: boolean = false
): string {
  let hue: number;
  let saturation: number;
  let lightness: number;
  
  if (useRoundRobin) {
    // Sequential round-robin with maximum separation using van der Corput sequence
    const index = getVariableIndex(name);
    hue = getDistributedHue(index, hueRange);
    
    // Use hash for slight saturation/lightness variation
    const hash = hashCode(name);
    const satSpan = saturationRange[1] - saturationRange[0];
    const lightSpan = lightnessRange[1] - lightnessRange[0];
    saturation = saturationRange[0] + (hash % Math.max(satSpan, 1));
    lightness = lightnessRange[0] + ((hash >> 8) % Math.max(lightSpan, 1));
  } else {
    // Hash-based distribution within specified hue range
    const hash = hashCode(name);
    const hueHash = hash;
    const satHash = (hash >> 8) & 0xFFFF;
    const lightHash = (hash >> 16) & 0xFFFF;
    
    const hueSpan = hueRange[1] - hueRange[0];
    hue = hueRange[0] + (hueHash % Math.max(hueSpan, 1));
    
    const satSpan = saturationRange[1] - saturationRange[0];
    saturation = saturationRange[0] + (satHash % Math.max(satSpan, 1));
    
    const lightSpan = lightnessRange[1] - lightnessRange[0];
    lightness = lightnessRange[0] + (lightHash % Math.max(lightSpan, 1));
  }
  
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
    const color = keywordColors[name];
    // If no color set or empty string, return null to use IDE theme
    if (!color || color === '') {
      return null;
    }
    return color;
  }
  
  // Handle semantic categories
  const semanticCategories = getSemanticCategories();
  const config = semanticCategories[category];
  
  if (!config || !config.enabled) {
    return null; // Disabled or not configured - let editor theme handle it
  }
  
  // Use round-robin (van der Corput) for all categories for maximum color variety
  return generateHashColor(
    name,
    config.hueRange,
    config.saturation,
    config.lightness,
    true  // Always use round-robin for maximum color distance
  );
}

export interface DecorationEntry {
  decorationType: vscode.TextEditorDecorationType;
  ranges: vscode.Range[];
}

/**
 * The color of every symbol occurrence of one analyzed file — the single place that decides the colors, shared by the
 * editor decorations (createDecorations) and the public API (colorize), so an embedding view shows the editor's colors.
 * Symbols whose color is null (disabled category, keyword without a fixed color) are left out: the theme colors them.
 */
export function colorSymbols(symbols: SymbolEntry[]): Map<string, Occurrence[]> {
  // Reset variable indices for fresh round-robin distribution (colors depend on the order of the whole file's symbols)
  resetVariableIndices();

  const occurrencesByColor = new Map<string, Occurrence[]>();
  for (const symbol of symbols) {
    const color = getColorForSymbol(symbol.name, symbol.kind);

    // Skip if color is null (disabled or inherit mode)
    if (!color) {
      continue;
    }

    // Group by color
    const existing = occurrencesByColor.get(color);
    if (existing) {
      existing.push(...symbol.occurrences);
    } else {
      occurrencesByColor.set(color, [...symbol.occurrences]);
    }
  }
  return occurrencesByColor;
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
  for (const [color, occurrences] of colorSymbols(symbols)) {
    rangesByColor.set(
      color,
      occurrences.map(occ => new vscode.Range(new vscode.Position(occ.line, occ.column), new vscode.Position(occ.line, occ.column + occ.length)))
    );
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
