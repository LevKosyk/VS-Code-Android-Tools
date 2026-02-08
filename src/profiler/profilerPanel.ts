import * as vscode from 'vscode';
import { ProfilerService } from './profilerService';
import { AdbService } from '../services/adbService';
import { listRunningEmulators } from '../devices/deviceManager';
export class ProfilerPanel {
  public static currentPanel: ProfilerPanel | undefined;
  private static readonly viewType = 'profilerPanel';
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private selectedDeviceId: string | undefined;
  private selectedPackage: string | undefined;
  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.webview.html = this.getHtmlContent();
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.refreshDevices();
  }
  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (ProfilerPanel.currentPanel) {
      ProfilerPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      ProfilerPanel.viewType,
      'Android Profiler',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );
    ProfilerPanel.currentPanel = new ProfilerPanel(panel, extensionUri);
  }
  private async refreshDevices() {
    const devices = await listRunningEmulators();
    this.postMessage({ 
      type: 'devices', 
      data: devices.map(d => ({ id: d.id, name: d.id }))  
    });
    if (devices.length > 0 && !this.selectedDeviceId) {
      this.selectedDeviceId = devices[0].id;
      this.refreshPackages();
    }
  }
  private async refreshPackages() {
    if (!this.selectedDeviceId) return;
    const packages = await AdbService.listPackages(this.selectedDeviceId);
    this.postMessage({ type: 'packages', data: packages });
    if (packages.length > 0 && !this.selectedPackage) {
      this.selectedPackage = packages.find(p => p.includes('example') || p.includes('app')) || packages[0];
      this.postMessage({ type: 'selectPackage', data: this.selectedPackage });
    }
  }
  private async handleMessage(message: any) {
    switch (message.type) {
      case 'refreshDevices':
        await this.refreshDevices();
        break;
      case 'selectDevice':
        this.selectedDeviceId = message.deviceId;
        await this.refreshPackages();
        break;
      case 'selectPackage':
        this.selectedPackage = message.package;
        break;
      case 'captureSnapshot':
        await this.captureAll();
        break;
      case 'measureStartup':
        await this.measureStartup();
        break;
    }
  }
  private async captureAll() {
    if (!this.selectedDeviceId || !this.selectedPackage) {
      vscode.window.showWarningMessage('Select a device and package first');
      return;
    }
    const profiler = ProfilerService.getInstance();
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Capturing snapshot...'
    }, async () => {
      const [cpu, memory, gfx] = await Promise.all([
        profiler.captureCpu(this.selectedDeviceId!, this.selectedPackage!),
        profiler.captureMemory(this.selectedDeviceId!, this.selectedPackage!),
        profiler.captureGraphics(this.selectedDeviceId!, this.selectedPackage!)
      ]);
      this.postMessage({
        type: 'snapshotData',
        data: {
          cpu: cpu.success ? cpu.data : null,
          memory: memory.success ? memory.data : null,
          graphics: gfx.success ? gfx.data : null,
          timestamp: Date.now()
        }
      });
    });
  }
  private async measureStartup() {
    if (!this.selectedDeviceId || !this.selectedPackage) return;
    const activity = await vscode.window.showInputBox({ 
      prompt: 'Main Activity Name (e.g. .MainActivity)',
      value: '.MainActivity'
    });
    if (!activity) return;
    const profiler = ProfilerService.getInstance();
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Measuring startup time...'
    }, async () => {
      const result = await profiler.measureStartup(this.selectedDeviceId!, this.selectedPackage!, activity);
      if (result.success) {
        this.postMessage({
          type: 'startupData',
          data: result.data
        });
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    });
  }
  private postMessage(message: any) {
    this.panel.webview.postMessage(message);
  }
  public dispose() {
    ProfilerPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) x.dispose();
    }
  }
  private getHtmlContent(): string {
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Android Profiler</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    .header { display: flex; gap: 10px; margin-bottom: 20px; align-items: center; }
    select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); padding: 5px; }
    .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; }
    .card { background: var(--vscode-editor-inactiveSelectionBackground); padding: 15px; border-radius: 6px; border: 1px solid var(--vscode-panel-border); }
    .card-title { font-weight: bold; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .stat-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.9em; }
    .stat-val { font-family: monospace; font-weight: bold; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; border-radius: 2px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .timestamp { font-size: 0.8em; color: var(--vscode-descriptionForeground); text-align: right; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="header">
    <select id="deviceSelect"><option>Loading devices...</option></select>
    <select id="packageSelect"><option>Loading packages...</option></select>
    <button onclick="refresh()">↻ Refresh</button>
    <button onclick="capture()">📸 Capture Snapshot</button>
    <button onclick="startup()">🚀 Measure Startup</button>
  </div>
  <div class="card-grid">
    <!-- CPU Card -->
    <div class="card">
      <div class="card-title">CPU Usage</div>
      <div id="cpuStats">No data captured</div>
    </div>
    <!-- Memory Card -->
    <div class="card">
      <div class="card-title">Memory Usage</div>
      <div id="memStats">No data captured</div>
    </div>
    <!-- Graphics Card -->
    <div class="card">
      <div class="card-title">Graphics (Jank)</div>
      <div id="gfxStats">No data captured</div>
    </div>
    <!-- Startup Card -->
    <div class="card">
      <div class="card-title">Startup Time</div>
      <div id="startupStats">No data captured</div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    // State
    const state = {
      devices: [],
      packages: [],
      cpu: null,
      mem: null
    };
    // DOM Elements
    const deviceSelect = document.getElementById('deviceSelect');
    const packageSelect = document.getElementById('packageSelect');
    // Event Listeners
    deviceSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'selectDevice', deviceId: deviceSelect.value });
    });
    packageSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'selectPackage', package: packageSelect.value });
    });
    function refresh() { vscode.postMessage({ type: 'refreshDevices' }); }
    function capture() { vscode.postMessage({ type: 'captureSnapshot' }); }
    function startup() { vscode.postMessage({ type: 'measureStartup' }); }
    // Message Handler
    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.type) {
        case 'devices':
          state.devices = msg.data;
          deviceSelect.innerHTML = state.devices.map(d => 
            '<option value="' + d.id + '">' + d.name + '</option>'
          ).join('');
          break;
        case 'packages':
          state.packages = msg.data;
          renderPackages();
          break;
        case 'selectPackage':
          packageSelect.value = msg.data;
          break;
        case 'snapshotData':
          renderSnapshot(msg.data);
          break;
        case 'startupData':
          renderStartup(msg.data);
          break;
      }
    });
    function renderPackages() {
      packageSelect.innerHTML = state.packages.map(p => 
        '<option value="' + p + '">' + p + '</option>'
      ).join('');
    }
    function renderSnapshot(data) {
      if (data.cpu) {
        document.getElementById('cpuStats').innerHTML = 
          '<div class="stat-row"><span>Total CPU</span><span class="stat-val">' + data.cpu.totalCpu + '%</span></div>' +
          '<div class="timestamp">Captured: ' + new Date(data.timestamp).toLocaleTimeString() + '</div>';
      }
      if (data.memory) {
        document.getElementById('memStats').innerHTML = 
          '<div class="stat-row"><span>Java Heap</span><span class="stat-val">' + (data.memory.javaHeap.used / 1024).toFixed(1) + ' MB</span></div>' +
          '<div class="stat-row"><span>Native Heap</span><span class="stat-val">' + (data.memory.nativeHeap.used / 1024).toFixed(1) + ' MB</span></div>' +
          '<div class="stat-row"><span>Total PSS</span><span class="stat-val">' + (data.memory.totalPss / 1024).toFixed(1) + ' MB</span></div>';
      }
      if (data.graphics) {
         document.getElementById('gfxStats').innerHTML = 
          '<div class="stat-row"><span>Total Frames</span><span class="stat-val">' + data.graphics.totalFrames + '</span></div>' +
          '<div class="stat-row"><span>Janky Frames</span><span class="stat-val">' + data.graphics.jankyFrames + '</span></div>' +
          '<div class="stat-row"><span>95th %ile</span><span class="stat-val">' + data.graphics.percentile95 + 'ms</span></div>' + 
          '<div class="stat-row"><span>99th %ile</span><span class="stat-val">' + data.graphics.percentile99 + 'ms</span></div>';
      }
    }
    function renderStartup(data) {
      document.getElementById('startupStats').innerHTML = 
        '<div class="stat-row"><span>Type</span><span class="stat-val">' + data.type.toUpperCase() + '</span></div>' +
        '<div class="stat-row"><span>Total Time</span><span class="stat-val">' + data.totalTime + ' ms</span></div>' +
        '<div class="stat-row"><span>Wait Time</span><span class="stat-val">' + data.waitTime + ' ms</span></div>';
    }
  </script>
</body>
</html>`;
  }
  private getNonce() {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) { text += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return text;
  }
}
