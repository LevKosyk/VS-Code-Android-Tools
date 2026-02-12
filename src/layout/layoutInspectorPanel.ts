import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { detectSdk } from '../core/sdkDetector';
import { listDevices } from '../devices/deviceManager';

interface UiNode {
  text?: string;
  desc?: string;
  resId?: string;
  cls?: string;
  bounds?: { l: number; t: number; r: number; b: number };
}

function parseBounds(value: string): { l: number; t: number; r: number; b: number } | undefined {
  const match = value.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) {
    return undefined;
  }
  return {
    l: parseInt(match[1], 10),
    t: parseInt(match[2], 10),
    r: parseInt(match[3], 10),
    b: parseInt(match[4], 10),
  };
}

function parseUiDump(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  const regex = /<node[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const line = match[0];
    const resId = line.match(/resource-id="([^"]+)"/)?.[1];
    const text = line.match(/text="([^"]*)"/)?.[1];
    const desc = line.match(/content-desc="([^"]*)"/)?.[1];
    const cls = line.match(/class="([^"]+)"/)?.[1];
    const boundsRaw = line.match(/bounds="([^"]+)"/)?.[1];
    const bounds = boundsRaw ? parseBounds(boundsRaw) : undefined;
    nodes.push({ resId, text, desc, cls, bounds });
  }
  return nodes.filter(n => n.bounds);
}

async function runAdbCommand(args: string[]): Promise<void> {
  const sdk = detectSdk();
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(sdk.adb, args, { stdio: 'ignore' });
    proc.on('exit', code => (code === 0 ? resolve() : reject(new Error('adb failed'))));
    proc.on('error', reject);
  });
}

async function captureScreenshot(deviceId: string, outPath: string): Promise<void> {
  const sdk = detectSdk();
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(sdk.adb, ['-s', deviceId, 'exec-out', 'screencap', '-p']);
    const file = fs.createWriteStream(outPath);
    proc.stdout.pipe(file);
    proc.on('exit', code => (code === 0 ? resolve() : reject(new Error('screencap failed'))));
    proc.on('error', reject);
  });
}

async function dumpUi(deviceId: string, outPath: string): Promise<void> {
  const tmpRemote = '/sdcard/__android_tools_uidump.xml';
  await runAdbCommand(['-s', deviceId, 'shell', 'uiautomator', 'dump', tmpRemote]);
  await runAdbCommand(['-s', deviceId, 'pull', tmpRemote, outPath]);
  await runAdbCommand(['-s', deviceId, 'shell', 'rm', '-f', tmpRemote]);
}

export class LayoutInspectorPanel {
  public static currentPanel: LayoutInspectorPanel | undefined;
  private static readonly viewType = 'androidLayoutInspector';
  private readonly panel: vscode.WebviewPanel;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
  }

  public static async createOrShow(): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (!LayoutInspectorPanel.currentPanel) {
      const panel = vscode.window.createWebviewPanel(
        LayoutInspectorPanel.viewType,
        'Layout Inspector',
        column || vscode.ViewColumn.One,
        { enableScripts: true }
      );
      LayoutInspectorPanel.currentPanel = new LayoutInspectorPanel(panel);
    }
    await LayoutInspectorPanel.currentPanel.render();
    LayoutInspectorPanel.currentPanel.panel.reveal(column);
  }

  private async render(): Promise<void> {
    const devices = await listDevices();
    const online = devices.filter(d => d.status === 'online');
    if (online.length === 0) {
      this.panel.webview.html = '<html><body>No online devices.</body></html>';
      return;
    }
    const deviceId = online.length === 1
      ? online[0].id
      : (await vscode.window.showQuickPick(online.map(d => d.id), { placeHolder: 'Select device' })) || online[0].id;
    const tempDir = path.join(require('os').tmpdir(), 'android-tools');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const pngPath = path.join(tempDir, `layout_${Date.now()}.png`);
    const xmlPath = path.join(tempDir, `layout_${Date.now()}.xml`);
    await captureScreenshot(deviceId, pngPath);
    await dumpUi(deviceId, xmlPath);
    const xml = fs.readFileSync(xmlPath, 'utf-8');
    const nodes = parseUiDump(xml);
    const img = fs.readFileSync(pngPath).toString('base64');
    const payload = JSON.stringify(nodes);
    this.panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: sans-serif; margin: 0; padding: 0; }
    .wrap { position: relative; display: inline-block; }
    .overlay { position: absolute; border: 1px solid rgba(255,0,0,0.6); pointer-events: none; }
    .list { max-height: 300px; overflow: auto; border-top: 1px solid #ddd; padding: 8px; }
    .item { font-size: 12px; padding: 4px 0; }
  </style>
</head>
<body>
  <div class="wrap" id="wrap">
    <img id="shot" src="data:image/png;base64,${img}" />
  </div>
  <div style="padding:8px;">
    <input id="search" placeholder="Filter by id/class/text" style="width:100%; padding:4px;" />
  </div>
  <div class="list" id="list"></div>
  <script>
    const nodes = ${payload};
    const wrap = document.getElementById('wrap');
    const list = document.getElementById('list');
    const img = document.getElementById('shot');
    const search = document.getElementById('search');
    function render(filter) {
      wrap.querySelectorAll('.overlay').forEach(el => el.remove());
      list.innerHTML = '';
      const f = filter ? filter.toLowerCase() : '';
      nodes.forEach(n => {
        const label = (n.resId || n.cls || 'View');
        const textMatch = !f || label.toLowerCase().includes(f) || (n.text || '').toLowerCase().includes(f);
        if (!textMatch) return;
        if (n.bounds) {
          const div = document.createElement('div');
          div.className = 'overlay';
          div.style.left = n.bounds.l + 'px';
          div.style.top = n.bounds.t + 'px';
          div.style.width = (n.bounds.r - n.bounds.l) + 'px';
          div.style.height = (n.bounds.b - n.bounds.t) + 'px';
          wrap.appendChild(div);
        }
        const item = document.createElement('div');
        item.className = 'item';
        item.textContent = label + ' [' + n.bounds.l + ',' + n.bounds.t + ',' + n.bounds.r + ',' + n.bounds.b + ']';
        list.appendChild(item);
      });
    }
    img.onload = () => {
      render('');
    };
    search.addEventListener('input', () => render(search.value));
  </script>
</body>
</html>`;
  }
}
