import * as vscode from 'vscode';
import { AdbService } from '../services/adbService';
import { listDevices } from '../devices/deviceManager';

export class AppInspectionPanel {
  public static currentPanel: AppInspectionPanel | undefined;
  private static readonly viewType = 'androidAppInspection';
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(): AppInspectionPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (AppInspectionPanel.currentPanel) {
      AppInspectionPanel.currentPanel.panel.reveal(column);
      return AppInspectionPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      AppInspectionPanel.viewType,
      'App Inspection',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    AppInspectionPanel.currentPanel = new AppInspectionPanel(panel);
    return AppInspectionPanel.currentPanel;
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'getDevices': {
        const devices = await listDevices();
        this.postMessage({ type: 'devices', devices });
        break;
      }
      case 'getProcesses': {
        const deviceId = String(message.deviceId || '');
        if (!deviceId) {
          return;
        }
        const processes = await AdbService.listProcesses(deviceId);
        this.postMessage({ type: 'processes', processes });
        break;
      }
      case 'getPackageDetails': {
        const deviceId = String(message.deviceId || '');
        const packageName = String(message.packageName || '');
        if (!deviceId || !packageName) {
          return;
        }
        const details = await AdbService.getPackageDetails(deviceId, packageName);
        this.postMessage({ type: 'packageDetails', details });
        break;
      }
    }
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
  <title>App Inspection</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-widget-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --muted: var(--vscode-descriptionForeground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: 13px; background: var(--bg); color: var(--fg); padding: 12px; }
    select, button { font-size: 12px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--input-bg); color: var(--input-fg); }
    button { cursor: pointer; }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    .list { border: 1px solid var(--border); border-radius: 6px; padding: 8px; max-height: 360px; overflow: auto; }
    .item { padding: 6px 4px; border-bottom: 1px solid var(--border); cursor: pointer; }
    .item:last-child { border-bottom: none; }
    .muted { color: var(--muted); }
    .details { margin-top: 10px; }
  </style>
</head>
<body>
  <div class="row">
    <select id="deviceSelect"></select>
    <button id="refreshBtn">Refresh</button>
  </div>
  <div class="list" id="processList"></div>
  <div class="details" id="details"></div>
  <script>
    const vscode = acquireVsCodeApi();
    const deviceSelect = document.getElementById('deviceSelect');
    const processList = document.getElementById('processList');
    const details = document.getElementById('details');
    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'getDevices' });
    });
    deviceSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'getProcesses', deviceId: deviceSelect.value });
    });
    processList.addEventListener('click', (e) => {
      const row = e.target.closest('.item');
      if (!row) return;
      const pkg = row.dataset.pkg;
      if (pkg) {
        vscode.postMessage({ type: 'getPackageDetails', deviceId: deviceSelect.value, packageName: pkg });
      }
    });
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'devices') {
        deviceSelect.innerHTML = '';
        msg.devices.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.id;
          opt.textContent = d.id + ' (' + d.type + ')';
          opt.disabled = d.status !== 'online';
          deviceSelect.appendChild(opt);
        });
        if (deviceSelect.value) {
          vscode.postMessage({ type: 'getProcesses', deviceId: deviceSelect.value });
        }
      }
      if (msg.type === 'processes') {
        processList.innerHTML = '';
        msg.processes.forEach(p => {
          const div = document.createElement('div');
          div.className = 'item';
          div.dataset.pkg = p.name;
          div.textContent = p.name + ' (pid ' + p.pid + ')';
          processList.appendChild(div);
        });
      }
      if (msg.type === 'packageDetails') {
        const d = msg.details;
        details.innerHTML = '<div class=\"muted\">' +
          'Package: ' + d.packageName + '<br>' +
          'Version: ' + (d.versionName || '-') + ' (' + (d.versionCode || '-') + ')<br>' +
          'First Install: ' + (d.firstInstallTime || '-') + '<br>' +
          'Last Update: ' + (d.lastUpdateTime || '-') +
          '</div>';
      }
    });
    vscode.postMessage({ type: 'getDevices' });
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    AppInspectionPanel.currentPanel = undefined;
    this.disposables.forEach(d => d.dispose());
  }
}
