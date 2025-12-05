# Python Semantic Highlighter for VS Code

IntelliJ風のセマンティックハイライト機能をVS Codeに提供するPython用拡張機能です。

## 特徴

- **シンボル単位の色分け**: 同じシンボル（変数、関数、クラス等）は常に同じ色で表示されます
- **高速なAST解析**: Rust製パーサー（rustpython-parser）によるネイティブ速度の解析
- **IntelliJ風の視認性**: シンボル名のハッシュに基づいた一貫性のある色付け
- **キーワードの統一色**: `def`, `class`, `return`などのPythonキーワードは固定色で表示

## 色付けルール

### ファイル単位で一貫性を保つもの
- ローカル変数 / グローバル変数
- 関数名
- クラス名
- パラメータ
- 属性（アトリビュート）

### グローバルに統一されるもの
- Pythonキーワード（`def`, `class`, `if`, `for`, `return`など）
- Python組み込み関数（`print`, `len`, `range`など）

## 必要要件

- VS Code 1.85.0以上
- Rust（cargo）- ビルド時に必要

## インストール

### 開発版

```bash
# リポジトリをクローン
git clone <repository-url>
cd vscode-semantic-highlighting

# Rustハイライターをビルド
cd rust-highlighter
cargo build --release
cd ..

# 拡張機能の依存関係をインストール
cd extension
npm install

# TypeScriptをコンパイル
npm run build
```

VS Codeで拡張機能を実行するには：
1. VS Codeでこのプロジェクトを開く
2. `F5`を押してExtension Development Hostを起動
3. 新しいウィンドウでPythonファイルを開く

## 設定

| 設定項目 | 説明 | デフォルト |
|---------|------|-----------|
| `pythonSemanticHighlighter.enable` | ハイライト機能の有効/無効 | `true` |
| `pythonSemanticHighlighter.debounceMs` | 編集後にハイライトを再実行するまでの遅延（ミリ秒） | `150` |

## コマンド

- **Python Semantic Highlighter: Refresh Semantic Highlighting** - 現在のファイルのハイライトを再実行
- **Python Semantic Highlighter: Toggle Semantic Highlighting** - ハイライト機能の有効/無効を切り替え

## アーキテクチャ

```
┌─────────────────────┐
│   VS Code 拡張      │
│   (TypeScript)      │
└──────────┬──────────┘
           │ subprocess
           ▼
┌─────────────────────┐
│  Rustハイライター   │
│  (rustpython-parser)│
└──────────┬──────────┘
           │ JSON
           ▼
┌─────────────────────┐
│   シンボル情報      │
│   { name, kind,     │
│     occurrences }   │
└─────────────────────┘
```

## 開発

### ディレクトリ構成

```
vscode-semantic-highlighting/
├── extension/              # VS Code拡張機能
│   ├── src/
│   │   ├── extension.ts    # エントリーポイント
│   │   ├── highlighter.ts  # Rustバイナリ呼び出し
│   │   └── colors.ts       # 色生成ロジック
│   └── package.json
├── rust-highlighter/       # Rustパーサー
│   ├── src/
│   │   └── main.rs         # AST解析・シンボル抽出
│   └── Cargo.toml
└── README.md
```

### ビルド

```bash
# Rustハイライターのビルド
cd rust-highlighter
cargo build --release

# TypeScriptのコンパイル
cd ../extension
npm run build
```

### テスト

```bash
# Rustのテスト
cd rust-highlighter
cargo test

# Rustハイライターの動作確認
./target/release/python-semantic-highlighter test.py
```

## ライセンス

MIT

