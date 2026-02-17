import * as vscode from 'vscode';
import { getWebviewThemeStyle } from './webviewTheme';

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
  testRun: () => Promise<{ ok: boolean; message: string }>;
  sendFeedback: () => Promise<void>;
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
      return;
    }
    if (message.type === 'testRun') {
      const result = await this.handlers.testRun();
      this.panel.webview.postMessage({ type: 'testRunResult', result });
      await this.refresh();
      return;
    }
    if (message.type === 'sendFeedback') {
      await this.handlers.sendFeedback();
    }
  }

  private async refresh(): Promise<void> {
    const checks = await this.handlers.load();
    this.panel.webview.postMessage({ type: 'checks', checks });
  }

  private html(): string {
    const themeVars = getWebviewThemeStyle();
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
${themeVars}
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); font-size: var(--at-font-size, 13px); padding: var(--at-space-4); }
h2 { margin: 0 0 var(--at-space-3) 0; font-size: var(--at-type-title); font-weight: 700; }
.card { border: 1px solid var(--vscode-widget-border); border-radius: var(--at-radius-md); padding: var(--at-space-3); margin-bottom: var(--at-space-3); }
.ok { border-left: 4px solid #22c55e; }
.warn { border-left: 4px solid #f59e0b; }
.step-title { font-weight: 700; margin-bottom: var(--at-space-2); font-size: var(--at-type-section); }
.row { display: flex; justify-content: space-between; gap: var(--at-space-3); align-items: center; }
.title { font-weight: 600; margin-bottom: var(--at-space-1); font-size: var(--at-type-label); }
.meta { opacity: 0.86; font-size: var(--at-type-helper); }
button { border: 1px solid var(--vscode-widget-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: var(--at-radius-sm); padding: var(--at-control-padding-y, 6px) var(--at-control-padding-x, 8px); cursor: pointer; min-height: var(--at-table-row-height, 34px); font-size: var(--at-type-label); font-weight: 600; }
button.btn-primary { background: var(--at-info); color: var(--at-info-contrast); border-color: transparent; }
button.btn-secondary { background: transparent; color: var(--vscode-foreground); }
button.btn-tertiary { background: transparent; border-style: dashed; color: var(--vscode-descriptionForeground); font-weight: 500; }
button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px; }
.actions { display: flex; gap: var(--at-space-2); margin-bottom: var(--at-space-3); flex-wrap: wrap; }
.score { border: 1px solid var(--vscode-widget-border); border-radius: var(--at-radius-md); padding: var(--at-space-3); margin-bottom: var(--at-space-4); }
.score-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--at-space-2); }
.score-value { font-weight: 700; font-size: var(--at-type-section); }
.bar { width: 100%; height: 10px; border-radius: 999px; background: #1f2937; overflow: hidden; }
.bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #f59e0b, #22c55e); transition: width .2s ease; }
.ready { border: 1px solid #22c55e66; background: #22c55e22; border-radius: var(--at-radius-md); padding: var(--at-space-3); margin-bottom: var(--at-space-3); font-weight: 700; display:none; font-size: var(--at-type-section); }
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
  <div id="ready" class="ready">Environment ready</div>
  <div class="card">
    <div class="step-title">Step 1/3 — Validate environment</div>
    <div id="checks"></div>
  </div>
  <div class="card">
    <div class="step-title">Step 2/3 — Apply fixes</div>
    <div class="actions">
      <button id="refresh" class="btn-tertiary">Refresh</button>
      <button id="fixAll" class="btn-secondary">Fix All Detected Issues</button>
      <button id="openRun" class="btn-primary">Open Run Panel</button>
    </div>
  </div>
  <div class="card">
    <div class="step-title">Step 3/3 — Test run + feedback</div>
    <div class="actions">
      <button id="testRun" class="btn-primary">Test Run</button>
      <button id="feedback" class="btn-tertiary">Send UX Feedback</button>
    </div>
    <div id="testRunStatus" class="meta">Test run not executed yet.</div>
  </div>
<script>
const vscode = acquireVsCodeApi();
const checksEl = document.getElementById('checks');
const scoreValueEl = document.getElementById('scoreValue');
const scoreFillEl = document.getElementById('scoreFill');
const readyEl = document.getElementById('ready');
const testRunStatusEl = document.getElementById('testRunStatus');
document.getElementById('refresh').onclick = () => vscode.postMessage({ type: 'refresh' });
document.getElementById('fixAll').onclick = () => vscode.postMessage({ type: 'fixAll' });
document.getElementById('openRun').onclick = () => vscode.postMessage({ type: 'openRunPanel' });
document.getElementById('testRun').onclick = () => {
  testRunStatusEl.textContent = 'Running test run...';
  vscode.postMessage({ type: 'testRun' });
};
document.getElementById('feedback').onclick = () => vscode.postMessage({ type: 'sendFeedback' });
window.addEventListener('message', (event) => {
  const m = event.data;
  if (m.type !== 'checks') return;
  const checks = m.checks || [];
  const okCount = checks.filter(c => c.ok).length;
  const total = checks.length || 1;
  const score = Math.round((okCount / total) * 100);
  scoreValueEl.textContent = score + '%';
  scoreFillEl.style.width = score + '%';
  readyEl.style.display = score === 100 ? 'block' : 'none';
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
      btn.className = 'btn-secondary';
      btn.textContent = c.fixLabel;
      btn.onclick = () => vscode.postMessage({ type: 'fix', id: c.id });
      row.appendChild(btn);
    }
    card.appendChild(row);
    checksEl.appendChild(card);
  }
});
window.addEventListener('message', (event) => {
  const m = event.data;
  if (m.type !== 'testRunResult') return;
  const result = m.result || {};
  testRunStatusEl.textContent = (result.ok ? 'Test run completed: ' : 'Test run failed: ') + (result.message || '');
});
vscode.postMessage({ type: 'refresh' });
</script>
</body>
</html>`;
  }
}
