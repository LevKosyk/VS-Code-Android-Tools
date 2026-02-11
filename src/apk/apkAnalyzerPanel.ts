import * as vscode from 'vscode';
import { execCommand } from '../core/cli';

interface ApkEntry {
  path: string;
  size: number;
}

function parseJarTOutput(output: string): ApkEntry[] {
  const entries: ApkEntry[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.trim().match(/^([0-9]+)\\s+\\S+\\s+\\S+\\s+(.+)$/);
    if (match) {
      const size = parseInt(match[1], 10);
      const path = match[2];
      if (!Number.isNaN(size)) {
        entries.push({ path, size });
      }
    }
  }
  return entries;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export class ApkAnalyzerPanel {
  public static currentPanel: ApkAnalyzerPanel | undefined;
  private static readonly viewType = 'androidApkAnalyzer';
  private readonly panel: vscode.WebviewPanel;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
  }

  public static async createOrShow(apkPath: string): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (ApkAnalyzerPanel.currentPanel) {
      ApkAnalyzerPanel.currentPanel.panel.reveal(column);
    } else {
      const panel = vscode.window.createWebviewPanel(
        ApkAnalyzerPanel.viewType,
        'APK Analyzer',
        column || vscode.ViewColumn.One,
        { enableScripts: false }
      );
      ApkAnalyzerPanel.currentPanel = new ApkAnalyzerPanel(panel);
    }
    await ApkAnalyzerPanel.currentPanel!.render(apkPath);
  }

  private async render(apkPath: string): Promise<void> {
    const result = await execCommand('jar', ['tvf', apkPath], { timeout: 60_000 });
    if (result.exitCode !== 0) {
      this.panel.webview.html = `<html><body><p>Failed to analyze APK. Ensure JDK is installed.</p></body></html>`;
      return;
    }
    const entries = parseJarTOutput(result.stdout);
    const total = entries.reduce((sum, e) => sum + e.size, 0);
    const top = entries
      .sort((a, b) => b.size - a.size)
      .slice(0, 20);
    const rows = top
      .map(e => `<tr><td>${e.path}</td><td>${formatBytes(e.size)}</td></tr>`)
      .join('');
    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>APK Analyzer</title>
  <style>
    body { font-family: sans-serif; padding: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; font-size: 12px; }
    .muted { color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h3>APK Analyzer</h3>
  <div class="muted">Total size: ${formatBytes(total)}</div>
  <h4>Largest files</h4>
  <table>
    <thead><tr><th>File</th><th>Size</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  }
}
