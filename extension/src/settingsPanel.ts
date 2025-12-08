import * as vscode from 'vscode';

export class SettingsPanel {
  public static currentPanel: SettingsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'pythonSemanticHighlighterSettings',
      'Python Semantic Highlighter Settings',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'updateEnable':
            await this._updateEnable(message.value);
            break;
          case 'updateDebounceMs':
            await this._updateDebounceMs(message.value);
            break;
          case 'updateSemanticCategory':
            await this._updateSemanticCategory(message.category, message.config);
            break;
          case 'updateKeywordColor':
            await this._updateKeywordColor(message.keyword, message.color);
            break;
          case 'clearKeywordColor':
            await this._clearKeywordColor(message.keyword);
            break;
          case 'updateExcludeKeywordHues':
            await this._updateExcludeKeywordHues(message.value);
            break;
          case 'updateKeywordHueExclusionRange':
            await this._updateKeywordHueExclusionRange(message.value);
            break;
          case 'updateExcludedHueRanges':
            await this._updateExcludedHueRanges(message.value);
            break;
          case 'updateAdditionalBuiltins':
            await this._updateAdditionalBuiltins(message.value);
            break;
          case 'updateDisabledBuiltins':
            await this._updateDisabledBuiltins(message.value);
            break;
          case 'updateThemeKeywordHues':
            await this._updateThemeKeywordHues(message.value);
            break;
          case 'updateThemeKeywordHueRange':
            await this._updateThemeKeywordHueRange(message.value);
            break;
          case 'getSettings':
            this._sendCurrentSettings();
            break;
        }
      },
      null,
      this._disposables
    );

    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('pythonSemanticHighlighter')) {
          this._sendCurrentSettings();
        }
      },
      null,
      this._disposables
    );
  }

  private async _updateEnable(value: boolean) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    await vsConfig.update('enable', value, vscode.ConfigurationTarget.Global);
  }

  private async _updateDebounceMs(value: number) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    await vsConfig.update('debounceMs', value, vscode.ConfigurationTarget.Global);
  }

  private async _updateSemanticCategory(category: string, config: any) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    const categories = { ...vsConfig.get<Record<string, any>>('semanticCategories', {}) };
    categories[category] = { ...categories[category], ...config };
    await vsConfig.update('semanticCategories', categories, vscode.ConfigurationTarget.Global);
  }

  private async _updateKeywordColor(keyword: string, color: string) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    const colors = { ...vsConfig.get<Record<string, string>>('keywordColors', {}) };
    colors[keyword] = color;
    await vsConfig.update('keywordColors', colors, vscode.ConfigurationTarget.Global);
  }

  private async _clearKeywordColor(keyword: string) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    const colors = { ...vsConfig.get<Record<string, string>>('keywordColors', {}) };
    delete colors[keyword];
    await vsConfig.update('keywordColors', colors, vscode.ConfigurationTarget.Global);
  }

  private async _updateExcludeKeywordHues(value: boolean) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    await vsConfig.update('excludeKeywordHues', value, vscode.ConfigurationTarget.Global);
  }

  private async _updateKeywordHueExclusionRange(value: number) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    await vsConfig.update('keywordHueExclusionRange', value, vscode.ConfigurationTarget.Global);
  }

  private async _updateExcludedHueRanges(value: [number, number][]) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    await vsConfig.update('excludedHueRanges', value, vscode.ConfigurationTarget.Global);
  }

  private async _updateAdditionalBuiltins(value: string[]) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    await vsConfig.update('additionalBuiltins', value, vscode.ConfigurationTarget.Global);
  }

  private async _updateDisabledBuiltins(value: string[]) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    await vsConfig.update('disabledBuiltins', value, vscode.ConfigurationTarget.Global);
  }

  private async _updateThemeKeywordHues(value: number[]) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    await vsConfig.update('themeKeywordHues', value, vscode.ConfigurationTarget.Global);
  }

  private async _updateThemeKeywordHueRange(value: number) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    await vsConfig.update('themeKeywordHueRange', value, vscode.ConfigurationTarget.Global);
  }

  private _sendCurrentSettings() {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    const enable = vsConfig.get('enable', true);
    const debounceMs = vsConfig.get('debounceMs', 150);
    const semanticCategories = vsConfig.get('semanticCategories', {});
    const keywordColors = vsConfig.get('keywordColors', {});
    const excludeKeywordHues = vsConfig.get('excludeKeywordHues', true);
    const keywordHueExclusionRange = vsConfig.get('keywordHueExclusionRange', 20);
    const excludedHueRanges = vsConfig.get('excludedHueRanges', []);
    const additionalBuiltins = vsConfig.get('additionalBuiltins', []);
    const disabledBuiltins = vsConfig.get('disabledBuiltins', []);
    const themeKeywordHues = vsConfig.get('themeKeywordHues', []);
    const themeKeywordHueRange = vsConfig.get('themeKeywordHueRange', 25);
    
    this._panel.webview.postMessage({
      command: 'settingsLoaded',
      enable,
      debounceMs,
      semanticCategories,
      keywordColors,
      excludeKeywordHues,
      keywordHueExclusionRange,
      excludedHueRanges,
      additionalBuiltins,
      disabledBuiltins,
      themeKeywordHues,
      themeKeywordHueRange,
    });
  }

  private _update() {
    this._panel.webview.html = this._getHtmlForWebview();
    setTimeout(() => this._sendCurrentSettings(), 100);
  }

  public dispose() {
    SettingsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Python Semantic Highlighter Settings</title>
  <style>
    :root {
      --bg-color: #1e1e1e;
      --card-bg: #252526;
      --border-color: #3c3c3c;
      --text-color: #cccccc;
      --text-muted: #888888;
      --accent-color: #0e639c;
      --accent-hover: #1177bb;
      --danger-color: #f14c4c;
    }
    
    * { box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-color);
      color: var(--text-color);
      padding: 20px;
      margin: 0;
      line-height: 1.5;
    }
    
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; color: #fff; }
    h2 { font-size: 18px; font-weight: 600; margin: 32px 0 16px 0; color: #fff; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
    .subtitle { color: var(--text-muted); margin-bottom: 24px; font-size: 14px; }
    
    .category-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }
    
    .category-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    
    .category-name { font-weight: 600; font-size: 15px; }
    
    .toggle-switch {
      position: relative;
      width: 44px;
      height: 24px;
    }
    
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #555;
      transition: .3s;
      border-radius: 24px;
    }
    
    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
    }
    
    input:checked + .toggle-slider { background-color: var(--accent-color); }
    input:checked + .toggle-slider:before { transform: translateX(20px); }
    
    .slider-row {
      display: grid;
      grid-template-columns: 100px 1fr 60px;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    
    .slider-label { font-size: 13px; color: var(--text-muted); }
    
    /* Circular Hue Picker */
    .hue-picker-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }
    
    .circular-hue-picker {
      position: relative;
      width: 100px;
      height: 100px;
      flex-shrink: 0;
    }
    
    .hue-wheel {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: conic-gradient(
        hsl(0, 70%, 60%),
        hsl(60, 70%, 60%),
        hsl(120, 70%, 60%),
        hsl(180, 70%, 60%),
        hsl(240, 70%, 60%),
        hsl(300, 70%, 60%),
        hsl(360, 70%, 60%)
      );
      position: relative;
    }
    
    .hue-wheel-inner {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 60%;
      height: 60%;
      background: var(--card-bg);
      border-radius: 50%;
    }
    
    .hue-handle {
      position: absolute;
      width: 14px;
      height: 14px;
      background: #fff;
      border: 2px solid #333;
      border-radius: 50%;
      cursor: grab;
      transform: translate(-50%, -50%);
      z-index: 10;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    
    .hue-handle:active { cursor: grabbing; }
    .hue-handle.start { border-color: var(--accent-color); }
    .hue-handle.end { border-color: #e74c3c; }
    
    .hue-arc {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    
    .hue-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .hue-value-display {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 13px;
      color: var(--text-muted);
    }
    
    .hue-value-display span { color: var(--text-color); font-weight: 500; }
    
    .full-range-btn {
      margin-top: 8px;
      padding: 6px 12px;
      background: var(--accent-color);
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    }
    
    .full-range-btn:hover { background: var(--accent-hover); }
    
    .range-slider {
      position: relative;
      height: 24px;
    }
    
    .range-slider input[type="range"] {
      position: absolute;
      width: 100%;
      height: 6px;
      top: 9px;
      -webkit-appearance: none;
      background: transparent;
      pointer-events: none;
    }
    
    .range-slider input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      background: var(--accent-color);
      border-radius: 50%;
      cursor: pointer;
      pointer-events: auto;
      border: 2px solid #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    
    .range-track {
      position: absolute;
      width: 100%;
      height: 6px;
      top: 9px;
      background: var(--border-color);
      border-radius: 3px;
    }
    
    .range-track-fill {
      position: absolute;
      height: 6px;
      top: 9px;
      background: var(--accent-color);
      border-radius: 3px;
      opacity: 0.5;
    }
    
    .slider-value {
      font-size: 12px;
      color: var(--text-muted);
      text-align: right;
      font-family: 'SF Mono', Monaco, monospace;
    }
    
    .color-preview {
      height: 32px;
      border-radius: 6px;
      margin-top: 12px;
      border: 1px solid var(--border-color);
    }
    
    .disabled .slider-row { opacity: 0.35; pointer-events: none; }
    .disabled .color-preview { opacity: 0.35; }
    
    /* Keyword colors */
    .keyword-section { margin-top: 16px; }
    
    .keyword-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px;
    }
    
    .keyword-item {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px 12px;
    }
    
    .keyword-item.has-color { border-color: var(--accent-color); }
    
    .color-picker-wrapper {
      position: relative;
      width: 28px;
      height: 28px;
    }
    
    .color-picker-wrapper input[type="color"] {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: none;
      padding: 0;
    }
    
    .color-picker-wrapper input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
    .color-picker-wrapper input[type="color"]::-webkit-color-swatch {
      border: 1px solid var(--border-color);
      border-radius: 4px;
    }
    
    .color-picker-wrapper.empty input[type="color"]::-webkit-color-swatch {
      background: linear-gradient(135deg, #333 25%, #444 25%, #444 50%, #333 50%, #333 75%, #444 75%);
      background-size: 8px 8px;
    }
    
    .keyword-name {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 13px;
      flex: 1;
    }
    
    /* General Settings */
    .general-settings {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--border-color);
    }
    
    .setting-row:last-child {
      border-bottom: none;
    }
    
    .setting-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    
    .setting-name {
      font-weight: 600;
      font-size: 14px;
    }
    
    .setting-desc {
      font-size: 12px;
      color: var(--text-muted);
    }
    
    .debounce-control {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .debounce-control input[type="range"] {
      width: 120px;
      height: 6px;
      -webkit-appearance: none;
      background: var(--border-color);
      border-radius: 3px;
      outline: none;
    }
    
    .debounce-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      background: var(--accent-color);
      border-radius: 50%;
      cursor: pointer;
    }
    
    #debounce-value {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      color: var(--text-muted);
      min-width: 50px;
    }
    
    .clear-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      font-size: 14px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    
    .keyword-item:hover .clear-btn { opacity: 1; }
    .clear-btn:hover { color: var(--danger-color); }
    
    .theme-default-badge {
      font-size: 10px;
      color: var(--text-muted);
      background: var(--border-color);
      padding: 2px 6px;
      border-radius: 3px;
    }
    
    /* Hue Exclusion Section */
    .exclusion-section {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    
    .exclusion-visualization {
      display: flex;
      gap: 24px;
      align-items: flex-start;
      margin-top: 16px;
    }
    
    .exclusion-wheel-container {
      position: relative;
      width: 150px;
      height: 150px;
      flex-shrink: 0;
    }
    
    .exclusion-wheel {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: conic-gradient(
        hsl(0, 70%, 60%),
        hsl(60, 70%, 60%),
        hsl(120, 70%, 60%),
        hsl(180, 70%, 60%),
        hsl(240, 70%, 60%),
        hsl(300, 70%, 60%),
        hsl(360, 70%, 60%)
      );
      position: relative;
    }
    
    .exclusion-wheel-inner {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 50%;
      height: 50%;
      background: var(--card-bg);
      border-radius: 50%;
    }
    
    .exclusion-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    
    .exclusion-info {
      flex: 1;
    }
    
    .exclusion-ranges-list {
      margin-top: 12px;
    }
    
    .exclusion-range-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      margin-bottom: 6px;
    }
    
    .exclusion-range-item.auto {
      border-left: 3px solid #9b59b6;
    }
    
    .exclusion-range-item.manual {
      border-left: 3px solid #e67e22;
    }
    
    .exclusion-range-label {
      font-size: 10px;
      color: var(--text-muted);
      background: var(--border-color);
      padding: 2px 6px;
      border-radius: 3px;
    }
    
    .exclusion-range-color {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }
    
    .exclusion-range-text {
      flex: 1;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 13px;
    }
    
    .exclusion-range-label {
      font-size: 10px;
      color: var(--text-muted);
      background: var(--border-color);
      padding: 2px 6px;
      border-radius: 3px;
    }
    
    .exclusion-range-delete {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      font-size: 14px;
    }
    
    .exclusion-range-delete:hover {
      color: var(--danger-color);
    }
    
    .add-exclusion-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: none;
      border: 1px dashed var(--border-color);
      border-radius: 4px;
      color: var(--text-muted);
      cursor: pointer;
      width: 100%;
      margin-top: 8px;
      font-size: 13px;
    }
    
    .add-exclusion-btn:hover {
      border-color: var(--accent-color);
      color: var(--text-color);
    }
    
    .exclusion-range-inputs {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    
    .exclusion-range-inputs input {
      width: 60px;
      padding: 4px 8px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-color);
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
    }
    
    .no-exclusions {
      color: var(--text-muted);
      font-size: 13px;
      font-style: italic;
    }
    
    /* Theme Keyword Hues Section */
    .theme-hues-section {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }
    
    .theme-hue-presets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .theme-preset-btn {
      padding: 6px 12px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-color);
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .theme-preset-btn:hover {
      border-color: var(--accent-color);
    }
    
    .theme-preset-btn.active {
      border-color: var(--accent-color);
      background: rgba(14, 99, 156, 0.2);
    }
    
    .preset-color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.3);
    }
    
    .theme-hue-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    
    .theme-hue-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
    }
    
    .theme-hue-tag .hue-color-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.3);
    }
    
    .theme-hue-tag .remove-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 0;
      font-size: 12px;
      line-height: 1;
    }
    
    .theme-hue-tag .remove-btn:hover {
      color: var(--danger-color);
    }
    
    .add-hue-form {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 12px;
    }
    
    .add-hue-form input[type="number"] {
      width: 80px;
      padding: 6px 10px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-color);
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
    }
    
    .add-hue-form button {
      padding: 6px 12px;
      background: var(--accent-color);
      border: none;
      border-radius: 4px;
      color: #fff;
      cursor: pointer;
      font-size: 12px;
    }
    
    .add-hue-form button:hover {
      background: var(--accent-hover);
    }

    .eyedropper-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: var(--card-bg);
      border: 1px solid var(--accent-color);
      border-radius: 6px;
      color: var(--accent-color);
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
    }

    .eyedropper-btn:hover {
      background: var(--accent-color);
      color: #fff;
    }

    .eyedropper-btn svg {
      width: 16px;
      height: 16px;
    }

    .eyedropper-result {
      display: none;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding: 8px 12px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      font-size: 12px;
    }

    .eyedropper-result.visible {
      display: flex;
    }

    .eyedropper-result .picked-color {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }

    .eyedropper-result button {
      margin-left: auto;
      padding: 4px 10px;
      background: var(--accent-color);
      border: none;
      border-radius: 4px;
      color: #fff;
      cursor: pointer;
      font-size: 11px;
    }

    .eyedropper-unsupported {
      font-size: 12px;
      color: var(--text-muted);
      font-style: italic;
    }

    /* Builtins Section */
    .builtins-section {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    
    .builtins-subsection {
      margin-top: 16px;
    }
    
    .builtins-subsection-title {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .builtins-subsection-title .count {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: normal;
    }
    
    .builtins-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }
    
    .builtin-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
    }
    
    .builtin-tag.additional {
      border-color: #98c379;
      background: rgba(152, 195, 121, 0.1);
    }
    
    .builtin-tag.disabled {
      border-color: var(--danger-color);
      background: rgba(241, 76, 76, 0.1);
      text-decoration: line-through;
      color: var(--text-muted);
    }
    
    .builtin-tag .remove-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 0;
      font-size: 12px;
      line-height: 1;
    }
    
    .builtin-tag .remove-btn:hover {
      color: var(--danger-color);
    }
    
    .add-builtin-form {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    
    .add-builtin-form input {
      flex: 1;
      padding: 6px 10px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-color);
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
    }
    
    .add-builtin-form input:focus {
      outline: none;
      border-color: var(--accent-color);
    }
    
    .add-builtin-form button {
      padding: 6px 12px;
      background: var(--accent-color);
      border: none;
      border-radius: 4px;
      color: #fff;
      cursor: pointer;
      font-size: 12px;
    }
    
    .add-builtin-form button:hover {
      background: var(--accent-hover);
    }
    
    .default-builtins-toggle {
      margin-top: 12px;
    }
    
    .default-builtins-list {
      max-height: 150px;
      overflow-y: auto;
      padding: 8px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      margin-top: 8px;
    }
    
    .default-builtin-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      margin: 2px;
      background: var(--card-bg);
      border-radius: 3px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 11px;
      cursor: pointer;
    }
    
    .default-builtin-item:hover {
      background: var(--border-color);
    }
    
    .default-builtin-item.disabled {
      text-decoration: line-through;
      color: var(--text-muted);
    }
    
    .default-builtin-item input {
      margin: 0;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h1>🎨 Python Semantic Highlighter</h1>
  <p class="subtitle">Configure colors for semantic highlighting. Changes apply immediately.</p>
  
  <h2>General Settings</h2>
  <div class="general-settings">
    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-name">Enable Highlighter</span>
        <span class="setting-desc">Turn semantic highlighting on/off</span>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="enable-toggle" checked>
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-name">Debounce Delay</span>
        <span class="setting-desc">Delay before re-highlighting after edits (ms)</span>
      </div>
      <div class="debounce-control">
        <input type="range" id="debounce-slider" min="50" max="500" value="150">
        <span id="debounce-value">150ms</span>
      </div>
    </div>
  </div>
  
  <h2>Hue Exclusion</h2>
  <p class="subtitle">Exclude certain hue ranges from symbol coloring to distinguish from keywords.</p>
  <div class="exclusion-section">
    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-name">Exclude Keyword Hues</span>
        <span class="setting-desc">Automatically exclude hues of keyword colors from symbol coloring</span>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="exclude-keyword-hues-toggle" checked>
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="setting-row" id="exclusion-range-row">
      <div class="setting-info">
        <span class="setting-name">Exclusion Range</span>
        <span class="setting-desc">Range around each keyword hue to exclude (±degrees)</span>
      </div>
      <div class="debounce-control">
        <input type="range" id="exclusion-range-slider" min="5" max="60" value="20">
        <span id="exclusion-range-value">±20°</span>
      </div>
    </div>
    
    <div class="exclusion-visualization">
      <div class="exclusion-wheel-container">
        <div class="exclusion-wheel">
          <div class="exclusion-wheel-inner"></div>
        </div>
        <svg class="exclusion-overlay" viewBox="0 0 100 100" id="exclusion-overlay"></svg>
      </div>
      <div class="exclusion-info">
        <div class="setting-name" style="margin-bottom: 8px;">Excluded Hue Ranges</div>
        <div id="exclusion-ranges-list" class="exclusion-ranges-list"></div>
        <button class="add-exclusion-btn" id="add-exclusion-btn">+ Add Manual Exclusion Range</button>
      </div>
    </div>
    
    <div class="theme-hues-section">
      <div class="setting-name" style="margin-bottom: 8px;">Theme Keyword Hues</div>
      <p class="setting-desc">Select the hue(s) your theme uses for keywords like <code>def</code>, <code>if</code>, <code>return</code>. These will be excluded from symbol coloring.</p>
      
      <div class="theme-hue-presets">
        <button class="theme-preset-btn" data-preset="purple" data-hue="300">
          <span class="preset-color-dot" style="background: hsl(300, 60%, 60%)"></span>
          Purple/Magenta
        </button>
        <button class="theme-preset-btn" data-preset="orange" data-hue="30">
          <span class="preset-color-dot" style="background: hsl(30, 60%, 60%)"></span>
          Orange
        </button>
        <button class="theme-preset-btn" data-preset="blue" data-hue="220">
          <span class="preset-color-dot" style="background: hsl(220, 60%, 60%)"></span>
          Blue
        </button>
        <button class="theme-preset-btn" data-preset="red" data-hue="0">
          <span class="preset-color-dot" style="background: hsl(0, 60%, 60%)"></span>
          Red
        </button>
        <button class="theme-preset-btn" data-preset="cyan" data-hue="180">
          <span class="preset-color-dot" style="background: hsl(180, 60%, 60%)"></span>
          Cyan
        </button>
      </div>
      
      <div style="margin: 12px 0;">
        <button id="eyedropper-btn" class="eyedropper-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 22l1-1h3l9-9"/>
            <path d="M3 21v-3l9-9"/>
            <path d="M14.5 5.5l4 4"/>
            <path d="M18.5 1.5a2.12 2.12 0 013 3l-1 1-4-4 1-1z"/>
          </svg>
          Pick color from screen
        </button>
        <span id="eyedropper-unsupported" class="eyedropper-unsupported" style="display: none;">
          (EyeDropper not supported in this environment)
        </span>
        <div id="eyedropper-result" class="eyedropper-result">
          <span class="picked-color" id="picked-color-preview"></span>
          <span>Hue: <strong id="picked-hue-value">0</strong>°</span>
          <span style="color: var(--text-muted);" id="picked-hex-value">#000000</span>
          <button id="add-picked-hue-btn">Add this hue</button>
        </div>
      </div>
      
      <div class="setting-row" style="border: none; padding: 8px 0;">
        <div class="setting-info">
          <span class="setting-name" style="font-size: 13px;">Exclusion Range</span>
          <span class="setting-desc">Range around each hue to exclude (±degrees)</span>
        </div>
        <div class="debounce-control">
          <input type="range" id="theme-hue-range-slider" min="5" max="60" value="25">
          <span id="theme-hue-range-value">±25°</span>
        </div>
      </div>
      
      <div class="setting-name" style="font-size: 13px; margin-top: 8px;">Active Theme Hues</div>
      <div id="theme-hue-list" class="theme-hue-list"></div>
      
      <div class="add-hue-form">
        <span style="color: var(--text-muted); font-size: 12px;">Custom:</span>
        <input type="number" id="add-theme-hue-input" min="0" max="360" placeholder="0-360">
        <span style="color: var(--text-muted);">°</span>
        <button id="add-theme-hue-btn">Add</button>
      </div>
    </div>
  </div>
  
  <h2>Semantic Categories</h2>
  <p class="subtitle">Hash-based coloring within HSV ranges. Toggle off to use IDE theme defaults.</p>
  <div id="semantic-categories"></div>
  
  <h2>Builtins</h2>
  <p class="subtitle">Configure which names are treated as Python builtins (colored using the 'builtin' category).</p>
  <div class="builtins-section">
    <div class="builtins-subsection">
      <div class="builtins-subsection-title">
        Additional Builtins <span class="count" id="additional-count">(0)</span>
      </div>
      <p class="setting-desc">Names to add as builtins (e.g., numpy, pandas, torch)</p>
      <div id="additional-builtins-list" class="builtins-list"></div>
      <div class="add-builtin-form">
        <input type="text" id="add-additional-input" placeholder="Enter name...">
        <button id="add-additional-btn">Add</button>
      </div>
    </div>
    
    <div class="builtins-subsection">
      <div class="builtins-subsection-title">
        Disabled Builtins <span class="count" id="disabled-count">(0)</span>
      </div>
      <p class="setting-desc">Default builtins to disable (will use normal variable coloring)</p>
      <div id="disabled-builtins-list" class="builtins-list"></div>
      <div class="add-builtin-form">
        <input type="text" id="add-disabled-input" placeholder="Enter name...">
        <button id="add-disabled-btn">Add</button>
      </div>
    </div>
    
    <div class="builtins-subsection default-builtins-toggle">
      <details>
        <summary style="cursor: pointer; color: var(--text-muted); font-size: 13px;">View/Edit Default Builtins</summary>
        <div id="default-builtins-list" class="default-builtins-list"></div>
      </details>
    </div>
  </div>
  
  <h2>Keyword Colors</h2>
  <p class="subtitle">Click color swatch to set custom color. Click ✕ to reset to theme default.</p>
  <div id="keyword-colors" class="keyword-grid"></div>

  <script>
    const vscode = acquireVsCodeApi();
    
    const categoryLabels = {
      localVariable: 'Local Variable',
      globalVariable: 'Global Variable', 
      parameter: 'Parameter',
      functionDef: 'Function Definition',
      functionCall: 'Function Call',
      methodCall: 'Method Call',
      classDef: 'Class Definition',
      classReference: 'Class Reference',
      attribute: 'Attribute',
      typeAnnotation: 'Type Annotation',
      decorator: 'Decorator',
      self: 'self / cls',
      builtin: 'Built-in',
      kwargName: 'Kwarg Name (func(x=0))',
      import: 'Import',
      stringLiteral: 'String Literal',
      fstringLiteral: 'F-String',
      rawStringLiteral: 'Raw String',
      byteStringLiteral: 'Byte String',
      comment: 'Comment (# ...)',
      docstring: 'Docstring ("""...""")'
    };
    
    const defaultCategories = {
      localVariable: { enabled: true, hueRange: [0, 360], saturation: [45, 65], lightness: [55, 70] },
      globalVariable: { enabled: true, hueRange: [0, 360], saturation: [50, 70], lightness: [50, 65] },
      parameter: { enabled: true, hueRange: [0, 360], saturation: [45, 65], lightness: [55, 70] },
      functionDef: { enabled: true, hueRange: [30, 60], saturation: [50, 70], lightness: [55, 70] },
      functionCall: { enabled: true, hueRange: [30, 60], saturation: [50, 70], lightness: [55, 70] },
      methodCall: { enabled: true, hueRange: [0, 30], saturation: [50, 70], lightness: [55, 70] },
      classDef: { enabled: true, hueRange: [45, 75], saturation: [55, 75], lightness: [55, 70] },
      classReference: { enabled: true, hueRange: [45, 75], saturation: [55, 75], lightness: [55, 70] },
      attribute: { enabled: true, hueRange: [150, 210], saturation: [40, 55], lightness: [55, 70] },
      typeAnnotation: { enabled: false, hueRange: [280, 320], saturation: [35, 50], lightness: [60, 75] },
      decorator: { enabled: true, hueRange: [50, 70], saturation: [60, 80], lightness: [50, 65] },
      self: { enabled: true, hueRange: [290, 310], saturation: [50, 70], lightness: [50, 65] },
      builtin: { enabled: true, hueRange: [220, 260], saturation: [40, 60], lightness: [55, 70] },
      kwargName: { enabled: true, hueRange: [0, 360], saturation: [40, 60], lightness: [55, 70] },
      import: { enabled: true, hueRange: [0, 360], saturation: [35, 55], lightness: [60, 75] },
      stringLiteral: { enabled: false, hueRange: [80, 120], saturation: [40, 60], lightness: [50, 65] },
      fstringLiteral: { enabled: false, hueRange: [30, 60], saturation: [45, 65], lightness: [55, 70] },
      rawStringLiteral: { enabled: false, hueRange: [180, 220], saturation: [40, 60], lightness: [50, 65] },
      byteStringLiteral: { enabled: false, hueRange: [270, 310], saturation: [40, 60], lightness: [50, 65] },
      comment: { enabled: false, hueRange: [90, 130], saturation: [20, 40], lightness: [45, 60] },
      docstring: { enabled: false, hueRange: [100, 140], saturation: [30, 50], lightness: [50, 65] }
    };
    
    const keywords = [
      'def', 'class', 'return', 'yield', 'await', 'async',
      'if', 'elif', 'else', 'for', 'while', 'break', 'continue',
      'try', 'except', 'finally', 'raise', 'with', 'as',
      'import', 'from', 'pass', 'lambda', 'global', 'nonlocal',
      'assert', 'del', 'in', 'is', 'not', 'and', 'or',
      'match', 'case', 'type'
    ];
    
    let currentSettings = {
      semanticCategories: { ...defaultCategories },
      keywordColors: {},
      excludeKeywordHues: true,
      keywordHueExclusionRange: 20,
      excludedHueRanges: [],
      additionalBuiltins: [],
      disabledBuiltins: [],
      themeKeywordHues: [],
      themeKeywordHueRange: 25
    };
    
    const defaultBuiltins = [
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
      'OSError', 'IOError', 'FileNotFoundError', 'PermissionError', 'ZeroDivisionError'
    ];
    
    function hslToHex(h, s, l) {
      s /= 100; l /= 100;
      const a = s * Math.min(l, 1 - l);
      const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
      };
      return '#' + f(0) + f(8) + f(4);
    }
    
    function hexToHsl(hex) {
      hex = hex.replace(/^#/, '');
      if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return null;
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      let h = 0;
      if (delta !== 0) {
        if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
        else if (max === g) h = ((b - r) / delta + 2) * 60;
        else h = ((r - g) / delta + 4) * 60;
      }
      return Math.round(h);
    }
    
    function getAutoExcludedRanges() {
      const ranges = [];
      
      // Helper to add range with wraparound
      function addRange(hue, range, label, type) {
        let minHue = hue - range;
        let maxHue = hue + range;
        if (minHue < 0) {
          ranges.push({ min: 0, max: maxHue, label, type, hue });
          ranges.push({ min: 360 + minHue, max: 360, label, type, hue });
        } else if (maxHue > 360) {
          ranges.push({ min: minHue, max: 360, label, type, hue });
          ranges.push({ min: 0, max: maxHue - 360, label, type, hue });
        } else {
          ranges.push({ min: minHue, max: maxHue, label, type, hue });
        }
      }
      
      // Add theme keyword hues
      const themeHueRange = currentSettings.themeKeywordHueRange;
      for (const hue of currentSettings.themeKeywordHues) {
        addRange(hue, themeHueRange, 'theme ' + hue + '°', 'theme');
      }
      
      // Add keyword colors (if enabled)
      if (currentSettings.excludeKeywordHues) {
        const exclusionRange = currentSettings.keywordHueExclusionRange;
        for (const [keyword, color] of Object.entries(currentSettings.keywordColors)) {
          if (color && color !== '') {
            const hue = hexToHsl(color);
            if (hue !== null) {
              addRange(hue, exclusionRange, keyword, 'keyword');
            }
          }
        }
      }
      
      return ranges;
    }
    
    function getAllExcludedRanges() {
      const autoRanges = getAutoExcludedRanges();
      const manualRanges = (currentSettings.excludedHueRanges || []).map(r => ({
        min: r[0],
        max: r[1],
        type: 'manual',
        label: 'manual'
      }));
      return [...autoRanges, ...manualRanges];
    }
    
    function renderExclusionVisualization() {
      const overlay = document.getElementById('exclusion-overlay');
      const list = document.getElementById('exclusion-ranges-list');
      const allRanges = getAllExcludedRanges();
      
      // Render SVG overlay
      let svgContent = '';
      for (const range of allRanges) {
        const startAngle = (range.min - 90) * Math.PI / 180;
        const endAngle = (range.max - 90) * Math.PI / 180;
        const radius = 50;
        const innerRadius = 25;
        
        const x1 = 50 + radius * Math.cos(startAngle);
        const y1 = 50 + radius * Math.sin(startAngle);
        const x2 = 50 + radius * Math.cos(endAngle);
        const y2 = 50 + radius * Math.sin(endAngle);
        const x3 = 50 + innerRadius * Math.cos(endAngle);
        const y3 = 50 + innerRadius * Math.sin(endAngle);
        const x4 = 50 + innerRadius * Math.cos(startAngle);
        const y4 = 50 + innerRadius * Math.sin(startAngle);
        
        const largeArc = (range.max - range.min) > 180 ? 1 : 0;
        
        svgContent += '<path d="M ' + x1 + ' ' + y1 + 
          ' A ' + radius + ' ' + radius + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 +
          ' L ' + x3 + ' ' + y3 +
          ' A ' + innerRadius + ' ' + innerRadius + ' 0 ' + largeArc + ' 0 ' + x4 + ' ' + y4 +
          ' Z" fill="rgba(0,0,0,0.7)" stroke="' + (range.auto ? '#0e639c' : '#e67e22') + '" stroke-width="0.5"/>';
      }
      overlay.innerHTML = svgContent;
      
      // Render list
      if (allRanges.length === 0) {
        list.innerHTML = '<div class="no-exclusions">No exclusion ranges configured. Keyword colors will be set in the Keyword Colors section below.</div>';
        return;
      }
      
      let listHtml = '';
      let manualIndex = 0;
      for (let i = 0; i < allRanges.length; i++) {
        const range = allRanges[i];
        const midHue = (range.min + range.max) / 2;
        const bgColor = hslToHex(midHue, 60, 50);
        
        const typeClass = range.type === 'manual' ? 'manual' : 'auto';
        listHtml += '<div class="exclusion-range-item ' + typeClass + '">';
        listHtml += '<div class="exclusion-range-color" style="background: ' + bgColor + '"></div>';

        if (range.type === 'manual') {
          listHtml += '<div class="exclusion-range-inputs">';
          listHtml += '<input type="number" min="0" max="360" value="' + Math.round(range.min) + '" data-manual-index="' + manualIndex + '" data-field="min" title="Min hue">°';
          listHtml += '<span>-</span>';
          listHtml += '<input type="number" min="0" max="360" value="' + Math.round(range.max) + '" data-manual-index="' + manualIndex + '" data-field="max" title="Max hue">°';
          listHtml += '</div>';
          listHtml += '<span class="exclusion-range-label">manual</span>';
          listHtml += '<button class="exclusion-range-delete" data-manual-index="' + manualIndex + '" title="Remove">✕</button>';
          manualIndex++;
        } else {
          listHtml += '<span class="exclusion-range-text">' + Math.round(range.min) + '° - ' + Math.round(range.max) + '°</span>';
          listHtml += '<span class="exclusion-range-label">' + range.label + '</span>';
        }
        listHtml += '</div>';
      }
      list.innerHTML = listHtml;
      
      // Add input change handlers for manual ranges
      list.querySelectorAll('.exclusion-range-inputs input').forEach(input => {
        input.addEventListener('change', (e) => {
          const index = parseInt(e.target.dataset.manualIndex);
          const field = e.target.dataset.field;
          const value = parseInt(e.target.value) || 0;
          if (field === 'min') {
            currentSettings.excludedHueRanges[index][0] = Math.max(0, Math.min(360, value));
          } else {
            currentSettings.excludedHueRanges[index][1] = Math.max(0, Math.min(360, value));
          }
          vscode.postMessage({ command: 'updateExcludedHueRanges', value: currentSettings.excludedHueRanges });
          renderExclusionVisualization();
        });
      });
      
      // Add delete handlers
      list.querySelectorAll('.exclusion-range-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.target.dataset.manualIndex);
          currentSettings.excludedHueRanges.splice(index, 1);
          vscode.postMessage({ command: 'updateExcludedHueRanges', value: currentSettings.excludedHueRanges });
          renderExclusionVisualization();
        });
      });
    }
    
    function renderBuiltins() {
      // Render additional builtins
      const additionalList = document.getElementById('additional-builtins-list');
      const additionalCount = document.getElementById('additional-count');
      additionalCount.textContent = '(' + currentSettings.additionalBuiltins.length + ')';
      
      let additionalHtml = '';
      for (let i = 0; i < currentSettings.additionalBuiltins.length; i++) {
        const name = currentSettings.additionalBuiltins[i];
        additionalHtml += '<span class="builtin-tag additional">' + name + 
          '<button class="remove-btn" data-type="additional" data-index="' + i + '">✕</button></span>';
      }
      additionalList.innerHTML = additionalHtml || '<span class="no-exclusions">No additional builtins</span>';
      
      // Render disabled builtins
      const disabledList = document.getElementById('disabled-builtins-list');
      const disabledCount = document.getElementById('disabled-count');
      disabledCount.textContent = '(' + currentSettings.disabledBuiltins.length + ')';
      
      let disabledHtml = '';
      for (let i = 0; i < currentSettings.disabledBuiltins.length; i++) {
        const name = currentSettings.disabledBuiltins[i];
        disabledHtml += '<span class="builtin-tag disabled">' + name + 
          '<button class="remove-btn" data-type="disabled" data-index="' + i + '">✕</button></span>';
      }
      disabledList.innerHTML = disabledHtml || '<span class="no-exclusions">No disabled builtins</span>';
      
      // Render default builtins list
      const defaultList = document.getElementById('default-builtins-list');
      let defaultHtml = '';
      const disabledSet = new Set(currentSettings.disabledBuiltins);
      for (const name of defaultBuiltins) {
        const isDisabled = disabledSet.has(name);
        defaultHtml += '<label class="default-builtin-item' + (isDisabled ? ' disabled' : '') + '">' +
          '<input type="checkbox" ' + (isDisabled ? '' : 'checked') + ' data-builtin="' + name + '">' +
          name + '</label>';
      }
      defaultList.innerHTML = defaultHtml;
      
      // Add event handlers for remove buttons
      document.querySelectorAll('.builtin-tag .remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const type = e.target.dataset.type;
          const index = parseInt(e.target.dataset.index);
          if (type === 'additional') {
            currentSettings.additionalBuiltins.splice(index, 1);
            vscode.postMessage({ command: 'updateAdditionalBuiltins', value: currentSettings.additionalBuiltins });
          } else {
            currentSettings.disabledBuiltins.splice(index, 1);
            vscode.postMessage({ command: 'updateDisabledBuiltins', value: currentSettings.disabledBuiltins });
          }
          renderBuiltins();
        });
      });
      
      // Add event handlers for default builtin checkboxes
      defaultList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
          const name = e.target.dataset.builtin;
          if (e.target.checked) {
            // Remove from disabled list
            const index = currentSettings.disabledBuiltins.indexOf(name);
            if (index !== -1) {
              currentSettings.disabledBuiltins.splice(index, 1);
              vscode.postMessage({ command: 'updateDisabledBuiltins', value: currentSettings.disabledBuiltins });
            }
          } else {
            // Add to disabled list
            if (!currentSettings.disabledBuiltins.includes(name)) {
              currentSettings.disabledBuiltins.push(name);
              vscode.postMessage({ command: 'updateDisabledBuiltins', value: currentSettings.disabledBuiltins });
            }
          }
          renderBuiltins();
        });
      });
    }
    
    function setupBuiltinsHandlers() {
      const addAdditionalInput = document.getElementById('add-additional-input');
      const addAdditionalBtn = document.getElementById('add-additional-btn');
      const addDisabledInput = document.getElementById('add-disabled-input');
      const addDisabledBtn = document.getElementById('add-disabled-btn');
      
      function addAdditional() {
        const value = addAdditionalInput.value.trim();
        if (value && !currentSettings.additionalBuiltins.includes(value)) {
          currentSettings.additionalBuiltins.push(value);
          vscode.postMessage({ command: 'updateAdditionalBuiltins', value: currentSettings.additionalBuiltins });
          addAdditionalInput.value = '';
          renderBuiltins();
        }
      }
      
      function addDisabled() {
        const value = addDisabledInput.value.trim();
        if (value && !currentSettings.disabledBuiltins.includes(value)) {
          currentSettings.disabledBuiltins.push(value);
          vscode.postMessage({ command: 'updateDisabledBuiltins', value: currentSettings.disabledBuiltins });
          addDisabledInput.value = '';
          renderBuiltins();
        }
      }
      
      addAdditionalBtn.addEventListener('click', addAdditional);
      addAdditionalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addAdditional();
      });
      
      addDisabledBtn.addEventListener('click', addDisabled);
      addDisabledInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addDisabled();
      });
    }
    
    function renderThemeKeywordHues() {
      const list = document.getElementById('theme-hue-list');
      const presetBtns = document.querySelectorAll('.theme-preset-btn');
      
      // Update preset button states
      presetBtns.forEach(btn => {
        const hue = parseInt(btn.dataset.hue);
        const isActive = currentSettings.themeKeywordHues.includes(hue);
        btn.classList.toggle('active', isActive);
      });
      
      // Render hue list
      if (currentSettings.themeKeywordHues.length === 0) {
        list.innerHTML = '<span class="no-exclusions">No theme hues selected. Click presets above or add custom hue.</span>';
        return;
      }
      
      let html = '';
      for (let i = 0; i < currentSettings.themeKeywordHues.length; i++) {
        const hue = currentSettings.themeKeywordHues[i];
        html += '<span class="theme-hue-tag">' +
          '<span class="hue-color-dot" style="background: hsl(' + hue + ', 60%, 60%)"></span>' +
          hue + '°' +
          '<button class="remove-btn" data-index="' + i + '">✕</button>' +
          '</span>';
      }
      list.innerHTML = html;
      
      // Add remove handlers
      list.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.target.dataset.index);
          currentSettings.themeKeywordHues.splice(index, 1);
          vscode.postMessage({ command: 'updateThemeKeywordHues', value: currentSettings.themeKeywordHues });
          renderThemeKeywordHues();
          renderExclusionVisualization();
        });
      });
    }
    
    function setupThemeKeywordHuesHandlers() {
      const presetBtns = document.querySelectorAll('.theme-preset-btn');
      const addInput = document.getElementById('add-theme-hue-input');
      const addBtn = document.getElementById('add-theme-hue-btn');
      const rangeSlider = document.getElementById('theme-hue-range-slider');
      const rangeValue = document.getElementById('theme-hue-range-value');
      
      // Preset button handlers
      presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const hue = parseInt(btn.dataset.hue);
          const index = currentSettings.themeKeywordHues.indexOf(hue);
          if (index === -1) {
            currentSettings.themeKeywordHues.push(hue);
          } else {
            currentSettings.themeKeywordHues.splice(index, 1);
          }
          vscode.postMessage({ command: 'updateThemeKeywordHues', value: currentSettings.themeKeywordHues });
          renderThemeKeywordHues();
          renderExclusionVisualization();
        });
      });
      
      // Range slider handler
      rangeSlider.addEventListener('input', (e) => {
        rangeValue.textContent = '±' + e.target.value + '°';
      });
      
      rangeSlider.addEventListener('change', (e) => {
        currentSettings.themeKeywordHueRange = parseInt(e.target.value);
        vscode.postMessage({ command: 'updateThemeKeywordHueRange', value: parseInt(e.target.value) });
        renderExclusionVisualization();
      });
      
      // Add custom hue handler
      function addCustomHue() {
        const value = parseInt(addInput.value);
        if (!isNaN(value) && value >= 0 && value <= 360 && !currentSettings.themeKeywordHues.includes(value)) {
          currentSettings.themeKeywordHues.push(value);
          vscode.postMessage({ command: 'updateThemeKeywordHues', value: currentSettings.themeKeywordHues });
          addInput.value = '';
          renderThemeKeywordHues();
          renderExclusionVisualization();
        }
      }
      
      addBtn.addEventListener('click', addCustomHue);
      addInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCustomHue();
      });
      
      // Eyedropper handler
      const eyedropperBtn = document.getElementById('eyedropper-btn');
      const eyedropperUnsupported = document.getElementById('eyedropper-unsupported');
      const eyedropperResult = document.getElementById('eyedropper-result');
      const pickedColorPreview = document.getElementById('picked-color-preview');
      const pickedHueValue = document.getElementById('picked-hue-value');
      const pickedHexValue = document.getElementById('picked-hex-value');
      const addPickedHueBtn = document.getElementById('add-picked-hue-btn');
      
      // Check if EyeDropper is supported
      if (!window.EyeDropper) {
        eyedropperBtn.style.display = 'none';
        eyedropperUnsupported.style.display = 'inline';
      } else {
        let lastPickedHue = null;
        
        eyedropperBtn.addEventListener('click', async () => {
          try {
            const eyeDropper = new EyeDropper();
            const result = await eyeDropper.open();
            const hex = result.sRGBHex;
            
            // Convert hex to HSL
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            let h = 0;
            
            if (max !== min) {
              const d = max - min;
              switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
              }
            }
            
            const hue = Math.round(h * 360);
            lastPickedHue = hue;
            
            // Show result
            pickedColorPreview.style.background = hex;
            pickedHueValue.textContent = hue;
            pickedHexValue.textContent = hex;
            eyedropperResult.classList.add('visible');
          } catch (e) {
            // User cancelled or error
            console.log('EyeDropper cancelled or error:', e);
          }
        });
        
        addPickedHueBtn.addEventListener('click', () => {
          if (lastPickedHue !== null && !currentSettings.themeKeywordHues.includes(lastPickedHue)) {
            currentSettings.themeKeywordHues.push(lastPickedHue);
            vscode.postMessage({ command: 'updateThemeKeywordHues', value: currentSettings.themeKeywordHues });
            renderThemeKeywordHues();
            renderExclusionVisualization();
            eyedropperResult.classList.remove('visible');
          }
        });
      }
    }
    
    function renderSemanticCategories() {
      const container = document.getElementById('semantic-categories');
      container.innerHTML = '';
      
      for (const [key, label] of Object.entries(categoryLabels)) {
        const config = { ...defaultCategories[key], ...currentSettings.semanticCategories[key] };
        const card = document.createElement('div');
        card.className = 'category-card' + (config.enabled ? '' : ' disabled');
        card.dataset.category = key;
        
        card.innerHTML = \`
          <div class="category-header">
            <span class="category-name">\${label}</span>
            <label class="toggle-switch">
              <input type="checkbox" \${config.enabled ? 'checked' : ''} data-field="enabled">
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <div class="hue-picker-row">
            <div class="circular-hue-picker" data-hue-picker>
              <div class="hue-wheel">
                <div class="hue-wheel-inner"></div>
              </div>
              <svg class="hue-arc" viewBox="0 0 100 100">
                <path data-arc-path fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="8" stroke-linecap="round"/>
              </svg>
              <div class="hue-handle start" data-handle="start"></div>
              <div class="hue-handle end" data-handle="end"></div>
              <input type="hidden" data-field="hueMin" value="\${config.hueRange[0]}">
              <input type="hidden" data-field="hueMax" value="\${config.hueRange[1]}">
            </div>
            <div class="hue-info">
              <div class="hue-value-display">Start: <span data-value="hueStart">\${config.hueRange[0]}°</span></div>
              <div class="hue-value-display">End: <span data-value="hueEnd">\${config.hueRange[1]}°</span></div>
              <div class="hue-value-display">Range: <span data-value="hueRange">\${config.hueRange[1] - config.hueRange[0]}°</span></div>
              <button class="full-range-btn" data-full-range title="Set full hue range (0°-360°)">🌈 Full Range</button>
            </div>
          </div>
          
          <div class="slider-row">
            <span class="slider-label">Saturation</span>
            <div class="range-slider">
              <div class="range-track"></div>
              <div class="range-track-fill" data-fill="sat"></div>
              <input type="range" min="0" max="100" value="\${config.saturation[0]}" data-field="satMin">
              <input type="range" min="0" max="100" value="\${config.saturation[1]}" data-field="satMax">
            </div>
            <span class="slider-value" data-value="sat">\${config.saturation[0]}% - \${config.saturation[1]}%</span>
          </div>
          
          <div class="slider-row">
            <span class="slider-label">Lightness</span>
            <div class="range-slider">
              <div class="range-track"></div>
              <div class="range-track-fill" data-fill="light"></div>
              <input type="range" min="0" max="100" value="\${config.lightness[0]}" data-field="lightMin">
              <input type="range" min="0" max="100" value="\${config.lightness[1]}" data-field="lightMax">
            </div>
            <span class="slider-value" data-value="light">\${config.lightness[0]}% - \${config.lightness[1]}%</span>
          </div>
          
          <div class="color-preview"></div>
        \`;
        
        container.appendChild(card);
        updateSliderFills(card, config);
        updateColorPreview(card, config);
        
        // Event listeners
        card.querySelector('[data-field="enabled"]').addEventListener('change', (e) => {
          card.className = 'category-card' + (e.target.checked ? '' : ' disabled');
          saveCategory(key, card);
        });
        
        card.querySelectorAll('input[type="range"]').forEach(input => {
          input.addEventListener('input', () => {
            const cfg = getConfigFromCard(card);
            updateSliderFills(card, cfg);
            updateColorPreview(card, cfg);
            updateSliderLabels(card, cfg);
          });
          input.addEventListener('change', () => saveCategory(key, card));
        });
        
        // Circular hue picker drag handlers
        setupHuePicker(card, key);
      }
    }
    
    function setupHuePicker(card, categoryKey) {
      const picker = card.querySelector('[data-hue-picker]');
      if (!picker) return;
      
      const startHandle = picker.querySelector('[data-handle="start"]');
      const endHandle = picker.querySelector('[data-handle="end"]');
      
      let isDragging = false;
      let currentHandle = null;
      
      function getAngleFromEvent(e) {
        const rect = picker.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
        if (angle < 0) angle += 360;
        return Math.round(angle) % 360;
      }
      
      function onMouseDown(handle, e) {
        e.preventDefault();
        isDragging = true;
        currentHandle = handle;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }
      
      function onMouseMove(e) {
        if (!isDragging) return;
        
        const angle = getAngleFromEvent(e);
        const hueMinInput = card.querySelector('[data-field="hueMin"]');
        const hueMaxInput = card.querySelector('[data-field="hueMax"]');
        
        if (currentHandle === 'start') {
          hueMinInput.value = angle;
        } else {
          hueMaxInput.value = angle;
        }
        
        const cfg = getConfigFromCard(card);
        updateSliderFills(card, cfg);
        updateColorPreview(card, cfg);
        updateSliderLabels(card, cfg);
      }
      
      function onMouseUp() {
        if (isDragging) {
          isDragging = false;
          currentHandle = null;
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          saveCategory(categoryKey, card);
        }
      }
      
      startHandle.addEventListener('mousedown', (e) => onMouseDown('start', e));
      endHandle.addEventListener('mousedown', (e) => onMouseDown('end', e));
      
      // Full Range button
      const fullRangeBtn = card.querySelector('[data-full-range]');
      if (fullRangeBtn) {
        fullRangeBtn.addEventListener('click', () => {
          const hueMinInput = card.querySelector('[data-field="hueMin"]');
          const hueMaxInput = card.querySelector('[data-field="hueMax"]');
          hueMinInput.value = 0;
          hueMaxInput.value = 360;
          
          const cfg = getConfigFromCard(card);
          updateSliderFills(card, cfg);
          updateColorPreview(card, cfg);
          updateSliderLabels(card, cfg);
          saveCategory(categoryKey, card);
        });
      }
    }
    
    function updateSliderFills(card, config) {
      const satFill = card.querySelector('[data-fill="sat"]');
      const lightFill = card.querySelector('[data-fill="light"]');
      
      satFill.style.left = config.saturation[0] + '%';
      satFill.style.width = (config.saturation[1] - config.saturation[0]) + '%';
      
      lightFill.style.left = config.lightness[0] + '%';
      lightFill.style.width = (config.lightness[1] - config.lightness[0]) + '%';
      
      // Update circular hue picker
      updateHuePicker(card, config.hueRange[0], config.hueRange[1]);
    }
    
    function updateHuePicker(card, hueStart, hueEnd) {
      const picker = card.querySelector('[data-hue-picker]');
      if (!picker) return;
      
      const startHandle = picker.querySelector('[data-handle="start"]');
      const endHandle = picker.querySelector('[data-handle="end"]');
      const arcPath = picker.querySelector('[data-arc-path]');
      
      const radius = 50;
      const handleRadius = 43; // Position handles on the wheel
      
      // Convert hue to radians (0° = top, clockwise)
      const startRad = (hueStart - 90) * Math.PI / 180;
      const endRad = (hueEnd - 90) * Math.PI / 180;
      
      // Position handles
      const startX = 50 + handleRadius * Math.cos(startRad);
      const startY = 50 + handleRadius * Math.sin(startRad);
      const endX = 50 + handleRadius * Math.cos(endRad);
      const endY = 50 + handleRadius * Math.sin(endRad);
      
      startHandle.style.left = startX + '%';
      startHandle.style.top = startY + '%';
      endHandle.style.left = endX + '%';
      endHandle.style.top = endY + '%';
      
      // Draw arc
      const arcRadius = 43;
      const largeArc = (hueEnd - hueStart) > 180 ? 1 : 0;
      const arcStartX = 50 + arcRadius * Math.cos(startRad);
      const arcStartY = 50 + arcRadius * Math.sin(startRad);
      const arcEndX = 50 + arcRadius * Math.cos(endRad);
      const arcEndY = 50 + arcRadius * Math.sin(endRad);
      
      arcPath.setAttribute('d', 
        'M ' + arcStartX + ' ' + arcStartY + ' ' +
        'A ' + arcRadius + ' ' + arcRadius + ' 0 ' + largeArc + ' 1 ' + arcEndX + ' ' + arcEndY
      );
    }
    
    function updateColorPreview(card, config) {
      const preview = card.querySelector('.color-preview');
      const steps = 10;
      const colors = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const h = config.hueRange[0] + t * (config.hueRange[1] - config.hueRange[0]);
        const s = config.saturation[0] + t * (config.saturation[1] - config.saturation[0]);
        const l = config.lightness[0] + t * (config.lightness[1] - config.lightness[0]);
        colors.push(hslToHex(h, s, l));
      }
      preview.style.background = 'linear-gradient(90deg, ' + colors.join(', ') + ')';
    }
    
    function updateSliderLabels(card, config) {
      const hueStartEl = card.querySelector('[data-value="hueStart"]');
      const hueEndEl = card.querySelector('[data-value="hueEnd"]');
      const hueRangeEl = card.querySelector('[data-value="hueRange"]');
      
      if (hueStartEl) hueStartEl.textContent = config.hueRange[0] + '°';
      if (hueEndEl) hueEndEl.textContent = config.hueRange[1] + '°';
      if (hueRangeEl) hueRangeEl.textContent = (config.hueRange[1] - config.hueRange[0]) + '°';
      
      card.querySelector('[data-value="sat"]').textContent = config.saturation[0] + '% - ' + config.saturation[1] + '%';
      card.querySelector('[data-value="light"]').textContent = config.lightness[0] + '% - ' + config.lightness[1] + '%';
    }
    
    function getConfigFromCard(card) {
      return {
        enabled: card.querySelector('[data-field="enabled"]').checked,
        hueRange: [
          parseInt(card.querySelector('[data-field="hueMin"]').value),
          parseInt(card.querySelector('[data-field="hueMax"]').value)
        ],
        saturation: [
          parseInt(card.querySelector('[data-field="satMin"]').value),
          parseInt(card.querySelector('[data-field="satMax"]').value)
        ],
        lightness: [
          parseInt(card.querySelector('[data-field="lightMin"]').value),
          parseInt(card.querySelector('[data-field="lightMax"]').value)
        ]
      };
    }
    
    function saveCategory(category, card) {
      const config = getConfigFromCard(card);
      currentSettings.semanticCategories[category] = config;
      vscode.postMessage({ command: 'updateSemanticCategory', category, config });
    }
    
    function renderKeywordColors() {
      const container = document.getElementById('keyword-colors');
      container.innerHTML = '';
      
      for (const keyword of keywords) {
        const color = currentSettings.keywordColors[keyword] || '';
        const hasColor = color && color !== '';
        
        const item = document.createElement('div');
        item.className = 'keyword-item' + (hasColor ? ' has-color' : '');
        item.innerHTML = \`
          <div class="color-picker-wrapper \${hasColor ? '' : 'empty'}">
            <input type="color" value="\${hasColor ? color : '#CC7832'}" data-keyword="\${keyword}">
          </div>
          <span class="keyword-name">\${keyword}</span>
          \${hasColor ? '<button class="clear-btn" title="Reset to theme default">✕</button>' : '<span class="theme-default-badge">theme</span>'}
        \`;
        container.appendChild(item);
        
        const colorInput = item.querySelector('input[type="color"]');
        colorInput.addEventListener('change', (e) => {
          currentSettings.keywordColors[keyword] = e.target.value;
          vscode.postMessage({ command: 'updateKeywordColor', keyword, color: e.target.value });
          renderKeywordColors();
          renderExclusionVisualization();
        });
        
        const clearBtn = item.querySelector('.clear-btn');
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            delete currentSettings.keywordColors[keyword];
            vscode.postMessage({ command: 'clearKeywordColor', keyword });
            renderKeywordColors();
            renderExclusionVisualization();
          });
        }
      }
    }
    
    // General settings handlers
    const enableToggle = document.getElementById('enable-toggle');
    const debounceSlider = document.getElementById('debounce-slider');
    const debounceValue = document.getElementById('debounce-value');
    
    enableToggle.addEventListener('change', (e) => {
      vscode.postMessage({ command: 'updateEnable', value: e.target.checked });
    });
    
    debounceSlider.addEventListener('input', (e) => {
      debounceValue.textContent = e.target.value + 'ms';
    });
    
    debounceSlider.addEventListener('change', (e) => {
      vscode.postMessage({ command: 'updateDebounceMs', value: parseInt(e.target.value) });
    });
    
    // Hue exclusion handlers
    const excludeKeywordHuesToggle = document.getElementById('exclude-keyword-hues-toggle');
    const exclusionRangeSlider = document.getElementById('exclusion-range-slider');
    const exclusionRangeValue = document.getElementById('exclusion-range-value');
    const exclusionRangeRow = document.getElementById('exclusion-range-row');
    const addExclusionBtn = document.getElementById('add-exclusion-btn');
    
    excludeKeywordHuesToggle.addEventListener('change', (e) => {
      currentSettings.excludeKeywordHues = e.target.checked;
      exclusionRangeRow.style.opacity = e.target.checked ? '1' : '0.5';
      exclusionRangeRow.style.pointerEvents = e.target.checked ? 'auto' : 'none';
      vscode.postMessage({ command: 'updateExcludeKeywordHues', value: e.target.checked });
      renderExclusionVisualization();
    });
    
    exclusionRangeSlider.addEventListener('input', (e) => {
      exclusionRangeValue.textContent = '±' + e.target.value + '°';
    });
    
    exclusionRangeSlider.addEventListener('change', (e) => {
      currentSettings.keywordHueExclusionRange = parseInt(e.target.value);
      vscode.postMessage({ command: 'updateKeywordHueExclusionRange', value: parseInt(e.target.value) });
      renderExclusionVisualization();
    });
    
    addExclusionBtn.addEventListener('click', () => {
      // Find a gap in the hue range that's not already excluded
      const allRanges = getAllExcludedRanges();
      let newMin = 0;
      let newMax = 30;
      
      // Try to find an unoccupied range
      for (let testHue = 0; testHue < 360; testHue += 30) {
        const testMin = testHue;
        const testMax = testHue + 30;
        let overlaps = false;
        for (const range of allRanges) {
          if (!(testMax <= range.min || testMin >= range.max)) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          newMin = testMin;
          newMax = testMax;
          break;
        }
      }
      
      currentSettings.excludedHueRanges.push([newMin, newMax]);
      vscode.postMessage({ command: 'updateExcludedHueRanges', value: currentSettings.excludedHueRanges });
      renderExclusionVisualization();
    });
    
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'settingsLoaded') {
        // Update general settings
        enableToggle.checked = message.enable !== false;
        debounceSlider.value = message.debounceMs || 150;
        debounceValue.textContent = (message.debounceMs || 150) + 'ms';
        
        // Update hue exclusion settings
        excludeKeywordHuesToggle.checked = message.excludeKeywordHues !== false;
        exclusionRangeSlider.value = message.keywordHueExclusionRange || 20;
        exclusionRangeValue.textContent = '±' + (message.keywordHueExclusionRange || 20) + '°';
        exclusionRangeRow.style.opacity = message.excludeKeywordHues !== false ? '1' : '0.5';
        exclusionRangeRow.style.pointerEvents = message.excludeKeywordHues !== false ? 'auto' : 'none';
        currentSettings.excludeKeywordHues = message.excludeKeywordHues !== false;
        currentSettings.keywordHueExclusionRange = message.keywordHueExclusionRange || 20;
        currentSettings.excludedHueRanges = message.excludedHueRanges || [];
        
        // Update categories
        currentSettings.semanticCategories = { ...defaultCategories };
        for (const [key, val] of Object.entries(message.semanticCategories || {})) {
          currentSettings.semanticCategories[key] = { ...defaultCategories[key], ...val };
        }
        currentSettings.keywordColors = message.keywordColors || {};
        currentSettings.additionalBuiltins = message.additionalBuiltins || [];
        currentSettings.disabledBuiltins = message.disabledBuiltins || [];
        currentSettings.themeKeywordHues = message.themeKeywordHues || [];
        currentSettings.themeKeywordHueRange = message.themeKeywordHueRange || 25;
        
        // Update theme hue range slider
        const themeHueRangeSlider = document.getElementById('theme-hue-range-slider');
        const themeHueRangeValue = document.getElementById('theme-hue-range-value');
        if (themeHueRangeSlider) {
          themeHueRangeSlider.value = currentSettings.themeKeywordHueRange;
          themeHueRangeValue.textContent = '±' + currentSettings.themeKeywordHueRange + '°';
        }
        
        renderSemanticCategories();
        renderKeywordColors();
        renderExclusionVisualization();
        renderBuiltins();
        renderThemeKeywordHues();
      }
    });
    
    renderSemanticCategories();
    renderKeywordColors();
    renderExclusionVisualization();
    renderBuiltins();
    renderThemeKeywordHues();
    setupBuiltinsHandlers();
    setupThemeKeywordHuesHandlers();
    vscode.postMessage({ command: 'getSettings' });
  </script>
</body>
</html>`;
  }
}
