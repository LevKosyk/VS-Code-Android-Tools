import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { RunFailureRecord } from '../run/runDiagnostics';
import { ERROR_REASON_META, ErrorReason, normalizeErrorReason } from '../run/errorTaxonomy';

type KbEntry = {
  reason: ErrorReason;
  why: string;
  autoFix: string;
  manualFix: string;
  docsUrl?: string;
  fileHints: string[];
};

function topReasons(records: RunFailureRecord[], max = 10): Array<{ reason: ErrorReason; count: number }> {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const threshold = Date.now() - weekMs;
  const grouped = new Map<ErrorReason, number>();
  for (const record of records) {
    if (record.timestamp < threshold) {
      continue;
    }
    const reason = normalizeErrorReason(record.reason);
    grouped.set(reason, (grouped.get(reason) || 0) + 1);
  }
  return Array.from(grouped.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

function resolveFileHints(workspaceRoot: string, reason: ErrorReason): string[] {
  const generic = ['build.gradle', 'build.gradle.kts', 'gradle.properties', 'local.properties'];
  const reasonSpecific: Record<string, string[]> = {
    sdkMissing: ['local.properties'],
    buildToolsVersion: ['build.gradle', 'build.gradle.kts'],
    dependencyResolution: ['settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts'],
    signingConfig: ['build.gradle', 'build.gradle.kts', 'keystore.properties'],
    manifestMerge: ['src/main/AndroidManifest.xml'],
    namespaceMissing: ['build.gradle', 'build.gradle.kts'],
  };
  const list = [...new Set([...(reasonSpecific[reason] || []), ...generic])];
  const results: string[] = [];
  for (const rel of list) {
    const abs = path.join(workspaceRoot, rel);
    if (fs.existsSync(abs)) {
      results.push(abs);
    }
  }
  return results.slice(0, 5);
}

export class ErrorKnowledgeBasePanel {
  public static currentPanel: ErrorKnowledgeBasePanel | undefined;
  private static readonly viewType = 'androidToolkitErrorKnowledgeBase';
  private readonly panel: vscode.WebviewPanel;
  private readonly workspaceRoot: string;
  private readonly records: RunFailureRecord[];
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, workspaceRoot: string, records: RunFailureRecord[]) {
    this.panel = panel;
    this.workspaceRoot = workspaceRoot;
    this.records = records;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg), null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(workspaceRoot: string, records: RunFailureRecord[]): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (ErrorKnowledgeBasePanel.currentPanel) {
      ErrorKnowledgeBasePanel.currentPanel.panel.reveal(column);
      ErrorKnowledgeBasePanel.currentPanel.records.splice(0, ErrorKnowledgeBasePanel.currentPanel.records.length, ...records);
      ErrorKnowledgeBasePanel.currentPanel.panel.webview.html = ErrorKnowledgeBasePanel.currentPanel.getHtml();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      ErrorKnowledgeBasePanel.viewType,
      'Error Knowledge Base',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    ErrorKnowledgeBasePanel.currentPanel = new ErrorKnowledgeBasePanel(panel, workspaceRoot, [...records]);
  }

  private getEntries(): KbEntry[] {
    return topReasons(this.records).map(row => {
      const known = ERROR_REASON_META[row.reason] || ERROR_REASON_META.unknown;
      return {
        reason: row.reason,
        why: known.why,
        autoFix: known.autoFix,
        manualFix: known.manualFix,
        docsUrl: known.docsUrl,
        fileHints: resolveFileHints(this.workspaceRoot, row.reason),
      };
    });
  }

  private async handleMessage(message: { type: string; value?: string }): Promise<void> {
    if (message.type === 'openFile' && message.value) {
      const uri = vscode.Uri.file(message.value);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
      return;
    }
    if (message.type === 'openDocs' && message.value) {
      await vscode.env.openExternal(vscode.Uri.parse(message.value));
    }
  }

  private getHtml(): string {
    const cards = this.getEntries()
      .map(entry => {
        const files = entry.fileHints.length > 0
          ? entry.fileHints.map(file => `<button data-file="${escapeHtml(file)}">Open ${escapeHtml(path.basename(file))}</button>`).join(' ')
          : '<span class="muted">No related files detected.</span>';
        const docs = entry.docsUrl
          ? `<button data-docs="${escapeHtml(entry.docsUrl)}">Open docs</button>`
          : '';
        return `<div class="card">
  <h3>${escapeHtml(ERROR_REASON_META[entry.reason].title)} <span class="muted">(${escapeHtml(entry.reason)})</span></h3>
  <p><b>Why:</b> ${escapeHtml(entry.why)}</p>
  <p><b>Auto-fix:</b> ${escapeHtml(entry.autoFix)}</p>
  <p><b>Manual fix:</b> ${escapeHtml(entry.manualFix)}</p>
  <div class="row">${docs}</div>
  <div class="row">${files}</div>
</div>`;
      })
      .join('\n');
    const empty = `<div class="muted">No errors recorded in last 7 days.</div>`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); padding: 12px; }
    .card { border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
    .row { display:flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    button { border: 1px solid var(--vscode-widget-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; padding: 6px 8px; cursor: pointer; }
    button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px; }
    .muted { color: var(--vscode-descriptionForeground); }
    p { margin: 4px 0; }
  </style>
</head>
<body>
  <h2>Error Knowledge Base</h2>
  ${cards || empty}
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('button[data-file]').forEach(b => {
      b.addEventListener('click', () => vscode.postMessage({ type: 'openFile', value: b.getAttribute('data-file') }));
    });
    document.querySelectorAll('button[data-docs]').forEach(b => {
      b.addEventListener('click', () => vscode.postMessage({ type: 'openDocs', value: b.getAttribute('data-docs') }));
    });
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    ErrorKnowledgeBasePanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
