import * as vscode from 'vscode';

export interface StartupProfilerEntry {
  name: string;
  durationMs: number;
  atMs: number;
}

export class StartupProfilerPanel {
  public static currentPanel: StartupProfilerPanel | undefined;
  private static readonly viewType = 'androidToolkitStartupProfiler';
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, entries: StartupProfilerEntry[], totalMs: number) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml(entries, totalMs);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(entries: StartupProfilerEntry[], totalMs: number): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (StartupProfilerPanel.currentPanel) {
      StartupProfilerPanel.currentPanel.panel.reveal(column);
      StartupProfilerPanel.currentPanel.panel.webview.html = StartupProfilerPanel.currentPanel.getHtml(entries, totalMs);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      StartupProfilerPanel.viewType,
      'Startup Profiler',
      column || vscode.ViewColumn.One,
      { enableScripts: false, retainContextWhenHidden: true }
    );
    StartupProfilerPanel.currentPanel = new StartupProfilerPanel(panel, entries, totalMs);
  }

  private getHtml(entries: StartupProfilerEntry[], totalMs: number): string {
    const sorted = [...entries].sort((a, b) => b.durationMs - a.durationMs);
    const rows = sorted.length === 0
      ? '<tr><td colspan="4">No startup samples yet.</td></tr>'
      : sorted.map((entry, index) => `<tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(entry.name)}</td>
          <td>${entry.durationMs.toFixed(1)} ms</td>
          <td>${entry.atMs.toFixed(1)} ms</td>
        </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); padding: 12px; }
    .kpi { border:1px solid var(--vscode-widget-border); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
    .label { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .value { font-size: 22px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid var(--vscode-widget-border); text-align: left; padding: 6px; font-size: 12px; }
    th { color: var(--vscode-descriptionForeground); }
    code { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <h2>Extension Startup Profiler</h2>
  <div class="kpi">
    <div class="label">Activation total</div>
    <div class="value">${totalMs.toFixed(1)} ms</div>
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>Phase</th><th>Duration</th><th>Started At</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  }

  private dispose(): void {
    StartupProfilerPanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
