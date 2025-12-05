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
    const categories = vsConfig.get<Record<string, any>>('semanticCategories', {});
    categories[category] = { ...categories[category], ...config };
    await vsConfig.update('semanticCategories', categories, vscode.ConfigurationTarget.Global);
  }

  private async _updateKeywordColor(keyword: string, color: string) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    const colors = vsConfig.get<Record<string, string>>('keywordColors', {});
    colors[keyword] = color;
    await vsConfig.update('keywordColors', colors, vscode.ConfigurationTarget.Global);
  }

  private async _clearKeywordColor(keyword: string) {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    const colors = vsConfig.get<Record<string, string>>('keywordColors', {});
    delete colors[keyword];
    await vsConfig.update('keywordColors', colors, vscode.ConfigurationTarget.Global);
  }

  private _sendCurrentSettings() {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    const enable = vsConfig.get('enable', true);
    const debounceMs = vsConfig.get('debounceMs', 150);
    const semanticCategories = vsConfig.get('semanticCategories', {});
    const keywordColors = vsConfig.get('keywordColors', {});
    
    this._panel.webview.postMessage({
      command: 'settingsLoaded',
      enable,
      debounceMs,
      semanticCategories,
      keywordColors,
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
  
  <h2>Semantic Categories</h2>
  <p class="subtitle">Hash-based coloring within HSV ranges. Toggle off to use IDE theme defaults.</p>
  <div id="semantic-categories"></div>
  
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
      kwargName: 'Kwarg Name (func(x=0))'
    };
    
    const defaultCategories = {
      localVariable: { enabled: true, hueRange: [180, 270], saturation: [40, 60], lightness: [55, 70] },
      globalVariable: { enabled: true, hueRange: [270, 360], saturation: [40, 60], lightness: [55, 70] },
      parameter: { enabled: true, hueRange: [90, 150], saturation: [45, 65], lightness: [55, 70] },
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
      kwargName: { enabled: true, hueRange: [0, 360], saturation: [40, 60], lightness: [55, 70] }
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
      keywordColors: {}
    };
    
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
          
          <div class="slider-row">
            <span class="slider-label">Hue</span>
            <div class="range-slider">
              <div class="range-track"></div>
              <div class="range-track-fill" data-fill="hue"></div>
              <input type="range" min="0" max="360" value="\${config.hueRange[0]}" data-field="hueMin">
              <input type="range" min="0" max="360" value="\${config.hueRange[1]}" data-field="hueMax">
            </div>
            <span class="slider-value" data-value="hue">\${config.hueRange[0]}° - \${config.hueRange[1]}°</span>
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
      }
    }
    
    function updateSliderFills(card, config) {
      const hueFill = card.querySelector('[data-fill="hue"]');
      const satFill = card.querySelector('[data-fill="sat"]');
      const lightFill = card.querySelector('[data-fill="light"]');
      
      hueFill.style.left = (config.hueRange[0] / 360 * 100) + '%';
      hueFill.style.width = ((config.hueRange[1] - config.hueRange[0]) / 360 * 100) + '%';
      
      satFill.style.left = config.saturation[0] + '%';
      satFill.style.width = (config.saturation[1] - config.saturation[0]) + '%';
      
      lightFill.style.left = config.lightness[0] + '%';
      lightFill.style.width = (config.lightness[1] - config.lightness[0]) + '%';
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
      card.querySelector('[data-value="hue"]').textContent = config.hueRange[0] + '° - ' + config.hueRange[1] + '°';
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
        });
        
        const clearBtn = item.querySelector('.clear-btn');
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            delete currentSettings.keywordColors[keyword];
            vscode.postMessage({ command: 'clearKeywordColor', keyword });
            renderKeywordColors();
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
    
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'settingsLoaded') {
        // Update general settings
        enableToggle.checked = message.enable !== false;
        debounceSlider.value = message.debounceMs || 150;
        debounceValue.textContent = (message.debounceMs || 150) + 'ms';
        
        // Update categories
        currentSettings.semanticCategories = { ...defaultCategories };
        for (const [key, val] of Object.entries(message.semanticCategories || {})) {
          currentSettings.semanticCategories[key] = { ...defaultCategories[key], ...val };
        }
        currentSettings.keywordColors = message.keywordColors || {};
        renderSemanticCategories();
        renderKeywordColors();
      }
    });
    
    renderSemanticCategories();
    renderKeywordColors();
    vscode.postMessage({ command: 'getSettings' });
  </script>
</body>
</html>`;
  }
}
