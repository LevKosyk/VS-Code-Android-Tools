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

const PRESETS_KEY = 'matrixDashboard.presets';

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
    let apkPath = '';
    if (mode === 'install' || mode === 'run') {
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
      const t = await AdbService.runInstrumentation(deviceId, runner);
      return {
        deviceId,
        ok: t.success,
        message: (t.data || t.message).split('\n').slice(-20).join('\n')
      };
    }));
    this.postMessage({ type: 'results', rows });
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
    button { cursor: pointer; }
    .muted { color: var(--muted); white-space: pre-wrap; font-size: 12px; }
  </style>
</head>
<body>
  <div class="row">
    <select id="mode">
      <option value="install">Install</option>
      <option value="run">Run</option>
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
  <div class="row">
    <input id="presetName" placeholder="Preset name" />
    <button id="savePreset">Save Preset</button>
    <select id="presetSelect"></select>
    <button id="loadPreset">Load</button>
    <button id="deletePreset">Delete</button>
  </div>
  <div class="row">
    <button id="runBtn">Run Matrix</button>
  </div>
  <div class="list" id="results"></div>
  <div class="muted" id="status">Ready</div>
  <script>
    const vscode = acquireVsCodeApi();
    const devicesEl = document.getElementById('devices');
    const moduleEl = document.getElementById('module');
    const presetSelect = document.getElementById('presetSelect');
    const results = document.getElementById('results');
    const status = document.getElementById('status');
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
    });
    document.getElementById('loadPreset').addEventListener('click', () => {
      const p = presets.find(x => x.name === presetSelect.value);
      if (!p) return;
      const set = new Set(p.deviceIds);
      document.querySelectorAll('input[name="dev"]').forEach(i => {
        i.checked = set.has(i.value);
      });
    });
    document.getElementById('deletePreset').addEventListener('click', () => {
      const name = presetSelect.value;
      vscode.postMessage({ type: 'deletePreset', name });
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
      status.textContent = 'Running matrix...';
      results.textContent = '';
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
        status.textContent = msg.text || '';
      }
    });
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
