import * as vscode from 'vscode';

export interface RunProfileLite {
  id: string;
  name: string;
  moduleName: string;
  variant: string;
  deviceId?: string;
  launchType: 'default' | 'activity' | 'deeplink';
}

export interface RunProfilesPanelHandlers {
  listProfiles: () => Promise<RunProfileLite[]>;
  createProfile: () => Promise<void>;
  updateProfile: (profile: RunProfileLite) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  runProfile: (id: string) => Promise<void>;
  debugProfile: (id: string) => Promise<void>;
  duplicateProfile: (id: string) => Promise<void>;
}

export class RunProfilesPanel {
  private static current: RunProfilesPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly handlers: RunProfilesPanelHandlers;

  private constructor(panel: vscode.WebviewPanel, handlers: RunProfilesPanelHandlers) {
    this.panel = panel;
    this.handlers = handlers;
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m));
    this.panel.onDidDispose(() => {
      if (RunProfilesPanel.current === this) {
        RunProfilesPanel.current = undefined;
      }
    });
  }

  public static createOrShow(handlers: RunProfilesPanelHandlers): void {
    if (RunProfilesPanel.current) {
      RunProfilesPanel.current.panel.reveal(vscode.ViewColumn.One);
      void RunProfilesPanel.current.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'androidRunProfilesV2',
      'Run/Debug Profiles v2',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    RunProfilesPanel.current = new RunProfilesPanel(panel, handlers);
    void RunProfilesPanel.current.refresh();
  }

  private async onMessage(message: { type?: string; id?: string; profile?: RunProfileLite }): Promise<void> {
    const type = message.type || '';
    if (type === 'refresh') {
      await this.refresh();
      return;
    }
    if (type === 'create') {
      await this.handlers.createProfile();
      await this.refresh();
      return;
    }
    if (type === 'save' && message.profile) {
      await this.handlers.updateProfile(message.profile);
      await this.refresh();
      return;
    }
    if (!message.id) {
      return;
    }
    if (type === 'delete') {
      await this.handlers.deleteProfile(message.id);
      await this.refresh();
      return;
    }
    if (type === 'run') {
      await this.handlers.runProfile(message.id);
      return;
    }
    if (type === 'debug') {
      await this.handlers.debugProfile(message.id);
      return;
    }
    if (type === 'duplicate') {
      await this.handlers.duplicateProfile(message.id);
      await this.refresh();
      return;
    }
  }

  private async refresh(): Promise<void> {
    const profiles = await this.handlers.listProfiles();
    this.panel.webview.postMessage({ type: 'profiles', profiles });
  }

  private html(): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 14px; }
.toolbar { display: flex; gap: 8px; margin-bottom: 10px; }
button { border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 6px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; }
.list { display: flex; flex-direction: column; gap: 8px; }
.card { border: 1px solid var(--vscode-widget-border); border-radius: 10px; padding: 10px; }
.title { font-weight: 600; }
.meta { font-size: 12px; opacity: 0.85; margin-top: 4px; }
.actions { margin-top: 8px; display: flex; gap: 8px; }
.form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
input, select { width: 100%; border: 1px solid var(--vscode-widget-border); border-radius: 7px; padding: 5px 7px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: inherit; font-size: 12px; }
label { font-size: 11px; opacity: 0.85; display: block; margin-bottom: 3px; }
@media (max-width: 920px) { .form-grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
  <h2>Run/Debug Profiles v2</h2>
  <div class="toolbar">
    <button id="create">Create Profile</button>
    <button id="refresh">Refresh</button>
  </div>
  <div id="list" class="list"></div>
<script>
const vscode = acquireVsCodeApi();
const list = document.getElementById('list');
document.getElementById('create').onclick = () => vscode.postMessage({ type: 'create' });
document.getElementById('refresh').onclick = () => vscode.postMessage({ type: 'refresh' });
window.addEventListener('message', (event) => {
  const m = event.data;
  if (m.type !== 'profiles') return;
  list.innerHTML = '';
  const profiles = m.profiles || [];
  if (!profiles.length) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.textContent = 'No profiles yet. Create one to start.';
    list.appendChild(empty);
    return;
  }
  for (const p of profiles) {
    const card = document.createElement('div');
    card.className = 'card';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = p.name;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = 'Inline edit enabled';
    const form = document.createElement('div');
    form.className = 'form-grid';
    const nameWrap = document.createElement('div');
    nameWrap.innerHTML = '<label>Name</label>';
    const nameInput = document.createElement('input');
    nameInput.value = p.name;
    nameWrap.appendChild(nameInput);
    const moduleWrap = document.createElement('div');
    moduleWrap.innerHTML = '<label>Module</label>';
    const moduleInput = document.createElement('input');
    moduleInput.value = p.moduleName;
    moduleWrap.appendChild(moduleInput);
    const variantWrap = document.createElement('div');
    variantWrap.innerHTML = '<label>Variant</label>';
    const variantInput = document.createElement('input');
    variantInput.value = p.variant;
    variantWrap.appendChild(variantInput);
    const deviceWrap = document.createElement('div');
    deviceWrap.innerHTML = '<label>Device (optional)</label>';
    const deviceInput = document.createElement('input');
    deviceInput.value = p.deviceId || '';
    deviceInput.placeholder = 'Ask each time';
    deviceWrap.appendChild(deviceInput);
    const launchWrap = document.createElement('div');
    launchWrap.innerHTML = '<label>Launch Type</label>';
    const launchSelect = document.createElement('select');
    for (const opt of ['default', 'activity', 'deeplink']) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      launchSelect.appendChild(o);
    }
    launchSelect.value = p.launchType;
    launchWrap.appendChild(launchSelect);
    form.appendChild(nameWrap);
    form.appendChild(moduleWrap);
    form.appendChild(variantWrap);
    form.appendChild(deviceWrap);
    form.appendChild(launchWrap);
    const actions = document.createElement('div');
    actions.className = 'actions';
    const save = document.createElement('button');
    save.textContent = 'Save';
    save.onclick = () => vscode.postMessage({
      type: 'save',
      profile: {
        id: p.id,
        name: nameInput.value.trim(),
        moduleName: moduleInput.value.trim(),
        variant: variantInput.value.trim(),
        deviceId: deviceInput.value.trim() || undefined,
        launchType: launchSelect.value
      }
    });
    const run = document.createElement('button'); run.textContent = 'Run'; run.onclick = () => vscode.postMessage({ type: 'run', id: p.id });
    const debug = document.createElement('button'); debug.textContent = 'Debug'; debug.onclick = () => vscode.postMessage({ type: 'debug', id: p.id });
    const dup = document.createElement('button'); dup.textContent = 'Duplicate'; dup.onclick = () => vscode.postMessage({ type: 'duplicate', id: p.id });
    const del = document.createElement('button'); del.textContent = 'Delete'; del.onclick = () => vscode.postMessage({ type: 'delete', id: p.id });
    actions.appendChild(save); actions.appendChild(run); actions.appendChild(debug); actions.appendChild(dup); actions.appendChild(del);
    card.appendChild(title); card.appendChild(meta); card.appendChild(form); card.appendChild(actions);
    list.appendChild(card);
  }
});
vscode.postMessage({ type: 'refresh' });
</script>
</body>
</html>`;
  }
}
