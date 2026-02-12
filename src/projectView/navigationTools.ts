import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface NavDestination {
  id: string;
  label: string;
  file: string;
  line: number;
  args: string[];
}

interface NavAction {
  fromId: string;
  toId: string;
}

function getNavigationFiles(workspaceRoot: string): string[] {
  const dir = path.join(workspaceRoot, 'app', 'src', 'main', 'res', 'navigation');
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir).filter(f => f.endsWith('.xml')).map(f => path.join(dir, f));
}

function parseDestinations(filePath: string): NavDestination[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const out: NavDestination[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idMatch = line.match(/android:id="@\+id\/([^"]+)"/);
    if (!idMatch) {
      continue;
    }
    const labelMatch = line.match(/android:label="([^"]+)"/);
    const args: string[] = [];
    for (let j = i; j < Math.min(lines.length, i + 20); j++) {
      const a = lines[j].match(/<argument[^>]*android:name="([^"]+)"/);
      if (a) {
        args.push(a[1]);
      }
      if (lines[j].includes('</fragment>') || lines[j].includes('</activity>')) {
        break;
      }
    }
    out.push({
      id: idMatch[1],
      label: labelMatch?.[1] || idMatch[1],
      file: filePath,
      line: i + 1,
      args,
    });
  }
  return out;
}

function parseActions(filePath: string): NavAction[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const out: NavAction[] = [];
  let currentFrom = '';
  for (const line of lines) {
    const idMatch = line.match(/android:id="@\+id\/([^"]+)"/);
    if (idMatch) {
      currentFrom = idMatch[1];
    }
    const actionMatch = line.match(/<action[^>]*app:destination="@id\/([^"]+)"/);
    if (actionMatch && currentFrom) {
      out.push({ fromId: currentFrom, toId: actionMatch[1] });
    }
  }
  return out;
}

function allDestinations(workspaceRoot: string): NavDestination[] {
  const files = getNavigationFiles(workspaceRoot);
  const all: NavDestination[] = [];
  for (const file of files) {
    all.push(...parseDestinations(file));
  }
  return all;
}

async function revealAt(file: string, line: number): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(file);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  const pos = new vscode.Position(Math.max(0, line - 1), 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos));
}

export async function jumpToNavigationDestination(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const items = allDestinations(workspaceRoot);
  if (items.length === 0) {
    vscode.window.showWarningMessage('No navigation graph destinations found.');
    return;
  }
  const picked = await vscode.window.showQuickPick(
    items.map(i => ({ label: i.id, description: i.label, item: i })),
    { placeHolder: 'Jump to navigation destination' }
  );
  if (!picked) {
    return;
  }
  await revealAt(picked.item.file, picked.item.line);
}

export async function jumpToNavigationArgument(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const items = allDestinations(workspaceRoot);
  const argItems: Array<{ destination: NavDestination; arg: string }> = [];
  for (const d of items) {
    for (const arg of d.args) {
      argItems.push({ destination: d, arg });
    }
  }
  if (argItems.length === 0) {
    vscode.window.showWarningMessage('No navigation arguments found.');
    return;
  }
  const picked = await vscode.window.showQuickPick(
    argItems.map(a => ({
      label: a.arg,
      description: a.destination.id,
      argItem: a,
    })),
    { placeHolder: 'Jump to navigation argument' }
  );
  if (!picked) {
    return;
  }
  const doc = await vscode.workspace.openTextDocument(picked.argItem.destination.file);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  const idx = doc.getText().indexOf(`android:name="${picked.argItem.arg}"`);
  if (idx < 0) {
    return;
  }
  const pos = doc.positionAt(idx);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos));
}

export async function previewNavigationGraphSvg(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const destinations = allDestinations(workspaceRoot);
  const actions = getNavigationFiles(workspaceRoot).flatMap(parseActions);
  if (destinations.length === 0) {
    vscode.window.showWarningMessage('No navigation graph destinations found.');
    return;
  }
  const nodeW = 220;
  const nodeH = 52;
  const xGap = 120;
  const yGap = 36;
  const byId = new Map(destinations.map(d => [d.id, d]));
  const indegree = new Map<string, number>();
  const next = new Map<string, string[]>();
  for (const d of destinations) {
    indegree.set(d.id, 0);
    next.set(d.id, []);
  }
  for (const a of actions) {
    if (!byId.has(a.fromId) || !byId.has(a.toId)) {
      continue;
    }
    next.get(a.fromId)?.push(a.toId);
    indegree.set(a.toId, (indegree.get(a.toId) || 0) + 1);
  }
  const queue: string[] = [];
  for (const d of destinations) {
    if ((indegree.get(d.id) || 0) === 0) {
      queue.push(d.id);
    }
  }
  if (queue.length === 0 && destinations.length > 0) {
    queue.push(destinations[0].id);
  }
  const level = new Map<string, number>();
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const curLevel = level.get(id) || 0;
    for (const child of next.get(id) || []) {
      if (!level.has(child) || (level.get(child) as number) < curLevel + 1) {
        level.set(child, curLevel + 1);
      }
      indegree.set(child, (indegree.get(child) || 1) - 1);
      if ((indegree.get(child) || 0) <= 0) {
        queue.push(child);
      }
    }
  }
  const levelGroups = new Map<number, string[]>();
  for (const d of destinations) {
    const l = level.get(d.id) || 0;
    if (!levelGroups.has(l)) {
      levelGroups.set(l, []);
    }
    levelGroups.get(l)?.push(d.id);
  }
  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
  const positions = new Map<string, { x: number; y: number }>();
  let maxRows = 0;
  for (const l of sortedLevels) {
    const ids = levelGroups.get(l) || [];
    maxRows = Math.max(maxRows, ids.length);
    ids.forEach((id, idx) => {
      positions.set(id, {
        x: 40 + l * (nodeW + xGap),
        y: 40 + idx * (nodeH + yGap),
      });
    });
  }
  const width = Math.max(480, sortedLevels.length * (nodeW + xGap) + 120);
  const height = Math.max(260, maxRows * (nodeH + yGap) + 120);
  const lines = actions
    .filter(a => positions.has(a.fromId) && positions.has(a.toId))
    .map(a => {
      const from = positions.get(a.fromId) as { x: number; y: number };
      const to = positions.get(a.toId) as { x: number; y: number };
      const x1 = from.x + nodeW;
      const y1 = from.y + nodeH / 2;
      const x2 = to.x;
      const y2 = to.y + nodeH / 2;
      const c1x = x1 + 30;
      const c2x = x2 - 30;
      return `<path d="M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}" stroke="#8b949e" stroke-width="2" fill="none" marker-end="url(#arrow)"/>`;
    });
  const nodes = destinations.map(d => {
    const pos = positions.get(d.id) || { x: 40, y: 40 };
    return `<g><rect x="${pos.x}" y="${pos.y}" width="${nodeW}" height="${nodeH}" rx="10" fill="#1f6feb" opacity="0.9"/><text x="${pos.x + 12}" y="${pos.y + 22}" fill="white" font-size="12">${d.id}</text><text x="${pos.x + 12}" y="${pos.y + 38}" fill="#dbeafe" font-size="10">${d.label}</text></g>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8b949e"/></marker></defs>${lines.join('')}${nodes.join('')}</svg>`;
  const panel = vscode.window.createWebviewPanel(
    'androidNavGraphSvg',
    'Navigation Graph SVG',
    vscode.ViewColumn.One,
    { enableScripts: false }
  );
  panel.webview.html = `<!DOCTYPE html><html><body style="background:#0d1117;margin:0;padding:12px;">${svg}</body></html>`;
}
