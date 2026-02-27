import * as vscode from 'vscode';
import { getWebviewThemeStyle } from './webviewTheme';

interface SettingsCenterHandlers {
  values: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => Promise<void>;
  onApplyLayout: (name: string) => Promise<void>;
  listLayouts: () => string[];
}

export class SettingsCenterPanel {
  private static current: SettingsCenterPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private handlers: SettingsCenterHandlers;

  private constructor(panel: vscode.WebviewPanel, handlers: SettingsCenterHandlers) {
    this.panel = panel;
    this.handlers = handlers;
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage((message: { type?: string; key?: string; value?: unknown; layout?: string }) => {
      void this.handle(message);
    });
    this.panel.onDidDispose(() => {
      if (SettingsCenterPanel.current === this) {
        SettingsCenterPanel.current = undefined;
      }
    });
  }

  static createOrShow(handlers: SettingsCenterHandlers): void {
    if (SettingsCenterPanel.current) {
      SettingsCenterPanel.current.handlers = handlers;
      SettingsCenterPanel.current.panel.reveal(vscode.ViewColumn.One);
      void SettingsCenterPanel.current.pushState();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'androidToolkitSettingsCenter',
      'Android Settings Center',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    SettingsCenterPanel.current = new SettingsCenterPanel(panel, handlers);
    void SettingsCenterPanel.current.pushState();
  }

  private async handle(message: { type?: string; key?: string; value?: unknown; layout?: string }): Promise<void> {
    if (message.type === 'update' && message.key) {
      await this.handlers.onUpdate(message.key, message.value);
      this.handlers.values[message.key] = message.value;
      await this.pushState();
      return;
    }
    if (message.type === 'applyLayout' && message.layout) {
      await this.handlers.onApplyLayout(message.layout);
      await this.pushState();
    }
  }

  private async pushState(): Promise<void> {
    this.panel.webview.postMessage({
      type: 'state',
      values: this.handlers.values,
      layouts: this.handlers.listLayouts(),
    });
  }

  private html(): string {
    const themeVars = getWebviewThemeStyle();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    ${themeVars}
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); font-size: var(--at-font-size, 13px); padding: var(--at-space-3); }
    h2 { margin: 0 0 var(--at-space-2) 0; font-size: var(--at-type-title); font-weight: 700; }
    .row { display: grid; grid-template-columns: 260px 1fr; gap: var(--at-space-3); align-items: center; margin-bottom: var(--at-space-2); }
    input, select, button { border: 1px solid var(--vscode-widget-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: var(--at-radius-sm); padding: var(--at-control-padding-y, 6px) var(--at-control-padding-x, 8px); font-size: var(--at-type-label); min-height: var(--at-table-row-height, 34px); }
    button { cursor: pointer; font-weight: 600; }
    button.btn-primary { background: var(--at-info); color: var(--at-info-contrast); border-color: transparent; }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px; }
    .muted { color: var(--vscode-descriptionForeground); font-size: var(--at-type-helper); margin-bottom: var(--at-space-2); }
    #search { width: 100%; margin-bottom: var(--at-space-3); }
    .section { border: 1px solid var(--vscode-widget-border); border-radius: var(--at-radius-md); padding: var(--at-space-3); margin-bottom: var(--at-space-4); }
    .title { font-weight: 600; margin-bottom: var(--at-space-2); font-size: var(--at-type-section); }
    label { font-size: var(--at-type-label); }
  </style>
</head>
<body>
  <h2>Android Settings Center</h2>
  <div class="muted">Search + live update. Changes are applied immediately to workspace settings.</div>
  <input id="search" placeholder="Search settings (e.g. density, notification, run, theme)" />

  <div class="section">
    <div class="title">Saved Layouts</div>
    <div class="row"><label>Apply layout</label><select id="layoutSelect"></select></div>
    <button id="applyLayout" class="btn-primary">Apply</button>
  </div>

  <div id="settings"></div>

  <script>
    const vscode = acquireVsCodeApi();
    let values = {};
    let definitions = [
      { key: 'projectView.mode', label: 'Project View Mode', type: 'select', options: ['android','files','packages'] },
      { key: 'ui.mode', label: 'UI Mode', type: 'select', options: ['beginner','standard','power'] },
      { key: 'ui.density', label: 'Panel Density', type: 'select', options: ['compact','comfortable'] },
      { key: 'ui.fontSize', label: 'Panel Font Size', type: 'number' },
      { key: 'ui.tableRowHeight', label: 'Table Row Height', type: 'number' },
      { key: 'ui.logRowHeight', label: 'Log Row Height', type: 'number' },
      { key: 'config.profile', label: 'Config Profile', type: 'select', options: ['solo','team','ci-heavy','release','custom'] },
      { key: 'keyboard.profile', label: 'Shortcut Profile', type: 'select', options: ['default','vim','jetbrains','custom'] },
      { key: 'keyboard.shortcuts', label: 'Keyboard Shortcuts JSON', type: 'text' },
      { key: 'notifications.mode', label: 'Notification Mode', type: 'select', options: ['quiet','normal'] },
      { key: 'notifications.channels.run', label: 'Notify Run', type: 'bool' },
      { key: 'notifications.channels.gradle', label: 'Notify Gradle', type: 'bool' },
      { key: 'notifications.channels.device', label: 'Notify Device', type: 'bool' },
      { key: 'notifications.channels.logcat', label: 'Notify Logcat', type: 'bool' },
      { key: 'notifications.channels.tips', label: 'Notify Tips', type: 'bool' },
      { key: 'notifications.channels.errorsOnly', label: 'Errors Only', type: 'bool' },
      { key: 'theme.tokens.success', label: 'Theme Success', type: 'text' },
      { key: 'theme.tokens.warn', label: 'Theme Warn', type: 'text' },
      { key: 'theme.tokens.error', label: 'Theme Error', type: 'text' },
      { key: 'theme.tokens.info', label: 'Theme Info', type: 'text' },
      { key: 'sync.autoSync.enabled', label: 'Auto Sync', type: 'bool' },
      { key: 'sync.autoSync.intervalMs', label: 'Auto Sync Interval (ms)', type: 'number' }
    ];
    const searchEl = document.getElementById('search');
    const settingsEl = document.getElementById('settings');
    const layoutSelect = document.getElementById('layoutSelect');
    document.getElementById('applyLayout').addEventListener('click', () => {
      if (layoutSelect.value) vscode.postMessage({ type: 'applyLayout', layout: layoutSelect.value });
    });
    function render() {
      const q = (searchEl.value || '').toLowerCase().trim();
      settingsEl.innerHTML = '';
      definitions.filter(d => !q || d.key.includes(q) || d.label.toLowerCase().includes(q)).forEach(def => {
        const row = document.createElement('div');
        row.className = 'row';
        const label = document.createElement('label');
        label.textContent = def.label + ' (' + def.key + ')';
        row.appendChild(label);
        let input;
        if (def.type === 'select') {
          input = document.createElement('select');
          def.options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o;
            input.appendChild(opt);
          });
          input.value = String(values[def.key] ?? def.options[0]);
          input.addEventListener('change', () => vscode.postMessage({ type: 'update', key: def.key, value: input.value }));
        } else if (def.type === 'bool') {
          input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = Boolean(values[def.key]);
          input.addEventListener('change', () => vscode.postMessage({ type: 'update', key: def.key, value: input.checked }));
        } else if (def.type === 'number') {
          input = document.createElement('input');
          input.type = 'number';
          input.value = String(values[def.key] ?? '');
          input.addEventListener('change', () => vscode.postMessage({ type: 'update', key: def.key, value: Number(input.value) }));
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.value = String(values[def.key] ?? '');
          input.addEventListener('change', () => vscode.postMessage({ type: 'update', key: def.key, value: input.value }));
        }
        row.appendChild(input);
        settingsEl.appendChild(row);
      });
    }
    searchEl.addEventListener('input', render);
    window.addEventListener('message', event => {
      const m = event.data;
      if (m.type !== 'state') return;
      values = m.values || {};
      layoutSelect.innerHTML = '';
      (m.layouts || []).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        layoutSelect.appendChild(opt);
      });
      render();
    });
  </script>
</body>
</html>`;
  }
}
