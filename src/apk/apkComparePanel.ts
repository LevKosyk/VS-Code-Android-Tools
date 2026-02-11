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
    const match = line.trim().match(/^([0-9]+)\s+\S+\s+\S+\s+(.+)$/);
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

function sumByPrefix(entries: ApkEntry[], prefix: string): number {
  return entries.filter(e => e.path.startsWith(prefix)).reduce((sum, e) => sum + e.size, 0);
}

export class ApkComparePanel {
  public static currentPanel: ApkComparePanel | undefined;
  private static readonly viewType = 'androidApkCompare';
  private readonly panel: vscode.WebviewPanel;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
  }

  public static async createOrShow(apkA: string, apkB: string): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (ApkComparePanel.currentPanel) {
      ApkComparePanel.currentPanel.panel.reveal(column);
    } else {
      const panel = vscode.window.createWebviewPanel(
        ApkComparePanel.viewType,
        'APK Compare',
        column || vscode.ViewColumn.One,
        { enableScripts: false }
      );
      ApkComparePanel.currentPanel = new ApkComparePanel(panel);
    }
    await ApkComparePanel.currentPanel!.render(apkA, apkB);
  }

  private async readEntries(apkPath: string): Promise<ApkEntry[]> {
    const result = await execCommand('jar', ['tvf', apkPath], { timeout: 60_000 });
    if (result.exitCode !== 0) {
      return [];
    }
    return parseJarTOutput(result.stdout);
  }

  private async render(apkA: string, apkB: string): Promise<void> {
    const entriesA = await this.readEntries(apkA);
    const entriesB = await this.readEntries(apkB);
    const totalA = entriesA.reduce((s, e) => s + e.size, 0);
    const totalB = entriesB.reduce((s, e) => s + e.size, 0);
    const classesA = sumByPrefix(entriesA, 'classes');
    const classesB = sumByPrefix(entriesB, 'classes');
    const resA = sumByPrefix(entriesA, 'res/');
    const resB = sumByPrefix(entriesB, 'res/');

    const rows = [
      ['Total', formatBytes(totalA), formatBytes(totalB), formatBytes(totalB - totalA)],
      ['Classes (dex)', formatBytes(classesA), formatBytes(classesB), formatBytes(classesB - classesA)],
      ['Resources', formatBytes(resA), formatBytes(resB), formatBytes(resB - resA)],
    ];

    const topA = entriesA.sort((a, b) => b.size - a.size).slice(0, 15);
    const topB = entriesB.sort((a, b) => b.size - a.size).slice(0, 15);
    const renderTop = (list: ApkEntry[]) =>
      list.map(e => `<tr><td>${e.path}</td><td>${formatBytes(e.size)}</td></tr>`).join('');

    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>APK Compare</title>
  <style>
    body { font-family: sans-serif; padding: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; font-size: 12px; }
    .muted { color: #666; font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  </style>
</head>
<body>
  <h3>APK Compare</h3>
  <div class="muted">A: ${apkA}</div>
  <div class="muted">B: ${apkB}</div>
  <table>
    <thead><tr><th>Section</th><th>A</th><th>B</th><th>Diff</th></tr></thead>
    <tbody>
      ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}
    </tbody>
  </table>
  <div class="grid">
    <div>
      <h4>Top files A</h4>
      <table><tbody>${renderTop(topA)}</tbody></table>
    </div>
    <div>
      <h4>Top files B</h4>
      <table><tbody>${renderTop(topB)}</tbody></table>
    </div>
  </div>
</body>
</html>`;
  }
}
