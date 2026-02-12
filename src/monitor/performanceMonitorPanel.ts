import * as vscode from 'vscode';
import { listDevicesDetailed } from '../devices/deviceManager';
import { AdbService } from '../services/adbService';
import { ProfilerService } from '../profiler/profilerService';

export class PerformanceMonitorPanel {
  public static currentPanel: PerformanceMonitorPanel | undefined;
  private static readonly viewType = 'performanceMonitor';
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private selectedDeviceId: string | undefined;
  private selectedPackage: string | undefined;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this.getHtmlContent();
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.refreshDevices();
  }

  public static createOrShow(): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (PerformanceMonitorPanel.currentPanel) {
      PerformanceMonitorPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      PerformanceMonitorPanel.viewType,
      'ADB Performance Monitor',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    PerformanceMonitorPanel.currentPanel = new PerformanceMonitorPanel(panel);
  }

  private async refreshDevices(): Promise<void> {
    const devices = await listDevicesDetailed();
    const online = devices.filter(d => d.status === 'online');
    this.postMessage({
      type: 'devices',
      data: online.map(d => ({ id: d.id, name: `${d.id} (${d.type})` })),
    });
    if (online.length > 0 && !this.selectedDeviceId) {
      this.selectedDeviceId = online[0].id;
      await this.refreshPackages();
    }
  }

  private async refreshPackages(): Promise<void> {
    if (!this.selectedDeviceId) {
      return;
    }
    const packages = await AdbService.listPackages(this.selectedDeviceId);
    this.postMessage({ type: 'packages', data: packages });
    if (packages.length > 0 && !this.selectedPackage) {
      this.selectedPackage = packages[0];
      this.postMessage({ type: 'selectPackage', data: this.selectedPackage });
    }
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'refreshDevices':
        await this.refreshDevices();
        return;
      case 'selectDevice':
        this.selectedDeviceId = message.deviceId;
        await this.refreshPackages();
        return;
      case 'selectPackage':
        this.selectedPackage = message.package;
        return;
      case 'poll':
        await this.poll();
        return;
      case 'record10s':
        await this.recordTenSeconds();
        return;
    }
  }

  private async poll(): Promise<void> {
    if (!this.selectedDeviceId || !this.selectedPackage) {
      return;
    }
    const profiler = ProfilerService.getInstance();
    const [cpu, mem, gfx] = await Promise.all([
      profiler.captureCpu(this.selectedDeviceId, this.selectedPackage),
      profiler.captureMemory(this.selectedDeviceId, this.selectedPackage),
      profiler.captureGraphics(this.selectedDeviceId, this.selectedPackage),
    ]);
    this.postMessage({
      type: 'stats',
      data: {
        cpu: cpu.success ? cpu.data : null,
        mem: mem.success ? mem.data : null,
        gfx: gfx.success ? gfx.data : null,
        timestamp: Date.now(),
      }
    });
  }

  private postMessage(message: any): void {
    this.panel.webview.postMessage(message);
  }
  private async recordTenSeconds(): Promise<void> {
    if (!this.selectedDeviceId || !this.selectedPackage) {
      vscode.window.showWarningMessage('Select device and package first.');
      return;
    }
    const profiler = ProfilerService.getInstance();
    const result = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Recording 10s performance snapshot...'
    }, async () => {
      return profiler.recordSeries(this.selectedDeviceId!, this.selectedPackage!, 10_000, 1_000);
    });
    if (result.success && result.data) {
      vscode.window.showInformationMessage(`Saved trace: ${result.data}`);
    } else {
      vscode.window.showErrorMessage(result.message);
    }
  }

  public dispose(): void {
    PerformanceMonitorPanel.currentPanel = undefined;
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
  <title>ADB Performance Monitor</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); padding: 5px; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 10px; cursor: pointer; border-radius: 2px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .card { background: var(--vscode-editor-inactiveSelectionBackground); padding: 12px; border-radius: 6px; border: 1px solid var(--vscode-panel-border); }
    .title { font-weight: bold; margin-bottom: 6px; }
    .stat { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 11px; }
  </style>
</head>
<body>
  <div class="row">
    <select id="deviceSelect"><option>Loading devices...</option></select>
    <select id="packageSelect"><option>Loading packages...</option></select>
    <button id="toggleBtn">Start</button>
    <button id="recordBtn">Record 10s</button>
  </div>
  <div class="grid">
    <div class="card">
      <div class="title">CPU</div>
      <div id="cpuStats" class="muted">No data</div>
    </div>
    <div class="card">
      <div class="title">Memory</div>
      <div id="memStats" class="muted">No data</div>
    </div>
    <div class="card">
      <div class="title">Graphics</div>
      <div id="gfxStats" class="muted">No data</div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const deviceSelect = document.getElementById('deviceSelect');
    const packageSelect = document.getElementById('packageSelect');
    const toggleBtn = document.getElementById('toggleBtn');
    let timer = null;

    function start() {
      if (timer) return;
      toggleBtn.textContent = 'Stop';
      timer = setInterval(() => vscode.postMessage({ type: 'poll' }), 2000);
      vscode.postMessage({ type: 'poll' });
    }
    function stop() {
      toggleBtn.textContent = 'Start';
      if (timer) clearInterval(timer);
      timer = null;
    }
    toggleBtn.addEventListener('click', () => {
      if (timer) stop(); else start();
    });
    recordBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'record10s' });
    });
    deviceSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'selectDevice', deviceId: deviceSelect.value });
    });
    packageSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'selectPackage', package: packageSelect.value });
    });
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'devices') {
        deviceSelect.innerHTML = '';
        for (const device of msg.data) {
          const opt = document.createElement('option');
          opt.value = device.id;
          opt.textContent = device.name;
          deviceSelect.appendChild(opt);
        }
      }
      if (msg.type === 'packages') {
        packageSelect.innerHTML = '';
        for (const pkg of msg.data) {
          const opt = document.createElement('option');
          opt.value = pkg;
          opt.textContent = pkg;
          packageSelect.appendChild(opt);
        }
      }
      if (msg.type === 'selectPackage') {
        packageSelect.value = msg.data;
      }
      if (msg.type === 'stats') {
        const cpu = msg.data.cpu;
        const mem = msg.data.mem;
        const gfx = msg.data.gfx;
        document.getElementById('cpuStats').textContent = cpu ? \`${'${'}cpu.processCpu}% CPU\` : 'No data';
        document.getElementById('memStats').textContent = mem ? \`Total PSS: ${'${'}mem.totalPss} KB\` : 'No data';
        if (gfx) {
          document.getElementById('gfxStats').textContent =
            \`Frames: ${'${'}gfx.totalFrames}, Janky: ${'${'}gfx.jankyFrames}\`;
        } else {
          document.getElementById('gfxStats').textContent = 'No data';
        }
      }
    });
    vscode.postMessage({ type: 'refreshDevices' });
  </script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
