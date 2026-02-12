import * as vscode from 'vscode';
import * as fs from 'fs';

interface PreviewItem {
  functionName: string;
  filePath: string;
}

export class ComposePreviewPanel {
  public static currentPanel: ComposePreviewPanel | undefined;
  private static readonly viewType = 'composePreviewPanel';
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private previews: PreviewItem[] = [];

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
    if (ComposePreviewPanel.currentPanel) {
      ComposePreviewPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      ComposePreviewPanel.viewType,
      'Compose Preview (Lite)',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    ComposePreviewPanel.currentPanel = new ComposePreviewPanel(panel);
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'pickFile':
        await this.pickFile();
        return;
      case 'openFile':
        if (message.path) {
          const doc = await vscode.workspace.openTextDocument(message.path);
          await vscode.window.showTextDocument(doc);
        }
        return;
    }
  }

  private async pickFile(): Promise<void> {
    const uri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: { 'Kotlin': ['kt', 'kts'] },
      title: 'Select Kotlin file with @Preview',
    });
    if (!uri || !uri[0]) {
      return;
    }
    const filePath = uri[0].fsPath;
    const content = fs.readFileSync(filePath, 'utf-8');
    this.previews = this.parsePreviews(content, filePath);
    this.postMessage({ type: 'previews', data: this.previews });
  }

  private parsePreviews(content: string, filePath: string): PreviewItem[] {
    const results: PreviewItem[] = [];
    const regex = /@Preview[\s\S]*?fun\s+(\w+)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      results.push({ functionName: match[1], filePath });
    }
    return results;
  }

  private postMessage(message: any): void {
    this.panel.webview.postMessage(message);
  }

  public dispose(): void {
    ComposePreviewPanel.currentPanel = undefined;
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
  <title>Compose Preview (Lite)</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 10px; cursor: pointer; border-radius: 2px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .result { padding: 8px; border: 1px solid var(--vscode-panel-border); margin-top: 8px; border-radius: 4px; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
  </style>
</head>
<body>
  <button onclick="pick()">Pick Kotlin File</button>
  <div id="results"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function pick() { vscode.postMessage({ type: 'pickFile' }); }
    function openFile(path) { vscode.postMessage({ type: 'openFile', path }); }
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'previews') {
        const root = document.getElementById('results');
        root.innerHTML = '';
        if (!msg.data || msg.data.length === 0) {
          root.textContent = 'No @Preview composables found.';
          return;
        }
        for (const item of msg.data) {
          const div = document.createElement('div');
          div.className = 'result';
          div.innerHTML = '<strong>' + item.functionName + '</strong>' +
            '<div class="muted">' + item.filePath + '</div>' +
            '<button onclick="openFile(\\'' + item.filePath + '\\')">Open File</button>';
          root.appendChild(div);
        }
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
