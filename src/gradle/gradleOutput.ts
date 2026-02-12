import * as vscode from 'vscode';
import * as path from 'path';
import { ExecResult } from '../core/cli';

let outputChannel: vscode.OutputChannel | undefined;
let diagnostics: vscode.DiagnosticCollection | undefined;

function ensureChannels(): void {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Android Gradle');
  }
  if (!diagnostics) {
    diagnostics = vscode.languages.createDiagnosticCollection('android-gradle');
  }
}

function resolvePath(workspaceRoot: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(workspaceRoot, filePath);
}

function parseDiagnostics(workspaceRoot: string, output: string): Map<string, vscode.Diagnostic[]> {
  const results = new Map<string, vscode.Diagnostic[]>();
  const lines = output.split('\n');
  const patterns: Array<{ regex: RegExp; severity: (m: RegExpMatchArray) => vscode.DiagnosticSeverity; message: (m: RegExpMatchArray) => string; file: (m: RegExpMatchArray) => string; line: (m: RegExpMatchArray) => number; col: (m: RegExpMatchArray) => number }> = [
    {
      regex: /^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/i,
      severity: m => (m[4].toLowerCase() === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error),
      message: m => m[5],
      file: m => m[1],
      line: m => parseInt(m[2], 10),
      col: m => parseInt(m[3], 10),
    },
    {
      regex: /^(?:e: |w: )(.+?):\s*\((\d+),\s*(\d+)\):\s*(.+)$/i,
      severity: m => (m[0].toLowerCase().startsWith('w:') ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error),
      message: m => m[4],
      file: m => m[1],
      line: m => parseInt(m[2], 10),
      col: m => parseInt(m[3], 10),
    },
    {
      regex: /^(?:e: |w: )?(.+?):(\d+):\s*(.+)$/i,
      severity: m => (m[0].toLowerCase().startsWith('w:') ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error),
      message: m => m[3],
      file: m => m[1],
      line: m => parseInt(m[2], 10),
      col: () => 1,
    },
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let match: RegExpMatchArray | null = null;
    let pattern = patterns[0];
    for (const p of patterns) {
      match = trimmed.match(p.regex);
      if (match) {
        pattern = p;
        break;
      }
    }
    if (!match) {
      continue;
    }
    const filePath = resolvePath(workspaceRoot, pattern.file(match));
    const lineNum = Math.max(1, pattern.line(match));
    const colNum = Math.max(1, pattern.col(match));
    const range = new vscode.Range(lineNum - 1, colNum - 1, lineNum - 1, colNum);
    const diagnostic = new vscode.Diagnostic(range, pattern.message(match), pattern.severity(match));
    const list = results.get(filePath) ?? [];
    list.push(diagnostic);
    results.set(filePath, list);
  }
  return results;
}

export function showGradleOutput(task: string, result: ExecResult, workspaceRoot?: string): void {
  ensureChannels();
  outputChannel?.clear();
  outputChannel?.appendLine(`Task: ${task}`);
  outputChannel?.appendLine(`Exit code: ${result.exitCode}`);
  if (result.stdout) {
    outputChannel?.appendLine('');
    outputChannel?.appendLine(result.stdout);
  }
  if (result.stderr) {
    outputChannel?.appendLine('');
    outputChannel?.appendLine(result.stderr);
  }
  outputChannel?.show(true);
  if (workspaceRoot) {
    updateGradleDiagnostics(workspaceRoot, result);
  }
}

export function updateGradleDiagnostics(workspaceRoot: string, result: ExecResult): void {
  ensureChannels();
  if (result.exitCode === 0) {
    diagnostics?.clear();
    return;
  }
  const combined = [result.stdout, result.stderr].filter(Boolean).join('\n');
  const parsed = parseDiagnostics(workspaceRoot, combined);
  diagnostics?.clear();
  for (const [filePath, diags] of parsed.entries()) {
    diagnostics?.set(vscode.Uri.file(filePath), diags);
  }
}

export function clearGradleDiagnostics(): void {
  diagnostics?.clear();
}

export function revealGradleOutput(): void {
  ensureChannels();
  outputChannel?.show(true);
}
