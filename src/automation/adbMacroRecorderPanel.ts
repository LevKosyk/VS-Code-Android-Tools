import * as vscode from 'vscode';
import { listDevicesDetailed } from '../devices/deviceManager';
import { AdbService } from '../services/adbService';
import { getWebviewThemeStyle } from '../ui/webviewTheme';

type MacroStep =
  | { type: 'keyevent'; keycode: string }
  | { type: 'tap'; x: number; y: number }
  | { type: 'swipe'; x1: number; y1: number; x2: number; y2: number; duration: number }
  | { type: 'text'; text: string };

interface AdbMacro {
  id: string;
  name: string;
  steps: MacroStep[];
}

type PanelMessage =
  | { type: 'load' }
  | { type: 'setDevice'; deviceId?: string }
  | { type: 'setRecording'; recording?: boolean }
  | { type: 'action'; action?: MacroStep }
  | { type: 'clearSteps' }
  | { type: 'saveMacro'; name?: string }
  | { type: 'playMacro'; id?: string; delayMs?: number }
  | { type: 'deleteMacro'; id?: string };

const MACROS_KEY = 'adbMacroRecorder.macros';

export class AdbMacroRecorderPanel {
  public static currentPanel: AdbMacroRecorderPanel | undefined;
  private static readonly viewType = 'androidAdbMacroRecorder';
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly disposables: vscode.Disposable[] = [];
  private selectedDeviceId = '';
  private recording = false;
  private currentSteps: MacroStep[] = [];

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
    if (AdbMacroRecorderPanel.currentPanel) {
      AdbMacroRecorderPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      AdbMacroRecorderPanel.viewType,
      'ADB Macro Recorder',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    AdbMacroRecorderPanel.currentPanel = new AdbMacroRecorderPanel(panel, context);
  }

  private getMacros(): AdbMacro[] {
    return this.context.globalState.get<AdbMacro[]>(MACROS_KEY, []);
  }

  private async setMacros(items: AdbMacro[]): Promise<void> {
    await this.context.globalState.update(MACROS_KEY, items.slice(0, 60));
  }

  private async pushState(): Promise<void> {
    const devices = await listDevicesDetailed();
    const online = devices.filter(d => d.status === 'online');
    if (!this.selectedDeviceId && online.length > 0) {
      this.selectedDeviceId = online[0].id;
    }
    this.postMessage({
      type: 'state',
      devices: online.map(d => ({ id: d.id, label: `${d.id} (${d.type})` })),
      selectedDeviceId: this.selectedDeviceId,
      recording: this.recording,
      currentSteps: this.currentSteps,
      macros: this.getMacros(),
    });
  }

  private async executeStep(step: MacroStep): Promise<string> {
    if (!this.selectedDeviceId) {
      return 'Select device first.';
    }
    switch (step.type) {
      case 'keyevent': {
        const r = await AdbService.inputKeyevent(this.selectedDeviceId, step.keycode);
        return r.message;
      }
      case 'tap': {
        const r = await AdbService.inputTap(this.selectedDeviceId, step.x, step.y);
        return r.message;
      }
      case 'swipe': {
        const r = await AdbService.inputSwipe(this.selectedDeviceId, step.x1, step.y1, step.x2, step.y2, step.duration);
        return r.message;
      }
      case 'text': {
        const r = await AdbService.inputText(this.selectedDeviceId, step.text);
        return r.message;
      }
      default:
        return 'Unknown step.';
    }
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
      case 'setRecording':
        this.recording = Boolean(message.recording);
        this.postMessage({ type: 'status', level: 'ok', text: this.recording ? 'Recording ON' : 'Recording OFF' });
        await this.pushState();
        return;
      case 'clearSteps':
        this.currentSteps = [];
        await this.pushState();
        return;
      case 'action': {
        if (!message.action) {
          return;
        }
        const output = await this.executeStep(message.action);
        if (this.recording) {
          this.currentSteps.push(message.action);
        }
        this.postMessage({ type: 'status', level: 'ok', text: output });
        await this.pushState();
        return;
      }
      case 'saveMacro': {
        const name = (message.name || '').trim();
        if (!name) {
          this.postMessage({ type: 'status', level: 'error', text: 'Macro name is required.' });
          return;
        }
        if (this.currentSteps.length === 0) {
          this.postMessage({ type: 'status', level: 'error', text: 'No recorded steps.' });
          return;
        }
        const next: AdbMacro = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          steps: [...this.currentSteps],
        };
        const macros = this.getMacros().filter(m => m.name !== name);
        macros.unshift(next);
        await this.setMacros(macros);
        this.postMessage({ type: 'status', level: 'ok', text: `Saved macro: ${name}` });
        await this.pushState();
        return;
      }
      case 'playMacro': {
        const id = message.id || '';
        const macro = this.getMacros().find(m => m.id === id);
        if (!macro) {
          this.postMessage({ type: 'status', level: 'error', text: 'Macro not found.' });
          return;
        }
        const delayMs = Math.max(0, Math.min(5000, Number(message.delayMs || 250)));
        let okCount = 0;
        for (const step of macro.steps) {
          const text = await this.executeStep(step);
          this.postMessage({ type: 'status', level: 'ok', text: text });
          okCount += 1;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        this.postMessage({ type: 'status', level: 'ok', text: `Macro "${macro.name}" executed: ${okCount} steps.` });
        return;
      }
      case 'deleteMacro': {
        const id = message.id || '';
        const next = this.getMacros().filter(m => m.id !== id);
        await this.setMacros(next);
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
    AdbMacroRecorderPanel.currentPanel = undefined;
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
    .row { display: flex; gap: var(--at-space-2); align-items: center; margin-bottom: var(--at-space-2); flex-wrap: wrap; }
    input, select, button { border: 1px solid var(--vscode-widget-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: var(--at-radius-sm); padding: 6px 8px; min-height: 32px; }
    button { cursor: pointer; }
    .btn-primary { background: var(--at-info); color: var(--at-info-contrast); border-color: transparent; font-weight: 600; }
    .card { border: 1px solid var(--vscode-widget-border); border-radius: var(--at-radius-md); padding: var(--at-space-2); margin-top: var(--at-space-2); }
    .status { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: var(--at-space-2); }
    .status.error { color: var(--at-error); }
    .step, .macro { padding: 6px 0; border-bottom: 1px solid var(--vscode-widget-border); display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .step:last-child, .macro:last-child { border-bottom: none; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
  </style>
</head>
<body>
  <h2>ADB Macro Recorder</h2>
  <div class="row">
    <label>Device</label>
    <select id="device"></select>
    <label><input id="recording" type="checkbox" /> Recording</label>
    <button id="clearSteps">Clear Steps</button>
  </div>

  <div class="card">
    <h3>Actions</h3>
    <div class="row">
      <select id="keycode">
        <option value="KEYCODE_HOME">HOME</option>
        <option value="KEYCODE_BACK">BACK</option>
        <option value="KEYCODE_APP_SWITCH">RECENTS</option>
        <option value="KEYCODE_ENTER">ENTER</option>
      </select>
      <button id="sendKey">Keyevent</button>
    </div>
    <div class="row">
      <input id="tapX" type="number" placeholder="Tap X" />
      <input id="tapY" type="number" placeholder="Tap Y" />
      <button id="sendTap">Tap</button>
    </div>
    <div class="row">
      <input id="x1" type="number" placeholder="X1" />
      <input id="y1" type="number" placeholder="Y1" />
      <input id="x2" type="number" placeholder="X2" />
      <input id="y2" type="number" placeholder="Y2" />
      <input id="dur" type="number" placeholder="ms" />
      <button id="sendSwipe">Swipe</button>
    </div>
    <div class="row">
      <input id="text" type="text" placeholder="Input text" style="min-width:300px;" />
      <button id="sendText">Text</button>
    </div>
  </div>

  <div class="card">
    <h3>Recorded Steps</h3>
    <div class="muted">When recording is ON, every executed action is appended here.</div>
    <div id="steps"></div>
    <div class="row" style="margin-top:8px;">
      <input id="macroName" placeholder="Macro name" />
      <button id="saveMacro" class="btn-primary">Save Macro</button>
    </div>
  </div>

  <div class="card">
    <h3>Saved Macros</h3>
    <div class="row">
      <label>Step delay (ms)</label>
      <input id="delay" type="number" value="250" />
    </div>
    <div id="macros"></div>
  </div>

  <div id="status" class="status">Ready.</div>

  <script>
    const vscode = acquireVsCodeApi();
    const el = id => document.getElementById(id);
    let state = { currentSteps: [], macros: [] };
    function postAction(action) { vscode.postMessage({ type: 'action', action }); }
    function render() {
      const stepRoot = el('steps');
      stepRoot.innerHTML = '';
      if (!state.currentSteps.length) {
        stepRoot.innerHTML = '<div class="muted">No steps yet.</div>';
      } else {
        state.currentSteps.forEach((s, i) => {
          const row = document.createElement('div');
          row.className = 'step';
          row.textContent = (i + 1) + '. ' + JSON.stringify(s);
          stepRoot.appendChild(row);
        });
      }
      const macroRoot = el('macros');
      macroRoot.innerHTML = '';
      if (!state.macros.length) {
        macroRoot.innerHTML = '<div class="muted">No macros saved.</div>';
      } else {
        state.macros.forEach(m => {
          const row = document.createElement('div');
          row.className = 'macro';
          const left = document.createElement('div');
          left.innerHTML = '<strong>' + m.name + '</strong><div class="muted">' + m.steps.length + ' steps</div>';
          const right = document.createElement('div');
          const play = document.createElement('button');
          play.textContent = 'Play';
          play.onclick = () => vscode.postMessage({ type: 'playMacro', id: m.id, delayMs: Number(el('delay').value) || 250 });
          const del = document.createElement('button');
          del.textContent = 'Delete';
          del.onclick = () => vscode.postMessage({ type: 'deleteMacro', id: m.id });
          right.appendChild(play); right.appendChild(del);
          row.appendChild(left); row.appendChild(right);
          macroRoot.appendChild(row);
        });
      }
    }
    el('device').addEventListener('change', () => vscode.postMessage({ type: 'setDevice', deviceId: el('device').value }));
    el('recording').addEventListener('change', () => vscode.postMessage({ type: 'setRecording', recording: el('recording').checked }));
    el('clearSteps').onclick = () => vscode.postMessage({ type: 'clearSteps' });
    el('sendKey').onclick = () => postAction({ type: 'keyevent', keycode: el('keycode').value });
    el('sendTap').onclick = () => postAction({ type: 'tap', x: Number(el('tapX').value), y: Number(el('tapY').value) });
    el('sendSwipe').onclick = () => postAction({
      type: 'swipe',
      x1: Number(el('x1').value),
      y1: Number(el('y1').value),
      x2: Number(el('x2').value),
      y2: Number(el('y2').value),
      duration: Number(el('dur').value) || 300
    });
    el('sendText').onclick = () => postAction({ type: 'text', text: el('text').value });
    el('saveMacro').onclick = () => vscode.postMessage({ type: 'saveMacro', name: el('macroName').value });

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
        if (msg.selectedDeviceId) {
          device.value = msg.selectedDeviceId;
        }
        el('recording').checked = Boolean(msg.recording);
        state.currentSteps = msg.currentSteps || [];
        state.macros = msg.macros || [];
        render();
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
