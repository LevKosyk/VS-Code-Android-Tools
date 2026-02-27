import * as vscode from 'vscode';
import { listDevicesDetailed } from '../devices/deviceManager';
import { AdbService } from '../services/adbService';
import { getWebviewThemeStyle } from '../ui/webviewTheme';

interface DeepLinkScenario {
  id: string;
  name: string;
  deviceId?: string;
  packageName?: string;
  dataUri: string;
  action?: string;
  category?: string;
  flags?: string;
  extras?: string;
}

type PanelMessage =
  | { type: 'load' }
  | {
      type: 'run';
      deviceId?: string;
      packageName?: string;
      dataUri?: string;
      action?: string;
      category?: string;
      flags?: string;
      extras?: string;
    }
  | {
      type: 'saveScenario';
      name?: string;
      deviceId?: string;
      packageName?: string;
      dataUri?: string;
      action?: string;
      category?: string;
      flags?: string;
      extras?: string;
    }
  | { type: 'runScenario'; id?: string }
  | { type: 'deleteScenario'; id?: string };

const SCENARIOS_KEY = 'deepLinkStudio.scenarios';

export class DeepLinkStudioPanel {
  public static currentPanel: DeepLinkStudioPanel | undefined;
  private static readonly viewType = 'androidDeepLinkStudio';
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.context = context;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage((message: PanelMessage) => {
      void this.handleMessage(message);
    }, null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (DeepLinkStudioPanel.currentPanel) {
      DeepLinkStudioPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      DeepLinkStudioPanel.viewType,
      'Deep Link Studio',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    DeepLinkStudioPanel.currentPanel = new DeepLinkStudioPanel(panel, context);
  }

  private getScenarios(): DeepLinkScenario[] {
    return this.context.globalState.get<DeepLinkScenario[]>(SCENARIOS_KEY, []);
  }

  private async setScenarios(items: DeepLinkScenario[]): Promise<void> {
    await this.context.globalState.update(SCENARIOS_KEY, items.slice(0, 60));
  }

  private async pushInitialState(): Promise<void> {
    const devices = await listDevicesDetailed();
    const online = devices.filter(d => d.status === 'online');
    this.postMessage({
      type: 'state',
      devices: online.map(d => ({ id: d.id, label: `${d.id} (${d.type})` })),
      scenarios: this.getScenarios(),
    });
  }

  private parseExtras(raw: string | undefined): Array<{ key: string; value: string }> {
    if (!raw || !raw.trim()) {
      return [];
    }
    const lines = raw.split('\n').map(x => x.trim()).filter(Boolean);
    const out: Array<{ key: string; value: string }> = [];
    for (const line of lines) {
      const eq = line.indexOf('=');
      if (eq === -1) {
        continue;
      }
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!key) {
        continue;
      }
      out.push({ key, value });
    }
    return out;
  }

  private parseFlags(raw: string | undefined): string[] {
    if (!raw || !raw.trim()) {
      return [];
    }
    return raw
      .split(/[\s,]+/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  private async runIntent(payload: {
    deviceId?: string;
    packageName?: string;
    dataUri?: string;
    action?: string;
    category?: string;
    flags?: string;
    extras?: string;
  }): Promise<void> {
    const deviceId = (payload.deviceId || '').trim();
    const dataUri = (payload.dataUri || '').trim();
    if (!deviceId) {
      this.postMessage({ type: 'status', level: 'error', text: 'Select device.' });
      return;
    }
    if (!dataUri) {
      this.postMessage({ type: 'status', level: 'error', text: 'Deep link URI is required.' });
      return;
    }
    const result = await AdbService.launchIntent(deviceId, {
      action: (payload.action || '').trim() || 'android.intent.action.VIEW',
      category: (payload.category || '').trim() || 'android.intent.category.BROWSABLE',
      dataUri,
      packageName: (payload.packageName || '').trim() || undefined,
      flags: this.parseFlags(payload.flags),
      extras: this.parseExtras(payload.extras),
    });
    this.postMessage({
      type: 'status',
      level: result.success ? 'ok' : 'error',
      text: result.message,
    });
  }

  private async handleMessage(message: PanelMessage): Promise<void> {
    switch (message.type) {
      case 'load':
        await this.pushInitialState();
        return;
      case 'run':
        await this.runIntent(message);
        return;
      case 'saveScenario': {
        const name = (message.name || '').trim();
        const dataUri = (message.dataUri || '').trim();
        if (!name || !dataUri) {
          this.postMessage({ type: 'status', level: 'error', text: 'Scenario name and URI are required.' });
          return;
        }
        const next: DeepLinkScenario = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          deviceId: (message.deviceId || '').trim() || undefined,
          packageName: (message.packageName || '').trim() || undefined,
          dataUri,
          action: (message.action || '').trim() || undefined,
          category: (message.category || '').trim() || undefined,
          flags: (message.flags || '').trim() || undefined,
          extras: (message.extras || '').trim() || undefined,
        };
        const scenarios = this.getScenarios().filter(item => item.name !== name);
        scenarios.unshift(next);
        await this.setScenarios(scenarios);
        this.postMessage({ type: 'scenarios', scenarios: this.getScenarios() });
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
        await this.runIntent(item);
        return;
      }
      case 'deleteScenario': {
        const id = message.id || '';
        const scenarios = this.getScenarios().filter(x => x.id !== id);
        await this.setScenarios(scenarios);
        this.postMessage({ type: 'scenarios', scenarios });
        this.postMessage({ type: 'status', level: 'ok', text: 'Scenario deleted.' });
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
    DeepLinkStudioPanel.currentPanel = undefined;
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
    .row { display: grid; grid-template-columns: 200px 1fr; gap: var(--at-space-2); margin-bottom: var(--at-space-2); align-items: center; }
    input, select, textarea, button {
      border: 1px solid var(--vscode-widget-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: var(--at-radius-sm);
      padding: 6px 8px;
      min-height: 32px;
    }
    textarea { min-height: 80px; }
    .actions { display:flex; gap: var(--at-space-2); margin: var(--at-space-2) 0 var(--at-space-3) 0; }
    .btn-primary { background: var(--at-info); color: var(--at-info-contrast); border-color: transparent; font-weight: 600; }
    .card { border: 1px solid var(--vscode-widget-border); border-radius: var(--at-radius-md); padding: var(--at-space-2); margin-top: var(--at-space-2); }
    .scenario { display:flex; justify-content: space-between; gap: var(--at-space-2); align-items: center; padding: 6px 0; border-bottom: 1px solid var(--vscode-widget-border); }
    .scenario:last-child { border-bottom: none; }
    .status { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: var(--at-space-2); white-space: pre-wrap; }
    .status.ok { color: var(--at-success); }
    .status.error { color: var(--at-error); }
  </style>
</head>
<body>
  <h2>Deep Link Studio</h2>
  <div class="row"><label>Device</label><select id="device"></select></div>
  <div class="row"><label>Package (optional)</label><input id="pkg" placeholder="com.example.app" /></div>
  <div class="row"><label>Deep Link URI</label><input id="uri" placeholder="myapp://product/42" /></div>
  <div class="row"><label>Action</label><input id="action" value="android.intent.action.VIEW" /></div>
  <div class="row"><label>Category</label><input id="category" value="android.intent.category.BROWSABLE" /></div>
  <div class="row"><label>Flags</label><input id="flags" placeholder="--activity-clear-top --activity-single-top" /></div>
  <div class="row"><label>Extras (key=value)</label><textarea id="extras" placeholder="source=push\\ncampaign=spring"></textarea></div>
  <div class="row"><label>Scenario name</label><input id="scenarioName" placeholder="Open Product 42" /></div>
  <div class="actions">
    <button id="run" class="btn-primary">Run Deep Link</button>
    <button id="save">Save Scenario</button>
  </div>
  <div id="status" class="status">Ready.</div>

  <div class="card">
    <h3>Saved Scenarios</h3>
    <div id="scenarios"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const el = id => document.getElementById(id);
    const status = el('status');
    let scenarios = [];
    function payload() {
      return {
        deviceId: el('device').value,
        packageName: el('pkg').value,
        dataUri: el('uri').value,
        action: el('action').value,
        category: el('category').value,
        flags: el('flags').value,
        extras: el('extras').value
      };
    }
    function renderScenarios() {
      const root = el('scenarios');
      root.innerHTML = '';
      if (!scenarios.length) {
        root.innerHTML = '<div class="status">No scenarios yet.</div>';
        return;
      }
      scenarios.forEach(item => {
        const row = document.createElement('div');
        row.className = 'scenario';
        const left = document.createElement('div');
        left.innerHTML = '<strong>' + item.name + '</strong><div style="font-size:12px;color:var(--vscode-descriptionForeground)">' + item.dataUri + '</div>';
        const right = document.createElement('div');
        const runBtn = document.createElement('button');
        runBtn.textContent = 'Run';
        runBtn.onclick = () => vscode.postMessage({ type: 'runScenario', id: item.id });
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.onclick = () => vscode.postMessage({ type: 'deleteScenario', id: item.id });
        right.appendChild(runBtn);
        right.appendChild(delBtn);
        row.appendChild(left);
        row.appendChild(right);
        root.appendChild(row);
      });
    }
    el('run').onclick = () => vscode.postMessage({ type: 'run', ...payload() });
    el('save').onclick = () => vscode.postMessage({ type: 'saveScenario', name: el('scenarioName').value, ...payload() });
    window.addEventListener('message', event => {
      const msg = event.data || {};
      if (msg.type === 'state') {
        const device = el('device');
        device.innerHTML = '';
        (msg.devices || []).forEach(d => {
          const o = document.createElement('option');
          o.value = d.id; o.textContent = d.label;
          device.appendChild(o);
        });
        scenarios = msg.scenarios || [];
        renderScenarios();
      }
      if (msg.type === 'scenarios') {
        scenarios = msg.scenarios || [];
        renderScenarios();
      }
      if (msg.type === 'status') {
        status.textContent = msg.text || '';
        status.className = 'status ' + (msg.level || '');
      }
    });
    vscode.postMessage({ type: 'load' });
  </script>
</body>
</html>`;
  }
}
