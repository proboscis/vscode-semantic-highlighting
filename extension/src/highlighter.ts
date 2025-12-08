import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

export interface Occurrence {
  line: number;
  column: number;
  length: number;
}

export interface SymbolEntry {
  name: string;
  kind: 'variable' | 'function' | 'class' | 'parameter' | 'attribute' | 'keyword' | 'decorator' | 'type_annotation' | 'kwarg_name' | 'method_call' | 'function_call' | 'import' | 'string' | 'fstring' | 'raw_string' | 'byte_string' | 'comment' | 'docstring';
  occurrences: Occurrence[];
}

export interface HighlighterOutput {
  symbols: SymbolEntry[];
}

function getPlatformBinaryName(): { dir: string; name: string } {
  const platform = process.platform;
  const arch = process.arch;
  
  let dir: string;
  let name: string;
  
  if (platform === 'win32') {
    dir = arch === 'x64' ? 'win32-x64' : 'win32-arm64';
    name = 'python-semantic-highlighter.exe';
  } else if (platform === 'darwin') {
    dir = arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    name = 'python-semantic-highlighter';
  } else {
    // Linux
    dir = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
    name = 'python-semantic-highlighter';
  }
  
  return { dir, name };
}

export function getRustBinaryPath(context: vscode.ExtensionContext): string {
  const extensionPath = context.extensionPath;
  const { dir, name } = getPlatformBinaryName();
  const fs = require('fs');
  
  // Try platform-specific directory first (for multi-platform package)
  const platformPath = path.join(extensionPath, 'bin', dir, name);
  if (fs.existsSync(platformPath)) {
    return platformPath;
  }
  
  // Fall back to flat bin directory (for single-platform package)
  const flatPath = path.join(extensionPath, 'bin', name);
  if (fs.existsSync(flatPath)) {
    return flatPath;
  }
  
  // For development, try the local Rust build
  const releasePath = path.join(extensionPath, '..', 'rust-highlighter', 'target', 'release', name);
  const debugPath = path.join(extensionPath, '..', 'rust-highlighter', 'target', 'debug', name);
  
  if (fs.existsSync(releasePath)) {
    return releasePath;
  }
  if (fs.existsSync(debugPath)) {
    return debugPath;
  }
  
  // Default to platform path (will show error if not found)
  return platformPath;
}

export async function analyzeFile(
  filePath: string,
  binaryPath: string
): Promise<HighlighterOutput | null> {
  return new Promise((resolve) => {
    const child = spawn(binaryPath, [filePath]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`Highlighter failed with code ${code}: ${stderr}`);
        resolve(null);
        return;
      }

      try {
        const result = JSON.parse(stdout) as HighlighterOutput;
        resolve(result);
      } catch (e) {
        console.error(`Failed to parse highlighter output: ${e}`);
        resolve(null);
      }
    });

    child.on('error', (err) => {
      console.error(`Failed to spawn highlighter: ${err}`);
      resolve(null);
    });

    // Set timeout to prevent hanging
    setTimeout(() => {
      child.kill();
      resolve(null);
    }, 10000);
  });
}

export async function analyzeSource(
  source: string,
  binaryPath: string
): Promise<HighlighterOutput | null> {
  return new Promise((resolve) => {
    const child = spawn(binaryPath, ['/dev/stdin']);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`Highlighter failed with code ${code}: ${stderr}`);
        resolve(null);
        return;
      }

      try {
        const result = JSON.parse(stdout) as HighlighterOutput;
        resolve(result);
      } catch (e) {
        console.error(`Failed to parse highlighter output: ${e}`);
        resolve(null);
      }
    });

    child.on('error', (err) => {
      console.error(`Failed to spawn highlighter: ${err}`);
      resolve(null);
    });

    // Write source to stdin
    child.stdin.write(source);
    child.stdin.end();

    // Set timeout to prevent hanging
    setTimeout(() => {
      child.kill();
      resolve(null);
    }, 10000);
  });
}

