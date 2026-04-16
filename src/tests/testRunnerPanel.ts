import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execCommand } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { runGradleTaskWithResult } from '../gradle/gradleService';
import { showGradleOutput } from '../gradle/gradleOutput';
import { listDevicesDetailed } from '../devices/deviceManager';

interface TestCase {
  className: string;
  name: string;
  failed: boolean;
  message?: string;
}

interface MatrixFailureCluster {
  signature: string;
  count: number;
}

interface MatrixResultRow {
  deviceId: string;
  ok: boolean;
  output: string;
  attempts: number;
  flakyRecovered: boolean;
  clusters: MatrixFailureCluster[];
}

export class TestRunnerPanel {
  public static currentPanel: TestRunnerPanel | undefined;
  private static readonly viewType = 'androidTestRunnerPanel';
  private readonly panel: vscode.WebviewPanel;
  private readonly workspaceRoot: string;
  private readonly moduleName: string;
  private readonly disposables: vscode.Disposable[] = [];
  private lastFailed: TestCase[] = [];
  private lastVariant = 'Debug';

  private constructor(panel: vscode.WebviewPanel, workspaceRoot: string, moduleName: string) {
    this.panel = panel;
    this.workspaceRoot = workspaceRoot;
    this.moduleName = moduleName;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(workspaceRoot: string, moduleName: string): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (TestRunnerPanel.currentPanel) {
      TestRunnerPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      TestRunnerPanel.viewType,
      'Android Test Runner',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    TestRunnerPanel.currentPanel = new TestRunnerPanel(panel, workspaceRoot, moduleName);
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'runUnit': {
        const variant = String(message.variant || 'Debug');
        this.lastVariant = variant;
        const task = `:${this.moduleName}:test${variant}UnitTest`;
        const result = await runGradleTaskWithResult(this.workspaceRoot, task);
        showGradleOutput(task, result, this.workspaceRoot);
        const parsed = this.parseReports('test-results/test');
        this.lastFailed = parsed.filter(t => t.failed);
        this.postMessage({ type: 'results', tests: this.group(parsed), failed: this.lastFailed.length });
        break;
      }
      case 'runInstrumentationMatrix': {
        const variant = String(message.variant || 'Debug');
        this.lastVariant = variant;
        const runner = String(message.runner || '');
        const profileName = String(message.profileName || '');
        const retryPolicy = Math.max(0, Math.min(5, Number(message.retryPolicy ?? 1) || 0));
        if (!runner) {
          this.postMessage({ type: 'status', text: 'Instrumentation runner is required' });
          return;
        }
        const selectedIds = Array.isArray(message.devices) ? message.devices.map(String) : [];
        const results = await this.runInstrumentationMatrix(selectedIds, runner, profileName || undefined, retryPolicy);
        this.postMessage({ type: 'matrixResults', rows: results });
        break;
      }
      case 'loadProfiles': {
        const profiles = await vscode.commands.executeCommand<Array<{ id: string; name: string; updatedAt?: number }>>('android-toolkit.listDeviceStateProfiles');
        this.postMessage({ type: 'profiles', profiles: profiles || [] });
        break;
      }
      case 'loadDevices': {
        const devices = await listDevicesDetailed();
        this.postMessage({ type: 'devices', devices: devices.filter(d => d.status === 'online') });
        break;
      }
      case 'rerunFailed': {
        if (this.lastFailed.length === 0) {
          this.postMessage({ type: 'status', text: 'No failed tests to rerun' });
          return;
        }
        let ok = true;
        for (const test of this.lastFailed) {
          const testSelector = `${test.className}.${test.name}`;
          const task = `:${this.moduleName}:test${this.lastVariant}UnitTest`;
          const result = await runGradleTaskWithResult(this.workspaceRoot, task, ['--tests', testSelector]);
          showGradleOutput(`${task} --tests ${testSelector}`, result, this.workspaceRoot);
          ok = ok && result.exitCode === 0;
        }
        const parsed = this.parseReports('test-results/test');
        this.lastFailed = parsed.filter(t => t.failed);
        this.postMessage({ type: 'results', tests: this.group(parsed), failed: this.lastFailed.length });
        this.postMessage({ type: 'status', text: ok ? 'Re-run finished' : 'Re-run finished with failures' });
        break;
      }
    }
  }

  private parseReports(prefix: string): TestCase[] {
    const dir = path.join(this.workspaceRoot, this.moduleName, 'build', prefix);
    if (!fs.existsSync(dir)) {
      return [];
    }
    const xmlFiles = this.collectFiles(dir).filter(f => f.endsWith('.xml'));
    const tests: TestCase[] = [];
    for (const file of xmlFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const regex = /<testcase[^>]*classname="([^"]+)"[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/testcase>|<testcase[^>]*classname="([^"]+)"[^>]*name="([^"]+)"[^>]*\/>/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const className = match[1] || match[4] || '';
        const name = match[2] || match[5] || '';
        const body = match[3] || '';
        const failed = body.includes('<failure') || body.includes('<error');
        const msg = body.match(/message="([^"]+)"/)?.[1];
        tests.push({ className, name, failed, message: msg });
      }
    }
    return tests;
  }

  private collectFiles(root: string): string[] {
    const out: string[] = [];
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(current, e.name);
        if (e.isDirectory()) {
          stack.push(full);
        } else {
          out.push(full);
        }
      }
    }
    return out;
  }

  private group(tests: TestCase[]): Record<string, TestCase[]> {
    const grouped: Record<string, TestCase[]> = {};
    for (const t of tests) {
      if (!grouped[t.className]) {
        grouped[t.className] = [];
      }
      grouped[t.className].push(t);
    }
    return grouped;
  }

  private clusterFailureSignatures(output: string): MatrixFailureCluster[] {
    const map = new Map<string, number>();
    const lines = output.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      const signature =
        line.match(/(?:AssertionError|ComparisonFailure|NoSuchElementException|NullPointerException|TimeoutException|IllegalStateException|IllegalArgumentException|RuntimeException)\b/)?.[0]
        || line.match(/java\.[A-Za-z0-9_.]+Exception/)?.[0]
        || line.match(/at\s+([A-Za-z0-9_$.]+\.[A-Za-z0-9_$<>]+)\(/)?.[1]
        || line.match(/INSTRUMENTATION_RESULT:\s*shortMsg=(.+)$/)?.[1]
        || line.match(/Process crashed\./)?.[0]
        || undefined;
      if (!signature) {
        continue;
      }
      const next = (map.get(signature) || 0) + 1;
      map.set(signature, next);
    }
    return Array.from(map.entries())
      .map(([signature, count]) => ({ signature, count }))
      .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature))
      .slice(0, 4);
  }

  private async runInstrumentationMatrix(
    deviceIds: string[],
    runner: string,
    profileName?: string,
    retryPolicy = 0
  ): Promise<MatrixResultRow[]> {
    const sdk = detectSdk();
    const rows: MatrixResultRow[] = [];
    await Promise.all(deviceIds.map(async (deviceId) => {
      if (profileName) {
        await vscode.commands.executeCommand('android-toolkit.applyDeviceStateProfileByName', {
          profileName,
          deviceId,
          moduleName: this.moduleName,
        });
      }
      let ok = false;
      let output = '';
      let attempts = 0;
      const clusterMap = new Map<string, number>();
      const maxAttempts = Math.max(1, retryPolicy + 1);
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        attempts = attempt;
        const result = await execCommand(sdk.adb, [
          '-s', deviceId, 'shell', 'am', 'instrument', '-w', runner
        ], { timeout: 600_000 });
        const raw = result.stdout || result.stderr || '';
        output = raw.split('\n').slice(-25).join('\n');
        ok = result.exitCode === 0 && !raw.includes('FAILURES');
        if (!ok) {
          const clusters = this.clusterFailureSignatures(raw);
          for (const row of clusters) {
            clusterMap.set(row.signature, (clusterMap.get(row.signature) || 0) + row.count);
          }
        }
        if (ok) {
          break;
        }
      }

      const clusters = Array.from(clusterMap.entries())
        .map(([signature, count]) => ({ signature, count }))
        .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature))
        .slice(0, 4);
      rows.push({
        deviceId,
        ok,
        output,
        attempts,
        flakyRecovered: ok && attempts > 1,
        clusters,
      });
    }));
    return rows;
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
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-widget-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --muted: var(--vscode-descriptionForeground);
    }
    body { font-family: var(--vscode-font-family); background: var(--bg); color: var(--fg); padding: 12px; }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    select, input, button { border: 1px solid var(--border); background: var(--input-bg); color: var(--input-fg); border-radius: 4px; padding: 6px 8px; }
    button { cursor: pointer; }
    .tree { border: 1px solid var(--border); border-radius: 6px; padding: 8px; max-height: 420px; overflow: auto; }
    .classNode { margin-top: 8px; font-weight: 600; }
    .testNode { margin-left: 14px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
    .fail { color: #e55353; }
    .ok { color: #3fb950; }
    .muted { color: var(--muted); font-size: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="row">
    <select id="variant">
      <option>Debug</option>
      <option>Release</option>
    </select>
    <button id="runUnitBtn">Run Unit</button>
    <button id="rerunFailedBtn">Re-run Failed</button>
  </div>
  <div class="row">
    <input id="runnerInput" placeholder="Instrumentation runner (e.g. com.example.test/androidx.test.runner.AndroidJUnitRunner)" style="flex:1;" />
    <input id="retryInput" type="number" min="0" max="5" value="1" title="Retry count for failed tests" style="width:90px;" />
    <select id="profileSelect" style="min-width:200px;"><option value="">No state profile</option></select>
    <button id="loadProfilesBtn">Load Profiles</button>
    <button id="loadDevicesBtn">Load Devices</button>
    <button id="runMatrixBtn">Run Matrix</button>
  </div>
  <div class="row" id="devicesRow"></div>
  <div class="tree" id="tree"></div>
  <div class="muted" id="status">Ready</div>
  <script>
    const vscode = acquireVsCodeApi();
    const tree = document.getElementById('tree');
    const status = document.getElementById('status');
    const devicesRow = document.getElementById('devicesRow');
    document.getElementById('runUnitBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'runUnit', variant: document.getElementById('variant').value });
      status.textContent = 'Running unit tests...';
    });
    document.getElementById('rerunFailedBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'rerunFailed' });
      status.textContent = 'Re-running failed tests...';
    });
    document.getElementById('loadDevicesBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'loadDevices' });
    });
    document.getElementById('loadProfilesBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'loadProfiles' });
    });
    document.getElementById('runMatrixBtn').addEventListener('click', () => {
      const checks = Array.from(document.querySelectorAll('input[name="dev"]')).filter(n => n.checked).map(n => n.value);
      const profileName = document.getElementById('profileSelect').value;
      vscode.postMessage({
        type: 'runInstrumentationMatrix',
        variant: document.getElementById('variant').value,
        runner: document.getElementById('runnerInput').value.trim(),
        devices: checks,
        profileName,
        retryPolicy: Number(document.getElementById('retryInput').value || 0)
      });
      status.textContent = 'Running instrumentation matrix...';
    });
    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'results') {
        tree.innerHTML = '';
        const grouped = msg.tests || {};
        Object.keys(grouped).forEach(cls => {
          const c = document.createElement('div');
          c.className = 'classNode';
          c.textContent = cls;
          tree.appendChild(c);
          grouped[cls].forEach(t => {
            const n = document.createElement('div');
            n.className = 'testNode ' + (t.failed ? 'fail' : 'ok');
            n.textContent = (t.failed ? 'FAIL ' : 'OK   ') + t.name + (t.message ? ' - ' + t.message : '');
            tree.appendChild(n);
          });
        });
        status.textContent = 'Done. Failed: ' + (msg.failed || 0);
      }
      if (msg.type === 'devices') {
        devicesRow.innerHTML = '';
        (msg.devices || []).forEach(d => {
          const wrap = document.createElement('label');
          wrap.style.marginRight = '10px';
          const i = document.createElement('input');
          i.type = 'checkbox';
          i.name = 'dev';
          i.value = d.id;
          wrap.appendChild(i);
          wrap.append(' ' + d.id);
          devicesRow.appendChild(wrap);
        });
      }
      if (msg.type === 'profiles') {
        const sel = document.getElementById('profileSelect');
        const prev = sel.value;
        sel.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'No state profile';
        sel.appendChild(noneOpt);
        (msg.profiles || []).forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.name;
          opt.textContent = p.name;
          sel.appendChild(opt);
        });
        if (prev) {
          sel.value = prev;
        }
      }
      if (msg.type === 'matrixResults') {
        const rows = msg.rows || [];
        const passed = rows.filter(r => r.ok).length;
        const failed = rows.filter(r => !r.ok).length;
        const flakyRecovered = rows.filter(r => r.flakyRecovered).length;
        status.textContent = 'Matrix done. Pass: ' + passed + ' Fail: ' + failed + ' Flaky recovered: ' + flakyRecovered;
        const lines = [];
        lines.push('Matrix Dashboard');
        lines.push('Pass: ' + passed + '  Fail: ' + failed + '  Flaky recovered: ' + flakyRecovered);
        lines.push('');
        rows.forEach(r => {
          const topCluster = (r.clusters || []).slice(0, 2).map(c => c.signature + ' x' + c.count).join(' | ');
          lines.push((r.ok ? '[OK] ' : '[FAIL] ') + r.deviceId + ' attempts=' + r.attempts + (r.flakyRecovered ? ' (recovered on retry)' : ''));
          lines.push('Top clusters: ' + (topCluster || 'n/a'));
          lines.push(r.output || '');
          lines.push('');
        });
        tree.textContent = lines.join('\n');
      }
      if (msg.type === 'status') {
        status.textContent = msg.text;
      }
    });
    vscode.postMessage({ type: 'loadProfiles' });
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    TestRunnerPanel.currentPanel = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
