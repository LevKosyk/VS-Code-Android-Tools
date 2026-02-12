import * as vscode from 'vscode';
import { listDevicesDetailed } from '../devices/deviceManager';
import { AdbService } from '../services/adbService';
import { showError, showInfo } from '../ui/notifications';

export class QuickActionsPanel {
  public static currentPanel: QuickActionsPanel | undefined;
  private static readonly viewType = 'androidQuickActions';
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private selectedDeviceId: string | undefined;

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
    if (QuickActionsPanel.currentPanel) {
      QuickActionsPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      QuickActionsPanel.viewType,
      'Android Quick Actions',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    QuickActionsPanel.currentPanel = new QuickActionsPanel(panel);
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
      this.postMessage({ type: 'selectDevice', data: this.selectedDeviceId });
    }
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'refreshDevices':
        await this.refreshDevices();
        return;
      case 'selectDevice':
        this.selectedDeviceId = message.deviceId;
        return;
      case 'keyevent':
        if (!this.selectedDeviceId) return;
        await AdbService.inputKeyevent(this.selectedDeviceId, message.keycode);
        return;
      case 'tap':
        if (!this.selectedDeviceId) return;
        await AdbService.inputTap(this.selectedDeviceId, message.x, message.y);
        return;
      case 'swipe':
        if (!this.selectedDeviceId) return;
        await AdbService.inputSwipe(this.selectedDeviceId, message.x1, message.y1, message.x2, message.y2, message.duration);
        return;
      case 'text':
        if (!this.selectedDeviceId) return;
        await AdbService.inputText(this.selectedDeviceId, message.text);
        return;
      case 'pushClipboard':
        if (!this.selectedDeviceId) return;
        const clipboardText = await vscode.env.clipboard.readText();
        await AdbService.setClipboard(this.selectedDeviceId, clipboardText);
        return;
      case 'pullClipboard':
        if (!this.selectedDeviceId) return;
        const deviceClipboard = await AdbService.getClipboard(this.selectedDeviceId);
        if (deviceClipboard !== null) {
          await vscode.env.clipboard.writeText(deviceClipboard);
          showInfo('Clipboard pulled from device.');
        } else {
          showError('Failed to read device clipboard.');
        }
        return;
    }
  }

  private postMessage(message: any): void {
    this.panel.webview.postMessage(message);
  }

  public dispose(): void {
    QuickActionsPanel.currentPanel = undefined;
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
  <title>Android Quick Actions</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    select, input { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; border-radius: 2px; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 10px; cursor: pointer; border-radius: 2px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .section { margin-top: 16px; border-top: 1px solid var(--vscode-panel-border); padding-top: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
  </style>
</head>
<body>
  <div class="row">
    <select id="deviceSelect"></select>
    <button onclick="refresh()">Refresh</button>
  </div>

  <div class="section">
    <div class="row">
      <select id="keySelect">
        <option value="KEYCODE_HOME">HOME</option>
        <option value="KEYCODE_BACK">BACK</option>
        <option value="KEYCODE_APP_SWITCH">RECENTS</option>
        <option value="KEYCODE_ENTER">ENTER</option>
        <option value="KEYCODE_DEL">DEL</option>
        <option value="KEYCODE_VOLUME_UP">VOLUME UP</option>
        <option value="KEYCODE_VOLUME_DOWN">VOLUME DOWN</option>
        <option value="KEYCODE_POWER">POWER</option>
        <option value="KEYCODE_MENU">MENU</option>
      </select>
      <button onclick="sendKey()">Send Key</button>
    </div>
  </div>

  <div class="section">
    <div class="row">
      <input id="tapX" type="number" placeholder="Tap X" />
      <input id="tapY" type="number" placeholder="Tap Y" />
      <button onclick="tap()">Tap</button>
    </div>
    <div class="row">
      <input id="swipeX1" type="number" placeholder="X1" />
      <input id="swipeY1" type="number" placeholder="Y1" />
      <input id="swipeX2" type="number" placeholder="X2" />
      <input id="swipeY2" type="number" placeholder="Y2" />
      <input id="swipeDur" type="number" placeholder="ms" />
      <button onclick="swipe()">Swipe</button>
    </div>
  </div>

  <div class="section">
    <div class="row">
      <input id="textInput" type="text" placeholder="Text to paste" style="flex: 1;" />
      <button onclick="sendText()">Input Text</button>
    </div>
    <div class="grid">
      <button onclick="pushClipboard()">Push Clipboard</button>
      <button onclick="pullClipboard()">Pull Clipboard</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const deviceSelect = document.getElementById('deviceSelect');

    function refresh() {
      vscode.postMessage({ type: 'refreshDevices' });
    }
    function sendKey() {
      vscode.postMessage({ type: 'keyevent', keycode: document.getElementById('keySelect').value });
    }
    function tap() {
      vscode.postMessage({ type: 'tap', x: Number(document.getElementById('tapX').value), y: Number(document.getElementById('tapY').value) });
    }
    function swipe() {
      vscode.postMessage({
        type: 'swipe',
        x1: Number(document.getElementById('swipeX1').value),
        y1: Number(document.getElementById('swipeY1').value),
        x2: Number(document.getElementById('swipeX2').value),
        y2: Number(document.getElementById('swipeY2').value),
        duration: Number(document.getElementById('swipeDur').value) || 300
      });
    }
    function sendText() {
      vscode.postMessage({ type: 'text', text: document.getElementById('textInput').value });
    }
    function pushClipboard() {
      vscode.postMessage({ type: 'pushClipboard' });
    }
    function pullClipboard() {
      vscode.postMessage({ type: 'pullClipboard' });
    }
    deviceSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'selectDevice', deviceId: deviceSelect.value });
    });
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'devices') {
        deviceSelect.innerHTML = '';
        for (const device of message.data) {
          const opt = document.createElement('option');
          opt.value = device.id;
          opt.textContent = device.name;
          deviceSelect.appendChild(opt);
        }
      }
      if (message.type === 'selectDevice') {
        deviceSelect.value = message.data;
      }
    });
    refresh();
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
