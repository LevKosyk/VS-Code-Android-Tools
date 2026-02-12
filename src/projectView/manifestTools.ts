import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { showError } from '../ui/notifications';

function getManifestPaths(workspaceRoot: string): string[] {
  const candidates = [
    path.join(workspaceRoot, 'app', 'src', 'main', 'AndroidManifest.xml'),
    path.join(workspaceRoot, 'src', 'main', 'AndroidManifest.xml'),
  ];
  return candidates.filter(p => fs.existsSync(p));
}

export function validateManifest(workspaceRoot: string): string[] {
  const issues: string[] = [];
  const manifests = getManifestPaths(workspaceRoot);
  if (manifests.length === 0) {
    issues.push('AndroidManifest.xml not found.');
    return issues;
  }
  const content = fs.readFileSync(manifests[0], 'utf-8');
  if (!/package\s*=\s*"[^"]+"/.test(content)) {
    issues.push('Missing package attribute in manifest.');
  }
  if (!/<application[\s>]/.test(content)) {
    issues.push('Missing <application> tag.');
  }
  const launcherRegex = new RegExp(
    '<activity[\\s\\S]*?<intent-filter>[\\s\\S]*?MAIN[\\s\\S]*?LAUNCHER[\\s\\S]*?<\\/intent-filter>[\\s\\S]*?<\\/activity>'
  );
  const hasLauncher = launcherRegex.test(content);
  if (!hasLauncher) {
    issues.push('No launcher activity found (MAIN/LAUNCHER).');
  }
  const exportedMissingRegex = /<(activity|receiver|service)[^>]*>([\s\S]*?)<intent-filter>[\s\S]*?<\/intent-filter>[\s\S]*?<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = exportedMissingRegex.exec(content)) !== null) {
    const block = match[0];
    if (!/android:exported=/.test(block)) {
      issues.push(`Missing android:exported on <${match[1]}> with intent-filter.`);
      break;
    }
  }
  return issues;
}

export async function insertManifestTemplate(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const doc = editor.document;
  if (!doc.fileName.endsWith('AndroidManifest.xml')) {
    showError('Open AndroidManifest.xml to insert a template.');
    return;
  }
  const item = await vscode.window.showQuickPick(
    [
      'Activity',
      'Service',
      'Receiver',
      'Provider',
      'Uses Permission',
    ],
    { placeHolder: 'Select template' }
  );
  if (!item) {
    return;
  }
  const templates: Record<string, string> = {
    Activity: `\n        <activity android:name=".NewActivity" android:exported="false">\n        </activity>\n`,
    Service: `\n        <service android:name=".NewService" android:exported="false">\n        </service>\n`,
    Receiver: `\n        <receiver android:name=".NewReceiver" android:exported="false">\n        </receiver>\n`,
    Provider: `\n        <provider android:name=".NewProvider" android:exported="false" android:authorities="${doc.getText().match(/package\\s*=\\s*\"([^\"]+)\"/)?.[1] || 'com.example'}.provider"/>\n`,
    'Uses Permission': `\n    <uses-permission android:name="android.permission.INTERNET"/>\n`,
  };
  const text = doc.getText();
  if (item === 'Uses Permission') {
    const insertPos = text.indexOf('>') + 1;
    const position = doc.positionAt(insertPos);
    await editor.edit(edit => edit.insert(position, templates[item]));
    return;
  }
  const appClose = text.lastIndexOf('</application>');
  if (appClose === -1) {
    showError('Missing </application> tag.');
    return;
  }
  const position = doc.positionAt(appClose);
  await editor.edit(edit => edit.insert(position, templates[item]));
}

export async function openManifestEditor(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    await insertManifestTemplate();
    return;
  }
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const candidates = [
    path.join(workspaceRoot, 'app', 'src', 'main', 'AndroidManifest.xml'),
    path.join(workspaceRoot, 'src', 'main', 'AndroidManifest.xml'),
  ];
  const manifest = candidates.find(p => fs.existsSync(p));
  if (!manifest) {
    showError('AndroidManifest.xml not found.');
    return;
  }
  const doc = await vscode.workspace.openTextDocument(manifest);
  await vscode.window.showTextDocument(doc, { preview: false });
  await insertManifestTemplate();
}

export async function addManifestEntryFlow(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await openManifestEditor();
    return;
  }
  const doc = editor.document;
  if (!doc.fileName.endsWith('AndroidManifest.xml')) {
    await openManifestEditor();
    return;
  }
  const type = await vscode.window.showQuickPick(
    ['Activity', 'Service', 'Receiver', 'Permission'],
    { placeHolder: 'Select entry type' }
  );
  if (!type) {
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: `${type} name (e.g., .MainActivity)`,
    value: type === 'Permission' ? 'android.permission.INTERNET' : '.NewComponent',
  });
  if (!name) {
    return;
  }
  if (type === 'Permission') {
    const insertPos = doc.getText().indexOf('>') + 1;
    const position = doc.positionAt(insertPos);
    await editor.edit(edit => edit.insert(position, `\n    <uses-permission android:name="${name}"/>\n`));
    return;
  }
  const exported = await vscode.window.showQuickPick(
    ['true', 'false'],
    { placeHolder: 'android:exported' }
  );
  if (!exported) {
    return;
  }
  const addLauncher = type === 'Activity'
    ? await vscode.window.showQuickPick(['yes', 'no'], { placeHolder: 'Add MAIN/LAUNCHER intent-filter?' })
    : 'no';
  const intentFilter = addLauncher === 'yes'
    ? `\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN"/>\n                <category android:name="android.intent.category.LAUNCHER"/>\n            </intent-filter>\n`
    : '';
  const entry = `\n        <${type.toLowerCase()} android:name="${name}" android:exported="${exported}">${intentFilter}        </${type.toLowerCase()}>\n`;
  const appClose = doc.getText().lastIndexOf('</application>');
  if (appClose === -1) {
    showError('Missing </application> tag.');
    return;
  }
  const position = doc.positionAt(appClose);
  await editor.edit(edit => edit.insert(position, entry));
}
