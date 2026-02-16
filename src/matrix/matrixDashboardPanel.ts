import * as vscode from 'vscode';
import { listDevicesDetailed } from '../devices/deviceManager';
import { findApplicationId, findApplicationModules, findLatestApk } from '../core/androidProject';
import { runGradleTaskWithResult } from '../gradle/gradleService';
import { showGradleOutput } from '../gradle/gradleOutput';
import { AdbService } from '../services/adbService';

interface MatrixPreset {
  name: string;
  deviceIds: string[];
}
interface MatrixRunHistoryRow {
  mode: string;
  deviceId: string;
  target: string;
  ok: boolean;
  timestamp: number;
}

const PRESETS_KEY = 'matrixDashboard.presets';
const HISTORY_KEY = 'matrixDashboard.history';

export class MatrixDashboardPanel {
  public static currentPanel: MatrixDashboardPanel | undefined;
  private static readonly viewType = 'matrixDashboardPanel';
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly workspaceRoot: string;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, workspaceRoot: string) {
    this.panel = panel;
    this.context = context;
    this.workspaceRoot = workspaceRoot;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(context: vscode.ExtensionContext, workspaceRoot: string): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (MatrixDashboardPanel.currentPanel) {
      MatrixDashboardPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      MatrixDashboardPanel.viewType,
      'Matrix Dashboard',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    MatrixDashboardPanel.currentPanel = new MatrixDashboardPanel(panel, context, workspaceRoot);
  }

  private getPresets(): MatrixPreset[] {
    return this.context.globalState.get<MatrixPreset[]>(PRESETS_KEY, []);
  }

  private async setPresets(presets: MatrixPreset[]): Promise<void> {
    await this.context.globalState.update(PRESETS_KEY, presets);
  }
  private getHistory(): MatrixRunHistoryRow[] {
    return this.context.globalState.get<MatrixRunHistoryRow[]>(HISTORY_KEY, []);
  }

  private async pushHistory(entries: MatrixRunHistoryRow[]): Promise<void> {
    const next = [...entries, ...this.getHistory()].slice(0, 1200);
    await this.context.globalState.update(HISTORY_KEY, next);
  }

  private buildFlakySummary(): Array<{ deviceId: string; target: string; passes: number; fails: number; flaky: boolean }> {
    const recent = this.getHistory().slice(0, 600);
    const grouped = new Map<string, { deviceId: string; target: string; passes: number; fails: number }>();
    for (const item of recent) {
      if (item.mode !== 'tests') {
        continue;
      }
      const key = `${item.deviceId}::${item.target}`;
      const prev = grouped.get(key) || { deviceId: item.deviceId, target: item.target, passes: 0, fails: 0 };
      if (item.ok) {
        prev.passes += 1;
      } else {
        prev.fails += 1;
      }
      grouped.set(key, prev);
    }
    return Array.from(grouped.values())
      .map(x => ({ ...x, flaky: x.passes > 0 && x.fails > 0 }))
      .sort((a, b) => {
        const aScore = (a.flaky ? 1 : 0) * 1000 + a.fails;
        const bScore = (b.flaky ? 1 : 0) * 1000 + b.fails;
        return bScore - aScore;
      })
      .slice(0, 25);
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'loadData': {
        const devices = await listDevicesDetailed();
        const modules = findApplicationModules(this.workspaceRoot);
        this.postMessage({
          type: 'data',
          devices: devices.filter(d => d.status === 'online'),
          modules,
          presets: this.getPresets(),
          history: this.buildFlakySummary(),
        });
        return;
      }
      case 'savePreset': {
        const name = String(message.name || '').trim();
        const deviceIds = Array.isArray(message.deviceIds) ? message.deviceIds.map(String) : [];
        if (!name || deviceIds.length === 0) {
          return;
        }
        const presets = this.getPresets().filter(p => p.name !== name);
        presets.push({ name, deviceIds });
        await this.setPresets(presets);
        this.postMessage({ type: 'presets', presets });
        return;
      }
      case 'deletePreset': {
        const name = String(message.name || '').trim();
        const presets = this.getPresets().filter(p => p.name !== name);
        await this.setPresets(presets);
        this.postMessage({ type: 'presets', presets });
        return;
      }
      case 'run': {
        await this.runMatrix(message);
        return;
      }
      case 'refreshHistory': {
        this.postMessage({ type: 'history', rows: this.buildFlakySummary() });
        return;
      }
    }
  }

  private async runMatrix(message: { [key: string]: unknown }): Promise<void> {
    const mode = String(message.mode || 'install');
    const moduleName = String(message.moduleName || 'app');
    const variant = String(message.variant || 'Debug');
    const packageNameInput = String(message.packageName || '').trim();
    const runner = String(message.runner || '').trim();
    const deviceIds = Array.isArray(message.deviceIds) ? message.deviceIds.map(String) : [];
    if (deviceIds.length === 0) {
      this.postMessage({ type: 'status', text: 'Select at least one device.' });
      return;
    }
    if (mode === 'tests' && !runner) {
      this.postMessage({ type: 'status', text: 'Runner is required for tests.' });
      return;
    }
    if (mode === 'smoke' && !packageNameInput) {
      this.postMessage({ type: 'status', text: 'Package name is required for smoke run.' });
      return;
    }
    let apkPath = '';
    if (mode === 'install' || mode === 'run' || mode === 'smoke') {
      const task = `:${moduleName}:assemble${variant}`;
      const build = await runGradleTaskWithResult(this.workspaceRoot, task);
      showGradleOutput(task, build, this.workspaceRoot);
      if (build.exitCode !== 0) {
        this.postMessage({ type: 'status', text: 'Build failed. See Gradle output.' });
        return;
      }
      const found = findLatestApk(this.workspaceRoot, moduleName, variant);
      if (!found) {
        this.postMessage({ type: 'status', text: 'APK not found after build.' });
        return;
      }
      apkPath = found;
    }
    const packageName = packageNameInput || findApplicationId(this.workspaceRoot, moduleName) || '';
    const rows = await Promise.all(deviceIds.map(async deviceId => {
      if (mode === 'install') {
        const install = await AdbService.installApk(deviceId, apkPath);
        return { deviceId, ok: install.success, message: install.message };
      }
      if (mode === 'run') {
        const install = await AdbService.installApk(deviceId, apkPath);
        if (!install.success) {
          return { deviceId, ok: false, message: install.message };
        }
        if (!packageName) {
          return { deviceId, ok: true, message: 'Installed (package name missing for launch)' };
        }
        const start = await AdbService.startApp(deviceId, packageName);
        return { deviceId, ok: start.success, message: start.message };
      }
      if (mode === 'smoke') {
        const install = await AdbService.installApk(deviceId, apkPath);
        if (!install.success) {
          return { deviceId, ok: false, message: install.message };
        }
        const start = await AdbService.startApp(deviceId, packageNameInput);
        if (!start.success) {
          return { deviceId, ok: false, message: start.message };
        }
        const stop = await AdbService.forceStopApp(deviceId, packageNameInput);
        return { deviceId, ok: stop.success, message: stop.success ? 'Smoke run passed (install/start/stop).' : stop.message };
      }
      const t = await AdbService.runInstrumentation(deviceId, runner);
      return {
        deviceId,
        ok: t.success,
        message: (t.data || t.message).split('\n').slice(-20).join('\n')
      };
    }));
    const now = Date.now();
    await this.pushHistory(rows.map(row => ({
      mode,
      deviceId: row.deviceId,
      target: mode === 'tests' ? runner : packageName || `${moduleName}:${variant}`,
      ok: row.ok,
      timestamp: now,
    })));
    this.postMessage({ type: 'results', rows });
    this.postMessage({ type: 'history', rows: this.buildFlakySummary() });
    const failed = rows.filter(r => !r.ok).length;
    this.postMessage({ type: 'status', text: failed === 0 ? 'Matrix completed successfully.' : `Matrix finished with ${failed} failures.` });
  }

  private postMessage(message: object): void {
    this.panel.webview.postMessage(message);
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-widget-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --muted: var(--vscode-descriptionForeground);
    }
    body { font-family: var(--vscode-font-family); background: var(--bg); color: var(--fg); padding: 12px; }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    .list { border: 1px solid var(--border); border-radius: 6px; padding: 8px; max-height: 180px; overflow: auto; margin-bottom: 10px; }
    select, input, button, textarea {
      border: 1px solid var(--border);
      background: var(--input-bg);
      color: var(--input-fg);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
    }
    select:focus-visible, input:focus-visible, button:focus-visible, textarea:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    button { cursor: pointer; }
    .muted { color: var(--muted); white-space: pre-wrap; font-size: 12px; }
    .status { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; min-height: 34px; }
    .status.info { color: var(--muted); }
    .status.success { color: #166534; border-color: #86efac; background: #dcfce744; }
    .status.error { color: #b91c1c; border-color: #fca5a5; background: #fee2e244; font-weight: 600; }
    .hint { font-size: 12px; color: var(--muted); margin: 6px 0 10px; }
  </style>
</head>
<body>
  <div class="row">
    <select id="mode">
      <option value="install">Install</option>
      <option value="run">Run</option>
      <option value="smoke">Smoke</option>
      <option value="tests">Tests</option>
    </select>
    <select id="module"></select>
    <input id="variant" value="Debug" placeholder="Variant" />
  </div>
  <div class="row">
    <input id="packageName" placeholder="Package name for run (optional)" style="flex:1;" />
    <input id="runner" placeholder="Instrumentation runner for tests" style="flex:1;" />
  </div>
  <div class="list" id="devices"></div>
  <div class="hint">Tip: save a preset, then run matrix in one click. Use Ctrl/Cmd+Enter to start.</div>
  <div class="row">
    <input id="presetName" placeholder="Preset name" />
    <button id="savePreset">Save Preset</button>
    <select id="presetSelect"></select>
    <button id="loadPreset">Load</button>
    <button id="deletePreset">Delete</button>
  </div>
  <div class="row">
    <button id="runBtn">Run Matrix</button>
    <button id="refreshHistoryBtn">Refresh Flaky History</button>
  </div>
  <div class="list" id="results"></div>
  <div class="list" id="history"></div>
  <div class="status info" id="status" role="status" aria-live="polite">Ready. Select devices and mode, then press Run Matrix.</div>
  <script>
    const vscode = acquireVsCodeApi();
    const devicesEl = document.getElementById('devices');
    const moduleEl = document.getElementById('module');
    const presetSelect = document.getElementById('presetSelect');
    const results = document.getElementById('results');
    const history = document.getElementById('history');
    const status = document.getElementById('status');
    const persisted = vscode.getState ? (vscode.getState() || {}) : {};
    function setStatus(text, kind = 'info') {
      status.textContent = text || '';
      status.className = 'status ' + kind;
    }
    function persistState() {
      if (!vscode.setState) return;
      vscode.setState({
        mode: document.getElementById('mode').value,
        moduleName: document.getElementById('module').value,
        variant: document.getElementById('variant').value,
        packageName: document.getElementById('packageName').value,
        runner: document.getElementById('runner').value,
        presetName: document.getElementById('presetName').value,
        selectedPreset: presetSelect.value,
      });
    }
    let presets = [];

    function selectedDeviceIds() {
      return Array.from(document.querySelectorAll('input[name="dev"]:checked')).map(i => i.value);
    }
    function renderDevices(devices) {
      devicesEl.innerHTML = '';
      devices.forEach(d => {
        const wrap = document.createElement('label');
        wrap.style.display = 'block';
        const i = document.createElement('input');
        i.type = 'checkbox';
        i.name = 'dev';
        i.value = d.id;
        wrap.appendChild(i);
        wrap.append(' ' + d.id + ' (' + d.type + ')');
        devicesEl.appendChild(wrap);
      });
    }
    function renderPresets() {
      presetSelect.innerHTML = '';
      presets.forEach(p => {
        const o = document.createElement('option');
        o.value = p.name;
        o.textContent = p.name + ' [' + p.deviceIds.length + ']';
        presetSelect.appendChild(o);
      });
    }
    document.getElementById('savePreset').addEventListener('click', () => {
      const name = document.getElementById('presetName').value.trim();
      const deviceIds = selectedDeviceIds();
      vscode.postMessage({ type: 'savePreset', name, deviceIds });
      persistState();
    });
    document.getElementById('loadPreset').addEventListener('click', () => {
      const p = presets.find(x => x.name === presetSelect.value);
      if (!p) return;
      const set = new Set(p.deviceIds);
      document.querySelectorAll('input[name="dev"]').forEach(i => {
        i.checked = set.has(i.value);
      });
      persistState();
    });
    document.getElementById('deletePreset').addEventListener('click', () => {
      const name = presetSelect.value;
      vscode.postMessage({ type: 'deletePreset', name });
      persistState();
    });
    document.getElementById('runBtn').addEventListener('click', () => {
      vscode.postMessage({
        type: 'run',
        mode: document.getElementById('mode').value,
        moduleName: document.getElementById('module').value,
        variant: document.getElementById('variant').value.trim() || 'Debug',
        packageName: document.getElementById('packageName').value.trim(),
        runner: document.getElementById('runner').value.trim(),
        deviceIds: selectedDeviceIds(),
      });
      setStatus('Running matrix...', 'info');
      results.textContent = '';
      persistState();
    });
    document.getElementById('refreshHistoryBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'refreshHistory' });
      persistState();
    });
    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'data') {
        renderDevices(msg.devices || []);
        moduleEl.innerHTML = '';
        (msg.modules || []).forEach(m => {
          const o = document.createElement('option');
          o.value = m;
          o.textContent = m;
          moduleEl.appendChild(o);
        });
        presets = msg.presets || [];
        renderPresets();
        if (persisted.mode) document.getElementById('mode').value = persisted.mode;
        if (persisted.moduleName) document.getElementById('module').value = persisted.moduleName;
        if (persisted.variant) document.getElementById('variant').value = persisted.variant;
        if (persisted.packageName) document.getElementById('packageName').value = persisted.packageName;
        if (persisted.runner) document.getElementById('runner').value = persisted.runner;
        if (persisted.presetName) document.getElementById('presetName').value = persisted.presetName;
        if (persisted.selectedPreset) presetSelect.value = persisted.selectedPreset;
        const rows = msg.history || [];
        history.textContent = rows.length === 0
          ? 'No flaky history yet.'
          : rows.map(r => (r.flaky ? '[FLAKY] ' : '[STABLE] ') + r.deviceId + ' - ' + r.target + ' (pass: ' + r.passes + ', fail: ' + r.fails + ')').join('\\n');
      }
      if (msg.type === 'presets') {
        presets = msg.presets || [];
        renderPresets();
      }
      if (msg.type === 'results') {
        const rows = msg.rows || [];
        results.textContent = rows.map(r => (r.ok ? '[OK] ' : '[FAIL] ') + r.deviceId + ' - ' + r.message).join('\\n');
      }
      if (msg.type === 'status') {
        const text = msg.text || '';
        if (/failed|failure|error|required/i.test(text)) {
          setStatus(text, 'error');
        } else if (/completed successfully|completed|finished with 0/i.test(text)) {
          setStatus(text, 'success');
        } else {
          setStatus(text, 'info');
        }
      }
      if (msg.type === 'history') {
        const rows = msg.rows || [];
        history.textContent = rows.length === 0
          ? 'No flaky history yet.'
          : rows.map(r => (r.flaky ? '[FLAKY] ' : '[STABLE] ') + r.deviceId + ' - ' + r.target + ' (pass: ' + r.passes + ', fail: ' + r.fails + ')').join('\\n');
      }
    });
    document.getElementById('mode').addEventListener('change', persistState);
    document.getElementById('module').addEventListener('change', persistState);
    document.getElementById('variant').addEventListener('input', persistState);
    document.getElementById('packageName').addEventListener('input', persistState);
    document.getElementById('runner').addEventListener('input', persistState);
    document.getElementById('presetName').addEventListener('input', persistState);
    presetSelect.addEventListener('change', persistState);
    devicesEl.textContent = 'Loading devices...';
    results.textContent = 'Results will appear here...';
    history.textContent = 'Loading flaky history...';
    window.addEventListener('keydown', (e) => {
      const isRun = (e.metaKey || e.ctrlKey) && e.key === 'Enter';
      if (!isRun) {
        return;
      }
      e.preventDefault();
      document.getElementById('runBtn').click();
    });
    setInterval(persistState, 2500);
    vscode.postMessage({ type: 'loadData' });
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    MatrixDashboardPanel.currentPanel = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
