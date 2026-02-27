import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findApplicationModules } from '../core/androidProject';
import { showError } from '../ui/notifications';

interface ManifestSummary {
  variant: string;
  files: string[];
  packageName?: string;
  debuggable?: string;
  cleartext?: string;
  permissions: Set<string>;
  components: Map<string, string | undefined>;
}

function parseVariantParts(variant: string): { flavor: string; buildType: string } {
  const trimmed = variant.trim();
  const match = trimmed.match(/(Debug|Release)$/i);
  if (!match) {
    return { flavor: trimmed, buildType: '' };
  }
  const buildType = match[1].toLowerCase();
  const flavor = trimmed.slice(0, trimmed.length - match[1].length);
  return { flavor, buildType };
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function collectManifestFiles(workspaceRoot: string, moduleName: string, variant: string): string[] {
  const { flavor, buildType } = parseVariantParts(variant);
  const candidates = [
    path.join(workspaceRoot, moduleName, 'src', 'main', 'AndroidManifest.xml'),
  ];
  if (flavor) {
    candidates.push(
      path.join(workspaceRoot, moduleName, 'src', flavor, 'AndroidManifest.xml'),
      path.join(workspaceRoot, moduleName, 'src', flavor.toLowerCase(), 'AndroidManifest.xml')
    );
  }
  if (buildType) {
    candidates.push(
      path.join(workspaceRoot, moduleName, 'src', buildType, 'AndroidManifest.xml')
    );
  }
  if (flavor && buildType) {
    const combo = `${flavor}${buildType[0].toUpperCase()}${buildType.slice(1)}`;
    candidates.push(
      path.join(workspaceRoot, moduleName, 'src', combo, 'AndroidManifest.xml'),
      path.join(workspaceRoot, moduleName, 'src', combo.toLowerCase(), 'AndroidManifest.xml'),
      path.join(workspaceRoot, moduleName, 'src', flavor, buildType, 'AndroidManifest.xml'),
      path.join(workspaceRoot, moduleName, 'src', flavor.toLowerCase(), buildType, 'AndroidManifest.xml')
    );
  }
  return uniq(candidates).filter(file => fs.existsSync(file));
}

function readAttr(tagSource: string, attrName: string): string | undefined {
  const pattern = new RegExp(`${attrName}\\s*=\\s*"([^"]+)"`);
  return tagSource.match(pattern)?.[1];
}

function parseManifestContent(summary: ManifestSummary, content: string): void {
  const pkg = content.match(/<manifest\b[^>]*\bpackage\s*=\s*"([^"]+)"/)?.[1];
  if (pkg) {
    summary.packageName = pkg;
  }

  const appTag = content.match(/<application\b[^>]*>/)?.[0] || '';
  const dbg = readAttr(appTag, 'android:debuggable');
  if (dbg !== undefined) {
    summary.debuggable = dbg;
  }
  const cleartext = readAttr(appTag, 'android:usesCleartextTraffic');
  if (cleartext !== undefined) {
    summary.cleartext = cleartext;
  }

  const permissionRegex = /<uses-permission\b[^>]*\bandroid:name\s*=\s*"([^"]+)"/g;
  for (const match of content.matchAll(permissionRegex)) {
    summary.permissions.add(match[1]);
  }

  const componentRegex = /<(activity|service|receiver|provider)\b([^>]*)>/g;
  for (const match of content.matchAll(componentRegex)) {
    const type = match[1];
    const attrs = match[2];
    const name = readAttr(attrs, 'android:name');
    if (!name) {
      continue;
    }
    const exported = readAttr(attrs, 'android:exported');
    summary.components.set(`${type}:${name}`, exported);
  }
}

function summarizeManifest(workspaceRoot: string, moduleName: string, variant: string): ManifestSummary {
  const files = collectManifestFiles(workspaceRoot, moduleName, variant);
  const summary: ManifestSummary = {
    variant,
    files,
    permissions: new Set<string>(),
    components: new Map<string, string | undefined>(),
  };
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    parseManifestContent(summary, content);
  }
  return summary;
}

function diffSet(a: Set<string>, b: Set<string>): { onlyA: string[]; onlyB: string[] } {
  const onlyA = Array.from(a).filter(x => !b.has(x)).sort((x, y) => x.localeCompare(y));
  const onlyB = Array.from(b).filter(x => !a.has(x)).sort((x, y) => x.localeCompare(y));
  return { onlyA, onlyB };
}

function renderDiffMarkdown(a: ManifestSummary, b: ManifestSummary): string {
  const lines: string[] = [];
  lines.push('# Manifest Diff Assistant');
  lines.push('');
  lines.push(`Compare: \`${a.variant}\` vs \`${b.variant}\``);
  lines.push('');
  lines.push('## Source Files');
  lines.push(`### ${a.variant}`);
  if (a.files.length === 0) {
    lines.push('- No manifest files found.');
  } else {
    a.files.forEach(file => lines.push(`- ${file}`));
  }
  lines.push('');
  lines.push(`### ${b.variant}`);
  if (b.files.length === 0) {
    lines.push('- No manifest files found.');
  } else {
    b.files.forEach(file => lines.push(`- ${file}`));
  }
  lines.push('');
  lines.push('## Risky Flags');
  lines.push(`- package: ${a.packageName || '(n/a)'} -> ${b.packageName || '(n/a)'}`);
  lines.push(`- android:debuggable: ${a.debuggable ?? '(unset)'} -> ${b.debuggable ?? '(unset)'}`);
  lines.push(`- usesCleartextTraffic: ${a.cleartext ?? '(unset)'} -> ${b.cleartext ?? '(unset)'}`);
  if ((b.debuggable || '').toLowerCase() === 'true') {
    lines.push('- [RISK] target variant enables `android:debuggable=true`');
  }
  if ((b.cleartext || '').toLowerCase() === 'true') {
    lines.push('- [RISK] target variant enables cleartext traffic');
  }
  lines.push('');

  const perms = diffSet(a.permissions, b.permissions);
  lines.push('## Permissions Diff');
  lines.push(`### Added in ${b.variant}`);
  if (perms.onlyB.length === 0) {
    lines.push('- none');
  } else {
    perms.onlyB.forEach(x => lines.push(`- ${x}`));
  }
  lines.push('');
  lines.push(`### Removed in ${b.variant}`);
  if (perms.onlyA.length === 0) {
    lines.push('- none');
  } else {
    perms.onlyA.forEach(x => lines.push(`- ${x}`));
  }
  lines.push('');

  lines.push('## Exported Components Diff');
  const allKeys = uniq([...a.components.keys(), ...b.components.keys()]).sort((x, y) => x.localeCompare(y));
  let changedCount = 0;
  for (const key of allKeys) {
    const av = a.components.get(key);
    const bv = b.components.get(key);
    if (av === bv) {
      continue;
    }
    changedCount += 1;
    lines.push(`- ${key}: ${av ?? '(unset)'} -> ${bv ?? '(unset)'}`);
    if ((bv || '').toLowerCase() === 'true') {
      lines.push(`  - [RISK] exported enabled in ${b.variant}`);
    }
  }
  if (changedCount === 0) {
    lines.push('- no exported component changes');
  }
  lines.push('');
  return lines.join('\n');
}

export async function runManifestDiffAssistant(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const modules = findApplicationModules(workspaceRoot);
  if (modules.length === 0) {
    showError('No Android modules found.');
    return;
  }
  const moduleName = modules.length === 1
    ? modules[0]
    : await vscode.window.showQuickPick(modules, { placeHolder: 'Select module' });
  if (!moduleName) {
    return;
  }
  const variantA = await vscode.window.showInputBox({
    prompt: 'First variant (example: debug, freeDebug, release)',
    value: 'Debug',
  });
  if (!variantA) {
    return;
  }
  const variantB = await vscode.window.showInputBox({
    prompt: 'Second variant (example: release, paidRelease)',
    value: 'Release',
  });
  if (!variantB) {
    return;
  }
  const summaryA = summarizeManifest(workspaceRoot, moduleName, variantA);
  const summaryB = summarizeManifest(workspaceRoot, moduleName, variantB);
  const markdown = renderDiffMarkdown(summaryA, summaryB);
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: markdown,
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}
