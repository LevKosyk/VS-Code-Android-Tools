import * as vscode from 'vscode';

export interface RunFixSuggestion {
  id: string;
  label: string;
}

export interface RunActionResult {
  success: boolean;
  message: string;
  gradleError?: string;
  fixSuggestions?: RunFixSuggestion[];
  errorLocation?: { file: string; line: number; column?: number };
}

export interface RunHistoryEntry {
  id: string;
  label: string;
  moduleName: string;
  variant: string;
  deviceId: string;
  timestamp: number;
}

export interface RunPanelHandlers {
  getDevices: () => Promise<Array<{ id: string; label: string; type: string }>>;
  getModules: () => Promise<string[]>;
  getVariants: (moduleName: string) => Promise<{ variants: string[]; selected: string; flavors: string[]; buildTypes: string[]; selectedFlavor: string; selectedBuildType: string }>;
  setVariant: (moduleName: string, variant: string) => Promise<void>;
  setFlavor: (moduleName: string, flavor: string) => Promise<void>;
  setBuildType: (moduleName: string, buildType: string) => Promise<void>;
  build: (moduleName: string, deviceId: string) => Promise<RunActionResult>;
  install: (moduleName: string, deviceId: string) => Promise<RunActionResult>;
  run: (moduleName: string, deviceId: string) => Promise<RunActionResult>;
  stop: (moduleName: string, deviceId: string) => Promise<RunActionResult>;
  clean: () => Promise<RunActionResult>;
  getHistory: () => Promise<RunHistoryEntry[]>;
  rerunHistory: (historyId: string) => Promise<RunActionResult>;
  runPreset: (presetId: string, moduleName: string) => Promise<RunActionResult>;
  applyFix: (fixId: string, moduleName: string, deviceId: string) => Promise<RunActionResult>;
  getHealth: () => Promise<{ state: 'ok' | 'warning' | 'error'; message: string }>;
  quickAction: (actionId: string, moduleName: string, deviceId: string) => Promise<RunActionResult>;
}

export class RunPanel {
  public static currentPanel: RunPanel | undefined;
  private static readonly viewType = 'androidRunPanel';
  private readonly panel: vscode.WebviewPanel;
  private readonly handlers: RunPanelHandlers;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, handlers: RunPanelHandlers) {
    this.panel = panel;
    this.handlers = handlers;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(handlers: RunPanelHandlers): RunPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (RunPanel.currentPanel) {
      RunPanel.currentPanel.panel.reveal(column);
      return RunPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      RunPanel.viewType,
      'Android Run',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    RunPanel.currentPanel = new RunPanel(panel, handlers);
    return RunPanel.currentPanel;
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    const type = typeof message?.type === 'string' ? message.type : '';
    try {
      switch (type) {
      case 'getDevices': {
        const devices = await this.handlers.getDevices();
        this.postMessage({ type: 'devices', devices });
        break;
      }
      case 'getModules': {
        const modules = await this.handlers.getModules();
        this.postMessage({ type: 'modules', modules });
        break;
      }
      case 'getVariants': {
        const moduleName = String(message.moduleName || '');
        const payload = await this.handlers.getVariants(moduleName);
        this.postMessage({ type: 'variants', moduleName, ...payload });
        break;
      }
      case 'setVariant': {
        const moduleName = String(message.moduleName || '');
        const variant = String(message.variant || '');
        if (moduleName && variant) {
          await this.handlers.setVariant(moduleName, variant);
        }
        break;
      }
      case 'setFlavor': {
        const moduleName = String(message.moduleName || '');
        const flavor = String(message.flavor || '');
        if (moduleName) {
          await this.handlers.setFlavor(moduleName, flavor);
        }
        break;
      }
      case 'setBuildType': {
        const moduleName = String(message.moduleName || '');
        const buildType = String(message.buildType || '');
        if (moduleName && buildType) {
          await this.handlers.setBuildType(moduleName, buildType);
        }
        break;
      }
      case 'build': {
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const result = await this.handlers.build(moduleName, deviceId);
        this.postMessage({ type: 'result', action: 'build', ...result });
        break;
      }
      case 'install': {
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const result = await this.handlers.install(moduleName, deviceId);
        this.postMessage({ type: 'result', action: 'install', ...result });
        break;
      }
      case 'run': {
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const result = await this.handlers.run(moduleName, deviceId);
        this.postMessage({ type: 'result', action: 'run', ...result });
        break;
      }
      case 'stop': {
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const result = await this.handlers.stop(moduleName, deviceId);
        this.postMessage({ type: 'result', action: 'stop', ...result });
        break;
      }
      case 'clean': {
        const result = await this.handlers.clean();
        this.postMessage({ type: 'result', action: 'clean', ...result });
        break;
      }
      case 'getHistory': {
        const history = await this.handlers.getHistory();
        this.postMessage({ type: 'history', history });
        break;
      }
      case 'rerunHistory': {
        const historyId = String(message.historyId || '');
        const result = await this.handlers.rerunHistory(historyId);
        this.postMessage({ type: 'result', action: 'rerun', ...result });
        const history = await this.handlers.getHistory();
        this.postMessage({ type: 'history', history });
        break;
      }
      case 'runPreset': {
        const presetId = String(message.presetId || '');
        const moduleName = String(message.moduleName || '');
        const result = await this.handlers.runPreset(presetId, moduleName);
        this.postMessage({ type: 'result', action: 'preset', ...result });
        const history = await this.handlers.getHistory();
        this.postMessage({ type: 'history', history });
        break;
      }
      case 'applyFix': {
        const fixId = String(message.fixId || '');
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const result = await this.handlers.applyFix(fixId, moduleName, deviceId);
        this.postMessage({ type: 'result', action: 'fix', ...result });
        const [devices, modules] = await Promise.all([
          this.handlers.getDevices(),
          this.handlers.getModules(),
        ]);
        this.postMessage({ type: 'devices', devices });
        this.postMessage({ type: 'modules', modules });
        break;
      }
      case 'quickAction': {
        const actionId = String(message.actionId || '');
        const moduleName = String(message.moduleName || '');
        const deviceId = String(message.deviceId || '');
        const result = await this.handlers.quickAction(actionId, moduleName, deviceId);
        this.postMessage({ type: 'result', action: 'quickAction', ...result });
        break;
      }
      case 'openGradleOutput': {
        await vscode.commands.executeCommand('android-toolkit.showGradleOutput');
        break;
      }
      case 'releaseQualityGate': {
        await vscode.commands.executeCommand('android-toolkit.releaseQualityGate');
        this.postMessage({
          type: 'result',
          action: 'releaseQualityGate',
          success: true,
          message: 'Release quality gate finished.',
        });
        break;
      }
      case 'openErrorLocation': {
        const file = String(message.file || '');
        const line = Number(message.line || 1);
        const column = Number(message.column || 1);
        if (!file) {
          break;
        }
        const uri = vscode.Uri.file(file);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        const pos = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos));
        break;
      }
      case 'refresh': {
        const [devices, modules, history, health] = await Promise.all([
          this.handlers.getDevices(),
          this.handlers.getModules(),
          this.handlers.getHistory(),
          this.handlers.getHealth(),
        ]);
        this.postMessage({ type: 'devices', devices });
        this.postMessage({ type: 'modules', modules });
        this.postMessage({ type: 'history', history });
        this.postMessage({ type: 'health', health });
        break;
      }
      default:
        this.postMessage({
          type: 'result',
          action: 'protocol',
          success: false,
          message: `Unsupported panel action: ${type || 'unknown'}`,
        });
        break;
      }
    } catch (error) {
      this.postMessage({
        type: 'result',
        action: 'protocol',
        success: false,
        message: error instanceof Error ? error.message : 'Panel action failed',
      });
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
  <title>Android Run</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-widget-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --muted: var(--vscode-descriptionForeground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: 13px; background: var(--bg); color: var(--fg); padding: 12px; }
    .row { display: flex; gap: 8px; align-items: center; }
    .col { display: flex; flex-direction: column; gap: 6px; }
    .card { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 12px; }
    .title { font-weight: 600; margin-bottom: 8px; font-size: 13px; }
    select, button {
      font-family: inherit;
      font-size: 12px;
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--input-bg);
      color: var(--input-fg);
    }
    button { background: var(--btn-bg); color: var(--btn-fg); border: none; cursor: pointer; font-weight: 600; }
    button:hover { opacity: 0.92; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button:focus-visible, select:focus-visible, input:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    button.secondary { background: transparent; border: 1px solid var(--border); color: var(--fg); }
    .status { color: var(--muted); margin-top: 8px; border-radius: 8px; border: 1px solid var(--border); padding: 8px 10px; min-height: 36px; display: flex; align-items: center; }
    .status.loading { color: #0369a1; border-color: #7dd3fc; background: #e0f2fe44; }
    .status.success { color: #166534; border-color: #86efac; background: #dcfce744; }
    .status.error { color: #b91c1c; border-color: #fca5a5; background: #fee2e244; font-weight: 600; }
    .actions-row { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
    .actions-row button { width: 100%; }
    .preset-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .pinned-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .pinned-row button { width: auto; }
    .preset-line { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
    .preset-line:last-child { margin-bottom: 0; }
    .pin-btn { width: 34px; min-width: 34px; padding: 7px 0; text-align: center; }
    .history-tools { display: grid; grid-template-columns: 1fr 170px; gap: 8px; margin-bottom: 8px; }
    .history-tools input {
      font-family: inherit;
      font-size: 12px;
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--input-bg);
      color: var(--input-fg);
    }
    .history-list { border: 1px solid var(--border); border-radius: 8px; max-height: 130px; overflow: auto; }
    .history-item { padding: 8px; border-bottom: 1px solid var(--border); cursor: pointer; }
    .history-item:last-child { border-bottom: none; }
    .history-item:hover { background: #ffffff12; }
    .history-item.sel { background: #22c55e22; }
    .history-meta { color: var(--muted); font-size: 11px; margin-top: 3px; }
    .health { margin-top: 8px; border-radius: 8px; border: 1px solid var(--border); padding: 8px 10px; font-size: 12px; }
    .health.ok { color: #166534; border-color: #86efac; background: #dcfce744; }
    .health.warning { color: #92400e; border-color: #fdba74; background: #ffedd544; }
    .health.error { color: #b91c1c; border-color: #fca5a5; background: #fee2e244; }
    .error-box { margin-top: 8px; border: 1px solid #fca5a5; background: #fee2e244; border-radius: 8px; padding: 8px; display: none; }
    .error-box.visible { display: block; }
    .error-title { color: #b91c1c; font-weight: 700; margin-bottom: 6px; }
    .error-text { color: #7f1d1d; white-space: pre-wrap; font-family: var(--vscode-editor-font-family), monospace; font-size: 12px; max-height: 140px; overflow: auto; margin-bottom: 8px; }
    .error-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
    .fix-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .fix-row button { width: auto; }
    .quick-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
    .quick-row button { width: 100%; }
    .hint-box { border: 1px dashed var(--border); border-radius: 8px; padding: 8px; margin-top: 8px; display: none; }
    .hint-box.visible { display: block; }
    .hint-title { font-weight: 600; margin-bottom: 6px; }
    .hint-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    @media (max-width: 980px) {
      .actions-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .preset-row { grid-template-columns: 1fr; }
      .quick-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">Target</div>
    <div class="row">
      <div class="col" style="flex:1"><label>Module</label><select id="moduleSelect" aria-label="Module selector"></select></div>
      <div class="col" style="flex:1"><label>Device</label><select id="deviceSelect" aria-label="Device selector"></select></div>
      <div class="col" style="flex:1"><label>Variant</label><select id="variantSelect" aria-label="Variant selector"></select></div>
      <div class="col" style="flex:1"><label>Flavor</label><select id="flavorSelect" aria-label="Flavor selector"></select></div>
      <div class="col" style="flex:1"><label>Build Type</label><select id="buildTypeSelect" aria-label="Build type selector"></select></div>
      <button id="refreshBtn" class="secondary" aria-label="Refresh run panel">Refresh</button>
    </div>
  </div>

  <div class="card">
    <div class="title">Actions</div>
    <div class="actions-row">
      <button id="buildBtn" aria-label="Build selected variant">Build</button>
      <button id="installBtn" aria-label="Install app on selected device">Install</button>
      <button id="runBtn" aria-label="Run app on selected device">Run</button>
      <button id="stopBtn" class="secondary" aria-label="Stop app on selected device">Stop</button>
      <button id="cleanBtn" class="secondary" aria-label="Clean project">Clean</button>
      <button id="releaseGateBtn" class="secondary" aria-label="Run release quality gate">Release Gate</button>
    </div>
    <div id="status" class="status" role="status" aria-live="polite">Ready</div>
    <div id="hintBox" class="hint-box">
      <div id="hintTitle" class="hint-title"></div>
      <div id="hintActions" class="hint-actions"></div>
    </div>
    <div id="health" class="health">Runtime health: checking...</div>
    <div id="errorBox" class="error-box" role="alert" aria-live="assertive">
      <div class="error-title">Gradle Error</div>
      <div id="errorText" class="error-text"></div>
      <div class="error-actions">
        <button id="openErrLocationBtn" class="secondary">Open Error Location</button>
        <button id="openGradleBtn" class="secondary">Open Gradle Output</button>
      </div>
      <div id="fixRow" class="fix-row"></div>
    </div>
  </div>

  <div class="card">
    <div class="title">Quick Presets</div>
    <div id="pinnedPresets" class="pinned-row"></div>
    <div class="preset-line">
      <button id="presetDebugEmuBtn">Debug on Emulator</button>
      <button id="pinDebugEmuBtn" class="secondary pin-btn" title="Pin preset">☆</button>
    </div>
    <div class="preset-line">
      <button id="presetReleaseDeviceBtn">Release on Device</button>
      <button id="pinReleaseDeviceBtn" class="secondary pin-btn" title="Pin preset">☆</button>
    </div>
  </div>

  <div class="card">
    <div class="title">Quick Actions</div>
    <div class="quick-row">
      <button id="qaRunBtn" class="secondary">Run Selected</button>
      <button id="qaStopBtn" class="secondary">Stop Selected</button>
      <button id="qaLogcatBtn" class="secondary">Logcat This App</button>
      <button id="qaHealthBtn" class="secondary">Health Wizard</button>
      <button id="qaReleaseGateBtn" class="secondary">Release Gate</button>
    </div>
  </div>

  <div class="card">
    <div class="title">Recent Runs</div>
    <div class="history-tools">
      <input id="historySearch" placeholder="Search module, variant, device" />
      <select id="historyFilter">
        <option value="all">All</option>
        <option value="module">This module</option>
        <option value="device">This device</option>
      </select>
    </div>
    <div id="historyList" class="history-list"></div>
    <div class="row" style="margin-top:8px">
      <button id="rerunBtn" class="secondary">Re-run Selected</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const moduleSelect = document.getElementById('moduleSelect');
    const deviceSelect = document.getElementById('deviceSelect');
    const variantSelect = document.getElementById('variantSelect');
    const flavorSelect = document.getElementById('flavorSelect');
    const buildTypeSelect = document.getElementById('buildTypeSelect');
    const statusEl = document.getElementById('status');
    const errorBox = document.getElementById('errorBox');
    const errorText = document.getElementById('errorText');
    const openGradleBtn = document.getElementById('openGradleBtn');
    const openErrLocationBtn = document.getElementById('openErrLocationBtn');
    const fixRow = document.getElementById('fixRow');
    const historyList = document.getElementById('historyList');
    const historySearch = document.getElementById('historySearch');
    const historyFilter = document.getElementById('historyFilter');
    const pinnedPresets = document.getElementById('pinnedPresets');
    const healthEl = document.getElementById('health');
    const hintBox = document.getElementById('hintBox');
    const hintTitle = document.getElementById('hintTitle');
    const hintActions = document.getElementById('hintActions');

    const buildBtn = document.getElementById('buildBtn');
    const installBtn = document.getElementById('installBtn');
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const cleanBtn = document.getElementById('cleanBtn');
    const releaseGateBtn = document.getElementById('releaseGateBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const rerunBtn = document.getElementById('rerunBtn');
    const pinDebugEmuBtn = document.getElementById('pinDebugEmuBtn');
    const pinReleaseDeviceBtn = document.getElementById('pinReleaseDeviceBtn');
    const qaRunBtn = document.getElementById('qaRunBtn');
    const qaStopBtn = document.getElementById('qaStopBtn');
    const qaLogcatBtn = document.getElementById('qaLogcatBtn');
    const qaHealthBtn = document.getElementById('qaHealthBtn');
    const qaReleaseGateBtn = document.getElementById('qaReleaseGateBtn');

    let isBusy = false;
    let selectedHistoryId = '';
    let lastErrorLocation = null;
    let historyItems = [];
    const presetDefs = [
      { id: 'debug-emulator', label: 'Debug on Emulator' },
      { id: 'release-device', label: 'Release on Device' },
    ];
    let pinnedPresetIds = [];
    const persisted = vscode.getState && vscode.getState();
    if (persisted && Array.isArray(persisted.pinnedPresetIds)) {
      pinnedPresetIds = persisted.pinnedPresetIds.filter(v => typeof v === 'string');
    } else {
      pinnedPresetIds = ['debug-emulator'];
    }
    let restore = {
      module: persisted && typeof persisted.module === 'string' ? persisted.module : '',
      device: persisted && typeof persisted.device === 'string' ? persisted.device : '',
      variant: persisted && typeof persisted.variant === 'string' ? persisted.variant : '',
      flavor: persisted && typeof persisted.flavor === 'string' ? persisted.flavor : '',
      buildType: persisted && typeof persisted.buildType === 'string' ? persisted.buildType : '',
      historySearch: persisted && typeof persisted.historySearch === 'string' ? persisted.historySearch : '',
      historyFilter: persisted && typeof persisted.historyFilter === 'string' ? persisted.historyFilter : 'all',
      selectedHistoryId: persisted && typeof persisted.selectedHistoryId === 'string' ? persisted.selectedHistoryId : '',
    };
    if (restore.historySearch) {
      historySearch.value = restore.historySearch;
    }
    if (restore.historyFilter) {
      historyFilter.value = restore.historyFilter;
    }

    function persistPanelState() {
      if (vscode.setState) {
        vscode.setState({
          pinnedPresetIds,
          module: moduleSelect.value,
          device: deviceSelect.value,
          variant: variantSelect.value,
          flavor: flavorSelect.value,
          buildType: buildTypeSelect.value,
          historySearch: historySearch.value,
          historyFilter: historyFilter.value,
          selectedHistoryId,
        });
      }
    }

    function runPreset(presetId) {
      setBusy(true);
      vscode.postMessage({ type: 'runPreset', presetId, moduleName: moduleSelect.value });
      const label = (presetDefs.find(p => p.id === presetId) || { label: presetId }).label;
      setStatus('Running preset: ' + label + '...', 'loading');
    }

    function updatePinButtons() {
      const map = {
        'debug-emulator': pinDebugEmuBtn,
        'release-device': pinReleaseDeviceBtn,
      };
      Object.keys(map).forEach(id => {
        const btn = map[id];
        const pinned = pinnedPresetIds.includes(id);
        btn.textContent = pinned ? '★' : '☆';
        btn.title = pinned ? 'Unpin preset' : 'Pin preset';
      });
    }

    function renderPinnedPresets() {
      pinnedPresets.innerHTML = '';
      const pinned = presetDefs.filter(p => pinnedPresetIds.includes(p.id));
      if (!pinned.length) {
        const muted = document.createElement('span');
        muted.style.color = 'var(--muted)';
        muted.textContent = 'No pinned presets';
        pinnedPresets.appendChild(muted);
        updatePinButtons();
        return;
      }
      pinned.forEach(preset => {
        const b = document.createElement('button');
        b.className = 'secondary';
        b.textContent = preset.label;
        b.addEventListener('click', () => runPreset(preset.id));
        pinnedPresets.appendChild(b);
      });
      updatePinButtons();
    }

    function togglePresetPin(presetId) {
      if (pinnedPresetIds.includes(presetId)) {
        pinnedPresetIds = pinnedPresetIds.filter(id => id !== presetId);
      } else {
        pinnedPresetIds = [...pinnedPresetIds, presetId];
      }
      persistPanelState();
      renderPinnedPresets();
    }

    function updateActionButtons() {
      const hasModule = !!moduleSelect.value;
      const hasDevice = !!deviceSelect.value;
      buildBtn.disabled = isBusy || !hasModule;
      cleanBtn.disabled = isBusy;
      stopBtn.disabled = isBusy || !hasModule || !hasDevice;
      installBtn.disabled = isBusy || !hasModule || !hasDevice;
      runBtn.disabled = isBusy || !hasModule || !hasDevice;
      refreshBtn.disabled = isBusy;
      rerunBtn.disabled = isBusy || !selectedHistoryId;
      releaseGateBtn.disabled = isBusy;
      qaRunBtn.disabled = isBusy || !hasModule || !hasDevice;
      qaStopBtn.disabled = isBusy || !hasModule || !hasDevice;
      qaLogcatBtn.disabled = isBusy || !hasModule;
      qaHealthBtn.disabled = isBusy;
      qaReleaseGateBtn.disabled = isBusy;
      updateEmptyHints();
    }

    function setBusy(next) { isBusy = next; updateActionButtons(); }

    function updateBuildButtonLabel() {
      const variant = variantSelect.value || 'Variant';
      buildBtn.textContent = 'Build ' + variant;
    }

    function setStatus(text, kind = 'neutral') {
      statusEl.textContent = text;
      statusEl.className = 'status';
      if (kind === 'loading' || kind === 'success' || kind === 'error') {
        statusEl.classList.add(kind);
      }
    }
    function setHealth(health) {
      const state = (health && health.state) || 'ok';
      const message = (health && health.message) || 'Runtime health: OK';
      healthEl.className = 'health ' + state;
      healthEl.textContent = message;
    }
    function renderHint(title, fixes) {
      hintTitle.textContent = title;
      hintActions.innerHTML = '';
      (fixes || []).forEach(fix => {
        const b = document.createElement('button');
        b.className = 'secondary';
        b.textContent = fix.label;
        b.addEventListener('click', () => {
          setBusy(true);
          vscode.postMessage({ type: 'applyFix', fixId: fix.id, moduleName: moduleSelect.value, deviceId: deviceSelect.value });
          setStatus('Applying quick fix...', 'loading');
        });
        hintActions.appendChild(b);
      });
      hintBox.classList.add('visible');
    }
    function updateEmptyHints() {
      hintBox.classList.remove('visible');
      const hasModule = !!moduleSelect.value && moduleSelect.value !== 'No modules';
      const hasDevice = !!deviceSelect.value && deviceSelect.value !== 'No online devices';
      if (!hasModule) {
        renderHint('No module selected. Choose a module to run.', [
          { id: 'selectModule', label: 'Select Module' },
          { id: 'openWorkspace', label: 'Open Workspace' },
        ]);
        return;
      }
      if (!hasDevice) {
        renderHint('No online device. Start or select a device.', [
          { id: 'selectDevice', label: 'Select Device' },
          { id: 'openSdkDocs', label: 'SDK Setup Guide' },
        ]);
      }
    }

    function showErrorBox(gradleError, fixes, errorLocation) {
      if (!gradleError) {
        errorBox.classList.remove('visible');
        errorText.textContent = '';
        fixRow.innerHTML = '';
        lastErrorLocation = null;
        openErrLocationBtn.disabled = true;
        return;
      }
      errorText.textContent = gradleError;
      errorBox.classList.add('visible');
      lastErrorLocation = errorLocation || null;
      openErrLocationBtn.disabled = !lastErrorLocation;
      fixRow.innerHTML = '';
      (fixes || []).forEach(fix => {
        const b = document.createElement('button');
        b.className = 'secondary';
        b.textContent = fix.label;
        b.addEventListener('click', () => {
          setBusy(true);
          vscode.postMessage({ type: 'applyFix', fixId: fix.id, moduleName: moduleSelect.value, deviceId: deviceSelect.value });
          setStatus('Applying fix...', 'loading');
        });
        fixRow.appendChild(b);
      });
    }

    function renderHistory(history) {
      historyItems = history || [];
      historyList.innerHTML = '';
      const query = (historySearch.value || '').toLowerCase().trim();
      const filter = historyFilter.value || 'all';
      const filtered = historyItems.filter(h => {
        if (filter === 'module' && moduleSelect.value && h.moduleName !== moduleSelect.value) {
          return false;
        }
        if (filter === 'device' && deviceSelect.value && h.deviceId !== deviceSelect.value) {
          return false;
        }
        if (!query) {
          return true;
        }
        const hay = (h.label + ' ' + h.moduleName + ' ' + h.variant + ' ' + h.deviceId).toLowerCase();
        return hay.includes(query);
      });
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'history-item';
        empty.textContent = historyItems.length ? 'No matches' : 'No recent runs';
        historyList.appendChild(empty);
        selectedHistoryId = '';
        persistPanelState();
        updateActionButtons();
        return;
      }
      filtered.forEach(h => {
        const item = document.createElement('div');
        item.className = 'history-item' + (h.id === selectedHistoryId ? ' sel' : '');
        const ts = new Date(h.timestamp).toLocaleString();
        item.innerHTML = '<div>' + h.label + '</div><div class="history-meta">' + ts + '</div>';
        item.addEventListener('click', () => {
          selectedHistoryId = h.id;
          renderHistory(historyItems);
        });
        historyList.appendChild(item);
      });
      if (!selectedHistoryId) {
        selectedHistoryId = filtered[0].id;
      }
      if (!filtered.some(h => h.id === selectedHistoryId)) {
        selectedHistoryId = filtered[0].id;
      }
      persistPanelState();
      updateActionButtons();
    }

    function refreshAll() {
      vscode.postMessage({ type: 'refresh' });
      vscode.postMessage({ type: 'getHistory' });
    }

    refreshBtn.addEventListener('click', refreshAll);
    openGradleBtn.addEventListener('click', () => vscode.postMessage({ type: 'openGradleOutput' }));
    openErrLocationBtn.addEventListener('click', () => {
      if (!lastErrorLocation) return;
      vscode.postMessage({ type: 'openErrorLocation', ...lastErrorLocation });
    });

    buildBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'build', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatus('Building selected variant...', 'loading');
    });
    installBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'install', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatus('Installing on selected device...', 'loading');
    });
    runBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'run', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatus('Starting app...', 'loading');
    });
    stopBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'stop', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatus('Stopping app...', 'loading');
    });
    cleanBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'clean' });
      setStatus('Cleaning project...', 'loading');
    });
    releaseGateBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'releaseQualityGate' });
      setStatus('Running release quality gate...', 'loading');
    });

    document.getElementById('presetDebugEmuBtn').addEventListener('click', () => runPreset('debug-emulator'));
    document.getElementById('presetReleaseDeviceBtn').addEventListener('click', () => runPreset('release-device'));
    pinDebugEmuBtn.addEventListener('click', () => togglePresetPin('debug-emulator'));
    pinReleaseDeviceBtn.addEventListener('click', () => togglePresetPin('release-device'));

    rerunBtn.addEventListener('click', () => {
      if (!selectedHistoryId) return;
      setBusy(true);
      vscode.postMessage({ type: 'rerunHistory', historyId: selectedHistoryId });
      setStatus('Re-running selected history item...', 'loading');
    });
    qaRunBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: 'run-selected', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatus('Running selected target...', 'loading');
    });
    qaStopBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: 'stop-selected', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatus('Stopping selected target...', 'loading');
    });
    qaLogcatBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: 'logcat-this-app', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatus('Opening Logcat quick view...', 'loading');
    });
    qaHealthBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'quickAction', actionId: 'health-wizard', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatus('Opening health wizard...', 'loading');
    });
    qaReleaseGateBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'releaseQualityGate' });
      setStatus('Running release quality gate...', 'loading');
    });

    moduleSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'getVariants', moduleName: moduleSelect.value });
      persistPanelState();
      updateActionButtons();
    });
    deviceSelect.addEventListener('change', () => {
      persistPanelState();
      updateActionButtons();
    });
    variantSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setVariant', moduleName: moduleSelect.value, variant: variantSelect.value });
      persistPanelState();
      updateBuildButtonLabel();
    });
    flavorSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setFlavor', moduleName: moduleSelect.value, flavor: flavorSelect.value });
      persistPanelState();
      updateVariantFromSelections();
    });
    buildTypeSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setBuildType', moduleName: moduleSelect.value, buildType: buildTypeSelect.value });
      persistPanelState();
      updateVariantFromSelections();
    });
    historySearch.addEventListener('input', () => {
      persistPanelState();
      renderHistory(historyItems);
    });
    historyFilter.addEventListener('change', () => {
      persistPanelState();
      renderHistory(historyItems);
    });
    window.addEventListener('keydown', (e) => {
      const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
      const typingContext = tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement && document.activeElement.isContentEditable);
      const hasModule = !!moduleSelect.value && moduleSelect.value !== 'No modules';
      const hasDevice = !!deviceSelect.value && deviceSelect.value !== 'No online devices';

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (isBusy || !selectedHistoryId) {
          return;
        }
        setBusy(true);
        vscode.postMessage({ type: 'rerunHistory', historyId: selectedHistoryId });
        setStatus('Re-running selected history item...', 'loading');
        return;
      }

      if (e.key === 'Enter' && !typingContext) {
        e.preventDefault();
        if (isBusy || !hasModule || !hasDevice) {
          return;
        }
        setBusy(true);
        vscode.postMessage({ type: 'run', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
        setStatus('Starting app...', 'loading');
      }
    });

    function updateVariantFromSelections() {
      const flavor = flavorSelect.value || '';
      const buildType = buildTypeSelect.value || '';
      if (!buildType) return;
      const variant = flavor ? flavor + buildType : buildType;
      variantSelect.value = variant;
      vscode.postMessage({ type: 'setVariant', moduleName: moduleSelect.value, variant });
      updateBuildButtonLabel();
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'devices') {
        deviceSelect.innerHTML = '';
        if (!message.devices || message.devices.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No online devices';
          deviceSelect.appendChild(opt);
        } else {
          message.devices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.label;
            deviceSelect.appendChild(opt);
          });
          if (restore.device) {
            const exists = Array.from(deviceSelect.options).some(o => o.value === restore.device);
            if (exists) {
              deviceSelect.value = restore.device;
            }
            restore.device = '';
          }
        }
        persistPanelState();
        updateActionButtons();
      }
      if (message.type === 'modules') {
        moduleSelect.innerHTML = '';
        if (!message.modules || message.modules.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No modules';
          moduleSelect.appendChild(opt);
        } else {
          message.modules.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            moduleSelect.appendChild(opt);
          });
          if (restore.module) {
            const exists = Array.from(moduleSelect.options).some(o => o.value === restore.module);
            if (exists) {
              moduleSelect.value = restore.module;
            }
            restore.module = '';
          }
        }
        if (moduleSelect.value) {
          vscode.postMessage({ type: 'getVariants', moduleName: moduleSelect.value });
        }
        persistPanelState();
        updateActionButtons();
      }
      if (message.type === 'variants') {
        variantSelect.innerHTML = '';
        (message.variants || []).forEach(v => {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          variantSelect.appendChild(opt);
        });
        if (message.selected) {
          variantSelect.value = message.selected;
        }
        if (restore.variant) {
          const exists = Array.from(variantSelect.options).some(o => o.value === restore.variant);
          if (exists) {
            variantSelect.value = restore.variant;
          }
          restore.variant = '';
        }

        flavorSelect.innerHTML = '';
        (message.flavors || []).forEach(f => {
          const opt = document.createElement('option');
          opt.value = f;
          opt.textContent = f;
          flavorSelect.appendChild(opt);
        });
        if (message.selectedFlavor) {
          flavorSelect.value = message.selectedFlavor;
        }
        if (restore.flavor) {
          const exists = Array.from(flavorSelect.options).some(o => o.value === restore.flavor);
          if (exists) {
            flavorSelect.value = restore.flavor;
          }
          restore.flavor = '';
        }

        buildTypeSelect.innerHTML = '';
        (message.buildTypes || []).forEach(b => {
          const opt = document.createElement('option');
          opt.value = b;
          opt.textContent = b;
          buildTypeSelect.appendChild(opt);
        });
        if (message.selectedBuildType) {
          buildTypeSelect.value = message.selectedBuildType;
        }
        if (restore.buildType) {
          const exists = Array.from(buildTypeSelect.options).some(o => o.value === restore.buildType);
          if (exists) {
            buildTypeSelect.value = restore.buildType;
          }
          restore.buildType = '';
        }

        updateBuildButtonLabel();
        persistPanelState();
        updateActionButtons();
      }
      if (message.type === 'history') {
        renderHistory(message.history || []);
      }
      if (message.type === 'result') {
        setBusy(false);
        const prefix = message.success ? 'Done:' : 'Error:';
        setStatus(prefix + ' ' + message.message, message.success ? 'success' : 'error');
        showErrorBox(message.success ? '' : (message.gradleError || ''), message.fixSuggestions || [], message.errorLocation);
        if (message.success) {
          vscode.postMessage({ type: 'getHistory' });
        }
      }
      if (message.type === 'health') {
        setHealth(message.health);
      }
    });

    moduleSelect.innerHTML = '<option>Loading modules...</option>';
    deviceSelect.innerHTML = '<option>Loading devices...</option>';
    historyList.innerHTML = '<div class="history-item">Loading recent runs...</div>';
    vscode.postMessage({ type: 'refresh' });
    setInterval(persistPanelState, 2000);
    updateBuildButtonLabel();
    updateActionButtons();
    renderPinnedPresets();
    showErrorBox('', [], null);
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    RunPanel.currentPanel = undefined;
    this.disposables.forEach(d => d.dispose());
  }
}
