import * as vscode from 'vscode';

export interface RunPanelHandlers {
  getDevices: () => Promise<Array<{ id: string; label: string; type: string }>>;
  getModules: () => Promise<string[]>;
  getVariants: (moduleName: string) => Promise<{ variants: string[]; selected: string; flavors: string[]; buildTypes: string[]; selectedFlavor: string; selectedBuildType: string }>;
  setVariant: (moduleName: string, variant: string) => Promise<void>;
  setFlavor: (moduleName: string, flavor: string) => Promise<void>;
  setBuildType: (moduleName: string, buildType: string) => Promise<void>;
  build: (moduleName: string) => Promise<{ success: boolean; message: string; gradleError?: string }>;
  install: (moduleName: string, deviceId: string) => Promise<{ success: boolean; message: string; gradleError?: string }>;
  run: (moduleName: string, deviceId: string) => Promise<{ success: boolean; message: string; gradleError?: string }>;
  clean: () => Promise<{ success: boolean; message: string; gradleError?: string }>;
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
    switch (message.type) {
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
      case 'build': {
        const moduleName = String(message.moduleName || '');
        const result = await this.handlers.build(moduleName);
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
      case 'clean': {
        const result = await this.handlers.clean();
        this.postMessage({ type: 'result', action: 'clean', ...result });
        break;
      }
      case 'refresh': {
        const devices = await this.handlers.getDevices();
        const modules = await this.handlers.getModules();
        this.postMessage({ type: 'devices', devices });
        this.postMessage({ type: 'modules', modules });
        break;
      }
      case 'openGradleOutput': {
        await vscode.commands.executeCommand('android-toolkit.showGradleOutput');
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
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      background: var(--bg);
      color: var(--fg);
      padding: 12px;
    }
    .row { display: flex; gap: 8px; align-items: center; }
    .col { display: flex; flex-direction: column; gap: 6px; }
    .card {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 12px;
    }
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
    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      cursor: pointer;
      font-weight: 600;
    }
    button:hover { opacity: 0.92; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button.secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
    }
    .status {
      color: var(--muted);
      margin-top: 8px;
      border-radius: 8px;
      border: 1px solid var(--border);
      padding: 8px 10px;
      min-height: 36px;
      display: flex;
      align-items: center;
    }
    .status.loading {
      color: #0369a1;
      border-color: #7dd3fc;
      background: #e0f2fe44;
    }
    .status.success {
      color: #166534;
      border-color: #86efac;
      background: #dcfce744;
    }
    .status.error {
      color: #b91c1c;
      border-color: #fca5a5;
      background: #fee2e244;
      font-weight: 600;
    }
    .actions-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .actions-row button { width: 100%; }
    .error-box {
      margin-top: 8px;
      border: 1px solid #fca5a5;
      background: #fee2e244;
      border-radius: 8px;
      padding: 8px;
      display: none;
    }
    .error-box.visible { display: block; }
    .error-title { color: #b91c1c; font-weight: 700; margin-bottom: 6px; }
    .error-text {
      color: #7f1d1d;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 12px;
      max-height: 140px;
      overflow: auto;
      margin-bottom: 8px;
    }
    .error-actions { display: flex; justify-content: flex-end; }
    @media (max-width: 900px) {
      .actions-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">Target</div>
    <div class="row">
      <div class="col" style="flex:1">
        <label>Module</label>
        <select id="moduleSelect"></select>
      </div>
      <div class="col" style="flex:1">
        <label>Device</label>
        <select id="deviceSelect"></select>
      </div>
      <div class="col" style="flex:1">
        <label>Variant</label>
        <select id="variantSelect"></select>
      </div>
      <div class="col" style="flex:1">
        <label>Flavor</label>
        <select id="flavorSelect"></select>
      </div>
      <div class="col" style="flex:1">
        <label>Build Type</label>
        <select id="buildTypeSelect"></select>
      </div>
      <button id="refreshBtn" class="secondary">Refresh</button>
    </div>
  </div>
  <div class="card">
    <div class="title">Actions</div>
    <div class="actions-row">
      <button id="buildBtn">Build</button>
      <button id="installBtn">Install</button>
      <button id="runBtn">Run</button>
      <button id="cleanBtn" class="secondary">Clean</button>
    </div>
    <div id="status" class="status">Ready</div>
    <div id="errorBox" class="error-box">
      <div class="error-title">Gradle Error</div>
      <div id="errorText" class="error-text"></div>
      <div class="error-actions">
        <button id="openGradleBtn" class="secondary">Open Gradle Output</button>
      </div>
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
    const buildBtn = document.getElementById('buildBtn');
    const installBtn = document.getElementById('installBtn');
    const runBtn = document.getElementById('runBtn');
    const cleanBtn = document.getElementById('cleanBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    let isBusy = false;

    function updateActionButtons() {
      const hasModule = !!moduleSelect.value;
      const hasDevice = !!deviceSelect.value;
      buildBtn.disabled = isBusy || !hasModule;
      cleanBtn.disabled = isBusy;
      installBtn.disabled = isBusy || !hasModule || !hasDevice;
      runBtn.disabled = isBusy || !hasModule || !hasDevice;
      refreshBtn.disabled = isBusy;
    }
    function setBusy(next) {
      isBusy = next;
      updateActionButtons();
    }
    function updateBuildButtonLabel() {
      const variant = variantSelect.value || 'Variant';
      buildBtn.textContent = 'Build ' + variant;
    }
    function refresh() {
      vscode.postMessage({ type: 'refresh' });
    }
    function setStatus(text, kind = 'neutral') {
      statusEl.textContent = text;
      statusEl.className = 'status';
      if (kind === 'loading' || kind === 'success' || kind === 'error') {
        statusEl.classList.add(kind);
      }
    }
    function showGradleError(text) {
      if (!text) {
        errorBox.classList.remove('visible');
        errorText.textContent = '';
        return;
      }
      errorText.textContent = text;
      errorBox.classList.add('visible');
    }
    refreshBtn.addEventListener('click', refresh);
    buildBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'build', moduleName: moduleSelect.value });
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
    cleanBtn.addEventListener('click', () => {
      setBusy(true);
      vscode.postMessage({ type: 'clean' });
      setStatus('Cleaning project...', 'loading');
    });
    openGradleBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'openGradleOutput' });
    });
    moduleSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'getVariants', moduleName: moduleSelect.value });
      updateActionButtons();
    });
    variantSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setVariant', moduleName: moduleSelect.value, variant: variantSelect.value });
      updateBuildButtonLabel();
    });
    flavorSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setFlavor', moduleName: moduleSelect.value, flavor: flavorSelect.value });
      updateVariantFromSelections();
    });
    buildTypeSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setBuildType', moduleName: moduleSelect.value, buildType: buildTypeSelect.value });
      updateVariantFromSelections();
    });
    deviceSelect.addEventListener('change', updateActionButtons);
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
        }
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
        }
        if (moduleSelect.value) {
          vscode.postMessage({ type: 'getVariants', moduleName: moduleSelect.value });
        }
        updateActionButtons();
      }
      if (message.type === 'variants') {
        variantSelect.innerHTML = '';
        message.variants.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          variantSelect.appendChild(opt);
        });
        if (message.selected) {
          variantSelect.value = message.selected;
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
        updateBuildButtonLabel();
        updateActionButtons();
      }
      if (message.type === 'result') {
        setBusy(false);
        const prefix = message.success ? 'Done:' : 'Error:';
        setStatus(prefix + ' ' + message.message, message.success ? 'success' : 'error');
        showGradleError(message.success ? '' : (message.gradleError || ''));
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
    vscode.postMessage({ type: 'getDevices' });
    vscode.postMessage({ type: 'getModules' });
    updateBuildButtonLabel();
    updateActionButtons();
    showGradleError('');
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    RunPanel.currentPanel = undefined;
    this.disposables.forEach(d => d.dispose());
  }
}
