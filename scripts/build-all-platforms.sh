#!/bin/bash
# Build Rust binary for multiple platforms
# Requires cross-compilation toolchains to be installed

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUST_DIR="$PROJECT_ROOT/rust-highlighter"
BIN_DIR="$PROJECT_ROOT/extension/bin"

echo "Building Rust highlighter for multiple platforms..."

cd "$RUST_DIR"

# Create platform directories
mkdir -p "$BIN_DIR/darwin-arm64"
mkdir -p "$BIN_DIR/darwin-x64"
mkdir -p "$BIN_DIR/linux-x64"
mkdir -p "$BIN_DIR/linux-arm64"
mkdir -p "$BIN_DIR/win32-x64"

# Build for current platform first
echo "Building for current platform..."
cargo build --release
CURRENT_PLATFORM=$(uname -s)-$(uname -m)

case "$CURRENT_PLATFORM" in
  Darwin-arm64)
    cp target/release/python-semantic-highlighter "$BIN_DIR/darwin-arm64/"
    ;;
  Darwin-x86_64)
    cp target/release/python-semantic-highlighter "$BIN_DIR/darwin-x64/"
    ;;
  Linux-x86_64)
    cp target/release/python-semantic-highlighter "$BIN_DIR/linux-x64/"
    ;;
  Linux-aarch64)
    cp target/release/python-semantic-highlighter "$BIN_DIR/linux-arm64/"
    ;;
esac

# Cross-compile for other platforms if cross is installed
if command -v cross &> /dev/null; then
  echo "Cross-compiling for other platforms..."
  
  # macOS x64 (from ARM)
  if [ ! -f "$BIN_DIR/darwin-x64/python-semantic-highlighter" ]; then
    echo "Building for darwin-x64..."
    cross build --release --target x86_64-apple-darwin 2>/dev/null || echo "Skipping darwin-x64 (not available)"
    [ -f target/x86_64-apple-darwin/release/python-semantic-highlighter ] && \
      cp target/x86_64-apple-darwin/release/python-semantic-highlighter "$BIN_DIR/darwin-x64/"
  fi
  
  # Linux x64
  if [ ! -f "$BIN_DIR/linux-x64/python-semantic-highlighter" ]; then
    echo "Building for linux-x64..."
    cross build --release --target x86_64-unknown-linux-gnu 2>/dev/null || echo "Skipping linux-x64"
    [ -f target/x86_64-unknown-linux-gnu/release/python-semantic-highlighter ] && \
      cp target/x86_64-unknown-linux-gnu/release/python-semantic-highlighter "$BIN_DIR/linux-x64/"
  fi
  
  # Linux ARM64
  if [ ! -f "$BIN_DIR/linux-arm64/python-semantic-highlighter" ]; then
    echo "Building for linux-arm64..."
    cross build --release --target aarch64-unknown-linux-gnu 2>/dev/null || echo "Skipping linux-arm64"
    [ -f target/aarch64-unknown-linux-gnu/release/python-semantic-highlighter ] && \
      cp target/aarch64-unknown-linux-gnu/release/python-semantic-highlighter "$BIN_DIR/linux-arm64/"
  fi
  
  # Windows x64
  if [ ! -f "$BIN_DIR/win32-x64/python-semantic-highlighter.exe" ]; then
    echo "Building for win32-x64..."
    cross build --release --target x86_64-pc-windows-gnu 2>/dev/null || echo "Skipping win32-x64"
    [ -f target/x86_64-pc-windows-gnu/release/python-semantic-highlighter.exe ] && \
      cp target/x86_64-pc-windows-gnu/release/python-semantic-highlighter.exe "$BIN_DIR/win32-x64/"
  fi
else
  echo ""
  echo "Note: 'cross' is not installed. Only building for current platform."
  echo "To cross-compile, install cross: cargo install cross"
  echo ""
fi

echo ""
echo "Build complete. Binaries in $BIN_DIR:"
find "$BIN_DIR" -type f -name "python-semantic-highlighter*" | while read f; do
  echo "  $f"
done

