import * as vscode from 'vscode';
import { getSharedPanelUiKitStyle, getWebviewThemeStyle } from './webviewTheme';

export type NextActionItem = {
  id: string;
  label: string;
  detail: string;
  hotkey?: string;
  category?: 'recommended' | 'recent' | 'team';
};

export type NextActionModel = {
  recommended: NextActionItem;
  summary: {
    state: 'ok' | 'warning' | 'error';
    headline: string;
    detail: string;
  };
  recents: NextActionItem[];
  teamRecommended: NextActionItem[];
};

export type NextActionPanelHandlers = {
  load: () => Promise<NextActionModel>;
  runAction: (id: string) => Promise<{ success: boolean; message: string }>;
};

export class NextActionPanel {
  private static current: NextActionPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly handlers: NextActionPanelHandlers;

  private constructor(panel: vscode.WebviewPanel, handlers: NextActionPanelHandlers) {
    this.panel = panel;
    this.handlers = handlers;
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m));
    this.panel.onDidDispose(() => {
      if (NextActionPanel.current === this) {
        NextActionPanel.current = undefined;
      }
    });
  }

  public static createOrShow(handlers: NextActionPanelHandlers): void {
    if (NextActionPanel.current) {
      NextActionPanel.current.panel.reveal(vscode.ViewColumn.One);
      void NextActionPanel.current.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'androidWhatNext',
      'What Should I Do Next?',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    NextActionPanel.current = new NextActionPanel(panel, handlers);
    void NextActionPanel.current.refresh();
  }

  private async onMessage(message: { type?: string; id?: string }): Promise<void> {
    if (message.type === 'refresh') {
      await this.refresh();
      return;
    }
    if (message.type === 'run' && message.id) {
      const result = await this.handlers.runAction(message.id);
      this.panel.webview.postMessage({ type: 'runResult', result });
      await this.refresh();
    }
  }

  private async refresh(): Promise<void> {
    const model = await this.handlers.load();
    this.panel.webview.postMessage({ type: 'model', model });
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
.at-state-ok { border-left: 4px solid var(--at-success); }
.at-state-warning { border-left: 4px solid var(--at-warn); }
.at-state-error { border-left: 4px solid var(--at-error); }
.at-list { display: grid; gap: var(--at-space-2); }
.at-item { border: 1px solid var(--vscode-widget-border); border-radius: var(--at-radius-sm); padding: var(--at-space-2); display: flex; justify-content: space-between; align-items: center; gap: var(--at-space-2); }
.at-key { font-size: var(--at-type-helper); color: var(--vscode-descriptionForeground); }
</style>
</head>
<body class="at-page">
  <h2 class="at-title">What Should I Do Next?</h2>
  <div id="statusCard" class="at-card at-state-warning">
    <div class="at-title-sm" id="summaryHeadline">Checking workspace state...</div>
    <div class="at-meta" id="summaryDetail">Loading recommendation context.</div>
  </div>
  <div class="at-card">
    <div class="at-title-sm">Recommended Next Action</div>
    <div class="at-summary-grid">
      <div class="at-summary-card">
        <div id="recLabel" class="at-title-sm">Loading...</div>
        <div id="recDetail" class="at-meta">Preparing recommendation...</div>
      </div>
      <div class="at-summary-card">
        <button id="runRecommended" class="at-btn at-btn-primary">Do This Next</button>
      </div>
    </div>
  </div>
  <div class="at-card">
    <div class="at-title-sm">Recently Used</div>
    <div id="recentList" class="at-list">
      <div class="at-loading-text">Loading recent actions...</div>
      <div class="at-skeleton at-skeleton-lg"></div>
    </div>
  </div>
  <div class="at-card">
    <div class="at-title-sm">Team Recommended</div>
    <div id="teamList" class="at-list">
      <div class="at-loading-text">Loading team recommendations...</div>
      <div class="at-skeleton at-skeleton-lg"></div>
    </div>
  </div>
  <div class="at-actions">
    <button id="refresh" class="at-btn at-btn-tertiary">Refresh</button>
  </div>
  <div id="feedback" class="at-meta" style="margin-top:8px;"></div>
<script>
const vscode = acquireVsCodeApi();
const recLabel = document.getElementById('recLabel');
const recDetail = document.getElementById('recDetail');
const recentList = document.getElementById('recentList');
const teamList = document.getElementById('teamList');
const feedback = document.getElementById('feedback');
const statusCard = document.getElementById('statusCard');
const summaryHeadline = document.getElementById('summaryHeadline');
const summaryDetail = document.getElementById('summaryDetail');
const runRecommended = document.getElementById('runRecommended');
let currentRecommendedId = '';

function renderActionList(el, actions) {
  el.innerHTML = '';
  if (!actions || actions.length === 0) {
    el.innerHTML = '<div class="at-empty"><div class="at-meta">No actions yet.</div></div>';
    return;
  }
  for (const item of actions) {
    const row = document.createElement('div');
    row.className = 'at-item';
    const left = document.createElement('div');
    left.innerHTML = '<div class="at-title-sm">' + item.label + '</div><div class="at-meta">' + item.detail + '</div>';
    const right = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'at-btn at-btn-secondary';
    btn.textContent = 'Run';
    btn.onclick = () => {
      feedback.textContent = 'Running: ' + item.label + '...';
      vscode.postMessage({ type: 'run', id: item.id });
    };
    right.appendChild(btn);
    if (item.hotkey) {
      const hot = document.createElement('div');
      hot.className = 'at-key';
      hot.textContent = item.hotkey;
      right.appendChild(hot);
    }
    row.appendChild(left);
    row.appendChild(right);
    el.appendChild(row);
  }
}

document.getElementById('refresh').onclick = () => {
  feedback.textContent = 'Refreshing recommendation...';
  vscode.postMessage({ type: 'refresh' });
};
runRecommended.onclick = () => {
  if (!currentRecommendedId) return;
  feedback.textContent = 'Running recommended action...';
  vscode.postMessage({ type: 'run', id: currentRecommendedId });
};
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') {
    e.preventDefault();
    runRecommended.click();
  }
  if (e.key.toLowerCase() === 'r' && e.altKey) {
    e.preventDefault();
    document.getElementById('refresh').click();
  }
});

window.addEventListener('message', (event) => {
  const m = event.data;
  if (m.type === 'model') {
    const model = m.model || {};
    const summary = model.summary || {};
    summaryHeadline.textContent = summary.headline || 'Recommended next action ready.';
    summaryDetail.textContent = summary.detail || '';
    statusCard.className = 'at-card ' + (summary.state === 'error' ? 'at-state-error' : summary.state === 'warning' ? 'at-state-warning' : 'at-state-ok');
    const rec = model.recommended || {};
    currentRecommendedId = rec.id || '';
    recLabel.textContent = rec.label || 'No recommendation yet';
    recDetail.textContent = rec.detail || '';
    runRecommended.disabled = !currentRecommendedId;
    renderActionList(recentList, model.recents || []);
    renderActionList(teamList, model.teamRecommended || []);
    feedback.textContent = '';
  }
  if (m.type === 'runResult') {
    const result = m.result || {};
    feedback.textContent = (result.success ? 'Done: ' : 'Failed: ') + (result.message || 'Action completed');
  }
});

vscode.postMessage({ type: 'refresh' });
</script>
</body>
</html>`;
  }
}
