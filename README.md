# VS Code Python Semantic Highlighting

IntelliJ-style semantic highlighting for Python in VS Code.

## Overview

This VS Code extension provides semantic highlighting for Python code, where each symbol (variable, function, class, etc.) is colored based on its name. This makes it easy to visually track variables and identify patterns in your code.

**For user documentation, see [extension/README.md](extension/README.md)**

## Project Structure

```
vscode-semantic-highlighting/
├── extension/                    # VS Code extension (TypeScript)
│   ├── src/
│   │   ├── extension.ts          # Main extension entry point
│   │   ├── highlighter.ts        # Rust binary invocation
│   │   ├── colors.ts             # Color generation logic
│   │   └── settingsPanel.ts      # WebView settings UI
│   ├── bin/                      # Pre-built Rust binary (gitignored)
│   ├── package.json              # Extension manifest
│   └── README.md                 # User documentation
│
├── rust-highlighter/             # Rust AST parser
│   ├── src/
│   │   └── main.rs               # Symbol extraction from Python AST
│   └── Cargo.toml
│
└── README.md                     # This file (developer docs)
```

## Development Setup

### Prerequisites

- Node.js 18+
- Rust toolchain (rustup)
- VS Code

### Building

```bash
# Clone repository
git clone https://github.com/proboscis/vscode-semantic-highlighting.git
cd vscode-semantic-highlighting

# Build Rust highlighter
cd rust-highlighter
cargo build --release
cd ..

# Copy binary to extension
cp rust-highlighter/target/release/python-semantic-highlighter extension/bin/

# Install extension dependencies
cd extension
npm install

# Build TypeScript
npm run build
```

### Running in Development

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. Open a Python file in the new window

### Packaging

```bash
cd extension
npm run package
# Creates python-semantic-highlighter-x.x.x.vsix
```

## Architecture

### Rust Highlighter

The Rust component (`rust-highlighter/`) parses Python source code using `rustpython-parser` and extracts:

- Symbol names and their positions
- Symbol types (variable, function, class, parameter, etc.)
- Keyword positions

Output is JSON:
```json
{
  "symbols": [
    {
      "name": "my_variable",
      "kind": "variable",
      "occurrences": [
        {"line": 0, "column": 0, "length": 11},
        {"line": 5, "column": 4, "length": 11}
      ]
    }
  ]
}
```

### VS Code Extension

The TypeScript extension (`extension/`):

1. Invokes the Rust binary as a subprocess
2. Parses the JSON output
3. Generates colors based on symbol name hash and user configuration
4. Applies VS Code TextEditor decorations

### Color Generation

Colors are generated using HSL color space:
- **Hue**: Derived from symbol name hash
- **Saturation/Lightness**: Configurable per category

This ensures:
- Same symbol name → same color (within a file)
- Different names → visually distinct colors
- Consistent palette across sessions

## Testing

```bash
# Rust tests
cd rust-highlighter
cargo test

# Manual testing
./target/release/python-semantic-highlighter path/to/file.py
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## License

MIT
