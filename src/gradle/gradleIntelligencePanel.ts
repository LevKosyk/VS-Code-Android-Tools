import * as vscode from 'vscode';
import { runGradleTaskWithResult, runGradleTaskWithResultCached } from './gradleService';
import { showGradleOutput } from './gradleOutput';
import { getWebviewThemeStyle } from '../ui/webviewTheme';

interface ConflictRow {
  module: string;
  versions: string[];
  suggestion: string;
}

interface SlowTaskRow {
  task: string;
  durationMs: number;
}

function parseDependencyConflicts(output: string): ConflictRow[] {
  const byModule = new Map<string, Set<string>>();
  const regex = /([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+):([0-9][a-zA-Z0-9+_.-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(output)) !== null) {
    const module = match[1];
    const version = match[2];
    if (!byModule.has(module)) {
      byModule.set(module, new Set<string>());
    }
    byModule.get(module)?.add(version);
  }
  const rows: ConflictRow[] = [];
  for (const [module, versionsSet] of byModule.entries()) {
    const versions = Array.from(versionsSet).sort(compareVersionLoose);
    if (versions.length <= 1) {
      continue;
    }
    const selected = versions[versions.length - 1];
    rows.push({
      module,
      versions,
      suggestion: `resolutionStrategy.force("${module}:${selected}")`,
    });
  }
  return rows.sort((a, b) => b.versions.length - a.versions.length || a.module.localeCompare(b.module));
}

function compareVersionLoose(a: string, b: string): number {
  const pa = a.split(/[.-]/).map(part => Number(part));
  const pb = b.split(/[.-]/).map(part => Number(part));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const av = Number.isFinite(pa[i]) ? pa[i] : 0;
    const bv = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (av !== bv) {
      return av - bv;
    }
  }
  return a.localeCompare(b);
}

function parseTaskDurations(output: string): SlowTaskRow[] {
  const rows: SlowTaskRow[] = [];
  const secondsRegex = /Task\s+(:[^\s]+)\s+took\s+([0-9]+(?:\.[0-9]+)?)\s+secs/gi;
  let secMatch: RegExpExecArray | null;
  while ((secMatch = secondsRegex.exec(output)) !== null) {
    rows.push({ task: secMatch[1], durationMs: Math.round(parseFloat(secMatch[2]) * 1000) });
  }
  const msRegex = /Task\s+(:[^\s]+)\s+took\s+([0-9]+)\s+ms/gi;
  let msMatch: RegExpExecArray | null;
  while ((msMatch = msRegex.exec(output)) !== null) {
    rows.push({ task: msMatch[1], durationMs: parseInt(msMatch[2], 10) });
  }
  const merged = new Map<string, number>();
  for (const row of rows) {
    merged.set(row.task, Math.max(merged.get(row.task) || 0, row.durationMs));
  }
  return Array.from(merged.entries())
    .map(([task, durationMs]) => ({ task, durationMs }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 12);
}

export class GradleIntelligencePanel {
  public static currentPanel: GradleIntelligencePanel | undefined;
  private static readonly viewType = 'androidToolkitGradleIntelligence';
  private readonly panel: vscode.WebviewPanel;
  private readonly workspaceRoot: string;
  private readonly disposables: vscode.Disposable[] = [];
  private requestBusy = false;
  private queuedMessage: { type: string; moduleName?: string; configuration?: string; variant?: string } | undefined;

  private constructor(panel: vscode.WebviewPanel, workspaceRoot: string) {
    this.panel = panel;
    this.workspaceRoot = workspaceRoot;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg), null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(workspaceRoot: string): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (GradleIntelligencePanel.currentPanel) {
      GradleIntelligencePanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      GradleIntelligencePanel.viewType,
      'Gradle Intelligence',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    GradleIntelligencePanel.currentPanel = new GradleIntelligencePanel(panel, workspaceRoot);
  }

  private async handleMessage(message: { type: string; moduleName?: string; configuration?: string; variant?: string }): Promise<void> {
    if (this.requestBusy) {
      this.queuedMessage = message;
      return;
    }
    this.requestBusy = true;
    try {
    if (message.type === 'detectConflicts') {
      const moduleName = message.moduleName?.trim() || 'app';
      const configuration = message.configuration?.trim() || 'debugRuntimeClasspath';
      const task = `:${moduleName}:dependencies`;
      const args = ['--configuration', configuration];
      const result = await runGradleTaskWithResultCached(this.workspaceRoot, task, args, 10_000);
      showGradleOutput(`${task} ${args.join(' ')}`, result, this.workspaceRoot);
      if (result.exitCode !== 0) {
        this.postMessage({ type: 'status', text: 'Dependency scan failed. See Gradle output.' });
        return;
      }
      const rows = parseDependencyConflicts(`${result.stdout}\n${result.stderr}`);
      this.postMessage({ type: 'conflicts', rows });
      this.postMessage({ type: 'status', text: rows.length === 0 ? 'No version conflicts detected.' : `Detected ${rows.length} potential conflicts.` });
      return;
    }
    if (message.type === 'scanBuild') {
      const moduleName = message.moduleName?.trim() || 'app';
      const variant = message.variant?.trim() || 'Debug';
      const task = `:${moduleName}:assemble${variant}`;
      const args = ['--profile', '--info'];
      const result = await runGradleTaskWithResult(this.workspaceRoot, task, args);
      showGradleOutput(`${task} ${args.join(' ')}`, result, this.workspaceRoot);
      const rows = parseTaskDurations(`${result.stdout}\n${result.stderr}`);
      this.postMessage({ type: 'slowTasks', rows });
      this.postMessage({
        type: 'status',
        text: result.exitCode === 0
          ? (rows.length === 0 ? 'Build finished; task timings not found in output.' : `Build scan-lite completed. ${rows.length} slow tasks listed.`)
          : 'Build failed. Partial timings shown if available.',
      });
    }
    } finally {
      this.requestBusy = false;
      if (this.queuedMessage) {
        const next = this.queuedMessage;
        this.queuedMessage = undefined;
        setTimeout(() => void this.handleMessage(next), 120);
      }
    }
  }

  private postMessage(message: object): void {
    this.panel.webview.postMessage(message);
  }

  private getHtml(): string {
    const themeVars = getWebviewThemeStyle();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    ${themeVars}
    body { font-family: var(--vscode-font-family); font-size: var(--at-font-size, 13px); color: var(--vscode-editor-foreground); padding: var(--at-space-3); }
    h2 { margin: 0 0 var(--at-space-2) 0; font-size: var(--at-type-title); font-weight: 700; }
    .row { display:flex; gap:var(--at-space-2); margin-bottom:var(--at-space-3); align-items:center; flex-wrap:wrap; }
    input, button { border:1px solid var(--vscode-widget-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius:var(--at-radius-sm); padding:var(--at-control-padding-y, 6px) var(--at-control-padding-x, 8px); font-size: var(--at-type-label); }
    button { cursor:pointer; min-height: var(--at-table-row-height, 34px); font-weight: 600; }
    button.btn-primary { background: var(--at-info); color: var(--at-info-contrast); border-color: transparent; }
    button.btn-secondary { background: transparent; color: var(--vscode-editor-foreground); }
    button.btn-tertiary { background: transparent; border-style: dashed; color: var(--vscode-descriptionForeground); font-weight: 500; }
    input:focus-visible, button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px; }
    .card { border:1px solid var(--vscode-widget-border); border-radius:var(--at-radius-md); padding:var(--at-space-3); margin-bottom:var(--at-space-3); }
    .muted { color: var(--vscode-descriptionForeground); font-size:var(--at-type-helper); white-space: pre-wrap; margin-bottom: var(--at-space-3); }
    .status { border:1px solid var(--vscode-widget-border); border-radius:var(--at-radius-sm); padding:var(--at-space-2) var(--at-space-3); min-height:var(--at-table-row-height, 34px); font-size: var(--at-type-label); }
    .status.info { color: var(--at-info-contrast); border-color: var(--at-info); background: var(--at-info-bg); }
    .status.warn { color: var(--at-warn-contrast); border-color: var(--at-warn); background: var(--at-warn-bg); }
    .status.error { color: var(--at-error-contrast); border-color: var(--at-error); background: var(--at-error-bg); font-weight:600; }
    .status.success { color: var(--at-success-contrast); border-color: var(--at-success); background: var(--at-success-bg); }
    table { width:100%; border-collapse: collapse; }
    th, td { border-bottom:1px solid var(--vscode-widget-border); padding:var(--at-space-2); min-height: var(--at-table-row-height, 34px); text-align:left; font-size:var(--at-type-label); vertical-align: top; }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; }
    code { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <h2>Gradle Intelligence</h2>
  <div class="muted">Tip: run conflict detector first, then scan build for slow tasks. Press Ctrl/Cmd+Enter for conflict scan.</div>
  <div class="card">
    <div class="row">
      <input id="module" value="app" placeholder="Module" />
      <input id="config" value="debugRuntimeClasspath" placeholder="Configuration" />
      <button id="conflictsBtn" class="btn-primary">Detect dependency conflicts</button>
    </div>
    <table>
      <thead><tr><th>Module</th><th>Versions</th><th>Safe suggestion</th></tr></thead>
      <tbody id="conflictsBody"><tr><td colspan="3">Run detector to see results.</td></tr></tbody>
    </table>
  </div>
  <div class="card">
    <div class="row">
      <input id="variant" value="Debug" placeholder="Variant" />
      <button id="scanBtn" class="btn-secondary">Run build scan-lite</button>
    </div>
    <table>
      <thead><tr><th>Task</th><th>Duration</th></tr></thead>
      <tbody id="slowBody"><tr><td colspan="2">Run scan-lite to see slow tasks.</td></tr></tbody>
    </table>
  </div>
  <div class="status info" id="status" role="status" aria-live="polite">Idle — choose module/configuration and run a scan.</div>
  <script>
    const vscode = acquireVsCodeApi();
    const persisted = vscode.getState ? (vscode.getState() || {}) : {};
    const moduleInput = document.getElementById('module');
    const configInput = document.getElementById('config');
    const variantInput = document.getElementById('variant');
    const status = document.getElementById('status');
    const conflictsBody = document.getElementById('conflictsBody');
    const slowBody = document.getElementById('slowBody');
    function persistState() {
      if (!vscode.setState) return;
      vscode.setState({
        moduleName: moduleInput.value,
        configuration: configInput.value,
        variant: variantInput.value,
      });
    }
    if (persisted.moduleName) moduleInput.value = persisted.moduleName;
    if (persisted.configuration) configInput.value = persisted.configuration;
    if (persisted.variant) variantInput.value = persisted.variant;
    function setStatus(state, text) {
      const sev = state === 'failed' ? 'error' : state === 'fixed' ? 'success' : 'info';
      status.textContent = state.charAt(0).toUpperCase() + state.slice(1) + ' — ' + (text || '');
      status.className = 'status ' + sev;
    }
    document.getElementById('conflictsBtn').addEventListener('click', () => {
      setStatus('running', 'Scanning dependencies...');
      vscode.postMessage({
        type: 'detectConflicts',
        moduleName: moduleInput.value.trim(),
        configuration: configInput.value.trim()
      });
      persistState();
    });
    document.getElementById('scanBtn').addEventListener('click', () => {
      setStatus('running', 'Running build scan-lite...');
      vscode.postMessage({
        type: 'scanBuild',
        moduleName: moduleInput.value.trim(),
        variant: variantInput.value.trim()
      });
      persistState();
    });
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'status') {
        const text = msg.text || '';
        if (/failed|error/i.test(text)) {
          setStatus('failed', text);
        } else if (/completed|no .*detected/i.test(text)) {
          setStatus('fixed', text);
        } else {
          setStatus('idle', text);
        }
      }
      if (msg.type === 'conflicts') {
        const rows = msg.rows || [];
        if (rows.length === 0) {
          conflictsBody.innerHTML = '<tr><td colspan="3">No conflicts detected.</td></tr>';
          return;
        }
        conflictsBody.innerHTML = rows.map(r => '<tr><td><code>' + r.module + '</code></td><td>' + r.versions.join(', ') + '</td><td><code>' + r.suggestion + '</code></td></tr>').join('');
      }
      if (msg.type === 'slowTasks') {
        const rows = msg.rows || [];
        if (rows.length === 0) {
          slowBody.innerHTML = '<tr><td colspan="2">No task timing data found.</td></tr>';
          return;
        }
        slowBody.innerHTML = rows.map(r => '<tr><td><code>' + r.task + '</code></td><td>' + r.durationMs + ' ms</td></tr>').join('');
      }
    });
    moduleInput.addEventListener('input', persistState);
    configInput.addEventListener('input', persistState);
    variantInput.addEventListener('input', persistState);
    conflictsBody.innerHTML = '<tr><td colspan="3">Loading… run detector to show results.</td></tr>';
    slowBody.innerHTML = '<tr><td colspan="2">Loading… run scan-lite to show slow tasks.</td></tr>';
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('conflictsBtn').click();
      }
    });
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    GradleIntelligencePanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}
