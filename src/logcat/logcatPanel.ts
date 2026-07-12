import * as vscode from 'vscode';
import { LogcatStream, logcatManager } from './logcatStream';
import { LogEntry, LogFilter, LogLevel, LOG_LEVEL_NAMES, DEFAULT_FILTER } from './types';
import { listDevices } from '../devices/deviceManager';
import { showError, showInfo } from '../ui/notifications';
import { findApplicationId, findApplicationModules } from '../core/androidProject';
import { getWebviewThemeStyle } from '../ui/webviewTheme';
import { waitForAppPid } from '../run/appProcess';
export class LogcatPanel {
  public static currentPanel: LogcatPanel | undefined;
  private static readonly viewType = 'androidLogcat';
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly context: vscode.ExtensionContext;
  private stream: LogcatStream | null = null;
  private filter: LogFilter = { ...DEFAULT_FILTER };
  private disposables: vscode.Disposable[] = [];
  private pendingEntries: object[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private devicePollTimer: NodeJS.Timeout | undefined;
  private pidRefreshTimer: NodeJS.Timeout | undefined;
  private activeDeviceId: string | undefined;
  private resumeStreamOnVisible = false;
  private readonly flushIntervalMs = 120;
  private readonly flushBatchSize = 250;
  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.context = context;
    this.panel.webview.html = this.getHtmlContent();
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
    this.panel.onDidChangeViewState(() => {
      this.handleVisibilityChanged();
    }, null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.startDevicePolling();
  }
  public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): LogcatPanel {
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
    LogcatPanel.currentPanel = new LogcatPanel(panel, extensionUri, context);
    return LogcatPanel.currentPanel;
  }
  public async focusDeviceAndFilterApp(deviceId: string): Promise<void> {
    if (!deviceId) {
      return;
    }
    this.postMessage({ type: 'sessionApplied', session: { deviceId, filter: this.filter } });
    await this.startStream(deviceId);
    await new Promise(resolve => setTimeout(resolve, 800));
    await this.applyOnlyThisApp(deviceId);
  }
  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    const type = typeof message?.type === 'string' ? message.type : '';
    try {
      switch (type) {
        case 'getDevices':
          await this.sendDeviceList();
          break;
        case 'startStream':
          await this.startStream(String(message.deviceId || ''));
          break;
        case 'stopStream':
          this.stopStream();
          break;
        case 'setFilter':
          this.setFilter((message.filter || DEFAULT_FILTER) as LogFilter);
          break;
        case 'clear':
          this.clearLogs();
          break;
        case 'copyLine':
          await vscode.env.clipboard.writeText(String(message.text || ''));
          showInfo('Log line copied to clipboard.');
          break;
        case 'openSource':
          await this.openStackSource(String(message.file || ''), Number(message.line));
          break;
        case 'getPresets':
          this.sendPresets();
          break;
        case 'savePreset':
          this.savePreset(String(message.name || ''), (message.filter || DEFAULT_FILTER) as LogFilter);
          break;
        case 'deletePreset':
          this.deletePreset(String(message.name || ''));
          break;
        case 'applyPreset':
          this.applyPreset(String(message.name || ''));
          break;
        case 'getSessions':
          this.sendSessions();
          break;
        case 'saveSession':
          this.saveSession(String(message.name || ''), String(message.deviceId || ''), (message.filter || DEFAULT_FILTER) as LogFilter);
          break;
        case 'runSession':
          this.runSession(String(message.name || ''));
          break;
        case 'togglePinPreset':
          this.togglePinPreset(String(message.name || ''));
          break;
        case 'onlyThisApp':
          await this.applyOnlyThisApp(String(message.deviceId || ''));
          break;
        case 'exportLogs':
          await this.exportLogs(message.entries as string[] | undefined, Boolean(message.onlySelected));
          break;
        case 'startEmulator':
          await vscode.commands.executeCommand('android-toolkit.startEmulator');
          break;
        case 'runAppAndFilter':
          await this.runAppAndFilter(String(message.deviceId || ''));
          break;
        default:
          this.postMessage({ type: 'error', message: `Unsupported Logcat action: ${type || 'unknown'}` });
          break;
      }
    } catch (error) {
      this.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Logcat action failed',
      });
    }
  }
  private getPresets(): Array<{ name: string; filter: LogFilter }> {
    return this.context.globalState.get('android-tools.logcatPresets', []);
  }
  private updatePresets(presets: Array<{ name: string; filter: LogFilter }>): void {
    this.context.globalState.update('android-tools.logcatPresets', presets);
  }
  private getPinnedPresets(): string[] {
    return this.context.globalState.get('android-tools.logcatPinnedPresets', []);
  }
  private updatePinnedPresets(names: string[]): void {
    this.context.globalState.update('android-tools.logcatPinnedPresets', Array.from(new Set(names)));
  }
  private sendPresets(): void {
    const presets = this.getPresets();
    const pinned = this.getPinnedPresets();
    this.postMessage({ type: 'presets', presets, pinned });
  }
  private togglePinPreset(name: string): void {
    if (!name) {
      return;
    }
    const pinned = this.getPinnedPresets();
    if (pinned.includes(name)) {
      this.updatePinnedPresets(pinned.filter(p => p !== name));
    } else {
      this.updatePinnedPresets([...pinned, name]);
    }
    this.sendPresets();
  }
  private savePreset(name: string, filter: LogFilter): void {
    if (!name) {
      return;
    }
    const presets = this.getPresets();
    const existing = presets.findIndex(p => p.name === name);
    if (existing >= 0) {
      presets[existing] = { name, filter };
    } else {
      presets.push({ name, filter });
    }
    this.updatePresets(presets);
    this.sendPresets();
  }
  private deletePreset(name: string): void {
    if (!name) {
      return;
    }
    const presets = this.getPresets().filter(p => p.name !== name);
    this.updatePresets(presets);
    this.sendPresets();
  }
  private applyPreset(name: string): void {
    const presets = this.getPresets();
    const preset = presets.find(p => p.name === name);
    if (!preset) {
      return;
    }
    this.setFilter(preset.filter);
    this.postMessage({ type: 'presetApplied', filter: preset.filter });
  }
  private getSessions(): Array<{ name: string; deviceId: string; filter: LogFilter }> {
    return this.context.globalState.get('android-tools.logcatSessions', []);
  }
  private updateSessions(sessions: Array<{ name: string; deviceId: string; filter: LogFilter }>): void {
    this.context.globalState.update('android-tools.logcatSessions', sessions);
  }
  private sendSessions(): void {
    const sessions = this.getSessions();
    this.postMessage({ type: 'sessions', sessions });
  }
  private saveSession(name: string, deviceId: string, filter: LogFilter): void {
    if (!name || !deviceId) {
      return;
    }
    const sessions = this.getSessions();
    const existing = sessions.findIndex(s => s.name === name);
    const session = { name, deviceId, filter };
    if (existing >= 0) {
      sessions[existing] = session;
    } else {
      sessions.push(session);
    }
    this.updateSessions(sessions);
    this.sendSessions();
  }
  private runSession(name: string): void {
    const sessions = this.getSessions();
    const session = sessions.find(s => s.name === name);
    if (!session) {
      return;
    }
    this.postMessage({ type: 'sessionApplied', session });
    this.startStream(session.deviceId);
  }
  private async applyOnlyThisApp(deviceId: string): Promise<void> {
    if (!deviceId) {
      this.postMessage({ type: 'error', message: 'Select a device first.' });
      return;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      this.postMessage({ type: 'error', message: 'No workspace open.' });
      return;
    }
    const modules = findApplicationModules(workspaceRoot);
    const moduleName = modules[0];
    if (!moduleName) {
      this.postMessage({ type: 'error', message: 'No app module found.' });
      return;
    }
    const packageName = findApplicationId(workspaceRoot, moduleName);
    if (!packageName) {
      this.postMessage({ type: 'error', message: 'Cannot resolve applicationId.' });
      return;
    }
    const process = await waitForAppPid(deviceId, packageName);
    if (!process.pid) {
      this.postMessage({ type: 'error', message: process.error || `App is not running: ${packageName}` });
      return;
    }
    this.setFilter({ ...this.filter, packageName, pid: process.pid });
    this.postMessage({ type: 'onlyThisAppApplied', packageName, pid: process.pid });
  }
  private async exportLogs(entries: string[] | undefined, onlySelected: boolean): Promise<void> {
    const payload = entries?.filter(Boolean).join('\n') || '';
    if (!payload) {
      this.postMessage({ type: 'error', message: onlySelected ? 'No selected logs to export.' : 'No logs to export.' });
      return;
    }
    const uri = await vscode.window.showSaveDialog({
      title: onlySelected ? 'Export Selected Logs' : 'Export Logs',
      filters: { 'Log files': ['log', 'txt'] },
      saveLabel: 'Export',
    });
    if (!uri) {
      return;
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(payload, 'utf8'));
    showInfo(`Log export saved: ${uri.fsPath}`);
  }
  private async openStackSource(file: string, line: number): Promise<void> {
    if (!/^[\w.$-]+\.(?:kt|java)$/.test(file) || !Number.isInteger(line) || line < 1) {
      this.postMessage({ type: 'error', message: 'Invalid stack trace source location.' });
      return;
    }
    const matches = await vscode.workspace.findFiles(
      `**/${file}`,
      '**/{build,.gradle,node_modules}/**',
      20
    );
    if (matches.length === 0) {
      this.postMessage({ type: 'error', message: `Source file not found in workspace: ${file}` });
      return;
    }
    let target = matches[0];
    if (matches.length > 1) {
      const picked = await vscode.window.showQuickPick(
        matches.map(uri => ({ label: vscode.workspace.asRelativePath(uri), uri })),
        { placeHolder: `Select ${file}` }
      );
      if (!picked) {
        return;
      }
      target = picked.uri;
    }
    const document = await vscode.workspace.openTextDocument(target);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const position = new vscode.Position(Math.min(line - 1, Math.max(0, document.lineCount - 1)), 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
  private async runAppAndFilter(deviceId: string): Promise<void> {
    if (!deviceId) {
      this.postMessage({ type: 'error', message: 'Select a device first.' });
      return;
    }
    await vscode.commands.executeCommand('android-toolkit.runSelectedAlias');
    await this.applyOnlyThisApp(deviceId);
  }
  private async sendDeviceList(): Promise<void> {
    if (!this.panel.visible) {
      return;
    }
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
    this.activeDeviceId = deviceId;
    this.resumeStreamOnVisible = false;
    if (!this.panel.visible) {
      this.resumeStreamOnVisible = true;
      this.postMessage({ type: 'state', state: 'stopped' });
      return;
    }
    this.pendingEntries = [];
    this.stream = logcatManager.getStream(deviceId);
    this.stream.setFilter(this.filter);
    this.stream.on('entry', (entry: LogEntry) => {
      this.pendingEntries.push(this.serializeEntry(entry));
      this.scheduleEntryFlush();
    });
    this.stream.on('state', (state) => {
      this.postMessage({ type: 'state', state });
    });
    this.stream.on('error', (message) => {
      this.postMessage({ type: 'error', message });
      showError(`Logcat: ${message}`);
    });
    this.stream.on('cleared', () => {
      this.postMessage({ type: 'cleared' });
    });
    this.stream.start();
    this.syncPidRefresh();
    const existingEntries = this.stream.getFilteredEntries();
    this.postMessage({
      type: 'entries',
      entries: existingEntries.map(e => this.serializeEntry(e)),
    });
  }
  private scheduleEntryFlush(): void {
    if (this.pendingEntries.length >= this.flushBatchSize) {
      this.flushPendingEntries();
      return;
    }
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flushPendingEntries();
    }, this.flushIntervalMs);
  }
  private flushPendingEntries(): void {
    if (this.pendingEntries.length === 0) {
      return;
    }
    const batch = this.pendingEntries.splice(0, this.flushBatchSize);
    this.postMessage({ type: 'entriesBatch', entries: batch });
    if (this.pendingEntries.length > 0) {
      this.scheduleEntryFlush();
    }
  }
  private stopStream(options?: { preserveResumeIntent?: boolean }): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.pendingEntries = [];
    if (this.stream) {
      this.stream.removeAllListeners();
      this.stream.stop();
      this.stream = null;
    }
    if (!options?.preserveResumeIntent) {
      this.resumeStreamOnVisible = false;
    }
    if (this.pidRefreshTimer) {
      clearInterval(this.pidRefreshTimer);
      this.pidRefreshTimer = undefined;
    }
  }

  private startDevicePolling(): void {
    if (this.devicePollTimer) {
      return;
    }
    this.devicePollTimer = setInterval(() => {
      if (!this.panel.visible) {
        return;
      }
      void this.sendDeviceList();
    }, 4000);
  }

  private stopDevicePolling(): void {
    if (!this.devicePollTimer) {
      return;
    }
    clearInterval(this.devicePollTimer);
    this.devicePollTimer = undefined;
  }

  private handleVisibilityChanged(): void {
    if (this.panel.visible) {
      this.startDevicePolling();
      void this.sendDeviceList();
      if (this.resumeStreamOnVisible && this.activeDeviceId) {
        const deviceId = this.activeDeviceId;
        this.resumeStreamOnVisible = false;
        void this.startStream(deviceId);
      }
      return;
    }
    this.stopDevicePolling();
    if (this.stream && this.activeDeviceId) {
      this.resumeStreamOnVisible = true;
      this.stopStream({ preserveResumeIntent: true });
    }
  }
  private setFilter(filter: LogFilter): void {
    this.filter = {
      ...filter,
      packageName: filter.packageName ?? (typeof filter.pid === 'number' ? this.filter.packageName : undefined),
    };
    this.syncPidRefresh();
    if (this.stream) {
      this.stream.setFilter(this.filter);
      const entries = this.stream.getFilteredEntries();
      this.postMessage({
        type: 'entries',
        entries: entries.map(e => this.serializeEntry(e)),
      });
    }
  }
  private syncPidRefresh(): void {
    if (this.pidRefreshTimer) {
      clearInterval(this.pidRefreshTimer);
      this.pidRefreshTimer = undefined;
    }
    if (!this.filter.packageName || !this.activeDeviceId) {
      return;
    }
    this.pidRefreshTimer = setInterval(() => {
      if (!this.panel.visible || !this.activeDeviceId || !this.filter.packageName) {
        return;
      }
      void waitForAppPid(this.activeDeviceId, this.filter.packageName, { attempts: 1, intervalMs: 0 })
        .then(process => {
          if (!process.pid || process.pid === this.filter.pid) {
            return;
          }
          this.filter = { ...this.filter, pid: process.pid };
          this.stream?.setFilter(this.filter);
          this.postMessage({ type: 'onlyThisAppApplied', packageName: this.filter.packageName, pid: process.pid });
          this.postMessage({ type: 'pidChanged', packageName: this.filter.packageName, pid: process.pid });
        });
    }, 2500);
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
      kind: entry.kind,
    };
  }
  private postMessage(message: object): void {
    this.panel.webview.postMessage(message);
  }
  private getHtmlContent(): string {
    const themeVars = getWebviewThemeStyle();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logcat Viewer</title>
  <style>
    ${themeVars}
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-widget-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--at-font-size, 13px);
      background: var(--bg);
      color: var(--fg);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .toolbar {
      display: flex;
      gap: var(--at-space-2);
      padding: var(--at-space-2);
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
      align-items: center;
    }
    select, input, button {
      font-family: inherit;
      font-size: var(--at-type-label);
      padding: var(--at-control-padding-y, 6px) var(--at-control-padding-x, 8px);
      border: 1px solid var(--border);
      border-radius: var(--at-radius-sm);
      background: var(--input-bg);
      color: var(--input-fg);
    }
    button {
      cursor: pointer;
      min-height: var(--at-table-row-height, 34px);
      font-weight: 600;
    }
    button.btn-primary { background: var(--at-info); color: var(--at-info-contrast); border-color: transparent; }
    button.btn-secondary { background: transparent; color: var(--fg); }
    button.btn-tertiary { background: transparent; border-style: dashed; color: var(--vscode-descriptionForeground); font-weight: 500; }
    button.secondary { background: transparent; color: var(--fg); }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-stop { background: var(--at-error); color: var(--at-error-contrast); border-color: transparent; }
    .btn-clear { background: transparent; color: var(--fg); }
    input[type="text"] { width: 150px; }
    .status {
      margin-left: auto;
      font-size: var(--at-type-helper);
      color: var(--vscode-descriptionForeground);
    }
    .status.running { color: #4caf50; }
    .status.error { color: #f44336; }
    .log-container {
      flex: 1;
      overflow-y: auto;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: var(--at-type-label);
      padding: var(--at-space-1);
    }
    .log-line {
      display: flex;
      padding: var(--at-space-1);
      border-radius: 2px;
      cursor: pointer;
    }
    .log-line.kind-crash { background: color-mix(in srgb, var(--at-error) 18%, transparent); border-left: 3px solid var(--at-error); }
    .log-line.kind-anr { background: color-mix(in srgb, var(--at-warn) 18%, transparent); border-left: 3px solid var(--at-warn); }
    .log-line.kind-stacktrace { padding-left: 12px; opacity: 0.92; }
    .source-link { margin-left: 8px; min-height: 20px; padding: 1px 6px; font-size: 11px; }
    .log-line.selected { outline: 1px solid #4fc3f7; background: #4fc3f722; }
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
    <button id="startBtn" class="btn-primary">Start</button>
    <button id="stopBtn" class="btn-stop" disabled>Stop</button>
    <button id="clearBtn" class="btn-clear btn-secondary">Clear</button>
    <select id="levelSelect">
      <option value="V">Verbose+</option>
      <option value="D">Debug+</option>
      <option value="I">Info+</option>
      <option value="W">Warning+</option>
      <option value="E">Error+</option>
    </select>
    <input type="text" id="tagFilter" placeholder="Filter by tag...">
    <input type="text" id="searchFilter" placeholder="Search...">
    <select id="presetSelect">
      <option value="">Presets</option>
    </select>
    <input type="text" id="presetName" placeholder="Preset name">
    <button id="savePresetBtn" class="btn-secondary">Save</button>
    <button id="pinPresetBtn" class="btn-tertiary">Pin</button>
    <button id="deletePresetBtn" class="btn-tertiary">Delete</button>
    <select id="sessionSelect">
      <option value="">Sessions</option>
    </select>
    <input type="text" id="sessionName" placeholder="Session name">
    <button id="saveSessionBtn" class="btn-secondary">Save Session</button>
    <button id="runSessionBtn" class="btn-primary">Run Session</button>
    <button id="errorsBtn" class="btn-tertiary">Errors</button>
    <button id="warningsBtn" class="btn-tertiary">Warnings+</button>
    <button id="onlyAppBtn" class="btn-secondary">Only this app</button>
    <button id="exportSelectedBtn" class="btn-tertiary">Export selected</button>
    <button id="exportAllBtn" class="btn-tertiary">Export all</button>
    <span id="bufferInfo" class="status" style="margin-left:8px;">Rendered: 0</span>
    <span id="status" class="status">Stopped</span>
  </div>
  <div class="toolbar" id="pinnedToolbar" style="padding-top:0"></div>
    <div class="log-container" id="logContainer">
      <div class="empty-state" id="emptyState">Select a device and click Start to view logs</div>
    </div>
  <script>
    const vscode = acquireVsCodeApi();
    const deviceSelect = document.getElementById('deviceSelect');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const clearBtn = document.getElementById('clearBtn');
    const levelSelect = document.getElementById('levelSelect');
    const tagFilter = document.getElementById('tagFilter');
    const searchFilter = document.getElementById('searchFilter');
    const presetSelect = document.getElementById('presetSelect');
    const presetName = document.getElementById('presetName');
    const savePresetBtn = document.getElementById('savePresetBtn');
    const pinPresetBtn = document.getElementById('pinPresetBtn');
    const deletePresetBtn = document.getElementById('deletePresetBtn');
    const sessionSelect = document.getElementById('sessionSelect');
    const sessionName = document.getElementById('sessionName');
    const saveSessionBtn = document.getElementById('saveSessionBtn');
    const runSessionBtn = document.getElementById('runSessionBtn');
    const errorsBtn = document.getElementById('errorsBtn');
    const warningsBtn = document.getElementById('warningsBtn');
    const onlyAppBtn = document.getElementById('onlyAppBtn');
    const exportSelectedBtn = document.getElementById('exportSelectedBtn');
    const exportAllBtn = document.getElementById('exportAllBtn');
    const pinnedToolbar = document.getElementById('pinnedToolbar');
    const bufferInfoEl = document.getElementById('bufferInfo');
    const statusEl = document.getElementById('status');
    const logContainer = document.getElementById('logContainer');
    const MAX_RENDERED_LINES = 1500;
    let isRunning = false;
    let autoScroll = true;
    const selectedLogLines = new Set();
    let allRenderedLines = [];
    let pinnedPresets = [];
    let onlyAppPid = undefined;
    let droppedLines = 0;
    vscode.postMessage({ type: 'getDevices' });
    vscode.postMessage({ type: 'getPresets' });
    vscode.postMessage({ type: 'getSessions' });
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
      droppedLines = 0;
      updateBufferInfo();
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
    logContainer.addEventListener('click', (e) => {
      const target = e.target.closest('button[data-empty-action]');
      if (!target) return;
      const action = target.getAttribute('data-empty-action');
      if (action === 'startEmulator') {
        vscode.postMessage({ type: 'startEmulator' });
      } else if (action === 'startAppAndFilter') {
        vscode.postMessage({ type: 'runAppAndFilter', deviceId: deviceSelect.value });
      } else if (action === 'startStream' && deviceSelect.value) {
        vscode.postMessage({ type: 'startStream', deviceId: deviceSelect.value });
      }
    });
    presetSelect.addEventListener('change', () => {
      const name = presetSelect.value;
      if (name) {
        vscode.postMessage({ type: 'applyPreset', name });
      }
    });
    savePresetBtn.addEventListener('click', () => {
      const name = presetName.value.trim();
      if (!name) { return; }
      vscode.postMessage({
        type: 'savePreset',
        name,
        filter: {
          minLevel: levelSelect.value,
          tag: tagFilter.value || undefined,
          search: searchFilter.value || undefined,
        }
      });
    });
    deletePresetBtn.addEventListener('click', () => {
      const name = presetSelect.value;
      if (!name) { return; }
      vscode.postMessage({ type: 'deletePreset', name });
    });
    pinPresetBtn.addEventListener('click', () => {
      const name = presetSelect.value;
      if (!name) { return; }
      vscode.postMessage({ type: 'togglePinPreset', name });
    });
    saveSessionBtn.addEventListener('click', () => {
      const name = sessionName.value.trim();
      const deviceId = deviceSelect.value;
      if (!name || !deviceId) { return; }
      vscode.postMessage({
        type: 'saveSession',
        name,
        deviceId,
        filter: {
          minLevel: levelSelect.value,
          tag: tagFilter.value || undefined,
          search: searchFilter.value || undefined,
        }
      });
    });
    runSessionBtn.addEventListener('click', () => {
      const name = sessionSelect.value;
      if (!name) { return; }
      vscode.postMessage({ type: 'runSession', name });
    });
    errorsBtn.addEventListener('click', () => {
      levelSelect.value = 'E';
      sendFilter();
    });
    warningsBtn.addEventListener('click', () => {
      levelSelect.value = 'W';
      sendFilter();
    });
    onlyAppBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'onlyThisApp', deviceId: deviceSelect.value });
    });
    exportSelectedBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'exportLogs', onlySelected: true, entries: Array.from(selectedLogLines.values()) });
    });
    exportAllBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'exportLogs', onlySelected: false, entries: allRenderedLines });
    });
    function sendFilter() {
      vscode.postMessage({
        type: 'setFilter',
        filter: {
          minLevel: levelSelect.value,
          pid: onlyAppPid,
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
          if (!message.devices || message.devices.length === 0) {
            setEmptyState('no-device');
          } else if (logContainer.children.length === 0 || (logContainer.firstElementChild && logContainer.firstElementChild.classList.contains('empty-state'))) {
            setEmptyState('no-logs');
          }
          break;
        case 'state':
          isRunning = message.state === 'running';
          startBtn.disabled = isRunning;
          stopBtn.disabled = !isRunning;
          deviceSelect.disabled = isRunning;
          statusEl.textContent = message.state.charAt(0).toUpperCase() + message.state.slice(1);
          statusEl.className = 'status ' + message.state;
          if (!isRunning && allRenderedLines.length === 0) {
            setEmptyState(deviceSelect.value ? 'no-logs' : 'no-device');
          }
          break;
        case 'entry':
          appendEntry(message.entry);
          break;
        case 'entriesBatch':
          appendEntriesBatch(message.entries || []);
          break;
        case 'entries':
          logContainer.innerHTML = '';
          selectedLogLines.clear();
          allRenderedLines = [];
          droppedLines = 0;
          appendEntriesBatch(message.entries || []);
          updateBufferInfo();
          if (!message.entries || message.entries.length === 0) {
            setEmptyState(deviceSelect.value ? 'no-logs' : 'no-device');
          }
          break;
        case 'cleared':
          logContainer.innerHTML = '';
          allRenderedLines = [];
          selectedLogLines.clear();
          setEmptyState(deviceSelect.value ? 'no-logs' : 'no-device');
          break;
        case 'error':
          console.error('Logcat error:', message.message);
          break;
        case 'presets':
          presetSelect.innerHTML = '<option value=\"\">Presets</option>';
          pinnedPresets = message.pinned || [];
          message.presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            presetSelect.appendChild(opt);
          });
          renderPinnedPresets();
          break;
        case 'sessions':
          sessionSelect.innerHTML = '<option value=\"\">Sessions</option>';
          message.sessions.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = s.name;
            sessionSelect.appendChild(opt);
          });
          break;
        case 'sessionApplied':
          if (message.session) {
            deviceSelect.value = message.session.deviceId;
            levelSelect.value = message.session.filter.minLevel || 'V';
            tagFilter.value = message.session.filter.tag || '';
            searchFilter.value = message.session.filter.search || '';
            sendFilter();
          }
          break;
        case 'presetApplied':
          if (message.filter) {
            levelSelect.value = message.filter.minLevel || 'V';
            tagFilter.value = message.filter.tag || '';
            searchFilter.value = message.filter.search || '';
            sendFilter();
          }
          break;
        case 'onlyThisAppApplied':
          onlyAppPid = message.pid;
          sendFilter();
          break;
        case 'pidChanged':
          statusEl.textContent = 'Running · PID ' + message.pid;
          break;
      }
    });
    function renderPinnedPresets() {
      pinnedToolbar.innerHTML = '';
      if (!pinnedPresets || pinnedPresets.length === 0) {
        return;
      }
      const title = document.createElement('span');
      title.textContent = 'Pinned:';
      title.style.opacity = '0.8';
      pinnedToolbar.appendChild(title);
      pinnedPresets.forEach(name => {
        const b = document.createElement('button');
        b.textContent = name;
        b.className = 'secondary';
        b.addEventListener('click', () => vscode.postMessage({ type: 'applyPreset', name }));
        pinnedToolbar.appendChild(b);
      });
    }
    function updateBufferInfo() {
      bufferInfoEl.textContent = 'Rendered: ' + logContainer.children.length + ' | Dropped: ' + droppedLines;
    }
    function setEmptyState(kind) {
      let html = '';
      if (kind === 'no-device') {
        html = '<div>No device detected.</div><div style=\"margin-top:8px;\"><button data-empty-action=\"startEmulator\">Start emulator</button></div>';
      } else if (kind === 'no-logs') {
        html = '<div>No logs yet for selected device.</div><div style=\"margin-top:8px;display:flex;gap:8px;justify-content:center;\"><button data-empty-action=\"startStream\">Start stream</button><button data-empty-action=\"startAppAndFilter\">Start app + filter</button></div>';
      } else {
        html = 'Select a device and click Start to view logs';
      }
      logContainer.innerHTML = '<div class=\"empty-state\">' + html + '</div>';
      updateBufferInfo();
    }
    function clearEmptyStateIfNeeded() {
      const first = logContainer.firstElementChild;
      if (first && first.classList && first.classList.contains('empty-state')) {
        logContainer.innerHTML = '';
      }
    }
    function appendEntry(entry) {
      const div = document.createElement('div');
      div.className = 'log-line kind-' + (entry.kind || 'normal');
      const rawLine = entry.timestamp + ' ' + entry.level + '/' + entry.tag + ': ' + entry.message;
      div.dataset.raw = rawLine;
      allRenderedLines.push(rawLine);
      div.addEventListener('click', () => {
        if (selectedLogLines.has(rawLine)) {
          selectedLogLines.delete(rawLine);
          div.classList.remove('selected');
        } else {
          selectedLogLines.add(rawLine);
          div.classList.add('selected');
        }
      });
      const sourceMatch = entry.message.match(/\(([\w.$-]+\.(?:kt|java)):(\d+)\)/);
      const sourceLink = sourceMatch
        ? '<button class="source-link" data-source-file="' + escapeHtml(sourceMatch[1]) + '" data-source-line="' + sourceMatch[2] + '">Open ' + escapeHtml(sourceMatch[1]) + ':' + sourceMatch[2] + '</button>'
        : '';
      div.innerHTML = 
        '<span class="log-time">' + entry.timestamp.substring(6) + '</span>' +
        '<span class="log-level level-' + entry.level + '">' + entry.level + '</span>' +
        '<span class="log-tag" title="' + escapeHtml(entry.tag) + '">' + escapeHtml(entry.tag) + '</span>' +
        '<span class="log-msg">' + escapeHtml(entry.message) + sourceLink + '</span>';
      const sourceButton = div.querySelector('.source-link');
      if (sourceButton) {
        sourceButton.addEventListener('click', event => {
          event.stopPropagation();
          vscode.postMessage({
            type: 'openSource',
            file: sourceButton.dataset.sourceFile,
            line: Number(sourceButton.dataset.sourceLine),
          });
        });
      }
      return div;
    }
    function trimRenderedLines() {
      while (logContainer.children.length > MAX_RENDERED_LINES) {
        const first = logContainer.firstChild;
        const raw = first && first.dataset ? first.dataset.raw : undefined;
        if (raw) {
          selectedLogLines.delete(raw);
        }
        logContainer.removeChild(first);
        allRenderedLines.shift();
        droppedLines++;
      }
    }
    function appendEntriesBatch(entries) {
      if (!entries || entries.length === 0) {
        return;
      }
      clearEmptyStateIfNeeded();
      const frag = document.createDocumentFragment();
      for (const entry of entries) {
        frag.appendChild(appendEntry(entry));
      }
      logContainer.appendChild(frag);
      trimRenderedLines();
      updateBufferInfo();
      if (autoScroll) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    }
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    updateBufferInfo();
    setEmptyState('initial');
  </script>
</body>
</html>`;
  }
  public dispose(): void {
    LogcatPanel.currentPanel = undefined;
    this.stopDevicePolling();
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
