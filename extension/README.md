# Python Semantic Highlighter

**IntelliJ-style semantic highlighting for Python in VS Code**

Each symbol (variable, function, class, etc.) gets a unique color based on its name, making it easy to track variables throughout your code.

## Features

### 🎨 Symbol-based Coloring
- Same symbol = same color throughout the file
- Different symbols = different colors
- Colors are computed from symbol name hash for consistency

### 📁 Semantic Categories
Configurable coloring for different symbol types:
- **Local Variables** - Variables defined in local scope
- **Global Variables** - Module-level variables
- **Parameters** - Function/method parameters (consistent in definition and body)
- **Functions** - Function definitions and calls
- **Classes** - Class definitions and references
- **Attributes** - Object attributes (e.g., `self.name`)
- **Decorators** - Function/class decorators
- **Type Annotations** - Type hints
- **Builtins** - Python built-in functions
- **self/cls** - Special parameter names

### ⌨️ Keyword Colors
Fixed colors for Python keywords:
- Control flow: `if`, `elif`, `else`, `for`, `while`, `break`, `continue`
- Functions: `def`, `return`, `yield`, `lambda`
- Classes: `class`
- Async: `async`, `await`
- Exception handling: `try`, `except`, `finally`, `raise`
- Imports: `import`, `from`, `as`
- And more...

### ⚡ Fast Rust-based Parser
- Native Rust binary using `rustpython-parser`
- Sub-millisecond parsing for most files
- Debounced updates for smooth editing

### 🔧 Jupyter/IPython Support
Works with files containing:
- Cell markers (`# %%`)
- Cell magic (`%%time`, `%%bash`)
- Line magic (`%matplotlib`, `%load_ext`)
- Shell commands (`!pip install`)

## Installation

### From VSIX
1. Download the `.vsix` file
2. In VS Code: `Cmd+Shift+P` → `Extensions: Install from VSIX...`
3. Select the downloaded file

### From Source
```bash
# Clone the repository
git clone https://github.com/proboscis/vscode-semantic-highlighting.git
cd vscode-semantic-highlighting

# Build Rust highlighter
cd rust-highlighter
cargo build --release
cd ..

# Install extension dependencies
cd extension
npm install

# Build TypeScript
npm run build

# Package extension
npm run package
```

## Configuration

### Visual Settings Panel
The easiest way to configure the extension:

1. **Command Palette**: `Cmd+Shift+P` → `Python Semantic Highlighter: Open Settings Panel`
2. **Extension Page**: Click gear icon ⚙️ → `Open Settings Panel`
3. **VS Code Settings**: Search `pythonSemanticHighlighter` → Click `Open Visual Settings Panel` link

### Settings Overview

| Setting | Description | Default |
|---------|-------------|---------|
| `enable` | Enable/disable highlighting | `true` |
| `debounceMs` | Delay before re-highlighting (ms) | `150` |
| `semanticCategories` | HSV ranges for each category | See below |
| `keywordColors` | Fixed colors for keywords | Empty (theme default) |

### Semantic Categories Configuration

Each category can be configured with:
- **enabled** - Toggle this category on/off
- **hueRange** - `[min, max]` hue range (0-360°)
- **saturation** - `[min, max]` saturation range (0-100%)
- **lightness** - `[min, max]` lightness range (0-100%)

Example in `settings.json`:
```json
{
  "pythonSemanticHighlighter.semanticCategories": {
    "localVariable": {
      "enabled": true,
      "hueRange": [180, 270],
      "saturation": [40, 60],
      "lightness": [55, 70]
    },
    "parameter": {
      "enabled": true,
      "hueRange": [90, 150],
      "saturation": [45, 65],
      "lightness": [55, 70]
    },
    "typeAnnotation": {
      "enabled": false
    }
  }
}
```

### Keyword Colors Configuration

Set custom colors for specific keywords, or leave empty to use theme defaults:

```json
{
  "pythonSemanticHighlighter.keywordColors": {
    "def": "#CC7832",
    "class": "#CC7832",
    "return": "#CC7832",
    "yield": "#B58900",
    "await": "#859900"
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `Python Semantic Highlighter: Open Settings Panel` | Open visual configuration UI |
| `Python Semantic Highlighter: Refresh Semantic Highlighting` | Force re-highlight current file |
| `Python Semantic Highlighter: Toggle Semantic Highlighting` | Enable/disable highlighting |

## How It Works

```
┌─────────────────────────────────────────┐
│           Python File                    │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      Rust Parser (rustpython-parser)    │
│  - Parses Python AST                    │
│  - Extracts symbols with positions      │
│  - Handles Jupyter magic commands       │
└─────────────────┬───────────────────────┘
                  │ JSON
                  ▼
┌─────────────────────────────────────────┐
│         VS Code Extension               │
│  - Receives symbol information          │
│  - Computes colors from name hash       │
│  - Applies TextEditor decorations       │
└─────────────────────────────────────────┘
```

## Requirements

- VS Code 1.85.0 or later
- macOS, Linux, or Windows (binary must be built for your platform)

## Known Limitations

- Colors are file-scoped (same variable name in different files may have different colors)
- Requires file to be saved on disk for analysis
- Large files (>10K lines) may have slight delay

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

## Acknowledgments

- [rustpython-parser](https://github.com/RustPython/RustPython) - Python parser in Rust
- Inspired by IntelliJ IDEA's semantic highlighting feature

