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
  kind: 'variable' | 'function' | 'class' | 'parameter' | 'attribute' | 'keyword';
  occurrences: Occurrence[];
}

export interface HighlighterOutput {
  symbols: SymbolEntry[];
}

export function getRustBinaryPath(context: vscode.ExtensionContext): string {
  // In development, use the local build
  const extensionPath = context.extensionPath;
  const binaryName = process.platform === 'win32'
    ? 'python-semantic-highlighter.exe'
    : 'python-semantic-highlighter';
  
  // Try release build first, then debug
  const releasePath = path.join(extensionPath, '..', 'rust-highlighter', 'target', 'release', binaryName);
  const debugPath = path.join(extensionPath, '..', 'rust-highlighter', 'target', 'debug', binaryName);
  
  // For packaged extension, binary would be in extension directory
  const packagedPath = path.join(extensionPath, 'bin', binaryName);
  
  // Return paths in order of preference
  return releasePath;
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

