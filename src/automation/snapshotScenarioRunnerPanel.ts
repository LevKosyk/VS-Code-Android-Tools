import * as vscode from 'vscode';
import { listDevicesDetailed } from '../devices/deviceManager';
import { listSnapshots, loadSnapshot } from '../emulatorControl/emulatorCommands';
import { findApplicationId, findApplicationModules, findLatestApk } from '../core/androidProject';
import { runGradleTaskWithResult } from '../gradle/gradleService';
import { showGradleOutput } from '../gradle/gradleOutput';
import { AdbService } from '../services/adbService';
import { getWebviewThemeStyle } from '../ui/webviewTheme';

interface SnapshotScenario {
  id: string;
  name: string;
  deviceId: string;
  snapshotName: string;
  moduleName: string;
  variant: string;
  packageName?: string;
}

interface ScenarioStage {
  name: string;
  ok: boolean;
  durationMs: number;
  message: string;
}

type PanelMessage =
  | { type: 'load' }
  | { type: 'setDevice'; deviceId?: string }
  | { type: 'refreshSnapshots' }
  | {
      type: 'runNow';
      deviceId?: string;
      snapshotName?: string;
      moduleName?: string;
      variant?: string;
      packageName?: string;
    }
  | {
      type: 'saveScenario';
      name?: string;
      deviceId?: string;
      snapshotName?: string;
      moduleName?: string;
      variant?: string;
      packageName?: string;
    }
  | { type: 'runScenario'; id?: string }
  | { type: 'deleteScenario'; id?: string };

const SCENARIO_KEY = 'snapshotScenarioRunner.scenarios';

export class SnapshotScenarioRunnerPanel {
  public static currentPanel: SnapshotScenarioRunnerPanel | undefined;
  private static readonly viewType = 'androidSnapshotScenarioRunner';
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly workspaceRoot: string;
  private readonly disposables: vscode.Disposable[] = [];
  private selectedDeviceId = '';

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, workspaceRoot: string) {
    this.panel = panel;
    this.context = context;
    this.workspaceRoot = workspaceRoot;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage((message: PanelMessage) => {
      void this.handleMessage(message);
    }, null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(context: vscode.ExtensionContext, workspaceRoot: string): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (SnapshotScenarioRunnerPanel.currentPanel) {
      SnapshotScenarioRunnerPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      SnapshotScenarioRunnerPanel.viewType,
      'Snapshot Scenario Runner',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    SnapshotScenarioRunnerPanel.currentPanel = new SnapshotScenarioRunnerPanel(panel, context, workspaceRoot);
  }

  private getScenarios(): SnapshotScenario[] {
    return this.context.globalState.get<SnapshotScenario[]>(SCENARIO_KEY, []);
  }

  private async setScenarios(items: SnapshotScenario[]): Promise<void> {
    await this.context.globalState.update(SCENARIO_KEY, items.slice(0, 60));
  }

  private async pushState(): Promise<void> {
    const devices = (await listDevicesDetailed()).filter(d => d.status === 'online' && d.type === 'emulator');
    if (!this.selectedDeviceId && devices.length > 0) {
      this.selectedDeviceId = devices[0].id;
    }
    const snapshots = this.selectedDeviceId ? await listSnapshots(this.selectedDeviceId) : [];
    const modules = findApplicationModules(this.workspaceRoot);
    this.postMessage({
      type: 'state',
      devices: devices.map(d => ({ id: d.id, label: `${d.id} (${d.type})` })),
      selectedDeviceId: this.selectedDeviceId,
      snapshots,
      modules,
      scenarios: this.getScenarios(),
    });
  }

  private async buildRunReport(title: string, stages: ScenarioStage[]): Promise<void> {
    const lines: string[] = [];
    lines.push(`# ${title}`);
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    for (const stage of stages) {
      lines.push(`- ${stage.ok ? '[OK]' : '[FAIL]'} ${stage.name} (${stage.durationMs} ms): ${stage.message}`);
    }
    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content: lines.join('\n'),
    });
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  private async runScenario(payload: {
    deviceId: string;
    snapshotName: string;
    moduleName: string;
    variant: string;
    packageName?: string;
  }): Promise<void> {
    const stages: ScenarioStage[] = [];
    const stage = async (name: string, fn: () => Promise<{ ok: boolean; message: string }>): Promise<boolean> => {
      const started = Date.now();
      try {
        const result = await fn();
        stages.push({
          name,
          ok: result.ok,
          durationMs: Date.now() - started,
          message: result.message,
        });
        return result.ok;
      } catch (error) {
        stages.push({
          name,
          ok: false,
          durationMs: Date.now() - started,
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    };

    const packageName = (payload.packageName || '').trim() || findApplicationId(this.workspaceRoot, payload.moduleName) || '';

    const okLoad = await stage('Restore snapshot', async () => {
      const result = await loadSnapshot(payload.deviceId, payload.snapshotName);
      return { ok: result.success, message: result.message };
    });
    if (!okLoad) {
      this.postMessage({ type: 'status', level: 'error', text: 'Scenario stopped at snapshot restore.' });
      await this.buildRunReport('Snapshot Scenario Report', stages);
      return;
    }

    const okBuild = await stage('Build APK', async () => {
      const task = `:${payload.moduleName}:assemble${payload.variant}`;
      const result = await runGradleTaskWithResult(this.workspaceRoot, task);
      showGradleOutput(task, result, this.workspaceRoot);
      if (result.exitCode !== 0) {
        return { ok: false, message: result.stderr || result.stdout || 'Build failed' };
      }
      return { ok: true, message: 'Build finished' };
    });
    if (!okBuild) {
      this.postMessage({ type: 'status', level: 'error', text: 'Scenario stopped at build stage.' });
      await this.buildRunReport('Snapshot Scenario Report', stages);
      return;
    }

    let apkPath = '';
    const okApk = await stage('Resolve APK', async () => {
      const found = findLatestApk(this.workspaceRoot, payload.moduleName, payload.variant);
      if (!found) {
        return { ok: false, message: 'APK not found' };
      }
      apkPath = found;
      return { ok: true, message: found };
    });
    if (!okApk) {
      this.postMessage({ type: 'status', level: 'error', text: 'Scenario stopped: APK not found.' });
      await this.buildRunReport('Snapshot Scenario Report', stages);
      return;
    }

    const okInstall = await stage('Install APK', async () => {
      const result = await AdbService.installApk(payload.deviceId, apkPath);
      return { ok: result.success, message: result.message };
    });
    if (!okInstall) {
      this.postMessage({ type: 'status', level: 'error', text: 'Scenario stopped at install stage.' });
      await this.buildRunReport('Snapshot Scenario Report', stages);
      return;
    }

    const okRun = await stage('Start app', async () => {
      if (!packageName) {
        return { ok: false, message: 'Package name is missing.' };
      }
      const result = await AdbService.startApp(payload.deviceId, packageName);
      return { ok: result.success, message: result.message };
    });
    if (!okRun) {
      this.postMessage({ type: 'status', level: 'error', text: 'Scenario stopped at start stage.' });
      await this.buildRunReport('Snapshot Scenario Report', stages);
      return;
    }

    await stage('Smoke checks', async () => {
      if (!packageName) {
        return { ok: false, message: 'Package name is missing.' };
      }
      await new Promise(resolve => setTimeout(resolve, 900));
      const processes = await AdbService.listProcesses(payload.deviceId);
      const running = processes.some(p => p.name === packageName || p.name.endsWith(`:${packageName}`) || p.name.includes(packageName));
      const stop = await AdbService.forceStopApp(payload.deviceId, packageName);
      if (!running) {
        return { ok: false, message: `App process not detected. ${stop.message}` };
      }
      return { ok: stop.success, message: stop.success ? 'App started and stop check passed.' : stop.message };
    });

    await this.buildRunReport('Snapshot Scenario Report', stages);
    const failed = stages.filter(s => !s.ok).length;
    this.postMessage({
      type: 'status',
      level: failed === 0 ? 'ok' : 'error',
      text: failed === 0
        ? `Scenario completed successfully (${stages.length} stages).`
        : `Scenario completed with ${failed} failed stage(s).`,
    });
    this.postMessage({ type: 'reportRows', rows: stages });
  }

  private async handleMessage(message: PanelMessage): Promise<void> {
    switch (message.type) {
      case 'load':
        await this.pushState();
        return;
      case 'setDevice':
        this.selectedDeviceId = (message.deviceId || '').trim();
        await this.pushState();
        return;
      case 'refreshSnapshots':
        await this.pushState();
        return;
      case 'runNow': {
        const deviceId = (message.deviceId || '').trim();
        const snapshotName = (message.snapshotName || '').trim();
        const moduleName = (message.moduleName || '').trim() || 'app';
        const variant = (message.variant || '').trim() || 'Debug';
        const packageName = (message.packageName || '').trim();
        if (!deviceId || !snapshotName) {
          this.postMessage({ type: 'status', level: 'error', text: 'Device and snapshot are required.' });
          return;
        }
        await this.runScenario({ deviceId, snapshotName, moduleName, variant, packageName });
        return;
      }
      case 'saveScenario': {
        const name = (message.name || '').trim();
        const deviceId = (message.deviceId || '').trim();
        const snapshotName = (message.snapshotName || '').trim();
        const moduleName = (message.moduleName || '').trim() || 'app';
        const variant = (message.variant || '').trim() || 'Debug';
        const packageName = (message.packageName || '').trim() || undefined;
        if (!name || !deviceId || !snapshotName) {
          this.postMessage({ type: 'status', level: 'error', text: 'Name/device/snapshot are required.' });
          return;
        }
        const item: SnapshotScenario = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          deviceId,
          snapshotName,
          moduleName,
          variant,
          packageName,
        };
        const scenarios = this.getScenarios().filter(x => x.name !== name);
        scenarios.unshift(item);
        await this.setScenarios(scenarios);
        await this.pushState();
        this.postMessage({ type: 'status', level: 'ok', text: `Saved scenario: ${name}` });
        return;
      }
      case 'runScenario': {
        const id = message.id || '';
        const item = this.getScenarios().find(x => x.id === id);
        if (!item) {
          this.postMessage({ type: 'status', level: 'error', text: 'Scenario not found.' });
          return;
        }
        await this.runScenario(item);
        return;
      }
      case 'deleteScenario': {
        const id = message.id || '';
        const scenarios = this.getScenarios().filter(x => x.id !== id);
        await this.setScenarios(scenarios);
        await this.pushState();
        return;
      }
      default:
        return;
    }
  }

  private postMessage(message: unknown): void {
    this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    SnapshotScenarioRunnerPanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private getHtml(): string {
    const themeVars = getWebviewThemeStyle();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    ${themeVars}
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: var(--at-space-3); }
    .row { display: grid; grid-template-columns: 220px 1fr; gap: var(--at-space-2); margin-bottom: var(--at-space-2); align-items: center; }
    input, select, button {
      border: 1px solid var(--vscode-widget-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: var(--at-radius-sm);
      padding: 6px 8px;
      min-height: 32px;
    }
    .actions { display:flex; gap: var(--at-space-2); margin-top: var(--at-space-2); }
    .btn-primary { background: var(--at-info); color: var(--at-info-contrast); border-color: transparent; font-weight: 600; }
    .card { border:1px solid var(--vscode-widget-border); border-radius: var(--at-radius-md); padding: var(--at-space-2); margin-top: var(--at-space-2); }
    .scenario, .report { display:flex; justify-content: space-between; align-items: center; gap: 8px; padding:6px 0; border-bottom:1px solid var(--vscode-widget-border); }
    .scenario:last-child, .report:last-child { border-bottom: none; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .status { margin-top: var(--at-space-2); font-size: 12px; color: var(--vscode-descriptionForeground); white-space: pre-wrap; }
    .status.error { color: var(--at-error); }
  </style>
</head>
<body>
  <h2>Snapshot Scenario Runner</h2>
  <div class="row"><label>Device (emulator)</label><select id="device"></select></div>
  <div class="row"><label>Snapshot</label><select id="snapshot"></select></div>
  <div class="row"><label>Module</label><select id="module"></select></div>
  <div class="row"><label>Variant</label><input id="variant" value="Debug" /></div>
  <div class="row"><label>Package (optional)</label><input id="pkg" placeholder="com.example.app" /></div>
  <div class="row"><label>Scenario name</label><input id="name" placeholder="Smoke after snapshot" /></div>
  <div class="actions">
    <button id="refreshSnaps">Refresh Snapshots</button>
    <button id="runNow" class="btn-primary">Run Scenario Now</button>
    <button id="save">Save Scenario</button>
  </div>
  <div id="status" class="status">Ready.</div>

  <div class="card">
    <h3>Saved Scenarios</h3>
    <div id="scenarios"></div>
  </div>

  <div class="card">
    <h3>Last Report (this run)</h3>
    <div id="report"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const el = id => document.getElementById(id);
    let scenarios = [];
    function payload() {
      return {
        deviceId: el('device').value,
        snapshotName: el('snapshot').value,
        moduleName: el('module').value,
        variant: el('variant').value,
        packageName: el('pkg').value
      };
    }
    function renderScenarios() {
      const root = el('scenarios');
      root.innerHTML = '';
      if (!scenarios.length) {
        root.innerHTML = '<div class="muted">No saved scenarios.</div>';
        return;
      }
      scenarios.forEach(item => {
        const row = document.createElement('div');
        row.className = 'scenario';
        const left = document.createElement('div');
        left.innerHTML = '<strong>' + item.name + '</strong><div class="muted">' + item.snapshotName + ' · ' + item.moduleName + ' · ' + item.variant + '</div>';
        const right = document.createElement('div');
        const run = document.createElement('button');
        run.textContent = 'Run';
        run.onclick = () => vscode.postMessage({ type: 'runScenario', id: item.id });
        const del = document.createElement('button');
        del.textContent = 'Delete';
        del.onclick = () => vscode.postMessage({ type: 'deleteScenario', id: item.id });
        right.appendChild(run);
        right.appendChild(del);
        row.appendChild(left);
        row.appendChild(right);
        root.appendChild(row);
      });
    }
    function renderReport(rows) {
      const root = el('report');
      root.innerHTML = '';
      if (!rows || !rows.length) {
        root.innerHTML = '<div class="muted">No report yet.</div>';
        return;
      }
      rows.forEach(r => {
        const row = document.createElement('div');
        row.className = 'report';
        row.innerHTML = '<span>' + (r.ok ? 'OK' : 'FAIL') + ' ' + r.name + '</span><span class="muted">' + r.durationMs + ' ms</span>';
        root.appendChild(row);
      });
    }
    el('device').addEventListener('change', () => vscode.postMessage({ type: 'setDevice', deviceId: el('device').value }));
    el('refreshSnaps').onclick = () => vscode.postMessage({ type: 'refreshSnapshots' });
    el('runNow').onclick = () => vscode.postMessage({ type: 'runNow', ...payload() });
    el('save').onclick = () => vscode.postMessage({ type: 'saveScenario', name: el('name').value, ...payload() });
    window.addEventListener('message', event => {
      const msg = event.data || {};
      if (msg.type === 'state') {
        const dev = el('device'); dev.innerHTML = '';
        (msg.devices || []).forEach(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = d.label; dev.appendChild(o); });
        if (msg.selectedDeviceId) dev.value = msg.selectedDeviceId;
        const snap = el('snapshot'); snap.innerHTML = '';
        (msg.snapshots || []).forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; snap.appendChild(o); });
        const mod = el('module'); mod.innerHTML = '';
        (msg.modules || []).forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; mod.appendChild(o); });
        scenarios = msg.scenarios || [];
        renderScenarios();
      }
      if (msg.type === 'reportRows') {
        renderReport(msg.rows || []);
      }
      if (msg.type === 'status') {
        const status = el('status');
        status.textContent = msg.text || '';
        status.className = 'status ' + (msg.level === 'error' ? 'error' : '');
      }
    });
    vscode.postMessage({ type: 'load' });
  </script>
</body>
</html>`;
  }
}
