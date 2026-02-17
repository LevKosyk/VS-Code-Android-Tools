import * as vscode from 'vscode';
import { SloSummary } from './sloSummary';
import { SlowPathSummaryItem } from './slowPathMetrics';

export class SloDashboardPanel {
  public static currentPanel: SloDashboardPanel | undefined;
  private static readonly viewType = 'androidToolkitSloDashboard';
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, summary: SloSummary, slowPaths: SlowPathSummaryItem[]) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml(summary, slowPaths);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(summary: SloSummary, slowPaths: SlowPathSummaryItem[]): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (SloDashboardPanel.currentPanel) {
      SloDashboardPanel.currentPanel.panel.reveal(column);
      SloDashboardPanel.currentPanel.panel.webview.html = SloDashboardPanel.currentPanel.getHtml(summary, slowPaths);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      SloDashboardPanel.viewType,
      'Stability SLO Dashboard',
      column || vscode.ViewColumn.One,
      { enableScripts: false, retainContextWhenHidden: true }
    );
    SloDashboardPanel.currentPanel = new SloDashboardPanel(panel, summary, slowPaths);
  }

  private getHtml(summary: SloSummary, slowPaths: SlowPathSummaryItem[]): string {
    const formatMs = (value: number): string => value > 0 ? `${value} ms` : '-';
    const budgetRows = summary.commandBudgets.length === 0
      ? '<tr><td colspan="6">No command latency samples yet.</td></tr>'
      : summary.commandBudgets.map(item =>
          `<tr>
            <td><code>${item.commandId}</code></td>
            <td>${item.sloMs} ms</td>
            <td>${item.medianMs} ms</td>
            <td>${item.p95Ms} ms</td>
            <td>${item.samples}</td>
            <td>${item.breaches}</td>
          </tr>`).join('');
    const slowRows = slowPaths.length === 0
      ? '<tr><td colspan="6">No slow-stage samples yet.</td></tr>'
      : slowPaths.map(item => `<tr>
          <td><code>${item.stage}</code></td>
          <td>${item.samples}</td>
          <td>${item.failures}</td>
          <td>${item.medianMs} ms</td>
          <td>${item.p95Ms} ms</td>
          <td>${item.maxMs} ms</td>
        </tr>`).join('');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); padding: 14px; }
    .grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
    .card { border:1px solid var(--vscode-widget-border); border-radius:8px; padding:10px; }
    .title { font-size:12px; color: var(--vscode-descriptionForeground); margin-bottom:4px; }
    .value { font-size:22px; font-weight: 600; }
    .muted { margin-top: 10px; font-size:12px; color: var(--vscode-descriptionForeground); }
    table { width:100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom:1px solid var(--vscode-widget-border); text-align:left; padding:6px; font-size:12px; }
    th { color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <h2>Stability SLO (last 7 days)</h2>
  <div class="grid">
    <div class="card"><div class="title">Run success rate</div><div class="value">${summary.runSuccessRate}%</div></div>
    <div class="card"><div class="title">Crash-free sessions</div><div class="value">${summary.crashFreeSessionRate}%</div></div>
    <div class="card"><div class="title">Median build time</div><div class="value">${formatMs(summary.medianBuildMs)}</div></div>
    <div class="card"><div class="title">Median install time</div><div class="value">${formatMs(summary.medianInstallMs)}</div></div>
  </div>
  <div class="muted">
    Sessions: ${summary.totalSessions} • Actions: ${summary.totalActions}
  </div>
  <h3>Command Budget</h3>
  <table>
    <thead>
      <tr>
        <th>Command</th><th>SLO</th><th>Median</th><th>P95</th><th>Samples</th><th>Breaches</th>
      </tr>
    </thead>
    <tbody>${budgetRows}</tbody>
  </table>
  <h3>Top Slow Stages</h3>
  <table>
    <thead>
      <tr>
        <th>Stage</th><th>Samples</th><th>Failures</th><th>Median</th><th>P95</th><th>Max</th>
      </tr>
    </thead>
    <tbody>${slowRows}</tbody>
  </table>
</body>
</html>`;
  }

  private dispose(): void {
    SloDashboardPanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}
