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
  kind: 'variable' | 'function' | 'class' | 'parameter' | 'attribute' | 'keyword' | 'decorator' | 'type_annotation' | 'kwarg_name' | 'method_call' | 'function_call' | 'import';
  occurrences: Occurrence[];
}

export interface HighlighterOutput {
  symbols: SymbolEntry[];
}

export function getRustBinaryPath(context: vscode.ExtensionContext): string {
  const extensionPath = context.extensionPath;
  const binaryName = process.platform === 'win32'
    ? 'python-semantic-highlighter.exe'
    : 'python-semantic-highlighter';
  
  // For packaged extension, binary is in extension's bin directory
  const packagedPath = path.join(extensionPath, 'bin', binaryName);
  
  // For development, try the local Rust build
  const releasePath = path.join(extensionPath, '..', 'rust-highlighter', 'target', 'release', binaryName);
  const debugPath = path.join(extensionPath, '..', 'rust-highlighter', 'target', 'debug', binaryName);
  
  // Check packaged path first (for installed extension)
  const fs = require('fs');
  if (fs.existsSync(packagedPath)) {
    return packagedPath;
  }
  // Then try development paths
  if (fs.existsSync(releasePath)) {
    return releasePath;
  }
  if (fs.existsSync(debugPath)) {
    return debugPath;
  }
  
  // Default to packaged path (will show error if not found)
  return packagedPath;
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

