import * as vscode from 'vscode';

export type OnboardingCheck = {
  id: string;
  title: string;
  ok: boolean;
  details: string;
  fixLabel?: string;
};

export type OnboardingHandlers = {
  load: () => Promise<OnboardingCheck[]>;
  fix: (id: string) => Promise<void>;
  fixAll: () => Promise<void>;
  openRunPanel: () => Promise<void>;
};

export class OnboardingPanel {
  private static current: OnboardingPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly handlers: OnboardingHandlers;

  private constructor(panel: vscode.WebviewPanel, handlers: OnboardingHandlers) {
    this.panel = panel;
    this.handlers = handlers;
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m));
    this.panel.onDidDispose(() => {
      if (OnboardingPanel.current === this) {
        OnboardingPanel.current = undefined;
      }
    });
  }

  public static createOrShow(handlers: OnboardingHandlers): void {
    if (OnboardingPanel.current) {
      OnboardingPanel.current.panel.reveal(vscode.ViewColumn.One);
      void OnboardingPanel.current.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'androidOnboardingV2',
      'Android Onboarding v2',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    OnboardingPanel.current = new OnboardingPanel(panel, handlers);
    void OnboardingPanel.current.refresh();
  }

  private async onMessage(message: { type?: string; id?: string }): Promise<void> {
    if (message.type === 'refresh') {
      await this.refresh();
      return;
    }
    if (message.type === 'fix' && message.id) {
      await this.handlers.fix(message.id);
      await this.refresh();
      return;
    }
    if (message.type === 'fixAll') {
      await this.handlers.fixAll();
      await this.refresh();
      return;
    }
    if (message.type === 'openRunPanel') {
      await this.handlers.openRunPanel();
    }
  }

  private async refresh(): Promise<void> {
    const checks = await this.handlers.load();
    this.panel.webview.postMessage({ type: 'checks', checks });
  }

  private html(): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 14px; }
.card { border: 1px solid var(--vscode-widget-border); border-radius: 10px; padding: 10px; margin-bottom: 10px; }
.ok { border-left: 4px solid #22c55e; }
.warn { border-left: 4px solid #f59e0b; }
.row { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.title { font-weight: 600; margin-bottom: 4px; }
.meta { opacity: 0.8; font-size: 12px; }
button { border: 1px solid var(--vscode-widget-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 8px; padding: 6px 10px; cursor: pointer; }
.actions { display: flex; gap: 8px; margin-bottom: 10px; }
.score { border: 1px solid var(--vscode-widget-border); border-radius: 10px; padding: 10px; margin-bottom: 12px; }
.score-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.score-value { font-weight: 700; }
.bar { width: 100%; height: 10px; border-radius: 999px; background: #1f2937; overflow: hidden; }
.bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #f59e0b, #22c55e); transition: width .2s ease; }
</style>
</head>
<body>
  <h2>Android Onboarding v2</h2>
  <div class="score">
    <div class="score-head">
      <div>Environment Health Score</div>
      <div id="scoreValue" class="score-value">0%</div>
    </div>
    <div class="bar"><div id="scoreFill" class="bar-fill"></div></div>
  </div>
  <div class="actions">
    <button id="refresh">Refresh</button>
    <button id="fixAll">Fix All Detected Issues</button>
    <button id="openRun">Open Run Panel</button>
  </div>
  <div id="checks"></div>
<script>
const vscode = acquireVsCodeApi();
const checksEl = document.getElementById('checks');
const scoreValueEl = document.getElementById('scoreValue');
const scoreFillEl = document.getElementById('scoreFill');
document.getElementById('refresh').onclick = () => vscode.postMessage({ type: 'refresh' });
document.getElementById('fixAll').onclick = () => vscode.postMessage({ type: 'fixAll' });
document.getElementById('openRun').onclick = () => vscode.postMessage({ type: 'openRunPanel' });
window.addEventListener('message', (event) => {
  const m = event.data;
  if (m.type !== 'checks') return;
  const checks = m.checks || [];
  const okCount = checks.filter(c => c.ok).length;
  const total = checks.length || 1;
  const score = Math.round((okCount / total) * 100);
  scoreValueEl.textContent = score + '%';
  scoreFillEl.style.width = score + '%';
  checksEl.innerHTML = '';
  for (const c of checks) {
    const card = document.createElement('div');
    card.className = 'card ' + (c.ok ? 'ok' : 'warn');
    const row = document.createElement('div');
    row.className = 'row';
    const left = document.createElement('div');
    left.innerHTML = '<div class="title">' + c.title + '</div><div class="meta">' + c.details + '</div>';
    row.appendChild(left);
    if (!c.ok && c.fixLabel) {
      const btn = document.createElement('button');
      btn.textContent = c.fixLabel;
      btn.onclick = () => vscode.postMessage({ type: 'fix', id: c.id });
      row.appendChild(btn);
    }
    card.appendChild(row);
    checksEl.appendChild(card);
  }
});
vscode.postMessage({ type: 'refresh' });
</script>
</body>
</html>`;
  }
}
