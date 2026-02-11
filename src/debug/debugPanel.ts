import * as vscode from 'vscode';
import { listDevices } from '../devices/deviceManager';
import { listDebuggableProcesses } from './jdwpConnection';
import { debugSession } from './debugAdapter';

export class DebugPanel {
  public static currentPanel: DebugPanel | undefined;
  private static readonly viewType = 'androidDebugPanel';
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

  public static createOrShow(): DebugPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (DebugPanel.currentPanel) {
      DebugPanel.currentPanel.panel.reveal(column);
      return DebugPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      DebugPanel.viewType,
      'Android Debug',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    DebugPanel.currentPanel = new DebugPanel(panel);
    return DebugPanel.currentPanel;
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
        const processes = await listDebuggableProcesses(deviceId);
        this.postMessage({ type: 'processes', processes });
        break;
      }
      case 'attach': {
        const deviceId = String(message.deviceId || '');
        const pid = Number(message.pid);
        const name = String(message.packageName || '');
        if (!deviceId || !pid) {
          return;
        }
        await debugSession.attachTo(deviceId, { pid, packageName: name, processName: name });
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
  <title>Android Debug</title>
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
  </style>
</head>
<body>
  <div class="row">
    <select id="deviceSelect"></select>
    <button id="refreshBtn">Refresh</button>
  </div>
  <div class="list" id="processList"></div>
  <div class="muted" id="status">Ready</div>
  <script>
    const vscode = acquireVsCodeApi();
    const deviceSelect = document.getElementById('deviceSelect');
    const processList = document.getElementById('processList');
    const status = document.getElementById('status');
    function setStatus(t) { status.textContent = t; }
    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'getDevices' });
    });
    deviceSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'getProcesses', deviceId: deviceSelect.value });
    });
    processList.addEventListener('click', (e) => {
      const row = e.target.closest('.item');
      if (!row) return;
      vscode.postMessage({
        type: 'attach',
        deviceId: deviceSelect.value,
        pid: row.dataset.pid,
        packageName: row.dataset.name
      });
      setStatus('Attaching...');
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
          div.dataset.pid = p.pid;
          div.dataset.name = p.packageName;
          div.textContent = p.packageName + ' (pid ' + p.pid + ')';
          processList.appendChild(div);
        });
      }
    });
    vscode.postMessage({ type: 'getDevices' });
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    DebugPanel.currentPanel = undefined;
    this.disposables.forEach(d => d.dispose());
  }
}
