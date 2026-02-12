import * as vscode from 'vscode';
import * as fs from 'fs';

interface MappingEntry {
  obfuscatedClass: string;
  originalClass: string;
  members: Map<string, string>;
}

export class MappingViewerPanel {
  public static currentPanel: MappingViewerPanel | undefined;
  private static readonly viewType = 'mappingViewer';
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private mapping: Map<string, MappingEntry> = new Map();
  private mappingPath: string | undefined;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this.getHtmlContent();
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (MappingViewerPanel.currentPanel) {
      MappingViewerPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      MappingViewerPanel.viewType,
      'Proguard/R8 Mapping Viewer',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    MappingViewerPanel.currentPanel = new MappingViewerPanel(panel);
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'pickMapping':
        await this.pickMappingFile();
        return;
      case 'search':
        this.postMessage({ type: 'searchResults', data: this.searchMapping(message.query || '') });
        return;
      case 'deobfuscate':
        this.postMessage({ type: 'deobfuscated', data: this.deobfuscateStacktrace(message.stacktrace || '') });
        return;
    }
  }

  private async pickMappingFile(): Promise<void> {
    const uri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: { 'Mapping Files': ['txt'] },
      title: 'Select mapping.txt',
    });
    if (!uri || !uri[0]) {
      return;
    }
    this.mappingPath = uri[0].fsPath;
    const content = fs.readFileSync(this.mappingPath, 'utf-8');
    this.mapping = this.parseMapping(content);
    this.postMessage({ type: 'mappingLoaded', data: this.mappingPath });
  }

  private parseMapping(content: string): Map<string, MappingEntry> {
    const map = new Map<string, MappingEntry>();
    const lines = content.split('\n');
    let current: MappingEntry | undefined;
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      if (!line.startsWith(' ')) {
        const match = line.match(/^(.+?)\s+->\s+(.+?):$/);
        if (match) {
          const originalClass = match[1].trim();
          const obfuscatedClass = match[2].trim();
          current = {
            obfuscatedClass,
            originalClass,
            members: new Map(),
          };
          map.set(obfuscatedClass, current);
        } else {
          current = undefined;
        }
      } else if (current) {
        const trimmed = line.trim();
        const memberMatch = trimmed.match(/.+\s+(.+)\s+->\s+(.+)$/);
        if (memberMatch) {
          const original = memberMatch[1].trim();
          const obfuscated = memberMatch[2].trim();
          current.members.set(obfuscated, original);
        }
      }
    }
    return map;
  }

  private searchMapping(query: string): Array<{ original: string; obfuscated: string }> {
    const q = query.toLowerCase().trim();
    const results: Array<{ original: string; obfuscated: string }> = [];
    if (!q) {
      return results;
    }
    for (const entry of this.mapping.values()) {
      if (entry.originalClass.toLowerCase().includes(q) || entry.obfuscatedClass.toLowerCase().includes(q)) {
        results.push({ original: entry.originalClass, obfuscated: entry.obfuscatedClass });
      }
    }
    return results.slice(0, 200);
  }

  private deobfuscateStacktrace(stacktrace: string): string {
    const lines = stacktrace.split('\n');
    return lines.map(line => {
      const match = line.match(/(at\s+)([\\w.$]+)\\.([\\w$<>]+)(\\(.*\\))/);
      if (!match) {
        return line;
      }
      const className = match[2];
      const methodName = match[3];
      const entry = this.mapping.get(className);
      if (!entry) {
        return line;
      }
      const originalClass = entry.originalClass;
      const originalMethod = entry.members.get(methodName) || methodName;
      return `${match[1]}${originalClass}.${originalMethod}${match[4]}`;
    }).join('\n');
  }

  private postMessage(message: any): void {
    this.panel.webview.postMessage(message);
  }

  public dispose(): void {
    MappingViewerPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) x.dispose();
    }
  }

  private getHtmlContent(): string {
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Mapping Viewer</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    .row { display: flex; gap: 8px; margin-bottom: 10px; align-items: center; }
    input, textarea { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; border-radius: 2px; }
    textarea { width: 100%; min-height: 140px; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 10px; cursor: pointer; border-radius: 2px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .results { margin-top: 8px; }
    .result { padding: 6px; border: 1px solid var(--vscode-panel-border); border-radius: 2px; margin-bottom: 6px; }
    .muted { color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div class="row">
    <button onclick="pickMapping()">Pick mapping.txt</button>
    <span id="mappingPath" class="muted">No mapping loaded</span>
  </div>

  <div class="row">
    <input id="searchInput" type="text" placeholder="Search class (original or obfuscated)" style="flex: 1;" />
    <button onclick="search()">Search</button>
  </div>
  <div id="searchResults" class="results"></div>

  <div class="row">
    <textarea id="stacktraceInput" placeholder="Paste obfuscated stacktrace here..."></textarea>
  </div>
  <div class="row">
    <button onclick="deobfuscate()">Deobfuscate</button>
  </div>
  <div class="row">
    <textarea id="stacktraceOutput" placeholder="Deobfuscated stacktrace will appear here..." readonly></textarea>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const mappingPath = document.getElementById('mappingPath');
    const resultsEl = document.getElementById('searchResults');

    function pickMapping() {
      vscode.postMessage({ type: 'pickMapping' });
    }
    function search() {
      vscode.postMessage({ type: 'search', query: document.getElementById('searchInput').value });
    }
    function deobfuscate() {
      vscode.postMessage({ type: 'deobfuscate', stacktrace: document.getElementById('stacktraceInput').value });
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'mappingLoaded') {
        mappingPath.textContent = msg.data;
      }
      if (msg.type === 'searchResults') {
        resultsEl.innerHTML = '';
        if (!msg.data || msg.data.length === 0) {
          resultsEl.textContent = 'No results.';
          return;
        }
        for (const item of msg.data) {
          const div = document.createElement('div');
          div.className = 'result';
          div.textContent = item.original + '  ->  ' + item.obfuscated;
          resultsEl.appendChild(div);
        }
      }
      if (msg.type === 'deobfuscated') {
        document.getElementById('stacktraceOutput').value = msg.data || '';
      }
    });
  </script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
