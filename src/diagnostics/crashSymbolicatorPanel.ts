import * as vscode from 'vscode';
import * as fs from 'fs';
import { getWebviewThemeStyle } from '../ui/webviewTheme';

interface MappingData {
  classMap: Map<string, string>;
  methodMap: Map<string, Map<string, string>>;
}

function parseMapping(content: string): MappingData {
  const classMap = new Map<string, string>();
  const methodMap = new Map<string, Map<string, string>>();
  let currentObfuscatedClass = '';
  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/\r/g, '');
    const classMatch = line.match(/^(.+?) -> (.+?):$/);
    if (classMatch) {
      const originalClass = classMatch[1].trim();
      const obfuscatedClass = classMatch[2].trim();
      classMap.set(obfuscatedClass, originalClass);
      currentObfuscatedClass = obfuscatedClass;
      if (!methodMap.has(obfuscatedClass)) {
        methodMap.set(obfuscatedClass, new Map<string, string>());
      }
      continue;
    }
    if (!currentObfuscatedClass || !line.startsWith(' ')) {
      continue;
    }
    const methodMatch = line.match(/^\s*(?:\d+:\d+:)?(?:\d+:\d+:)?(?:[\w.$\[\]<>-]+\s+)?([\w$<>]+)\([^)]*\)\s+->\s+([\w$<>]+)$/);
    if (!methodMatch) {
      continue;
    }
    const originalMethod = methodMatch[1].trim();
    const obfuscatedMethod = methodMatch[2].trim();
    const perClass = methodMap.get(currentObfuscatedClass)!;
    if (!perClass.has(obfuscatedMethod)) {
      perClass.set(obfuscatedMethod, originalMethod);
    }
  }
  return { classMap, methodMap };
}

function symbolicateStacktrace(stacktrace: string, mapping: MappingData): string {
  const lines = stacktrace.split('\n');
  const out = lines.map(line => {
    let rewritten = line;
    rewritten = rewritten.replace(/(\bat\s+)([\w.$]+)\.([\w$<>]+)\(([^)]*)\)/g, (_, p1: string, obfClass: string, obfMethod: string, loc: string) => {
      const originalClass = mapping.classMap.get(obfClass) || obfClass;
      const methodName = mapping.methodMap.get(obfClass)?.get(obfMethod) || obfMethod;
      return `${p1}${originalClass}.${methodName}(${loc})`;
    });
    rewritten = rewritten.replace(/(Caused by:\s+)([\w.$]+)(:)/g, (_, p1: string, obfClass: string, p3: string) => {
      const originalClass = mapping.classMap.get(obfClass) || obfClass;
      return `${p1}${originalClass}${p3}`;
    });
    return rewritten;
  });
  return out.join('\n');
}

export class CrashSymbolicatorPanel {
  public static currentPanel: CrashSymbolicatorPanel | undefined;
  private static readonly viewType = 'androidCrashSymbolicator';
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

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

  static createOrShow(): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (CrashSymbolicatorPanel.currentPanel) {
      CrashSymbolicatorPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      CrashSymbolicatorPanel.viewType,
      'Crash Symbolicator',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    CrashSymbolicatorPanel.currentPanel = new CrashSymbolicatorPanel(panel);
  }

  private async handleMessage(message: { type?: string; mappingPath?: string; stacktrace?: string; output?: string }): Promise<void> {
    if (message.type === 'chooseMapping') {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: { 'Mapping File': ['txt'] },
        title: 'Select mapping.txt',
      });
      if (picked && picked[0]) {
        this.postMessage({ type: 'mappingPath', value: picked[0].fsPath });
      }
      return;
    }
    if (message.type === 'symbolicate') {
      const mappingPath = (message.mappingPath || '').trim();
      const stacktrace = message.stacktrace || '';
      if (!mappingPath) {
        this.postMessage({ type: 'status', level: 'error', text: 'Select mapping.txt first.' });
        return;
      }
      if (!fs.existsSync(mappingPath)) {
        this.postMessage({ type: 'status', level: 'error', text: 'mapping.txt file not found.' });
        return;
      }
      const mappingText = fs.readFileSync(mappingPath, 'utf-8');
      const mapping = parseMapping(mappingText);
      const output = symbolicateStacktrace(stacktrace, mapping);
      this.postMessage({ type: 'output', value: output });
      this.postMessage({ type: 'status', level: 'ok', text: 'Symbolication completed.' });
      return;
    }
    if (message.type === 'openInEditor') {
      const content = message.output || '';
      const doc = await vscode.workspace.openTextDocument({
        language: 'text',
        content,
      });
      await vscode.window.showTextDocument(doc, { preview: false });
      return;
    }
  }

  private postMessage(message: unknown): void {
    this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    CrashSymbolicatorPanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private getHtml(): string {
    const theme = getWebviewThemeStyle();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    ${theme}
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: var(--at-space-3); }
    .row { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
    input, textarea, button { border:1px solid var(--vscode-widget-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: var(--at-radius-sm); padding: 6px 8px; }
    textarea { width:100%; min-height: 180px; font-family: var(--vscode-editor-font-family); }
    input { flex:1; }
    .btn-primary { background: var(--at-info); color: var(--at-info-contrast); border-color: transparent; font-weight: 600; }
    .status { font-size:12px; color: var(--vscode-descriptionForeground); margin-top:8px; }
    .status.error { color: var(--at-error); }
  </style>
</head>
<body>
  <h2>Crash Symbolicator</h2>
  <div class="row">
    <input id="mappingPath" placeholder="Path to mapping.txt" />
    <button id="choose">Choose</button>
  </div>
  <div>
    <div style="margin:8px 0 4px 0;">Stacktrace (obfuscated)</div>
    <textarea id="stack" placeholder="Paste stacktrace here..."></textarea>
  </div>
  <div class="row" style="margin-top:8px;">
    <button id="run" class="btn-primary">Symbolicate</button>
    <button id="open">Open Result in Editor</button>
  </div>
  <div>
    <div style="margin:8px 0 4px 0;">Result</div>
    <textarea id="output" placeholder="Deobfuscated stacktrace appears here..."></textarea>
  </div>
  <div id="status" class="status">Ready.</div>
  <script>
    const vscode = acquireVsCodeApi();
    const mappingPath = document.getElementById('mappingPath');
    const stack = document.getElementById('stack');
    const output = document.getElementById('output');
    const status = document.getElementById('status');
    document.getElementById('choose').onclick = () => vscode.postMessage({ type: 'chooseMapping' });
    document.getElementById('run').onclick = () => vscode.postMessage({ type: 'symbolicate', mappingPath: mappingPath.value, stacktrace: stack.value });
    document.getElementById('open').onclick = () => vscode.postMessage({ type: 'openInEditor', output: output.value });
    window.addEventListener('message', event => {
      const msg = event.data || {};
      if (msg.type === 'mappingPath') mappingPath.value = msg.value || '';
      if (msg.type === 'output') output.value = msg.value || '';
      if (msg.type === 'status') {
        status.textContent = msg.text || '';
        status.className = 'status ' + (msg.level === 'error' ? 'error' : '');
      }
    });
  </script>
</body>
</html>`;
  }
}
