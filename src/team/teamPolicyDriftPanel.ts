import * as vscode from 'vscode';
import { getSharedPanelUiKitStyle, getWebviewThemeStyle } from '../ui/webviewTheme';

export type TeamPolicyDriftRow = {
  id: string;
  title: string;
  expected: string;
  actual: string;
};

export type TeamPolicyDriftHandlers = {
  load: () => Promise<TeamPolicyDriftRow[]>;
  alignOne: (id: string) => Promise<void>;
  alignAll: () => Promise<void>;
  openMarkdown: () => Promise<void>;
};

export class TeamPolicyDriftPanel {
  private static current: TeamPolicyDriftPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly handlers: TeamPolicyDriftHandlers;

  private constructor(panel: vscode.WebviewPanel, handlers: TeamPolicyDriftHandlers) {
    this.panel = panel;
    this.handlers = handlers;
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m));
    this.panel.onDidDispose(() => {
      if (TeamPolicyDriftPanel.current === this) {
        TeamPolicyDriftPanel.current = undefined;
      }
    });
  }

  public static createOrShow(handlers: TeamPolicyDriftHandlers): void {
    if (TeamPolicyDriftPanel.current) {
      TeamPolicyDriftPanel.current.panel.reveal(vscode.ViewColumn.One);
      void TeamPolicyDriftPanel.current.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'androidTeamPolicyDrift',
      'Team Policy Drift',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    TeamPolicyDriftPanel.current = new TeamPolicyDriftPanel(panel, handlers);
    void TeamPolicyDriftPanel.current.refresh();
  }

  private async onMessage(message: { type?: string; id?: string }): Promise<void> {
    if (message.type === 'refresh') {
      await this.refresh();
      return;
    }
    if (message.type === 'alignOne' && message.id) {
      await this.handlers.alignOne(message.id);
      await this.refresh();
      return;
    }
    if (message.type === 'alignAll') {
      await this.handlers.alignAll();
      await this.refresh();
      return;
    }
    if (message.type === 'openMarkdown') {
      await this.handlers.openMarkdown();
    }
  }

  private async refresh(): Promise<void> {
    const drifts = await this.handlers.load();
    this.panel.webview.postMessage({ type: 'drifts', drifts });
  }

  private html(): string {
    const themeVars = getWebviewThemeStyle();
    const kit = getSharedPanelUiKitStyle();
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
${themeVars}
${kit}
.warn { border-left: 4px solid var(--at-warn); }
.ok { border-left: 4px solid var(--at-success); }
.meta { opacity: 0.86; font-size: var(--at-type-helper); }
.title { font-weight: 600; font-size: var(--at-type-label); margin-bottom: var(--at-space-1); }
.row { display: flex; justify-content: space-between; gap: var(--at-space-3); align-items: center; }
code { font-family: var(--vscode-editor-font-family); }
details.at-more > summary { cursor: pointer; font-size: var(--at-type-helper); color: var(--vscode-descriptionForeground); }
</style>
</head>
<body class="at-page">
  <h2 class="at-title">Team Policy Drift</h2>
  <div id="loadingState" class="at-card">
    <div class="at-loading-text">Checking settings and run-rule drift...</div>
    <div class="at-skeleton at-skeleton-lg"></div>
  </div>
  <div class="at-actions" style="margin-bottom: var(--at-space-3);">
    <button id="refresh" class="at-btn at-btn-tertiary">Refresh</button>
    <button id="alignAll" class="at-btn at-btn-primary">Align All (Alt+A)</button>
    <button id="openMarkdown" class="at-btn at-btn-secondary">Open Markdown Report</button>
  </div>
  <div id="feedback" class="at-meta"></div>
  <div id="summary" class="meta"></div>
  <div id="drifts"></div>
<script>
const vscode = acquireVsCodeApi();
const summaryEl = document.getElementById('summary');
const driftsEl = document.getElementById('drifts');
const loadingStateEl = document.getElementById('loadingState');
const feedbackEl = document.getElementById('feedback');
function esc(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
document.getElementById('refresh').onclick = () => vscode.postMessage({ type: 'refresh' });
document.getElementById('alignAll').onclick = () => {
  feedbackEl.textContent = 'Aligning all drift items...';
  vscode.postMessage({ type: 'alignAll' });
};
document.getElementById('openMarkdown').onclick = () => vscode.postMessage({ type: 'openMarkdown' });
window.addEventListener('keydown', (e) => {
  if (e.altKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    document.getElementById('alignAll').click();
  }
  if (e.altKey && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    document.getElementById('refresh').click();
  }
});

window.addEventListener('message', (event) => {
  const m = event.data;
  if (m.type !== 'drifts') return;
  loadingStateEl.style.display = 'none';
  const drifts = Array.isArray(m.drifts) ? m.drifts : [];
  summaryEl.textContent = drifts.length === 0 ? 'No drift detected.' : (drifts.length + ' drift item(s) detected.');
  feedbackEl.textContent = drifts.length === 0 ? 'Success summary: policy is aligned.' : 'Action needed: align drift items or export report.';
  driftsEl.innerHTML = '';

  if (drifts.length === 0) {
    const okCard = document.createElement('div');
    okCard.className = 'card ok';
    okCard.innerHTML = '<div class="title">Policy aligned</div><div class="meta">Your local setup matches team profile and required settings.</div>';
    driftsEl.appendChild(okCard);
    return;
  }

  for (const drift of drifts) {
    const card = document.createElement('div');
    card.className = 'at-card warn';
    const row = document.createElement('div');
    row.className = 'row';
    const left = document.createElement('div');
    left.innerHTML = '<div class="title">' + esc(drift.title) + '</div>' +
      '<details class="at-more"><summary>Expected vs Actual</summary>' +
      '<div class="meta">Expected: <code>' + esc(drift.expected) + '</code></div>' +
      '<div class="meta">Actual: <code>' + esc(drift.actual) + '</code></div>' +
      '</details>';
    row.appendChild(left);
    const btn = document.createElement('button');
    btn.className = 'at-btn at-btn-secondary';
    btn.textContent = 'Align';
    btn.onclick = () => {
      feedbackEl.textContent = 'Applying drift fix...';
      vscode.postMessage({ type: 'alignOne', id: drift.id });
    };
    row.appendChild(btn);
    card.appendChild(row);
    driftsEl.appendChild(card);
  }
});

vscode.postMessage({ type: 'refresh' });
</script>
</body>
</html>`;
  }
}
