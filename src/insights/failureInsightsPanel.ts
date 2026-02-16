import * as vscode from 'vscode';
import { RunFailureRecord } from '../run/runDiagnostics';
import { ErrorReason } from '../run/errorTaxonomy';
import { ERROR_REASON_META } from '../run/errorTaxonomy';

export interface RunFixAttemptRecord {
  fixId: string;
  reason: ErrorReason;
  success: boolean;
  timestamp: number;
}

export interface FailureInsightsSummary {
  totalFailuresWeek: number;
  topReasons: Array<{ reason: ErrorReason; count: number; lastSeen: number }>;
  autoFixHitRate: number;
  autoFixAttempts: number;
  autoFixSuccesses: number;
}

function toWeek(records: RunFailureRecord[]): RunFailureRecord[] {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const threshold = Date.now() - weekMs;
  return records.filter(r => r.timestamp >= threshold);
}

export function summarizeFailureInsights(
  failures: RunFailureRecord[],
  fixAttempts: RunFixAttemptRecord[]
): FailureInsightsSummary {
  const weekly = toWeek(failures);
  const grouped = new Map<ErrorReason, { count: number; lastSeen: number }>();
  for (const item of weekly) {
    const reason = item.reason || 'unknown';
    const prev = grouped.get(reason);
    if (!prev) {
      grouped.set(reason, { count: 1, lastSeen: item.timestamp });
      continue;
    }
    prev.count += 1;
    prev.lastSeen = Math.max(prev.lastSeen, item.timestamp);
  }
  const topReasons = Array.from(grouped.entries())
    .map(([reason, value]) => ({ reason, count: value.count, lastSeen: value.lastSeen }))
    .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
    .slice(0, 8);

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const threshold = Date.now() - weekMs;
  const weeklyFixAttempts = fixAttempts.filter(r => r.timestamp >= threshold);
  const autoFixAttempts = weeklyFixAttempts.length;
  const autoFixSuccesses = weeklyFixAttempts.filter(r => r.success).length;
  const autoFixHitRate = autoFixAttempts > 0 ? Math.round((autoFixSuccesses / autoFixAttempts) * 1000) / 10 : 0;

  return {
    totalFailuresWeek: weekly.length,
    topReasons,
    autoFixHitRate,
    autoFixAttempts,
    autoFixSuccesses,
  };
}

export class FailureInsightsPanel {
  public static currentPanel: FailureInsightsPanel | undefined;
  private static readonly viewType = 'androidToolkitFailureInsightsPanel';
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, summary: FailureInsightsSummary) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml(summary);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(summary: FailureInsightsSummary): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (FailureInsightsPanel.currentPanel) {
      FailureInsightsPanel.currentPanel.panel.reveal(column);
      FailureInsightsPanel.currentPanel.panel.webview.html = FailureInsightsPanel.currentPanel.getHtml(summary);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      FailureInsightsPanel.viewType,
      'Crash / Failure Insights',
      column || vscode.ViewColumn.One,
      { enableScripts: false, retainContextWhenHidden: true }
    );
    FailureInsightsPanel.currentPanel = new FailureInsightsPanel(panel, summary);
  }

  private getHtml(summary: FailureInsightsSummary): string {
    const reasonRows = summary.topReasons.length > 0
      ? summary.topReasons.map((r, index) =>
          `<tr><td>${index + 1}</td><td>${escapeHtml(ERROR_REASON_META[r.reason].title)} <span style="color:var(--vscode-descriptionForeground)">(${escapeHtml(r.reason)})</span></td><td>${r.count}</td><td>${new Date(r.lastSeen).toLocaleString()}</td></tr>`).join('')
      : '<tr><td colspan="4">No failures in the last 7 days.</td></tr>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); padding: 14px; }
    .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .card { border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 10px; }
    .title { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
    .value { font-size: 22px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid var(--vscode-widget-border); text-align: left; padding: 8px 6px; font-size: 12px; }
    th { color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <h2>Crash / Failure Insights (last 7 days)</h2>
  <div class="kpis">
    <div class="card"><div class="title">Failures</div><div class="value">${summary.totalFailuresWeek}</div></div>
    <div class="card"><div class="title">Auto-fix hit rate</div><div class="value">${summary.autoFixHitRate}%</div></div>
    <div class="card"><div class="title">Auto-fix successes</div><div class="value">${summary.autoFixSuccesses}/${summary.autoFixAttempts}</div></div>
  </div>
  <h3>Top errors</h3>
  <table>
    <thead>
      <tr><th>#</th><th>Reason</th><th>Frequency</th><th>Last seen</th></tr>
    </thead>
    <tbody>${reasonRows}</tbody>
  </table>
</body>
</html>`;
  }

  private dispose(): void {
    FailureInsightsPanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
