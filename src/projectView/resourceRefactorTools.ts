import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { showError, showInfo, showWarning } from '../ui/notifications';

type ResourceKind = 'file' | 'value';

interface ResourceEntry {
  kind: ResourceKind;
  type: string;
  name: string;
  filePath: string;
  folderName?: string;
  extension?: string;
}

interface RenameMapping {
  oldType: string;
  oldName: string;
  newType: string;
  newName: string;
}

const TEXT_EXTENSIONS = new Set([
  '.xml',
  '.kt',
  '.kts',
  '.java',
  '.gradle',
  '.pro',
  '.txt',
  '.md',
]);

const IGNORED_DIRS = new Set([
  '.git',
  '.gradle',
  '.idea',
  '.vscode-test',
  'build',
  'dist',
  'node_modules',
  'out',
  'tmp',
  'vendor',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getResRoot(workspaceRoot: string): string | undefined {
  const candidates = [
    path.join(workspaceRoot, 'app', 'src', 'main', 'res'),
    path.join(workspaceRoot, 'src', 'main', 'res'),
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}

function collectResourceFolders(resRoot: string): string[] {
  return fs.readdirSync(resRoot)
    .map(name => path.join(resRoot, name))
    .filter(fullPath => fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory())
    .map(fullPath => path.basename(fullPath))
    .sort();
}

function collectFileResources(resRoot: string): ResourceEntry[] {
  const entries: ResourceEntry[] = [];
  const folders = collectResourceFolders(resRoot).filter(folder => !folder.startsWith('values'));
  for (const folder of folders) {
    const fullFolder = path.join(resRoot, folder);
    for (const item of fs.readdirSync(fullFolder)) {
      const fullPath = path.join(fullFolder, item);
      if (!fs.statSync(fullPath).isFile()) {
        continue;
      }
      const extension = path.extname(item);
      const name = path.basename(item, extension);
      const type = folder.split('-')[0];
      entries.push({
        kind: 'file',
        type,
        name,
        filePath: fullPath,
        folderName: folder,
        extension,
      });
    }
  }
  return entries;
}

function collectValueResources(resRoot: string): ResourceEntry[] {
  const entries: ResourceEntry[] = [];
  const folders = collectResourceFolders(resRoot).filter(folder => folder.startsWith('values'));
  const seen = new Set<string>();
  for (const folder of folders) {
    const fullFolder = path.join(resRoot, folder);
    for (const item of fs.readdirSync(fullFolder)) {
      if (!item.endsWith('.xml')) {
        continue;
      }
      const fullPath = path.join(fullFolder, item);
      const content = fs.readFileSync(fullPath, 'utf8');
      const directRegex = /<(string|color|dimen|style|integer|bool|plurals|string-array|integer-array|array)\s+[^>]*\bname\s*=\s*"([^"]+)"/g;
      const itemRegex = /<item\s+[^>]*\btype\s*=\s*"([^"]+)"[^>]*\bname\s*=\s*"([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = directRegex.exec(content)) !== null) {
        const key = `${match[1]}::${match[2]}::${fullPath}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        entries.push({ kind: 'value', type: match[1], name: match[2], filePath: fullPath, folderName: folder });
      }
      while ((match = itemRegex.exec(content)) !== null) {
        const key = `${match[1]}::${match[2]}::${fullPath}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        entries.push({ kind: 'value', type: match[1], name: match[2], filePath: fullPath, folderName: folder });
      }
    }
  }
  return entries;
}

function collectAllResources(resRoot: string): ResourceEntry[] {
  return [...collectFileResources(resRoot), ...collectValueResources(resRoot)]
    .sort((a, b) => `${a.type}/${a.name}`.localeCompare(`${b.type}/${b.name}`));
}

function replaceInString(input: string, mappings: RenameMapping[]): { output: string; replacements: number } {
  let output = input;
  let replacements = 0;
  const sortedMappings = [...mappings].sort((a, b) => {
    const left = `${a.oldType}/${a.oldName}`;
    const right = `${b.oldType}/${b.oldName}`;
    return right.length - left.length;
  });
  for (const mapping of sortedMappings) {
    const oldType = escapeRegExp(mapping.oldType);
    const oldName = escapeRegExp(mapping.oldName);
    const boundary = '(?=[^A-Za-z0-9_]|$)';
    const patterns = [
      {
        pattern: new RegExp(`@${oldType}/${oldName}${boundary}`, 'g'),
        replacement: `@${mapping.newType}/${mapping.newName}`,
      },
      {
        pattern: new RegExp(`R\\.${oldType}\\.${oldName}${boundary}`, 'g'),
        replacement: `R.${mapping.newType}.${mapping.newName}`,
      },
    ];
    if (mapping.oldType === 'id' && mapping.newType === 'id') {
      patterns.push(
        {
          pattern: new RegExp(`@\\+id/${oldName}${boundary}`, 'g'),
          replacement: `@+id/${mapping.newName}`,
        },
        {
          pattern: new RegExp(`@id/${oldName}${boundary}`, 'g'),
          replacement: `@id/${mapping.newName}`,
        }
      );
    }
    for (const item of patterns) {
      output = output.replace(item.pattern, (chunk) => {
        replacements += 1;
        return item.replacement;
      });
    }
  }
  return { output, replacements };
}

function walkFiles(root: string, onFile: (filePath: string) => void): void {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (!fs.existsSync(current)) {
      continue;
    }
    const stat = fs.statSync(current);
    if (!stat.isDirectory()) {
      onFile(current);
      continue;
    }
    for (const entry of fs.readdirSync(current)) {
      const full = path.join(current, entry);
      if (fs.statSync(full).isDirectory()) {
        if (!IGNORED_DIRS.has(entry)) {
          stack.push(full);
        }
      } else {
        onFile(full);
      }
    }
  }
}

function updateReferences(workspaceRoot: string, mappings: RenameMapping[]): { files: number; replacements: number } {
  let files = 0;
  let replacements = 0;
  walkFiles(workspaceRoot, (filePath) => {
    if (!TEXT_EXTENSIONS.has(path.extname(filePath))) {
      return;
    }
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }
    const replaced = replaceInString(content, mappings);
    if (replaced.replacements <= 0 || replaced.output === content) {
      return;
    }
    fs.writeFileSync(filePath, replaced.output, 'utf8');
    files += 1;
    replacements += replaced.replacements;
  });
  return { files, replacements };
}

function renameValueDefinition(filePath: string, type: string, oldName: string, newName: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const escapedType = escapeRegExp(type);
  const escapedOldName = escapeRegExp(oldName);
  let after = before;
  const directPattern = new RegExp(`(<${escapedType}\\b[^>]*\\bname\\s*=\\s*")${escapedOldName}(")`, 'g');
  const itemPattern = new RegExp(`(<item\\b(?=[^>]*\\btype\\s*=\\s*"${escapedType}")(?=[^>]*\\bname\\s*=\\s*")([^>]*\\bname\\s*=\\s*"))${escapedOldName}(")`, 'g');
  after = after.replace(directPattern, `$1${newName}$2`);
  after = after.replace(itemPattern, `$1${newName}$3`);
  if (after === before) {
    return false;
  }
  fs.writeFileSync(filePath, after, 'utf8');
  return true;
}

function isValidResourceName(name: string): boolean {
  return /^[a-z][a-z0-9_.]*$/.test(name);
}

async function pickResourcesForAction(entries: ResourceEntry[], title: string, workspaceRoot: string): Promise<ResourceEntry[] | undefined> {
  const picked = await vscode.window.showQuickPick(
    entries.map(entry => ({
      label: `${entry.type}/${entry.name}`,
      description: `${entry.kind === 'file' ? 'file' : 'value'} · ${path.relative(workspaceRoot, entry.filePath)}`,
      entry,
    })),
    { title, canPickMany: true, placeHolder: 'Select one or more resources' }
  );
  if (!picked || picked.length === 0) {
    return undefined;
  }
  return picked.map(item => item.entry);
}

export async function bulkRenameResources(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const resRoot = getResRoot(workspaceRoot);
  if (!resRoot) {
    showError('Android res folder not found.');
    return;
  }
  const resources = collectAllResources(resRoot);
  if (resources.length === 0) {
    showWarning('No resources found to rename.');
    return;
  }
  const selected = await pickResourcesForAction(resources, 'Resource Refactor: Bulk Rename', workspaceRoot);
  if (!selected) {
    return;
  }
  const findText = await vscode.window.showInputBox({
    prompt: 'Find text in resource names',
    placeHolder: 'old_part',
  });
  if (findText === undefined || findText.length === 0) {
    return;
  }
  const replaceText = await vscode.window.showInputBox({
    prompt: 'Replace with',
    placeHolder: 'new_part',
    value: '',
  });
  if (replaceText === undefined) {
    return;
  }
  const mappings: RenameMapping[] = [];
  const fileRenames: Array<{ from: string; to: string }> = [];
  const valueRenames: Array<{ filePath: string; type: string; oldName: string; newName: string }> = [];

  for (const entry of selected) {
    if (!entry.name.includes(findText)) {
      continue;
    }
    const newName = entry.name.split(findText).join(replaceText);
    if (!newName || !isValidResourceName(newName)) {
      showWarning(`Skip invalid target name "${newName}" for ${entry.type}/${entry.name}`);
      continue;
    }
    if (newName === entry.name) {
      continue;
    }
    mappings.push({
      oldType: entry.type,
      oldName: entry.name,
      newType: entry.type,
      newName,
    });
    if (entry.kind === 'file') {
      const targetPath = path.join(path.dirname(entry.filePath), `${newName}${entry.extension || ''}`);
      if (targetPath !== entry.filePath && fs.existsSync(targetPath)) {
        showWarning(`Skip ${entry.type}/${entry.name}: target file already exists.`);
        mappings.pop();
        continue;
      }
      fileRenames.push({ from: entry.filePath, to: targetPath });
    } else {
      valueRenames.push({ filePath: entry.filePath, type: entry.type, oldName: entry.name, newName });
    }
  }

  if (mappings.length === 0) {
    showWarning('No resources matched rename rule.');
    return;
  }

  const tmpRenames: Array<{ from: string; temp: string; to: string }> = [];
  for (let index = 0; index < fileRenames.length; index += 1) {
    const item = fileRenames[index];
    const temp = `${item.from}.atmp-${Date.now()}-${index}`;
    fs.renameSync(item.from, temp);
    tmpRenames.push({ from: item.from, temp, to: item.to });
  }
  for (const item of tmpRenames) {
    fs.renameSync(item.temp, item.to);
  }
  let valueDefinitionUpdates = 0;
  for (const item of valueRenames) {
    if (renameValueDefinition(item.filePath, item.type, item.oldName, item.newName)) {
      valueDefinitionUpdates += 1;
    }
  }
  const replaced = updateReferences(workspaceRoot, mappings);
  showInfo(
    `Resource rename complete: ${mappings.length} renamed, ${replaced.replacements} references updated in ${replaced.files} files, ${valueDefinitionUpdates} value definitions updated.`
  );
}

export async function bulkMoveResources(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const resRoot = getResRoot(workspaceRoot);
  if (!resRoot) {
    showError('Android res folder not found.');
    return;
  }
  const resources = collectFileResources(resRoot);
  if (resources.length === 0) {
    showWarning('No file resources found to move.');
    return;
  }
  const selected = await pickResourcesForAction(resources, 'Resource Refactor: Bulk Move', workspaceRoot);
  if (!selected) {
    return;
  }
  const folders = collectResourceFolders(resRoot);
  const createNewLabel = '$(add) Create new resource folder...';
  const destinationPick = await vscode.window.showQuickPick(
    [...folders.map(folder => ({ label: folder })), { label: createNewLabel }],
    { placeHolder: 'Select destination resource folder' }
  );
  if (!destinationPick) {
    return;
  }
  let destinationFolder = destinationPick.label;
  if (destinationFolder === createNewLabel) {
    const input = await vscode.window.showInputBox({
      prompt: 'New resource folder name (e.g., drawable-night, layout-land)',
      validateInput: (value) => /^[a-z][a-z0-9_]*(?:-[a-z0-9_]+)*$/.test(value) ? undefined : 'Invalid Android resource folder name',
    });
    if (!input) {
      return;
    }
    destinationFolder = input;
  }
  const destinationDir = path.join(resRoot, destinationFolder);
  fs.mkdirSync(destinationDir, { recursive: true });
  const destinationType = destinationFolder.split('-')[0];
  const mappings: RenameMapping[] = [];
  const moves: Array<{ from: string; to: string }> = [];
  for (const entry of selected) {
    const fileName = `${entry.name}${entry.extension || ''}`;
    const targetPath = path.join(destinationDir, fileName);
    if (path.resolve(entry.filePath) === path.resolve(targetPath)) {
      continue;
    }
    if (fs.existsSync(targetPath)) {
      showWarning(`Skip ${entry.type}/${entry.name}: destination already contains ${fileName}.`);
      continue;
    }
    moves.push({ from: entry.filePath, to: targetPath });
    mappings.push({
      oldType: entry.type,
      oldName: entry.name,
      newType: destinationType,
      newName: entry.name,
    });
  }
  if (moves.length === 0) {
    showWarning('No resources moved.');
    return;
  }
  for (const move of moves) {
    fs.renameSync(move.from, move.to);
  }
  const changedTypeMappings = mappings.filter(mapping => mapping.oldType !== mapping.newType);
  const replaced = changedTypeMappings.length > 0
    ? updateReferences(workspaceRoot, changedTypeMappings)
    : { files: 0, replacements: 0 };
  showInfo(
    `Resource move complete: ${moves.length} moved to ${destinationFolder}. ${replaced.replacements} references updated in ${replaced.files} files.`
  );
}

export async function openResourceRefactorTools(): Promise<void> {
  const action = await vscode.window.showQuickPick(
    [
      { label: 'Bulk Rename Resources', value: 'rename', description: 'Rename multiple resources and update references' },
      { label: 'Bulk Move Resources', value: 'move', description: 'Move resources between res folders and update references' },
    ],
    { placeHolder: 'Select Resource Refactor action' }
  );
  if (!action) {
    return;
  }
  if (action.value === 'rename') {
    await bulkRenameResources();
    return;
  }
  await bulkMoveResources();
}
