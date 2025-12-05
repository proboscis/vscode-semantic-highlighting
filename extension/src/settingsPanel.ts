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
          case 'updateSemanticCategory':
            await this._updateSemanticCategory(message.category, message.config);
            break;
          case 'updateKeywordColor':
            await this._updateKeywordColor(message.keyword, message.color);
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

  private _sendCurrentSettings() {
    const vsConfig = vscode.workspace.getConfiguration('pythonSemanticHighlighter');
    const semanticCategories = vsConfig.get('semanticCategories', {});
    const keywordColors = vsConfig.get('keywordColors', {});
    
    this._panel.webview.postMessage({
      command: 'settingsLoaded',
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
    }
    
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: var(--bg-color);
      color: var(--text-color);
      padding: 20px;
      margin: 0;
      line-height: 1.5;
    }
    
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #ffffff;
    }
    
    h2 {
      font-size: 18px;
      font-weight: 600;
      margin: 24px 0 16px 0;
      color: #ffffff;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
    }
    
    .subtitle {
      color: var(--text-muted);
      margin-bottom: 24px;
    }
    
    .category-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 12px;
    }
    
    .category-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    
    .category-name {
      font-weight: 600;
      font-size: 14px;
    }
    
    .toggle-switch {
      position: relative;
      width: 40px;
      height: 20px;
    }
    
    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #555;
      transition: .3s;
      border-radius: 20px;
    }
    
    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
    }
    
    input:checked + .toggle-slider {
      background-color: var(--accent-color);
    }
    
    input:checked + .toggle-slider:before {
      transform: translateX(20px);
    }
    
    .slider-group {
      margin-bottom: 12px;
    }
    
    .slider-label {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    
    .dual-slider {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    
    .dual-slider input[type="range"] {
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      background: var(--border-color);
      border-radius: 2px;
      outline: none;
    }
    
    .dual-slider input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      background: var(--accent-color);
      border-radius: 50%;
      cursor: pointer;
    }
    
    .dual-slider span {
      font-size: 11px;
      color: var(--text-muted);
      min-width: 30px;
      text-align: center;
    }
    
    .color-preview {
      width: 100%;
      height: 24px;
      border-radius: 4px;
      margin-top: 8px;
      border: 1px solid var(--border-color);
    }
    
    .keyword-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
    }
    
    .keyword-item {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 8px 12px;
    }
    
    .keyword-item input[type="color"] {
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: none;
      padding: 0;
    }
    
    .keyword-item input[type="color"]::-webkit-color-swatch-wrapper {
      padding: 0;
    }
    
    .keyword-item input[type="color"]::-webkit-color-swatch {
      border: 1px solid var(--border-color);
      border-radius: 4px;
    }
    
    .keyword-name {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 13px;
    }
    
    .disabled .slider-group {
      opacity: 0.4;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <h1>Python Semantic Highlighter</h1>
  <p class="subtitle">Configure colors for semantic highlighting</p>
  
  <h2>Semantic Categories</h2>
  <p class="subtitle">Each category uses hash-based coloring within the specified HSV range</p>
  
  <div id="semantic-categories"></div>
  
  <h2>Keyword Colors</h2>
  <p class="subtitle">Fixed colors for Python keywords</p>
  
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
      builtin: 'Builtin'
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
      builtin: { enabled: true, hueRange: [220, 260], saturation: [40, 60], lightness: [55, 70] }
    };
    
    const defaultKeywords = {
      'def': '#CC7832', 'class': '#CC7832', 'return': '#CC7832', 'yield': '#CC7832',
      'await': '#CC7832', 'async': '#CC7832', 'if': '#CC7832', 'elif': '#CC7832',
      'else': '#CC7832', 'for': '#CC7832', 'while': '#CC7832', 'break': '#CC7832',
      'continue': '#CC7832', 'try': '#CC7832', 'except': '#CC7832', 'finally': '#CC7832',
      'raise': '#CC7832', 'with': '#CC7832', 'as': '#CC7832', 'import': '#CC7832',
      'from': '#CC7832', 'pass': '#CC7832', 'lambda': '#CC7832', 'global': '#CC7832',
      'nonlocal': '#CC7832', 'assert': '#CC7832', 'del': '#CC7832', 'in': '#CC7832',
      'is': '#CC7832', 'not': '#CC7832', 'and': '#CC7832', 'or': '#CC7832',
      'match': '#CC7832', 'case': '#CC7832', 'type': '#CC7832'
    };
    
    let currentSettings = {
      semanticCategories: { ...defaultCategories },
      keywordColors: { ...defaultKeywords }
    };
    
    function hslToHex(h, s, l) {
      s /= 100;
      l /= 100;
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
        const config = currentSettings.semanticCategories[key] || defaultCategories[key];
        const card = document.createElement('div');
        card.className = 'category-card' + (config.enabled ? '' : ' disabled');
        card.dataset.category = key;
        
        const midHue = (config.hueRange[0] + config.hueRange[1]) / 2;
        const midSat = (config.saturation[0] + config.saturation[1]) / 2;
        const midLight = (config.lightness[0] + config.lightness[1]) / 2;
        const previewColor = hslToHex(midHue, midSat, midLight);
        
        card.innerHTML = \`
          <div class="category-header">
            <span class="category-name">\${label}</span>
            <label class="toggle-switch">
              <input type="checkbox" \${config.enabled ? 'checked' : ''} data-field="enabled">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="slider-group">
            <div class="slider-label"><span>Hue Range</span><span>\${config.hueRange[0]}° - \${config.hueRange[1]}°</span></div>
            <div class="dual-slider">
              <span>\${config.hueRange[0]}</span>
              <input type="range" min="0" max="360" value="\${config.hueRange[0]}" data-field="hueMin">
              <input type="range" min="0" max="360" value="\${config.hueRange[1]}" data-field="hueMax">
              <span>\${config.hueRange[1]}</span>
            </div>
          </div>
          <div class="slider-group">
            <div class="slider-label"><span>Saturation</span><span>\${config.saturation[0]}% - \${config.saturation[1]}%</span></div>
            <div class="dual-slider">
              <span>\${config.saturation[0]}</span>
              <input type="range" min="0" max="100" value="\${config.saturation[0]}" data-field="satMin">
              <input type="range" min="0" max="100" value="\${config.saturation[1]}" data-field="satMax">
              <span>\${config.saturation[1]}</span>
            </div>
          </div>
          <div class="slider-group">
            <div class="slider-label"><span>Lightness</span><span>\${config.lightness[0]}% - \${config.lightness[1]}%</span></div>
            <div class="dual-slider">
              <span>\${config.lightness[0]}</span>
              <input type="range" min="0" max="100" value="\${config.lightness[0]}" data-field="lightMin">
              <input type="range" min="0" max="100" value="\${config.lightness[1]}" data-field="lightMax">
              <span>\${config.lightness[1]}</span>
            </div>
          </div>
          <div class="color-preview" style="background: linear-gradient(90deg, \${hslToHex(config.hueRange[0], config.saturation[0], config.lightness[0])}, \${hslToHex(config.hueRange[1], config.saturation[1], config.lightness[1])})"></div>
        \`;
        
        container.appendChild(card);
        
        // Add event listeners
        card.querySelectorAll('input').forEach(input => {
          input.addEventListener('change', () => handleCategoryChange(key, card));
          input.addEventListener('input', () => updatePreview(key, card));
        });
      }
    }
    
    function handleCategoryChange(category, card) {
      const config = getConfigFromCard(card);
      currentSettings.semanticCategories[category] = config;
      
      vscode.postMessage({
        command: 'updateSemanticCategory',
        category,
        config
      });
      
      card.className = 'category-card' + (config.enabled ? '' : ' disabled');
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
    
    function updatePreview(category, card) {
      const config = getConfigFromCard(card);
      const preview = card.querySelector('.color-preview');
      preview.style.background = \`linear-gradient(90deg, \${hslToHex(config.hueRange[0], config.saturation[0], config.lightness[0])}, \${hslToHex(config.hueRange[1], config.saturation[1], config.lightness[1])})\`;
      
      // Update labels
      card.querySelector('.slider-group:nth-child(2) .slider-label span:last-child').textContent = \`\${config.hueRange[0]}° - \${config.hueRange[1]}°\`;
      card.querySelector('.slider-group:nth-child(3) .slider-label span:last-child').textContent = \`\${config.saturation[0]}% - \${config.saturation[1]}%\`;
      card.querySelector('.slider-group:nth-child(4) .slider-label span:last-child').textContent = \`\${config.lightness[0]}% - \${config.lightness[1]}%\`;
      
      // Update slider labels
      const sliders = card.querySelectorAll('.dual-slider');
      sliders[0].querySelector('span:first-child').textContent = config.hueRange[0];
      sliders[0].querySelector('span:last-child').textContent = config.hueRange[1];
      sliders[1].querySelector('span:first-child').textContent = config.saturation[0];
      sliders[1].querySelector('span:last-child').textContent = config.saturation[1];
      sliders[2].querySelector('span:first-child').textContent = config.lightness[0];
      sliders[2].querySelector('span:last-child').textContent = config.lightness[1];
    }
    
    function renderKeywordColors() {
      const container = document.getElementById('keyword-colors');
      container.innerHTML = '';
      
      for (const [keyword, color] of Object.entries(currentSettings.keywordColors)) {
        const item = document.createElement('div');
        item.className = 'keyword-item';
        item.innerHTML = \`
          <input type="color" value="\${color}" data-keyword="\${keyword}">
          <span class="keyword-name">\${keyword}</span>
        \`;
        container.appendChild(item);
        
        item.querySelector('input').addEventListener('change', (e) => {
          currentSettings.keywordColors[keyword] = e.target.value;
          vscode.postMessage({
            command: 'updateKeywordColor',
            keyword,
            color: e.target.value
          });
        });
      }
    }
    
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'settingsLoaded') {
        currentSettings.semanticCategories = { ...defaultCategories, ...message.semanticCategories };
        currentSettings.keywordColors = { ...defaultKeywords, ...message.keywordColors };
        renderSemanticCategories();
        renderKeywordColors();
      }
    });
    
    // Initial render
    renderSemanticCategories();
    renderKeywordColors();
    
    // Request current settings
    vscode.postMessage({ command: 'getSettings' });
  </script>
</body>
</html>`;
  }
}

