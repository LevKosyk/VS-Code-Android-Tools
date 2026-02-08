import * as vscode from 'vscode';
import { LogcatStream, logcatManager } from './logcatStream';
import { LogEntry, LogFilter, LogLevel, LOG_LEVEL_NAMES, DEFAULT_FILTER } from './types';
import { listDevices } from '../devices/deviceManager';
export class LogcatPanel {
  public static currentPanel: LogcatPanel | undefined;
  private static readonly viewType = 'androidLogcat';
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private stream: LogcatStream | null = null;
  private filter: LogFilter = { ...DEFAULT_FILTER };
  private disposables: vscode.Disposable[] = [];
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
  }
  public static createOrShow(extensionUri: vscode.Uri): LogcatPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (LogcatPanel.currentPanel) {
      LogcatPanel.currentPanel.panel.reveal(column);
      return LogcatPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      LogcatPanel.viewType,
      'Logcat Viewer',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    LogcatPanel.currentPanel = new LogcatPanel(panel, extensionUri);
    return LogcatPanel.currentPanel;
  }
  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'getDevices':
        await this.sendDeviceList();
        break;
      case 'startStream':
        await this.startStream(message.deviceId as string);
        break;
      case 'stopStream':
        this.stopStream();
        break;
      case 'setFilter':
        this.setFilter(message.filter as LogFilter);
        break;
      case 'clear':
        this.clearLogs();
        break;
      case 'copyLine':
        await vscode.env.clipboard.writeText(message.text as string);
        vscode.window.showInformationMessage('Log line copied to clipboard');
        break;
    }
  }
  private async sendDeviceList(): Promise<void> {
    try {
      const devices = await listDevices();
      this.postMessage({
        type: 'devices',
        devices: devices.map(d => ({
          id: d.id,
          type: d.type,
          status: d.status,
        })),
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        message: 'Failed to list devices',
      });
    }
  }
  private async startStream(deviceId: string): Promise<void> {
    this.stopStream();
    this.stream = logcatManager.getStream(deviceId);
    this.stream.setFilter(this.filter);
    this.stream.on('entry', (entry: LogEntry) => {
      this.postMessage({
        type: 'entry',
        entry: this.serializeEntry(entry),
      });
    });
    this.stream.on('state', (state) => {
      this.postMessage({ type: 'state', state });
    });
    this.stream.on('error', (message) => {
      this.postMessage({ type: 'error', message });
      vscode.window.showErrorMessage(`Logcat: ${message}`);
    });
    this.stream.on('cleared', () => {
      this.postMessage({ type: 'cleared' });
    });
    this.stream.start();
    const existingEntries = this.stream.getFilteredEntries();
    this.postMessage({
      type: 'entries',
      entries: existingEntries.map(e => this.serializeEntry(e)),
    });
  }
  private stopStream(): void {
    if (this.stream) {
      this.stream.removeAllListeners();
      this.stream.stop();
      this.stream = null;
    }
  }
  private setFilter(filter: LogFilter): void {
    this.filter = filter;
    if (this.stream) {
      this.stream.setFilter(filter);
      const entries = this.stream.getFilteredEntries();
      this.postMessage({
        type: 'entries',
        entries: entries.map(e => this.serializeEntry(e)),
      });
    }
  }
  private clearLogs(): void {
    if (this.stream) {
      this.stream.clear();
    }
  }
  private serializeEntry(entry: LogEntry): object {
    return {
      id: entry.id,
      timestamp: entry.timestamp,
      pid: entry.pid,
      level: entry.level,
      tag: entry.tag,
      message: entry.message,
    };
  }
  private postMessage(message: object): void {
    this.panel.webview.postMessage(message);
  }
  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logcat Viewer</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-widget-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      background: var(--bg);
      color: var(--fg);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      padding: 8px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
      align-items: center;
    }
    select, input, button {
      font-family: inherit;
      font-size: 12px;
      padding: 4px 8px;
      border: 1px solid var(--border);
      border-radius: 3px;
      background: var(--input-bg);
      color: var(--input-fg);
    }
    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      cursor: pointer;
      border: none;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-stop { background: #d32f2f; }
    .btn-clear { background: #616161; }
    input[type="text"] { width: 150px; }
    .status {
      margin-left: auto;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .status.running { color: #4caf50; }
    .status.error { color: #f44336; }
    .log-container {
      flex: 1;
      overflow-y: auto;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 12px;
      padding: 4px;
    }
    .log-line {
      display: flex;
      padding: 2px 4px;
      border-radius: 2px;
      cursor: pointer;
    }
    .log-line:hover { background: var(--vscode-list-hoverBackground); }
    .log-time { color: #888; width: 85px; flex-shrink: 0; }
    .log-level { width: 18px; flex-shrink: 0; font-weight: bold; text-align: center; }
    .log-tag { color: #4FC3F7; width: 120px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; }
    .log-msg { flex: 1; white-space: pre-wrap; word-break: break-all; }
    .level-V { color: #888888; }
    .level-D { color: #4FC3F7; }
    .level-I { color: #81C784; }
    .level-W { color: #FFB74D; }
    .level-E { color: #E57373; }
    .level-F { color: #F44336; }
    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <select id="deviceSelect">
      <option value="">Select device...</option>
    </select>
    <button id="startBtn">Start</button>
    <button id="stopBtn" class="btn-stop" disabled>Stop</button>
    <button id="clearBtn" class="btn-clear">Clear</button>
    <select id="levelSelect">
      <option value="V">Verbose+</option>
      <option value="D">Debug+</option>
      <option value="I">Info+</option>
      <option value="W">Warning+</option>
      <option value="E">Error+</option>
    </select>
    <input type="text" id="tagFilter" placeholder="Filter by tag...">
    <input type="text" id="searchFilter" placeholder="Search...">
    <span id="status" class="status">Stopped</span>
  </div>
  <div class="log-container" id="logContainer">
    <div class="empty-state">Select a device and click Start to view logs</div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    // Elements
    const deviceSelect = document.getElementById('deviceSelect');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const clearBtn = document.getElementById('clearBtn');
    const levelSelect = document.getElementById('levelSelect');
    const tagFilter = document.getElementById('tagFilter');
    const searchFilter = document.getElementById('searchFilter');
    const statusEl = document.getElementById('status');
    const logContainer = document.getElementById('logContainer');
    let isRunning = false;
    let autoScroll = true;
    // Request device list on load
    vscode.postMessage({ type: 'getDevices' });
    // Event listeners
    startBtn.addEventListener('click', () => {
      const deviceId = deviceSelect.value;
      if (deviceId) {
        vscode.postMessage({ type: 'startStream', deviceId });
      }
    });
    stopBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'stopStream' });
    });
    clearBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'clear' });
      logContainer.innerHTML = '';
    });
    levelSelect.addEventListener('change', sendFilter);
    tagFilter.addEventListener('input', debounce(sendFilter, 300));
    searchFilter.addEventListener('input', debounce(sendFilter, 300));
    logContainer.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = logContainer;
      autoScroll = scrollHeight - scrollTop - clientHeight < 50;
    });
    logContainer.addEventListener('dblclick', (e) => {
      const line = e.target.closest('.log-line');
      if (line) {
        vscode.postMessage({ type: 'copyLine', text: line.dataset.raw });
      }
    });
    function sendFilter() {
      vscode.postMessage({
        type: 'setFilter',
        filter: {
          minLevel: levelSelect.value,
          tag: tagFilter.value || undefined,
          search: searchFilter.value || undefined,
        }
      });
    }
    function debounce(fn, ms) {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), ms);
      };
    }
    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'devices':
          deviceSelect.innerHTML = '<option value="">Select device...</option>';
          message.devices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.id + ' (' + d.type + ')';
            opt.disabled = d.status !== 'online';
            deviceSelect.appendChild(opt);
          });
          break;
        case 'state':
          isRunning = message.state === 'running';
          startBtn.disabled = isRunning;
          stopBtn.disabled = !isRunning;
          deviceSelect.disabled = isRunning;
          statusEl.textContent = message.state.charAt(0).toUpperCase() + message.state.slice(1);
          statusEl.className = 'status ' + message.state;
          break;
        case 'entry':
          appendEntry(message.entry);
          break;
        case 'entries':
          logContainer.innerHTML = '';
          message.entries.forEach(appendEntry);
          break;
        case 'cleared':
          logContainer.innerHTML = '';
          break;
        case 'error':
          console.error('Logcat error:', message.message);
          break;
      }
    });
    function appendEntry(entry) {
      const div = document.createElement('div');
      div.className = 'log-line';
      div.dataset.raw = entry.timestamp + ' ' + entry.level + '/' + entry.tag + ': ' + entry.message;
      div.innerHTML = 
        '<span class="log-time">' + entry.timestamp.substring(6) + '</span>' +
        '<span class="log-level level-' + entry.level + '">' + entry.level + '</span>' +
        '<span class="log-tag" title="' + escapeHtml(entry.tag) + '">' + escapeHtml(entry.tag) + '</span>' +
        '<span class="log-msg">' + escapeHtml(entry.message) + '</span>';
      logContainer.appendChild(div);
      if (autoScroll) {
        div.scrollIntoView({ behavior: 'auto' });
      }
    }
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
  }
  public dispose(): void {
    LogcatPanel.currentPanel = undefined;
    this.stopStream();
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
