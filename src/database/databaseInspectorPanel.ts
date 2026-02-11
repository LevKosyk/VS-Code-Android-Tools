import * as vscode from 'vscode';
import { AdbService } from '../services/adbService';
import { listDevices } from '../devices/deviceManager';

export class DatabaseInspectorPanel {
  public static currentPanel: DatabaseInspectorPanel | undefined;
  private static readonly viewType = 'androidDatabaseInspector';
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

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

  public static createOrShow(): DatabaseInspectorPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (DatabaseInspectorPanel.currentPanel) {
      DatabaseInspectorPanel.currentPanel.panel.reveal(column);
      return DatabaseInspectorPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      DatabaseInspectorPanel.viewType,
      'Database Inspector',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    DatabaseInspectorPanel.currentPanel = new DatabaseInspectorPanel(panel);
    return DatabaseInspectorPanel.currentPanel;
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'getDevices': {
        const devices = await listDevices();
        this.postMessage({ type: 'devices', devices });
        break;
      }
      case 'getPackages': {
        const deviceId = String(message.deviceId || '');
        const packages = await AdbService.listPackages(deviceId, false);
        this.postMessage({ type: 'packages', packages });
        break;
      }
      case 'getDatabases': {
        const deviceId = String(message.deviceId || '');
        const packageName = String(message.packageName || '');
        const dbs = await AdbService.listDatabases(deviceId, packageName);
        this.postMessage({ type: 'databases', dbs });
        break;
      }
      case 'getTables': {
        const deviceId = String(message.deviceId || '');
        const packageName = String(message.packageName || '');
        const dbName = String(message.dbName || '');
        const tables = await AdbService.listTables(deviceId, packageName, dbName);
        this.postMessage({ type: 'tables', tables });
        break;
      }
      case 'runQuery': {
        const deviceId = String(message.deviceId || '');
        const packageName = String(message.packageName || '');
        const dbName = String(message.dbName || '');
        const query = String(message.query || '');
        const result = await AdbService.queryDatabase(deviceId, packageName, dbName, query);
        this.postMessage({ type: 'queryResult', result, query });
        break;
      }
      case 'exportCsv': {
        const csv = String(message.csv || '');
        if (!csv) {
          return;
        }
        const saveUri = await vscode.window.showSaveDialog({
          filters: { 'CSV': ['csv'] },
          saveLabel: 'Save CSV',
        });
        if (!saveUri) {
          return;
        }
        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(csv, 'utf-8'));
        this.postMessage({ type: 'csvSaved' });
        break;
      }
      case 'pullDatabase': {
        const deviceId = String(message.deviceId || '');
        const packageName = String(message.packageName || '');
        const dbName = String(message.dbName || '');
        const folders = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          title: 'Select destination folder',
        });
        if (!folders || !folders[0]) {
          return;
        }
        const ok = await AdbService.pullDatabase(deviceId, packageName, dbName, folders[0].fsPath);
        this.postMessage({ type: 'pullResult', success: ok });
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
  <title>Database Inspector</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-widget-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --muted: var(--vscode-descriptionForeground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: 13px; background: var(--bg); color: var(--fg); padding: 12px; }
    select, button { font-size: 12px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--input-bg); color: var(--input-fg); }
    button { cursor: pointer; }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    .list { border: 1px solid var(--border); border-radius: 6px; padding: 8px; max-height: 360px; overflow: auto; }
    .item { padding: 6px 4px; border-bottom: 1px solid var(--border); cursor: pointer; }
    .item:last-child { border-bottom: none; }
    .muted { color: var(--muted); }
  </style>
</head>
<body>
  <div class="row">
    <select id="deviceSelect"></select>
    <select id="packageSelect"></select>
    <select id="dbSelect"></select>
    <button id="refreshBtn">Refresh</button>
  </div>
  <div class="row">
    <input id="queryInput" list="historyList" placeholder="SELECT * FROM table LIMIT 20" style="flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:4px; background:var(--input-bg); color:var(--input-fg);" />
    <datalist id="historyList"></datalist>
    <button id="runQueryBtn">Run</button>
    <button id="pullBtn">Pull DB</button>
    <button id="exportBtn">Export CSV</button>
  </div>
  <div class="list" id="history"></div>
  <div class="list" id="dbList"></div>
  <div class="list" id="queryResult"></div>
  <div class="muted" id="status">Ready</div>
  <script>
    const vscode = acquireVsCodeApi();
    const deviceSelect = document.getElementById('deviceSelect');
    const packageSelect = document.getElementById('packageSelect');
    const dbSelect = document.getElementById('dbSelect');
    const historyList = document.getElementById('history');
    const historyDatalist = document.getElementById('historyList');
    const dbList = document.getElementById('dbList');
    const queryInput = document.getElementById('queryInput');
    const queryResult = document.getElementById('queryResult');
    const status = document.getElementById('status');
    let lastQueryText = '';
    let lastQueryResult = '';
    const historyKey = 'android-tools.dbQueryHistory';
    const lastDeviceKey = 'android-tools.dbLastDevice';
    const lastPackageKey = 'android-tools.dbLastPackage';
    const lastDbKey = 'android-tools.dbLastDb';
    function setStatus(t) { status.textContent = t; }
    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'getDevices' });
    });
    deviceSelect.addEventListener('change', () => {
      localStorage.setItem(lastDeviceKey, deviceSelect.value);
      vscode.postMessage({ type: 'getPackages', deviceId: deviceSelect.value });
    });
    packageSelect.addEventListener('change', () => {
      localStorage.setItem(lastPackageKey, packageSelect.value);
      vscode.postMessage({ type: 'getDatabases', deviceId: deviceSelect.value, packageName: packageSelect.value });
    });
    dbSelect.addEventListener('change', () => {
      const db = dbSelect.value;
      localStorage.setItem(lastDbKey, db);
      if (db) {
        vscode.postMessage({ type: 'getTables', deviceId: deviceSelect.value, packageName: packageSelect.value, dbName: db });
      }
    });
    document.getElementById('runQueryBtn').addEventListener('click', () => {
      const q = queryInput.value.trim();
      if (!q) return;
      vscode.postMessage({ type: 'runQuery', deviceId: deviceSelect.value, packageName: packageSelect.value, dbName: dbSelect.value, query: q });
      setStatus('Running query...');
    });
    document.getElementById('exportBtn').addEventListener('click', () => {
      if (!lastQueryResult) return;
      const csv = toCsv(lastQueryResult);
      vscode.postMessage({ type: 'exportCsv', csv });
    });
    document.getElementById('pullBtn').addEventListener('click', () => {
      const db = dbSelect.value;
      if (!db) return;
      vscode.postMessage({ type: 'pullDatabase', deviceId: deviceSelect.value, packageName: packageSelect.value, dbName: db });
      setStatus('Pulling ' + db + '...');
    });
    dbList.addEventListener('click', (e) => {
      const row = e.target.closest('.item');
      if (!row) return;
      const name = row.dataset.name;
      vscode.postMessage({
        type: 'pullDatabase',
        deviceId: deviceSelect.value,
        packageName: packageSelect.value,
        dbName: name
      });
      setStatus('Pulling ' + name + '...');
    });
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'devices') {
        deviceSelect.innerHTML = '';
        msg.devices.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.id;
          opt.textContent = d.id + ' (' + d.type + ')';
          opt.disabled = d.status !== 'online';
          deviceSelect.appendChild(opt);
        });
        const lastDevice = localStorage.getItem(lastDeviceKey);
        if (lastDevice) {
          deviceSelect.value = lastDevice;
        }
        if (deviceSelect.value) {
          vscode.postMessage({ type: 'getPackages', deviceId: deviceSelect.value });
        }
      }
      if (msg.type === 'packages') {
        packageSelect.innerHTML = '';
        msg.packages.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p;
          opt.textContent = p;
          packageSelect.appendChild(opt);
        });
        const lastPackage = localStorage.getItem(lastPackageKey);
        if (lastPackage) {
          packageSelect.value = lastPackage;
        }
        if (packageSelect.value) {
          vscode.postMessage({ type: 'getDatabases', deviceId: deviceSelect.value, packageName: packageSelect.value });
        }
      }
      if (msg.type === 'databases') {
        dbSelect.innerHTML = '';
        msg.dbs.forEach(n => {
          const opt = document.createElement('option');
          opt.value = n;
          opt.textContent = n;
          dbSelect.appendChild(opt);
        });
        const lastDb = localStorage.getItem(lastDbKey);
        if (lastDb) {
          dbSelect.value = lastDb;
        }
        if (dbSelect.value) {
          vscode.postMessage({ type: 'getTables', deviceId: deviceSelect.value, packageName: packageSelect.value, dbName: dbSelect.value });
        }
      }
      if (msg.type === 'tables') {
        dbList.innerHTML = '';
        msg.tables.forEach(t => {
          const div = document.createElement('div');
          div.className = 'item';
          div.textContent = t;
          dbList.appendChild(div);
        });
      }
      if (msg.type === 'queryResult') {
        lastQueryText = msg.query || '';
        lastQueryResult = msg.result || '';
        queryResult.textContent = lastQueryResult;
        saveHistory(lastQueryText);
        setStatus('Query completed');
      }
      if (msg.type === 'csvSaved') {
        setStatus('CSV saved');
      }
      if (msg.type === 'pullResult') {
        setStatus(msg.success ? 'Pull completed' : 'Pull failed');
      }
    });
    vscode.postMessage({ type: 'getDevices' });
    loadHistory();

    function saveHistory(query) {
      if (!query) return;
      const raw = localStorage.getItem(historyKey);
      const list = raw ? JSON.parse(raw) : [];
      const next = [query, ...list.filter(q => q !== query)].slice(0, 20);
      localStorage.setItem(historyKey, JSON.stringify(next));
      renderHistory(next);
    }
    function loadHistory() {
      const raw = localStorage.getItem(historyKey);
      const list = raw ? JSON.parse(raw) : [];
      if (list.length > 0) {
        queryInput.value = list[0];
      }
      renderHistory(list);
    }
    function renderHistory(list) {
      historyList.innerHTML = '';
      historyDatalist.innerHTML = '';
      list.forEach(q => {
        const div = document.createElement('div');
        div.className = 'item';
        div.textContent = q;
        div.addEventListener('click', () => {
          queryInput.value = q;
        });
        historyList.appendChild(div);
        const opt = document.createElement('option');
        opt.value = q;
        historyDatalist.appendChild(opt);
      });
    }
    function toCsv(text) {
      const lines = text.split('\\n').filter(Boolean);
      return lines.map(l => l.replace(/\\s+\\|\\s+/g, ',')).join('\\n');
    }
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    DatabaseInspectorPanel.currentPanel = undefined;
    this.disposables.forEach(d => d.dispose());
  }
}
