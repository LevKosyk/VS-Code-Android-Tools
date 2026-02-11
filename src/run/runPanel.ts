import * as vscode from 'vscode';

export interface RunPanelHandlers {
  getDevices: () => Promise<Array<{ id: string; label: string; type: string }>>;
  getModules: () => Promise<string[]>;
  getVariants: (moduleName: string) => Promise<{ variants: string[]; selected: string; flavors: string[]; buildTypes: string[]; selectedFlavor: string; selectedBuildType: string }>;
  setVariant: (moduleName: string, variant: string) => Promise<void>;
  setFlavor: (moduleName: string, flavor: string) => Promise<void>;
  setBuildType: (moduleName: string, buildType: string) => Promise<void>;
  build: (moduleName: string) => Promise<{ success: boolean; message: string }>;
  install: (moduleName: string, deviceId: string) => Promise<{ success: boolean; message: string }>;
  run: (moduleName: string, deviceId: string) => Promise<{ success: boolean; message: string }>;
  clean: () => Promise<{ success: boolean; message: string }>;
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
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 12px;
    }
    .title { font-weight: 600; margin-bottom: 6px; }
    select, button {
      font-family: inherit;
      font-size: 12px;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--input-bg);
      color: var(--input-fg);
    }
    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      cursor: pointer;
    }
    button.secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
    }
    .status { color: var(--muted); margin-top: 6px; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .grid button { width: 100%; }
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
    <div class="grid">
      <button id="buildBtn">Build Debug</button>
      <button id="installBtn">Install</button>
      <button id="runBtn">Run</button>
      <button id="cleanBtn" class="secondary">Clean</button>
    </div>
    <div id="status" class="status">Ready</div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const moduleSelect = document.getElementById('moduleSelect');
    const deviceSelect = document.getElementById('deviceSelect');
    const variantSelect = document.getElementById('variantSelect');
    const flavorSelect = document.getElementById('flavorSelect');
    const buildTypeSelect = document.getElementById('buildTypeSelect');
    const statusEl = document.getElementById('status');
    function refresh() {
      vscode.postMessage({ type: 'refresh' });
    }
    function setStatus(text) {
      statusEl.textContent = text;
    }
    document.getElementById('refreshBtn').addEventListener('click', refresh);
    document.getElementById('buildBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'build', moduleName: moduleSelect.value });
      setStatus('Building...');
    });
    document.getElementById('installBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'install', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatus('Installing...');
    });
    document.getElementById('runBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'run', moduleName: moduleSelect.value, deviceId: deviceSelect.value });
      setStatus('Starting app...');
    });
    document.getElementById('cleanBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'clean' });
      setStatus('Cleaning...');
    });
    moduleSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'getVariants', moduleName: moduleSelect.value });
    });
    variantSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setVariant', moduleName: moduleSelect.value, variant: variantSelect.value });
    });
    flavorSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setFlavor', moduleName: moduleSelect.value, flavor: flavorSelect.value });
      updateVariantFromSelections();
    });
    buildTypeSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'setBuildType', moduleName: moduleSelect.value, buildType: buildTypeSelect.value });
      updateVariantFromSelections();
    });
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'devices') {
        deviceSelect.innerHTML = '';
        message.devices.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.id;
          opt.textContent = d.label;
          deviceSelect.appendChild(opt);
        });
      }
      if (message.type === 'modules') {
        moduleSelect.innerHTML = '';
        message.modules.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          moduleSelect.appendChild(opt);
        });
        if (moduleSelect.value) {
          vscode.postMessage({ type: 'getVariants', moduleName: moduleSelect.value });
        }
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
      }
      if (message.type === 'result') {
        const prefix = message.success ? 'Done:' : 'Error:';
        setStatus(prefix + ' ' + message.message);
      }
    });
    function updateVariantFromSelections() {
      const flavor = flavorSelect.value || '';
      const buildType = buildTypeSelect.value || '';
      if (!buildType) return;
      const variant = flavor ? flavor + buildType : buildType;
      variantSelect.value = variant;
      vscode.postMessage({ type: 'setVariant', moduleName: moduleSelect.value, variant });
    }
    vscode.postMessage({ type: 'getDevices' });
    vscode.postMessage({ type: 'getModules' });
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    RunPanel.currentPanel = undefined;
    this.disposables.forEach(d => d.dispose());
  }
}
