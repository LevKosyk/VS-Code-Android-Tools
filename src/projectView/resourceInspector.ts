import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { showError, showInfo, showWarning } from '../ui/notifications';

interface ResourceItem {
  type: string;
  name: string;
  file: string;
}

function getResRoot(workspaceRoot: string): string | undefined {
  const candidates = [
    path.join(workspaceRoot, 'app', 'src', 'main', 'res'),
    path.join(workspaceRoot, 'src', 'main', 'res'),
  ];
  return candidates.find(p => fs.existsSync(p));
}

function collectValuesResources(filePath: string): ResourceItem[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const regex = /<(string|color|dimen|style|integer|bool|array|string-array|integer-array|plurals|item)\s+name\s*=\s*"([^"]+)"/g;
  const items: ResourceItem[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    items.push({ type: match[1], name: match[2], file: filePath });
  }
  return items;
}

export async function openResourceInspector(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const resRoot = getResRoot(workspaceRoot);
  if (!resRoot) {
    showError('res directory not found.');
    return;
  }
  const valuesDir = path.join(resRoot, 'values');
  if (!fs.existsSync(valuesDir)) {
    showError('values directory not found.');
    return;
  }
  const files = fs.readdirSync(valuesDir).filter(f => f.endsWith('.xml'));
  const items: ResourceItem[] = [];
  for (const file of files) {
    items.push(...collectValuesResources(path.join(valuesDir, file)));
  }
  if (items.length === 0) {
    showInfo('No resources found in values.');
    return;
  }
  const picked = await vscode.window.showQuickPick(
    items.map(i => ({
      label: `${i.type}/${i.name}`,
      description: path.basename(i.file),
      item: i,
    })),
    { placeHolder: 'Search resources (values)' }
  );
  if (!picked) {
    return;
  }
  const doc = await vscode.workspace.openTextDocument(picked.item.file);
  await vscode.window.showTextDocument(doc, { preview: false });
  const idx = doc.getText().indexOf(`name="${picked.item.name}"`);
  if (idx >= 0) {
    const pos = doc.positionAt(idx);
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
    }
  }
}

export async function openResourceByQuery(): Promise<void> {
  const query = await vscode.window.showInputBox({
    prompt: 'Enter resource (e.g., R.string.app_name or string/app_name)',
  });
  if (!query) {
    return;
  }
  const normalized = query.replace(/^R\./, '').replace('.', '/').trim();
  const parts = normalized.split('/');
  if (parts.length !== 2) {
    showError('Invalid resource format.');
    return;
  }
  const [type, name] = parts;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const resRoot = getResRoot(workspaceRoot);
  if (!resRoot) {
    showError('res directory not found.');
    return;
  }
  const valuesDir = path.join(resRoot, 'values');
  const files = fs.readdirSync(valuesDir).filter(f => f.endsWith('.xml'));
  for (const file of files) {
    const filePath = path.join(valuesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const regex = new RegExp(`<${type}[^>]*name\\s*=\\s*\"${name}\"`);
    if (regex.test(content)) {
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc, { preview: false });
      const idx = doc.getText().indexOf(`name="${name}"`);
      if (idx >= 0) {
        const pos = doc.positionAt(idx);
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos));
        }
      }
      return;
    }
  }
  showWarning('Resource not found.');
}
