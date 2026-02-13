import * as vscode from 'vscode';
import * as path from 'path';
import { listDevicesDetailed } from '../devices/deviceManager';
import { AdbService } from '../services/adbService';
import { ProfilerService } from '../profiler/profilerService';

export class LayoutEditorPanel {
  public static currentPanel: LayoutEditorPanel | undefined;
  private static readonly viewType = 'androidLayoutEditorLite';
  private readonly panel: vscode.WebviewPanel;
  private readonly document: vscode.TextDocument;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, document: vscode.TextDocument) {
    this.panel = panel;
    this.document = document;
    this.panel.webview.html = this.getHtml(document.getText(), path.basename(document.fileName));
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables
    );
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.toString() !== this.document.uri.toString()) {
          return;
        }
        this.postMessage({ type: 'externalXml', xml: e.document.getText() });
      }),
      this.panel.onDidDispose(() => this.dispose())
    );
  }

  public static createOrShow(document: vscode.TextDocument): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (LayoutEditorPanel.currentPanel) {
      LayoutEditorPanel.currentPanel.panel.reveal(column);
      LayoutEditorPanel.currentPanel.postMessage({ type: 'externalXml', xml: document.getText() });
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      LayoutEditorPanel.viewType,
      `Layout Editor: ${path.basename(document.fileName)}`,
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    LayoutEditorPanel.currentPanel = new LayoutEditorPanel(panel, document);
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'saveXml': {
        const xml = String(message.xml || '');
        if (!xml.trim()) {
          return;
        }
        const edit = new vscode.WorkspaceEdit();
        const full = new vscode.Range(
          this.document.positionAt(0),
          this.document.positionAt(this.document.getText().length)
        );
        edit.replace(this.document.uri, full, xml);
        await vscode.workspace.applyEdit(edit);
        await this.document.save();
        return;
      }
      case 'externalXmlRequest': {
        this.postMessage({ type: 'externalXml', xml: this.document.getText() });
        return;
      }
      case 'getDevices': {
        const devices = await listDevicesDetailed();
        this.postMessage({ type: 'devices', devices: devices.filter(d => d.status === 'online') });
        return;
      }
      case 'captureDevicePreview': {
        const deviceId = String(message.deviceId || '');
        const packageName = String(message.packageName || '');
        if (!deviceId) {
          return;
        }
        const image = await AdbService.captureScreenBase64(deviceId);
        const gfx = packageName
          ? await ProfilerService.getInstance().captureGraphics(deviceId, packageName)
          : { success: false, data: undefined };
        this.postMessage({
          type: 'devicePreview',
          image,
          gfx: gfx.success ? gfx.data : null,
        });
        return;
      }
      case 'fixAllLayoutWarnings': {
        await vscode.commands.executeCommand('android-toolkit.fixAllLayoutWarnings', this.document.uri.toString());
        this.postMessage({ type: 'externalXml', xml: this.document.getText() });
        return;
      }
    }
  }

  private postMessage(message: object): void {
    this.panel.webview.postMessage(message);
  }

  private getHtml(initialXml: string, fileName: string): string {
    const escaped = JSON.stringify(initialXml);
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Layout Editor</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-widget-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --muted: var(--vscode-descriptionForeground);
      --accent: #22c55e;
      --surface: #0b1220;
      --canvas: #f3f4f6;
    }
    body {
      margin:0;
      padding:0;
      color:var(--fg);
      background:
        radial-gradient(circle at top left, color-mix(in srgb, #22c55e22 60%, transparent), transparent 55%),
        var(--bg);
      font-family: var(--vscode-font-family);
    }
    .root { display:grid; grid-template-columns: 260px 1fr 280px; height:100vh; }
    .pane {
      border-right:1px solid var(--border);
      padding:10px;
      overflow:auto;
      backdrop-filter: blur(6px);
    }
    .pane:last-child { border-right:none; border-left:1px solid var(--border); }
    .title { font-size:12px; color:var(--muted); margin-bottom:8px; text-transform:uppercase; letter-spacing:.06em; }
    .btn, select, input, textarea {
      width:100%;
      margin-bottom:8px;
      border:1px solid var(--border);
      background:var(--input-bg);
      color:var(--input-fg);
      border-radius:8px;
      padding:8px;
      font-size:12px;
    }
    .btn { cursor:pointer; text-align:left; transition:all .12s ease; }
    .btn:hover { border-color:color-mix(in srgb, var(--accent) 50%, var(--border)); }
    .btn:disabled { opacity:.5; cursor:not-allowed; }
    .canvasWrap { padding:12px; display:flex; flex-direction:column; gap:10px; }
    .device { width:360px; min-height:640px; background:var(--canvas); border:2px solid #374151; border-radius:24px; margin:auto; position:relative; overflow:hidden; }
    .device.gridOn {
      background-image:
        linear-gradient(to right, rgba(120,120,120,0.15) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(120,120,120,0.15) 1px, transparent 1px);
      background-size: var(--grid-size, 8px) var(--grid-size, 8px);
    }
    .node {
      position:absolute;
      border:1px dashed #9ca3af;
      background:linear-gradient(180deg, #ffffffee 0%, #f8fafccc 100%);
      border-radius:8px;
      padding:6px;
      cursor:move;
      user-select:none;
      font-size:12px;
    }
    .node.sel { border:2px solid var(--accent); box-shadow:0 0 0 2px #22c55e22; }
    .guide { position:absolute; pointer-events:none; background:#22c55e88; z-index:2; }
    .guide.v { width:1px; top:0; bottom:0; }
    .guide.h { height:1px; left:0; right:0; }
    .constraints { position:absolute; inset:0; pointer-events:none; z-index:1; }
    .constraints line { stroke:#2563eb; stroke-width:1.2; stroke-dasharray:4 3; opacity:.75; }
    .constraints circle { fill:#2563eb; opacity:.8; }
    .constraints line.type-toStartOf { stroke:#0891b2; stroke-dasharray:2 3; }
    .constraints line.type-toEndOf { stroke:#2563eb; stroke-dasharray:6 3; }
    .constraints line.type-toTopOf { stroke:#7c3aed; stroke-dasharray:4 2; }
    .constraints line.type-toBottomOf { stroke:#c026d3; stroke-dasharray:1 3; }
    .handle { position:absolute; width:10px; height:10px; border-radius:50%; background:#16a34a; border:1px solid #064e3b; cursor:pointer; z-index:3; }
    .handle.topTo { top:-6px; left:50%; transform:translateX(-50%); }
    .handle.bottomTo { bottom:-6px; left:50%; transform:translateX(-50%); }
    .handle.startTo { left:-6px; top:50%; transform:translateY(-50%); }
    .handle.endTo { right:-6px; top:50%; transform:translateY(-50%); }
    .resizeHandle { position:absolute; width:10px; height:10px; border-radius:2px; background:#f59e0b; border:1px solid #78350f; cursor:nwse-resize; z-index:3; }
    .resizeHandle.nw { left:-6px; top:-6px; cursor:nwse-resize; }
    .resizeHandle.ne { right:-6px; top:-6px; cursor:nesw-resize; }
    .resizeHandle.sw { left:-6px; bottom:-6px; cursor:nesw-resize; }
    .resizeHandle.se { right:-6px; bottom:-6px; cursor:nwse-resize; }
    .toolbar { display:flex; gap:8px; }
    .toolbar .btn { flex:1; margin:0; text-align:center; }
    .preview { border:1px solid var(--border); border-radius:8px; overflow:hidden; background:#000; min-height:180px; }
    .preview img { width:100%; display:block; }
    .muted { color:var(--muted); font-size:11px; }
    .linkRow { display:grid; grid-template-columns: 1fr 1fr; gap:6px; }
    .tree { border:1px solid var(--border); border-radius:8px; padding:6px; margin-bottom:10px; max-height:180px; overflow:auto; }
    .treeItem { border:1px solid transparent; border-radius:6px; padding:6px; font-size:12px; cursor:pointer; }
    .treeItem:hover { background: color-mix(in srgb, var(--input-bg) 85%, transparent); }
    .treeItem.sel { border-color:var(--accent); background: color-mix(in srgb, #22c55e22 65%, transparent); }
    .treeRow { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .badge { font-size:10px; line-height:1; border-radius:10px; padding:3px 6px; border:1px solid transparent; }
    .badge.warn { background:#f59e0b22; border-color:#f59e0b66; color:#92400e; }
    .badge.error { background:#ef444422; border-color:#ef444466; color:#991b1b; }
    .diagPanel { border:1px solid var(--border); border-radius:8px; padding:8px; max-height:190px; overflow:auto; font-size:11px; }
    .diagItem { margin-bottom:6px; padding:6px; border-radius:6px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .diagItem.warn { background:#f59e0b22; }
    .diagItem.error { background:#ef444422; }
    .diagTxt { flex:1; }
    .diagActions { display:flex; gap:6px; }
    .miniBtn { width:auto; margin:0; padding:4px 8px; font-size:11px; border-radius:999px; }
    .diagPreview { margin-bottom:8px; padding:8px; border-radius:8px; border:1px solid #22c55e55; background:#22c55e1a; }
    .diagPreviewList { margin-top:6px; max-height:120px; overflow:auto; font-size:11px; }
    .diagPreviewRow { padding:4px 6px; border-radius:6px; background:#ffffff33; margin-bottom:4px; }
    @media (max-width: 1280px) {
      .root { grid-template-columns: 230px 1fr 250px; }
      .device { width:360px; min-height:640px; }
    }
    @media (max-width: 1024px) {
      .root { grid-template-columns: 1fr; height:auto; }
      .pane { border-right:none; border-bottom:1px solid var(--border); }
      .pane:last-child { border-left:none; }
      .canvasWrap { order:-1; }
      .device { width:100%; max-width:360px; min-height:540px; }
    }
  </style>
</head>
<body>
  <div class="root">
    <div class="pane">
      <div class="title">Palette</div>
      <button class="btn" data-add="TextView">+ TextView</button>
      <button class="btn" data-add="Button">+ Button</button>
      <button class="btn" data-add="EditText">+ EditText</button>
      <button class="btn" data-add="ImageView">+ ImageView</button>
      <button class="btn" data-add="CheckBox">+ CheckBox</button>
      <button class="btn" data-add="Switch">+ Switch</button>
      <button class="btn" data-add="ProgressBar">+ ProgressBar</button>
      <div class="title">Actions</div>
      <div class="toolbar">
        <button id="saveBtn" class="btn">Apply XML</button>
        <button id="refreshBtn" class="btn">Reload</button>
      </div>
      <div class="toolbar">
        <button id="undoBtn" class="btn">Undo</button>
        <button id="redoBtn" class="btn">Redo</button>
      </div>
      <div class="toolbar">
        <button id="alignLeftBtn" class="btn">Align Left</button>
        <button id="alignTopBtn" class="btn">Align Top</button>
      </div>
      <div class="toolbar">
        <button id="distHBtn" class="btn">Distribute H</button>
        <button id="distVBtn" class="btn">Distribute V</button>
      </div>
      <div class="toolbar">
        <button id="clearSelBtn" class="btn">Clear Selection</button>
        <button id="deleteSelBtn" class="btn">Delete</button>
      </div>
      <label class="muted"><input id="snapGrid" type="checkbox" checked /> Snap to grid</label>
      <input id="gridSize" type="number" value="8" min="2" max="64" />
      <label class="muted">Live write mode</label>
      <select id="liveMode">
        <option value="onType">onType</option>
        <option value="onSave">onSave</option>
      </select>
      <div class="muted">Multi-select: Cmd/Ctrl-click</div>
      <div class="muted">${fileName}</div>
    </div>
    <div class="canvasWrap">
      <div class="device" id="canvas"></div>
      <div class="preview" id="devicePreview"></div>
      <div class="toolbar">
        <button id="toggleLiveBtn" class="btn">Start Device Live Preview</button>
      </div>
      <div class="linkRow">
        <select id="deviceSelect"></select>
        <input id="packageInput" placeholder="package for hotspots" />
      </div>
      <div class="muted" id="gfxMeta"></div>
    </div>
    <div class="pane">
      <div class="title">Component Tree</div>
      <div id="componentTree" class="tree"></div>
      <div class="title">Properties</div>
      <div class="title">Common</div>
      <input id="propId" placeholder="id (e.g. titleText)" />
      <div class="title">Text</div>
      <input id="propText" placeholder="text" />
      <div class="title">Layout</div>
      <div class="linkRow">
        <input id="propX" type="number" placeholder="x" />
        <input id="propY" type="number" placeholder="y" />
      </div>
      <div class="linkRow">
        <input id="propW" type="number" placeholder="width" />
        <input id="propH" type="number" placeholder="height" />
      </div>
      <div class="title">Constraints</div>
      <div class="linkRow">
        <select id="topTo"><option value="">topTo</option></select>
        <select id="topType">
          <option value="toTopOf">toTopOf</option>
          <option value="toBottomOf">toBottomOf</option>
        </select>
      </div>
      <div class="linkRow">
        <select id="startTo"><option value="">startTo</option></select>
        <select id="startType">
          <option value="toStartOf">toStartOf</option>
          <option value="toEndOf">toEndOf</option>
        </select>
      </div>
      <div class="linkRow">
        <select id="endTo"><option value="">endTo</option></select>
        <select id="endType">
          <option value="toEndOf">toEndOf</option>
          <option value="toStartOf">toStartOf</option>
        </select>
      </div>
      <div class="linkRow">
        <select id="bottomTo"><option value="">bottomTo</option></select>
        <select id="bottomType">
          <option value="toBottomOf">toBottomOf</option>
          <option value="toTopOf">toTopOf</option>
        </select>
      </div>
      <div class="title">Visibility</div>
      <select id="propVisibility">
        <option value="visible">visible</option>
        <option value="invisible">invisible</option>
        <option value="gone">gone</option>
      </select>
      <button id="applyPropsBtn" class="btn">Apply Properties</button>
      <div class="title">Constraint Diagnostics</div>
      <label class="muted"><input id="safeFixMode" type="checkbox" checked /> Safe Auto-Fix (preview first)</label>
      <div class="toolbar">
        <button id="fixAllDiagnosticsBtn" class="btn">Auto-Fix All</button>
        <button id="undoDiagFixBtn" class="btn">Undo Last Fix</button>
      </div>
      <button id="fixAllAndroidLintBtn" class="btn">Fix All (Android Lint)</button>
      <div class="toolbar">
        <button id="applyPreviewBtn" class="btn">Apply Preview</button>
        <button id="discardPreviewBtn" class="btn">Discard Preview</button>
      </div>
      <div id="diagnosticsPanel" class="diagPanel"></div>
      <div class="muted">Tip: click green handle on selected block, then click target block to connect constraint.</div>
      <div class="title">XML Preview</div>
      <textarea id="xmlPreview" rows="18"></textarea>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const canvas = document.getElementById('canvas');
    const xmlPreview = document.getElementById('xmlPreview');
    const devicePreview = document.getElementById('devicePreview');
    const gfxMeta = document.getElementById('gfxMeta');
    const deviceSelect = document.getElementById('deviceSelect');
    const packageInput = document.getElementById('packageInput');
    const componentTree = document.getElementById('componentTree');
    const diagnosticsPanel = document.getElementById('diagnosticsPanel');
    const safeFixModeEl = document.getElementById('safeFixMode');
    const applyPreviewBtn = document.getElementById('applyPreviewBtn');
    const discardPreviewBtn = document.getElementById('discardPreviewBtn');
    const saveBtn = document.getElementById('saveBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const alignLeftBtn = document.getElementById('alignLeftBtn');
    const alignTopBtn = document.getElementById('alignTopBtn');
    const distHBtn = document.getElementById('distHBtn');
    const distVBtn = document.getElementById('distVBtn');
    const clearSelBtn = document.getElementById('clearSelBtn');
    const deleteSelBtn = document.getElementById('deleteSelBtn');
    const applyPropsBtn = document.getElementById('applyPropsBtn');
    const fixAllDiagnosticsBtn = document.getElementById('fixAllDiagnosticsBtn');
    const undoDiagFixBtn = document.getElementById('undoDiagFixBtn');
    const fixAllAndroidLintBtn = document.getElementById('fixAllAndroidLintBtn');
    const toggleLiveBtn = document.getElementById('toggleLiveBtn');
    const snapGridEl = document.getElementById('snapGrid');
    const gridSizeEl = document.getElementById('gridSize');
    const liveModeEl = document.getElementById('liveMode');
    const props = {
      id: document.getElementById('propId'),
      text: document.getElementById('propText'),
      x: document.getElementById('propX'),
      y: document.getElementById('propY'),
      w: document.getElementById('propW'),
      h: document.getElementById('propH'),
      topTo: document.getElementById('topTo'),
      topType: document.getElementById('topType'),
      startTo: document.getElementById('startTo'),
      startType: document.getElementById('startType'),
      endTo: document.getElementById('endTo'),
      endType: document.getElementById('endType'),
      bottomTo: document.getElementById('bottomTo'),
      bottomType: document.getElementById('bottomType'),
      visibility: document.getElementById('propVisibility'),
    };
    const textCapable = new Set(['TextView', 'Button', 'EditText', 'CheckBox', 'Switch']);
    const paletteTypes = new Set(['TextView', 'Button', 'EditText', 'ImageView', 'CheckBox', 'Switch', 'ProgressBar']);
    const DEVICE_WIDTH = 360;
    const DEVICE_HEIGHT = 640;
    let nodes = [];
    let selectedIds = new Set();
    let selectedAnchorId = '';
    let drag = null;
    let resize = null;
    let liveTimer = null;
    let saveTimer = null;
    let pendingConstraintSide = '';
    let guide = { x: null, y: null };
    let history = [];
    let historyIndex = -1;
    let diagnostics = [];
    let nodeIssueSeverity = {};
    let diagnosticsFixUndoStack = [];
    let pendingFixPreview = null;

    deviceSelect.innerHTML = '<option value="">Loading devices...</option>';

    function cloneNodes(input) {
      return JSON.parse(JSON.stringify(input));
    }
    function resetHistory() {
      history = [cloneNodes(nodes)];
      historyIndex = 0;
    }
    function pushHistory() {
      const snapshot = cloneNodes(nodes);
      history = history.slice(0, historyIndex + 1);
      history.push(snapshot);
      historyIndex = history.length - 1;
      pendingFixPreview = null;
    }
    function restoreHistory(nextIndex) {
      if (nextIndex < 0 || nextIndex >= history.length) return;
      historyIndex = nextIndex;
      nodes = cloneNodes(history[historyIndex]);
      syncSelectionState();
      bindProps();
      render();
      scheduleSave(toXml());
    }
    function getSelectedNodes() {
      return nodes.filter(n => selectedIds.has(n.id));
    }
    function getPrimarySelected() {
      if (!selectedAnchorId) return null;
      return nodes.find(n => n.id === selectedAnchorId) || null;
    }
    function setSingleSelection(id) {
      selectedIds = new Set(id ? [id] : []);
      selectedAnchorId = id || '';
    }
    function toggleSelection(id) {
      if (!id) return;
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
        if (selectedAnchorId === id) {
          selectedAnchorId = selectedIds.values().next().value || '';
        }
      } else {
        selectedIds.add(id);
        selectedAnchorId = id;
      }
    }
    function createNode(type) {
      const index = nodes.length + 1;
      const id = (type.charAt(0).toLowerCase() + type.slice(1)) + index;
      const base = {
        id,
        type,
        text: textCapable.has(type) ? type : '',
        visibility: 'visible',
        x: 24,
        y: 24 + nodes.length * 56,
        w: 140,
        h: 44,
        constraints: {
          topTo: 'parent',
          topType: 'toTopOf',
          startTo: 'parent',
          startType: 'toStartOf',
          endTo: '',
          endType: 'toEndOf',
          bottomTo: '',
          bottomType: 'toBottomOf'
        }
      };
      if (type === 'ProgressBar') {
        base.w = 160;
        base.h = 20;
      }
      return base;
    }
    function syncSelectionState() {
      const ids = new Set(nodes.map(n => n.id));
      selectedIds = new Set([...selectedIds].filter(id => ids.has(id)));
      if (!selectedIds.size && nodes[0]) {
        selectedIds.add(nodes[0].id);
      }
      if (!selectedIds.has(selectedAnchorId)) {
        selectedAnchorId = selectedIds.values().next().value || '';
      }
    }
    function normalizeConstraints(targetNodes = nodes) {
      const existing = new Set(targetNodes.map(n => n.id));
      const keepOrClear = (value) => !value || value === 'parent' || existing.has(value) ? value : '';
      for (const n of targetNodes) {
        n.visibility = n.visibility || 'visible';
        n.constraints = n.constraints || {};
        n.constraints.topTo = keepOrClear(n.constraints.topTo || '');
        n.constraints.topType = n.constraints.topType === 'toBottomOf' ? 'toBottomOf' : 'toTopOf';
        n.constraints.startTo = keepOrClear(n.constraints.startTo || '');
        n.constraints.startType = n.constraints.startType === 'toEndOf' ? 'toEndOf' : 'toStartOf';
        n.constraints.endTo = keepOrClear(n.constraints.endTo || '');
        n.constraints.endType = n.constraints.endType === 'toStartOf' ? 'toStartOf' : 'toEndOf';
        n.constraints.bottomTo = keepOrClear(n.constraints.bottomTo || '');
        n.constraints.bottomType = n.constraints.bottomType === 'toTopOf' ? 'toTopOf' : 'toBottomOf';
      }
    }

    function maybeSnap(v) {
      if (!snapGridEl.checked) return v;
      const g = Math.max(2, parseInt(gridSizeEl.value, 10) || 8);
      return Math.round(v / g) * g;
    }
    function scheduleSave(xml) {
      if (liveModeEl.value !== 'onType') return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        vscode.postMessage({ type: 'saveXml', xml });
      }, 500);
    }

    function parseXml(xml) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const out = [];
      let idx = 1;
      const candidates = Array.from(doc.documentElement ? doc.documentElement.children : []);
      for (const n of candidates) {
        const tag = n.tagName.includes('.') ? n.tagName.split('.').pop() : n.tagName;
        if (!paletteTypes.has(tag)) continue;
        const rawId = n.getAttribute('android:id') || '';
        const id = rawId.replace('@+id/','').replace('@id/','') || ('node' + idx++);
        const text = n.getAttribute('android:text') || (textCapable.has(tag) ? tag : '');
        const mStart = parseInt((n.getAttribute('android:layout_marginStart')||'24').replace('dp',''),10) || 24;
        const mTop = parseInt((n.getAttribute('android:layout_marginTop')||String(24+out.length*56)).replace('dp',''),10) || (24+out.length*56);
        const width = parseInt((n.getAttribute('android:layout_width')||'120').replace('dp','').replace('wrap_content','120').replace('match_parent','300'),10) || 120;
        const height = parseInt((n.getAttribute('android:layout_height')||'44').replace('dp','').replace('wrap_content','44').replace('match_parent','44'),10) || 44;
        out.push({
          id, type: tag, text,
          visibility: n.getAttribute('android:visibility') || 'visible',
          x: mStart, y: mTop, w: width, h: height,
          constraints: {
            topTo: (n.getAttribute('app:layout_constraintTop_toTopOf')||n.getAttribute('app:layout_constraintTop_toBottomOf')||'').replace('@id/',''),
            topType: n.getAttribute('app:layout_constraintTop_toBottomOf') ? 'toBottomOf' : 'toTopOf',
            startTo: (n.getAttribute('app:layout_constraintStart_toStartOf')||n.getAttribute('app:layout_constraintStart_toEndOf')||'').replace('@id/',''),
            startType: n.getAttribute('app:layout_constraintStart_toEndOf') ? 'toEndOf' : 'toStartOf',
            endTo: (n.getAttribute('app:layout_constraintEnd_toEndOf')||n.getAttribute('app:layout_constraintEnd_toStartOf')||'').replace('@id/',''),
            endType: n.getAttribute('app:layout_constraintEnd_toStartOf') ? 'toStartOf' : 'toEndOf',
            bottomTo: (n.getAttribute('app:layout_constraintBottom_toBottomOf')||n.getAttribute('app:layout_constraintBottom_toTopOf')||'').replace('@id/',''),
            bottomType: n.getAttribute('app:layout_constraintBottom_toTopOf') ? 'toTopOf' : 'toBottomOf',
          }
        });
      }
      return out;
    }
    function esc(v) { return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
    function toXml() {
      const constraintAttr = {
        topType: { toTopOf: 'app:layout_constraintTop_toTopOf', toBottomOf: 'app:layout_constraintTop_toBottomOf' },
        startType: { toStartOf: 'app:layout_constraintStart_toStartOf', toEndOf: 'app:layout_constraintStart_toEndOf' },
        endType: { toEndOf: 'app:layout_constraintEnd_toEndOf', toStartOf: 'app:layout_constraintEnd_toStartOf' },
        bottomType: { toBottomOf: 'app:layout_constraintBottom_toBottomOf', toTopOf: 'app:layout_constraintBottom_toTopOf' },
      };
      const refFor = (value) => value === 'parent' ? 'parent' : '@id/' + esc(value);
      const lines = [];
      lines.push('<?xml version="1.0" encoding="utf-8"?>');
      lines.push('<androidx.constraintlayout.widget.ConstraintLayout xmlns:android="http://schemas.android.com/apk/res/android" xmlns:app="http://schemas.android.com/apk/res-auto" android:layout_width="match_parent" android:layout_height="match_parent">');
      for (const n of nodes) {
        lines.push('  <' + n.type);
        lines.push('      android:id="@+id/' + esc(n.id) + '"');
        lines.push('      android:layout_width="' + (n.w||120) + 'dp"');
        lines.push('      android:layout_height="' + (n.h||44) + 'dp"');
        lines.push('      android:layout_marginStart="' + (n.x||0) + 'dp"');
        lines.push('      android:layout_marginTop="' + (n.y||0) + 'dp"');
        if (textCapable.has(n.type)) lines.push('      android:text="' + esc(n.text || n.type) + '"');
        if (n.visibility && n.visibility !== 'visible') lines.push('      android:visibility="' + esc(n.visibility) + '"');
        if (n.constraints.topTo) lines.push('      ' + constraintAttr.topType[n.constraints.topType || 'toTopOf'] + '="' + refFor(n.constraints.topTo) + '"');
        if (n.constraints.startTo) lines.push('      ' + constraintAttr.startType[n.constraints.startType || 'toStartOf'] + '="' + refFor(n.constraints.startTo) + '"');
        if (n.constraints.endTo) lines.push('      ' + constraintAttr.endType[n.constraints.endType || 'toEndOf'] + '="' + refFor(n.constraints.endTo) + '"');
        if (n.constraints.bottomTo) lines.push('      ' + constraintAttr.bottomType[n.constraints.bottomType || 'toBottomOf'] + '="' + refFor(n.constraints.bottomTo) + '"');
        lines.push('      />');
      }
      lines.push('</androidx.constraintlayout.widget.ConstraintLayout>');
      return lines.join('\\n');
    }
    function renderConstraintOptions() {
      const opts = ['','parent', ...nodes.map(n=>n.id)];
      ['topTo','startTo','endTo','bottomTo'].forEach(k => {
        const s = props[k];
        const v = s.value;
        s.innerHTML = '';
        opts.forEach(o => {
          const op = document.createElement('option');
          op.value = o;
          op.textContent = o ? o : k;
          s.appendChild(op);
        });
        s.value = opts.includes(v) ? v : '';
      });
    }
    function setButtonDisabled(button, disabled) {
      if (!button) return;
      button.disabled = disabled;
    }
    function renderActionStates() {
      const selectedCount = selectedIds.size;
      const hasPrimary = !!getPrimarySelected();
      const hasDiagnostics = diagnostics.length > 0;
      const hasPreview = !!pendingFixPreview;
      setButtonDisabled(saveBtn, !xmlPreview.value.trim());
      setButtonDisabled(refreshBtn, false);
      setButtonDisabled(undoBtn, historyIndex <= 0);
      setButtonDisabled(redoBtn, historyIndex >= history.length - 1);
      setButtonDisabled(clearSelBtn, selectedCount === 0);
      setButtonDisabled(deleteSelBtn, selectedCount === 0);
      setButtonDisabled(applyPropsBtn, !hasPrimary);
      setButtonDisabled(alignLeftBtn, selectedCount < 2);
      setButtonDisabled(alignTopBtn, selectedCount < 2);
      setButtonDisabled(distHBtn, selectedCount < 2);
      setButtonDisabled(distVBtn, selectedCount < 2);
      setButtonDisabled(fixAllDiagnosticsBtn, !hasDiagnostics);
      setButtonDisabled(fixAllAndroidLintBtn, !nodes.length);
      setButtonDisabled(undoDiagFixBtn, diagnosticsFixUndoStack.length === 0);
      setButtonDisabled(applyPreviewBtn, !hasPreview);
      setButtonDisabled(discardPreviewBtn, !hasPreview);
      setButtonDisabled(toggleLiveBtn, !deviceSelect.value);
      if (!deviceSelect.value) {
        gfxMeta.textContent = 'No online device selected.';
      }
    }
    function clampNodeIntoCanvas(node) {
      node.w = Math.max(36, Math.min(node.w, DEVICE_WIDTH));
      node.h = Math.max(24, Math.min(node.h, DEVICE_HEIGHT));
      node.x = Math.max(0, Math.min(DEVICE_WIDTH - node.w, maybeSnap(node.x)));
      node.y = Math.max(0, Math.min(DEVICE_HEIGHT - node.h, maybeSnap(node.y)));
    }
    function applyDiagnosticFix(diag, targetNodes = nodes) {
      if (!diag) return false;
      if (diag.kind === 'missingHorizontal') {
        const n = targetNodes.find(item => item.id === diag.ids[0]);
        if (!n) return false;
        n.constraints.startTo = 'parent';
        n.constraints.startType = 'toStartOf';
        return true;
      }
      if (diag.kind === 'missingVertical') {
        const n = targetNodes.find(item => item.id === diag.ids[0]);
        if (!n) return false;
        n.constraints.topTo = 'parent';
        n.constraints.topType = 'toTopOf';
        return true;
      }
      if (diag.kind === 'offScreen') {
        const n = targetNodes.find(item => item.id === diag.ids[0]);
        if (!n) return false;
        clampNodeIntoCanvas(n);
        return true;
      }
      if (diag.kind === 'overlap') {
        const a = targetNodes.find(item => item.id === diag.ids[0]);
        const b = targetNodes.find(item => item.id === diag.ids[1]);
        if (!a || !b) return false;
        b.y = maybeSnap(a.y + a.h + 12);
        b.x = maybeSnap(a.x);
        clampNodeIntoCanvas(b);
        if (!b.constraints.topTo && !b.constraints.bottomTo) {
          b.constraints.topTo = a.id;
          b.constraints.topType = 'toBottomOf';
        }
        return true;
      }
      return false;
    }
    function buildFixPreview(diagList) {
      const simulated = cloneNodes(nodes);
      let changed = false;
      for (const diag of diagList) {
        changed = applyDiagnosticFix(diag, simulated) || changed;
      }
      if (!changed) return null;
      normalizeConstraints(simulated);
      const beforeMap = new Map(nodes.map(n => [n.id, n]));
      const afterMap = new Map(simulated.map(n => [n.id, n]));
      const fields = ['x', 'y', 'w', 'h', 'visibility', 'topTo', 'topType', 'startTo', 'startType', 'endTo', 'endType', 'bottomTo', 'bottomType'];
      const changes = [];
      for (const [id, afterNode] of afterMap.entries()) {
        const beforeNode = beforeMap.get(id);
        if (!beforeNode) continue;
        const parts = [];
        const from = {
          x: beforeNode.x, y: beforeNode.y, w: beforeNode.w, h: beforeNode.h, visibility: beforeNode.visibility,
          topTo: beforeNode.constraints.topTo, topType: beforeNode.constraints.topType,
          startTo: beforeNode.constraints.startTo, startType: beforeNode.constraints.startType,
          endTo: beforeNode.constraints.endTo, endType: beforeNode.constraints.endType,
          bottomTo: beforeNode.constraints.bottomTo, bottomType: beforeNode.constraints.bottomType,
        };
        const to = {
          x: afterNode.x, y: afterNode.y, w: afterNode.w, h: afterNode.h, visibility: afterNode.visibility,
          topTo: afterNode.constraints.topTo, topType: afterNode.constraints.topType,
          startTo: afterNode.constraints.startTo, startType: afterNode.constraints.startType,
          endTo: afterNode.constraints.endTo, endType: afterNode.constraints.endType,
          bottomTo: afterNode.constraints.bottomTo, bottomType: afterNode.constraints.bottomType,
        };
        for (const field of fields) {
          if (String(from[field]) !== String(to[field])) {
            parts.push(field + ': ' + String(from[field] || '(empty)') + ' -> ' + String(to[field] || '(empty)'));
          }
        }
        if (parts.length) {
          changes.push({ id, parts });
        }
      }
      return {
        before: cloneNodes(nodes),
        after: simulated,
        applied: diagList.length,
        changes,
      };
    }
    function applyDiagnosticsChanges(snapshotBefore, nextNodes) {
      diagnosticsFixUndoStack.push(snapshotBefore);
      if (diagnosticsFixUndoStack.length > 50) {
        diagnosticsFixUndoStack.shift();
      }
      nodes = cloneNodes(nextNodes);
      normalizeConstraints();
      syncSelectionState();
      bindProps();
      pushHistory();
      pendingFixPreview = null;
      render();
      scheduleSave(toXml());
    }
    function applyAllDiagnostics() {
      const snapshot = [...diagnostics];
      if (!snapshot.length) return;
      const preview = buildFixPreview(snapshot);
      if (!preview) return;
      if (safeFixModeEl.checked) {
        pendingFixPreview = preview;
        render();
        return;
      }
      applyDiagnosticsChanges(preview.before, preview.after);
    }
    function applyPreviewedDiagnostics() {
      if (!pendingFixPreview) return;
      applyDiagnosticsChanges(pendingFixPreview.before, pendingFixPreview.after);
    }
    function discardPreviewedDiagnostics() {
      pendingFixPreview = null;
      render();
    }
    function undoLastDiagnosticsFix() {
      if (!diagnosticsFixUndoStack.length) return;
      nodes = diagnosticsFixUndoStack.pop();
      normalizeConstraints();
      syncSelectionState();
      bindProps();
      pushHistory();
      pendingFixPreview = null;
      render();
      scheduleSave(toXml());
    }
    function collectDiagnostics() {
      const list = [];
      const severityRank = { warn: 1, error: 2 };
      const issueMap = {};
      const addIssue = (severity, kind, message, ids) => {
        list.push({ id: kind + ':' + ids.join('|'), severity, kind, message, ids });
        ids.forEach(id => {
          const prev = issueMap[id];
          if (!prev || severityRank[severity] > severityRank[prev]) {
            issueMap[id] = severity;
          }
        });
      };
      for (const n of nodes) {
        if (!n.constraints.startTo && !n.constraints.endTo) {
          addIssue('warn', 'missingHorizontal', n.id + ': missing horizontal constraint', [n.id]);
        }
        if (!n.constraints.topTo && !n.constraints.bottomTo) {
          addIssue('warn', 'missingVertical', n.id + ': missing vertical constraint', [n.id]);
        }
        if (n.x < 0 || n.y < 0 || n.x + n.w > DEVICE_WIDTH || n.y + n.h > DEVICE_HEIGHT) {
          addIssue('error', 'offScreen', n.id + ': off-screen bounds', [n.id]);
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
          if (overlap) {
            addIssue('warn', 'overlap', 'Overlap: ' + a.id + ' & ' + b.id, [a.id, b.id]);
          }
        }
      }
      diagnostics = list;
      nodeIssueSeverity = issueMap;
    }
    function renderDiagnostics() {
      diagnosticsPanel.innerHTML = '';
      if (pendingFixPreview) {
        const prev = document.createElement('div');
        prev.className = 'diagPreview';
        const title = document.createElement('div');
        title.textContent = 'Preview ready: ' + pendingFixPreview.applied + ' fixes. Review and press Apply Preview.';
        prev.appendChild(title);
        if (pendingFixPreview.changes && pendingFixPreview.changes.length) {
          const list = document.createElement('div');
          list.className = 'diagPreviewList';
          pendingFixPreview.changes.forEach(change => {
            const row = document.createElement('div');
            row.className = 'diagPreviewRow';
            row.textContent = change.id + ' | ' + change.parts.join('; ');
            list.appendChild(row);
          });
          prev.appendChild(list);
        }
        diagnosticsPanel.appendChild(prev);
      }
      if (!diagnostics.length) {
        const clean = document.createElement('div');
        clean.className = 'muted';
        clean.textContent = 'No issues found';
        diagnosticsPanel.appendChild(clean);
        return;
      }
      diagnostics.forEach(item => {
        const row = document.createElement('div');
        row.className = 'diagItem ' + item.severity;
        const txt = document.createElement('div');
        txt.className = 'diagTxt';
        txt.textContent = '[' + item.severity.toUpperCase() + '] ' + item.message;
        row.appendChild(txt);
        const actions = document.createElement('div');
        actions.className = 'diagActions';
        const focusBtn = document.createElement('button');
        focusBtn.className = 'btn miniBtn';
        focusBtn.textContent = 'Focus';
        focusBtn.addEventListener('click', () => {
          const id = item.ids[0];
          if (!id) return;
          setSingleSelection(id);
          bindProps();
          render();
        });
        const fixBtn = document.createElement('button');
        fixBtn.className = 'btn miniBtn';
        fixBtn.textContent = 'Fix';
        fixBtn.addEventListener('click', () => {
          const preview = buildFixPreview([item]);
          if (!preview) return;
          if (safeFixModeEl.checked) {
            pendingFixPreview = preview;
            render();
            return;
          }
          applyDiagnosticsChanges(preview.before, preview.after);
        });
        actions.appendChild(focusBtn);
        actions.appendChild(fixBtn);
        row.appendChild(actions);
        diagnosticsPanel.appendChild(row);
      });
    }
    function renderComponentTree() {
      componentTree.innerHTML = '';
      if (!nodes.length) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'No components. Add from palette.';
        componentTree.appendChild(empty);
        return;
      }
      for (const n of nodes) {
        const row = document.createElement('div');
        row.className = 'treeItem' + (selectedIds.has(n.id) ? ' sel' : '');
        const wrap = document.createElement('div');
        wrap.className = 'treeRow';
        const label = document.createElement('span');
        label.textContent = n.type + ' (' + n.id + ')';
        wrap.appendChild(label);
        const severity = nodeIssueSeverity[n.id];
        if (severity) {
          const badge = document.createElement('span');
          badge.className = 'badge ' + severity;
          badge.textContent = severity === 'error' ? 'error' : 'warn';
          wrap.appendChild(badge);
        }
        row.appendChild(wrap);
        row.addEventListener('click', (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) {
            toggleSelection(n.id);
          } else {
            setSingleSelection(n.id);
          }
          bindProps();
          render();
        });
        componentTree.appendChild(row);
      }
    }
    function renderConstraintLines() {
      const svgNs = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNs, 'svg');
      svg.setAttribute('class', 'constraints');
      const resolveAnchor = (targetId, side, type, fallbackX, fallbackY) => {
        let tx = fallbackX;
        let ty = fallbackY;
        if (targetId === 'parent') {
          if (side === 'topTo') ty = type === 'toBottomOf' ? DEVICE_HEIGHT : 0;
          if (side === 'bottomTo') ty = type === 'toTopOf' ? 0 : DEVICE_HEIGHT;
          if (side === 'startTo') tx = type === 'toEndOf' ? DEVICE_WIDTH : 0;
          if (side === 'endTo') tx = type === 'toStartOf' ? 0 : DEVICE_WIDTH;
          return [tx, ty];
        }
        const t = nodes.find(item => item.id === targetId);
        if (!t) return [tx, ty];
        if (side === 'topTo') {
          tx = t.x + t.w / 2;
          ty = type === 'toBottomOf' ? t.y + t.h : t.y;
        }
        if (side === 'bottomTo') {
          tx = t.x + t.w / 2;
          ty = type === 'toTopOf' ? t.y : t.y + t.h;
        }
        if (side === 'startTo') {
          tx = type === 'toEndOf' ? t.x + t.w : t.x;
          ty = t.y + t.h / 2;
        }
        if (side === 'endTo') {
          tx = type === 'toStartOf' ? t.x : t.x + t.w;
          ty = t.y + t.h / 2;
        }
        return [tx, ty];
      };
      for (const n of nodes) {
        const map = [
          ['topTo', 'topType', n.x + n.w / 2, n.y],
          ['bottomTo', 'bottomType', n.x + n.w / 2, n.y + n.h],
          ['startTo', 'startType', n.x, n.y + n.h / 2],
          ['endTo', 'endType', n.x + n.w, n.y + n.h / 2],
        ];
        for (const [side, typeKey, sx, sy] of map) {
          const targetId = n.constraints[side];
          if (!targetId) continue;
          const type = n.constraints[typeKey] || '';
          const [tx, ty] = resolveAnchor(targetId, side, type, sx, sy);
          const line = document.createElementNS(svgNs, 'line');
          line.setAttribute('x1', String(sx));
          line.setAttribute('y1', String(sy));
          line.setAttribute('x2', String(tx));
          line.setAttribute('y2', String(ty));
          if (type) {
            line.setAttribute('class', 'type-' + type);
          }
          svg.appendChild(line);
          const dot = document.createElementNS(svgNs, 'circle');
          dot.setAttribute('cx', String(tx));
          dot.setAttribute('cy', String(ty));
          dot.setAttribute('r', '2');
          svg.appendChild(dot);
        }
      }
      canvas.appendChild(svg);
    }
    function render() {
      canvas.innerHTML = '';
      const g = Math.max(2, parseInt(gridSizeEl.value, 10) || 8);
      canvas.classList.toggle('gridOn', snapGridEl.checked);
      canvas.style.setProperty('--grid-size', g + 'px');
      renderConstraintOptions();
      collectDiagnostics();
      renderComponentTree();
      renderDiagnostics();
      for (const n of nodes) {
        const el = document.createElement('div');
        el.className = 'node' + (selectedIds.has(n.id) ? ' sel' : '');
        el.style.left = n.x + 'px';
        el.style.top = n.y + 'px';
        el.style.width = n.w + 'px';
        el.style.height = n.h + 'px';
        el.dataset.id = n.id;
        if (n.type === 'ImageView') {
          el.textContent = 'Image';
        } else if (n.type === 'ProgressBar') {
          el.textContent = 'Progress';
        } else {
          el.textContent = n.text || n.type;
        }
        el.addEventListener('mousedown', (e) => {
          const primary = getPrimarySelected();
          if (pendingConstraintSide && primary && primary.id !== n.id) {
            primary.constraints[pendingConstraintSide] = n.id;
            pendingConstraintSide = '';
            bindProps();
            pushHistory();
            render();
            scheduleSave(toXml());
            return;
          }
          if (e.metaKey || e.ctrlKey || e.shiftKey) {
            toggleSelection(n.id);
          } else if (!selectedIds.has(n.id)) {
            setSingleSelection(n.id);
          }
          if (!selectedIds.size) {
            setSingleSelection(n.id);
          }
          const draggingNodes = getSelectedNodes();
          drag = {
            id: n.id,
            ox: e.clientX - n.x,
            oy: e.clientY - n.y,
            nodes: draggingNodes.map(item => ({ id: item.id, x: item.x, y: item.y }))
          };
          bindProps();
          render();
        });
        if (selectedAnchorId === n.id) {
          ['topTo', 'startTo', 'endTo', 'bottomTo'].forEach(side => {
            const h = document.createElement('div');
            h.className = 'handle ' + side;
            h.title = 'Connect ' + side;
            h.addEventListener('mousedown', (ev) => {
              ev.stopPropagation();
              pendingConstraintSide = side;
            });
            el.appendChild(h);
          });
          ['nw', 'ne', 'sw', 'se'].forEach(edge => {
            const h = document.createElement('div');
            h.className = 'resizeHandle ' + edge;
            h.title = 'Resize ' + edge.toUpperCase();
            h.addEventListener('mousedown', (ev) => {
              ev.stopPropagation();
              resize = {
                id: n.id,
                edge,
                startMouseX: ev.clientX,
                startMouseY: ev.clientY,
                startX: n.x,
                startY: n.y,
                startW: n.w,
                startH: n.h,
              };
            });
            el.appendChild(h);
          });
        }
        canvas.appendChild(el);
      }
      renderConstraintLines();
      if (guide.x !== null) {
        const gv = document.createElement('div');
        gv.className = 'guide v';
        gv.style.left = guide.x + 'px';
        canvas.appendChild(gv);
      }
      if (guide.y !== null) {
        const gh = document.createElement('div');
        gh.className = 'guide h';
        gh.style.top = guide.y + 'px';
        canvas.appendChild(gh);
      }
      xmlPreview.value = toXml();
      renderActionStates();
    }
    function bindProps() {
      const selected = getPrimarySelected();
      if (!selected) {
        props.id.value = '';
        props.text.value = '';
        props.x.value = '';
        props.y.value = '';
        props.w.value = '';
      props.h.value = '';
      props.topTo.value = '';
      props.topType.value = 'toTopOf';
      props.startTo.value = '';
      props.startType.value = 'toStartOf';
      props.endTo.value = '';
      props.endType.value = 'toEndOf';
      props.bottomTo.value = '';
      props.bottomType.value = 'toBottomOf';
      props.visibility.value = 'visible';
      props.text.disabled = true;
      return;
    }
      props.id.value = selected.id;
      props.text.value = selected.text || '';
      props.x.value = selected.x;
      props.y.value = selected.y;
      props.w.value = selected.w;
      props.h.value = selected.h;
      props.topTo.value = selected.constraints.topTo || '';
      props.topType.value = selected.constraints.topType || 'toTopOf';
      props.startTo.value = selected.constraints.startTo || '';
      props.startType.value = selected.constraints.startType || 'toStartOf';
      props.endTo.value = selected.constraints.endTo || '';
      props.endType.value = selected.constraints.endType || 'toEndOf';
      props.bottomTo.value = selected.constraints.bottomTo || '';
      props.bottomType.value = selected.constraints.bottomType || 'toBottomOf';
      props.visibility.value = selected.visibility || 'visible';
      props.text.disabled = !textCapable.has(selected.type);
    }
    function applyProps() {
      const selected = getPrimarySelected();
      if (!selected) return;
      const oldId = selected.id;
      selected.id = (props.id.value || selected.id).trim();
      if (oldId !== selected.id) {
        for (const n of nodes) {
          if (n.constraints.topTo === oldId) n.constraints.topTo = selected.id;
          if (n.constraints.startTo === oldId) n.constraints.startTo = selected.id;
          if (n.constraints.endTo === oldId) n.constraints.endTo = selected.id;
          if (n.constraints.bottomTo === oldId) n.constraints.bottomTo = selected.id;
        }
        selectedIds.delete(oldId);
        selectedIds.add(selected.id);
        selectedAnchorId = selected.id;
      }
      normalizeConstraints();
      if (textCapable.has(selected.type)) {
        selected.text = props.text.value;
      }
      selected.x = parseInt(props.x.value, 10) || 0;
      selected.y = parseInt(props.y.value, 10) || 0;
      selected.w = parseInt(props.w.value, 10) || 120;
      selected.h = parseInt(props.h.value, 10) || 44;
      selected.constraints.topTo = props.topTo.value;
      selected.constraints.topType = props.topType.value || 'toTopOf';
      selected.constraints.startTo = props.startTo.value;
      selected.constraints.startType = props.startType.value || 'toStartOf';
      selected.constraints.endTo = props.endTo.value;
      selected.constraints.endType = props.endType.value || 'toEndOf';
      selected.constraints.bottomTo = props.bottomTo.value;
      selected.constraints.bottomType = props.bottomType.value || 'toBottomOf';
      selected.visibility = props.visibility.value || 'visible';
      pushHistory();
      render();
      scheduleSave(toXml());
    }
    function applySelectionLayout(action) {
      const selected = getSelectedNodes();
      if (selected.length < 2) return;
      if (action === 'alignLeft') {
        const x = Math.min(...selected.map(n => n.x));
        selected.forEach(n => { n.x = x; });
      }
      if (action === 'alignTop') {
        const y = Math.min(...selected.map(n => n.y));
        selected.forEach(n => { n.y = y; });
      }
      if (action === 'distH') {
        const ordered = [...selected].sort((a, b) => a.x - b.x);
        const first = ordered[0].x;
        const last = ordered[ordered.length - 1].x;
        const step = (last - first) / (ordered.length - 1);
        ordered.forEach((n, i) => {
          n.x = maybeSnap(first + step * i);
        });
      }
      if (action === 'distV') {
        const ordered = [...selected].sort((a, b) => a.y - b.y);
        const first = ordered[0].y;
        const last = ordered[ordered.length - 1].y;
        const step = (last - first) / (ordered.length - 1);
        ordered.forEach((n, i) => {
          n.y = maybeSnap(first + step * i);
        });
      }
      pushHistory();
      bindProps();
      render();
      scheduleSave(toXml());
    }
    canvas.addEventListener('mousemove', (e) => {
      if (resize) {
        const n = nodes.find(x => x.id === resize.id);
        if (!n) return;
        const minW = 36;
        const minH = 24;
        const dx = e.clientX - resize.startMouseX;
        const dy = e.clientY - resize.startMouseY;
        let x = resize.startX;
        let y = resize.startY;
        let w = resize.startW;
        let h = resize.startH;
        if (resize.edge.includes('e')) w = resize.startW + dx;
        if (resize.edge.includes('s')) h = resize.startH + dy;
        if (resize.edge.includes('w')) {
          x = resize.startX + dx;
          w = resize.startW - dx;
        }
        if (resize.edge.includes('n')) {
          y = resize.startY + dy;
          h = resize.startH - dy;
        }
        w = Math.max(minW, maybeSnap(w));
        h = Math.max(minH, maybeSnap(h));
        x = Math.max(0, Math.min(DEVICE_WIDTH - w, maybeSnap(x)));
        y = Math.max(0, Math.min(DEVICE_HEIGHT - h, maybeSnap(y)));
        n.x = x;
        n.y = y;
        n.w = w;
        n.h = h;
        bindProps();
        render();
        return;
      }
      if (!drag) return;
      const n = nodes.find(x => x.id === drag.id);
      if (!n) return;
      let nx = Math.max(0, Math.min(DEVICE_WIDTH - n.w, e.clientX - drag.ox));
      let ny = Math.max(0, Math.min(DEVICE_HEIGHT - n.h, e.clientY - drag.oy));
      nx = maybeSnap(nx);
      ny = maybeSnap(ny);
      guide = { x: null, y: null };
      for (const o of nodes) {
        if (o.id === n.id) continue;
        if (Math.abs(nx - o.x) <= 4) guide.x = o.x;
        if (Math.abs(ny - o.y) <= 4) guide.y = o.y;
        const cx = nx + n.w / 2;
        const cy = ny + n.h / 2;
        const ocx = o.x + o.w / 2;
        const ocy = o.y + o.h / 2;
        if (Math.abs(cx - ocx) <= 4) guide.x = ocx;
        if (Math.abs(cy - ocy) <= 4) guide.y = ocy;
      }
      if (guide.x !== null) nx = maybeSnap(guide.x - n.w / 2);
      if (guide.y !== null) ny = maybeSnap(guide.y - n.h / 2);
      const dx = nx - n.x;
      const dy = ny - n.y;
      drag.nodes.forEach(saved => {
        const item = nodes.find(x => x.id === saved.id);
        if (!item) return;
        item.x = Math.max(0, Math.min(DEVICE_WIDTH - item.w, maybeSnap(saved.x + dx)));
        item.y = Math.max(0, Math.min(DEVICE_HEIGHT - item.h, maybeSnap(saved.y + dy)));
      });
      render();
    });
    window.addEventListener('mouseup', () => {
      if (drag) {
        pushHistory();
        scheduleSave(toXml());
      }
      if (resize) {
        pushHistory();
        scheduleSave(toXml());
      }
      drag = null;
      resize = null;
      guide = { x: null, y: null };
      render();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.target === canvas) {
        setSingleSelection('');
        pendingConstraintSide = '';
        bindProps();
        render();
      }
    });
    document.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-add');
        if (!type) return;
        nodes.push(createNode(type));
        normalizeConstraints();
        setSingleSelection(nodes[nodes.length - 1].id);
        bindProps();
        pushHistory();
        render();
        scheduleSave(toXml());
      });
    });
    undoBtn.addEventListener('click', () => restoreHistory(historyIndex - 1));
    redoBtn.addEventListener('click', () => restoreHistory(historyIndex + 1));
    alignLeftBtn.addEventListener('click', () => applySelectionLayout('alignLeft'));
    alignTopBtn.addEventListener('click', () => applySelectionLayout('alignTop'));
    distHBtn.addEventListener('click', () => applySelectionLayout('distH'));
    distVBtn.addEventListener('click', () => applySelectionLayout('distV'));
    fixAllDiagnosticsBtn.addEventListener('click', () => applyAllDiagnostics());
    fixAllAndroidLintBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'fixAllLayoutWarnings' });
    });
    undoDiagFixBtn.addEventListener('click', () => undoLastDiagnosticsFix());
    applyPreviewBtn.addEventListener('click', () => applyPreviewedDiagnostics());
    discardPreviewBtn.addEventListener('click', () => discardPreviewedDiagnostics());
    safeFixModeEl.addEventListener('change', () => render());
    clearSelBtn.addEventListener('click', () => {
      setSingleSelection('');
      pendingConstraintSide = '';
      pendingFixPreview = null;
      bindProps();
      render();
    });
    deleteSelBtn.addEventListener('click', () => {
      if (!selectedIds.size) return;
      nodes = nodes.filter(n => !selectedIds.has(n.id));
      normalizeConstraints();
      setSingleSelection(nodes[0] ? nodes[0].id : '');
      bindProps();
      pushHistory();
      render();
      scheduleSave(toXml());
    });
    applyPropsBtn.addEventListener('click', applyProps);
    saveBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'saveXml', xml: xmlPreview.value });
    });
    refreshBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'externalXmlRequest' });
      render();
    });
    xmlPreview.addEventListener('input', () => {
      scheduleSave(xmlPreview.value);
      renderActionStates();
    });
    gridSizeEl.addEventListener('change', () => render());
    snapGridEl.addEventListener('change', () => render());
    deviceSelect.addEventListener('change', () => {
      if (!deviceSelect.value && liveTimer) {
        clearInterval(liveTimer);
        liveTimer = null;
        toggleLiveBtn.textContent = 'Start Device Live Preview';
      }
      renderActionStates();
    });
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        e.preventDefault();
        restoreHistory(historyIndex - 1);
      }
      if ((e.metaKey || e.ctrlKey) && key === 'y') {
        e.preventDefault();
        restoreHistory(historyIndex + 1);
      }
      if (key === 'delete' || key === 'backspace') {
        if (!selectedIds.size) return;
        nodes = nodes.filter(n => !selectedIds.has(n.id));
        normalizeConstraints();
        setSingleSelection(nodes[0] ? nodes[0].id : '');
        bindProps();
        pushHistory();
        render();
        scheduleSave(toXml());
      }
    });
    toggleLiveBtn.addEventListener('click', () => {
      if (!deviceSelect.value) {
        gfxMeta.textContent = 'Select an online device first.';
        return;
      }
      if (liveTimer) {
        clearInterval(liveTimer);
        liveTimer = null;
        toggleLiveBtn.textContent = 'Start Device Live Preview';
        return;
      }
      toggleLiveBtn.textContent = 'Stop Device Live Preview';
      const poll = () => {
        vscode.postMessage({
          type: 'captureDevicePreview',
          deviceId: deviceSelect.value,
          packageName: packageInput.value.trim()
        });
      };
      poll();
      liveTimer = setInterval(poll, 1800);
    });
    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'externalXml') {
        nodes = parseXml(msg.xml || '');
        normalizeConstraints();
        pendingConstraintSide = '';
        pendingFixPreview = null;
        setSingleSelection(nodes[0] ? nodes[0].id : '');
        resetHistory();
        bindProps();
        render();
      }
      if (msg.type === 'devices') {
        deviceSelect.innerHTML = '';
        const list = msg.devices || [];
        if (!list.length) {
          const op = document.createElement('option');
          op.value = '';
          op.textContent = 'No online devices';
          deviceSelect.appendChild(op);
        } else {
          list.forEach(d => {
            const op = document.createElement('option');
            op.value = d.id;
            op.textContent = d.id + ' (' + d.type + ')';
            deviceSelect.appendChild(op);
          });
        }
        renderActionStates();
      }
      if (msg.type === 'devicePreview') {
        if (msg.image) {
          devicePreview.innerHTML = '<img src="data:image/png;base64,' + msg.image + '"/>';
        }
        if (msg.gfx) {
          gfxMeta.textContent = 'Jank ' + msg.gfx.jankyFrames + '/' + msg.gfx.totalFrames + ' | P90 ' + msg.gfx.percentile90 + 'ms';
        }
      }
    });
    nodes = parseXml(${escaped});
    normalizeConstraints();
    pendingFixPreview = null;
    setSingleSelection(nodes[0] ? nodes[0].id : '');
    resetHistory();
    bindProps();
    render();
    vscode.postMessage({ type: 'getDevices' });
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

  private dispose(): void {
    LayoutEditorPanel.currentPanel = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
