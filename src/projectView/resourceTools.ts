import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { showError } from '../ui/notifications';

export function validateResources(workspaceRoot: string): string[] {
  const issues: string[] = [];
  const resDir = [
    path.join(workspaceRoot, 'app', 'src', 'main', 'res'),
    path.join(workspaceRoot, 'src', 'main', 'res'),
  ].find(p => fs.existsSync(p));
  if (!resDir) {
    issues.push('res directory not found.');
    return issues;
  }
  const stringsPath = path.join(resDir, 'values', 'strings.xml');
  if (!fs.existsSync(stringsPath)) {
    issues.push('Missing values/strings.xml');
  }
  const entries = fs.readdirSync(resDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const name = entry.name;
    if (!/^[a-z0-9_.-]+$/.test(name)) {
      issues.push(`Invalid resource folder name: ${name}`);
    }
  }
  return issues;
}

export async function insertValuesTemplate(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const doc = editor.document;
  if (!doc.fileName.endsWith('.xml')) {
    showError('Open a values XML file to insert a template.');
    return;
  }
  const item = await vscode.window.showQuickPick(
    [
      'String',
      'Color',
      'Dimen',
      'Bool',
      'Integer',
    ],
    { placeHolder: 'Select template' }
  );
  if (!item) {
    return;
  }
  const templates: Record<string, string> = {
    String: `\\n    <string name=\\"new_string\\">Text</string>\\n`,
    Color: `\\n    <color name=\\"new_color\\">#FF0000</color>\\n`,
    Dimen: `\\n    <dimen name=\\"new_dimen\\">16dp</dimen>\\n`,
    Bool: `\\n    <bool name=\\"new_bool\\">true</bool>\\n`,
    Integer: `\\n    <integer name=\\"new_int\\">1</integer>\\n`,
  };
  const text = doc.getText();
  const close = text.lastIndexOf('</resources>');
  if (close === -1) {
    showError('Missing </resources> tag.');
    return;
  }
  const position = doc.positionAt(close);
  await editor.edit(edit => edit.insert(position, templates[item]));
}
