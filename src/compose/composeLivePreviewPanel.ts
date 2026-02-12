import * as vscode from 'vscode';
import { listDevices } from '../devices/deviceManager';
import { AdbService } from '../services/adbService';
import { ProfilerService } from '../profiler/profilerService';

export class ComposeLivePreviewPanel {
  public static currentPanel: ComposeLivePreviewPanel | undefined;
  private static readonly viewType = 'composeLivePreviewPanel';
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

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

  static createOrShow(): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (ComposeLivePreviewPanel.currentPanel) {
      ComposeLivePreviewPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      ComposeLivePreviewPanel.viewType,
      'Compose Live Preview',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    ComposeLivePreviewPanel.currentPanel = new ComposeLivePreviewPanel(panel);
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'getDevices': {
        const devices = await listDevices();
        this.postMessage({ type: 'devices', devices: devices.filter(d => d.status === 'online') });
        break;
      }
      case 'captureFrame': {
        const deviceId = String(message.deviceId || '');
        const packageName = String(message.packageName || '');
        if (!deviceId) {
          return;
        }
        const image = await AdbService.captureScreenBase64(deviceId);
        const gfx = packageName
          ? await ProfilerService.getInstance().captureGraphics(deviceId, packageName)
          : { success: false, data: undefined };
        this.postMessage({
          type: 'frame',
          image,
          gfx: gfx.success ? gfx.data : null,
          params: String(message.params || ''),
        });
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
    select, input, button, textarea {
      font-size: 12px;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--input-bg);
      color: var(--input-fg);
    }
    button { cursor: pointer; }
    #frame { max-width: 100%; border: 1px solid var(--border); border-radius: 6px; }
    .muted { color: var(--muted); font-size: 12px; }
  </style>
</head>
<body>
  <div class="row">
    <select id="deviceSelect"></select>
    <input id="packageInput" placeholder="packageName (for hotspots)" style="flex:1;" />
    <button id="toggleBtn">Start Live</button>
  </div>
  <div class="row">
    <textarea id="paramsInput" rows="2" style="width:100%;" placeholder='Parameter sets JSON (e.g. {"theme":"dark","size":"l"})'></textarea>
  </div>
  <img id="frame" />
  <div class="muted" id="meta">No frame</div>
  <script>
    const vscode = acquireVsCodeApi();
    const deviceSelect = document.getElementById('deviceSelect');
    const packageInput = document.getElementById('packageInput');
    const paramsInput = document.getElementById('paramsInput');
    const toggleBtn = document.getElementById('toggleBtn');
    const frame = document.getElementById('frame');
    const meta = document.getElementById('meta');
    let timer = null;
    function poll() {
      vscode.postMessage({
        type: 'captureFrame',
        deviceId: deviceSelect.value,
        packageName: packageInput.value.trim(),
        params: paramsInput.value.trim()
      });
    }
    toggleBtn.addEventListener('click', () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
        toggleBtn.textContent = 'Start Live';
        return;
      }
      toggleBtn.textContent = 'Stop Live';
      poll();
      timer = setInterval(poll, 1800);
    });
    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'devices') {
        deviceSelect.innerHTML = '';
        (msg.devices || []).forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.id;
          opt.textContent = d.id + ' (' + d.type + ')';
          deviceSelect.appendChild(opt);
        });
      }
      if (msg.type === 'frame') {
        if (msg.image) {
          frame.src = 'data:image/png;base64,' + msg.image;
        }
        const g = msg.gfx;
        if (g) {
          meta.textContent = 'Params: ' + (msg.params || '{}') + ' | Jank ' + g.jankyFrames + '/' + g.totalFrames + ' | P90 ' + g.percentile90 + 'ms';
        } else {
          meta.textContent = 'Params: ' + (msg.params || '{}') + ' | No gfx stats';
        }
      }
    });
    vscode.postMessage({ type: 'getDevices' });
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    ComposeLivePreviewPanel.currentPanel = undefined;
    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }
}
