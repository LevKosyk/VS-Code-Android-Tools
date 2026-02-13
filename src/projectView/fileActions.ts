import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AndroidProjectProvider } from './projectTreeProvider';
import { ProjectTreeItem } from './projectTreeItem';
import { CATEGORY_CONFIGS, CategoryId } from './types';
import { showError, showInfo, showWarning } from '../ui/notifications';
import { pushUndoEntry, undoLastEntry } from './undoManager';

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function findCategoryRoot(workspaceRoot: string, categoryId: CategoryId): string | undefined {
  const config = CATEGORY_CONFIGS.find(c => c.id === categoryId);
  if (!config) {
    return undefined;
  }
  for (const rootPath of config.rootPaths) {
    const fullPath = path.join(workspaceRoot, rootPath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return undefined;
}

function getTargetDirectory(item?: ProjectTreeItem): string | undefined {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return undefined;
  }
  if (!item) {
    return workspaceRoot;
  }
  if (item.data.type === 'folder' || item.data.type === 'package') {
    return item.data.resourceUri?.fsPath;
  }
  if (item.data.type === 'file') {
    return item.data.resourceUri ? path.dirname(item.data.resourceUri.fsPath) : workspaceRoot;
  }
  if (item.data.type === 'category' && item.data.categoryId) {
    return findCategoryRoot(workspaceRoot, item.data.categoryId) || workspaceRoot;
  }
  return workspaceRoot;
}

function getTrashRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.android-tools-trash');
}

async function getUniquePath(targetPath: string): Promise<string> {
  const parsed = path.parse(targetPath);
  let attempt = 0;
  while (attempt < 200) {
    const suffix = attempt === 0 ? '' : `-${attempt}`;
    const candidate = path.join(parsed.dir, `${parsed.name}${suffix}${parsed.ext}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    attempt++;
  }
  return path.join(parsed.dir, `${parsed.name}-${Date.now()}${parsed.ext}`);
}

export async function createFolderCommand(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  const baseDir = getTargetDirectory(item);
  if (!baseDir) {
    showError('No workspace folder open.');
    return;
  }
  const folderName = await vscode.window.showInputBox({
    title: 'Create Folder (Inline)',
    prompt: 'Enter folder name',
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Folder name cannot be empty';
      }
      if (value.includes(path.sep)) {
        return 'Folder name cannot include path separators';
      }
      return undefined;
    },
  });
  if (!folderName) {
    return;
  }
  const folderPath = path.join(baseDir, folderName);
  if (fs.existsSync(folderPath)) {
    showWarning(`Folder already exists: ${folderName}`);
    return;
  }
  try {
    await fs.promises.mkdir(folderPath, { recursive: true });
    provider.refresh();
    showInfo(`Created folder: ${folderName}`);
  } catch (error) {
    showError(
      `Failed to create folder: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function createFileCommand(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  const baseDir = getTargetDirectory(item);
  if (!baseDir) {
    showError('No workspace folder open.');
    return;
  }
  const fileName = await vscode.window.showInputBox({
    title: 'Create File (Inline)',
    prompt: 'Enter file name (with extension)',
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'File name cannot be empty';
      }
      if (value.includes(path.sep)) {
        return 'File name cannot include path separators';
      }
      return undefined;
    },
  });
  if (!fileName) {
    return;
  }
  const filePath = path.join(baseDir, fileName);
  if (fs.existsSync(filePath)) {
    showWarning(`File already exists: ${fileName}`);
    return;
  }
  try {
    await fs.promises.mkdir(baseDir, { recursive: true });
    await fs.promises.writeFile(filePath, '', 'utf-8');
    provider.refresh();
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    showInfo(`Created file: ${fileName}`);
  } catch (error) {
    showError(
      `Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function renameItemCommand(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  if (!item?.data.resourceUri) {
    showError('Select a file or folder to rename.');
    return;
  }
  const currentPath = item.data.resourceUri.fsPath;
  const currentName = path.basename(currentPath);
  const newName = await vscode.window.showInputBox({
    title: 'Rename (Inline)',
    value: currentName,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Name cannot be empty';
      }
      if (value.includes(path.sep)) {
        return 'Name cannot include path separators';
      }
      return undefined;
    },
  });
  if (!newName || newName === currentName) {
    return;
  }
  const newPath = path.join(path.dirname(currentPath), newName);
  if (fs.existsSync(newPath)) {
    showError('A file or folder with that name already exists.');
    return;
  }
  try {
    await vscode.workspace.fs.rename(
      vscode.Uri.file(currentPath),
      vscode.Uri.file(newPath),
      { overwrite: false }
    );
    provider.refresh();
    showInfo(`Renamed to ${newName}`);
  } catch (error) {
    showError(
      `Failed to rename: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function deleteItemCommand(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  if (!item?.data.resourceUri) {
    showError('Select a file or folder to delete.');
    return;
  }
  const targetPath = item.data.resourceUri.fsPath;
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  try {
    const trashRoot = getTrashRoot(workspaceRoot);
    const rel = path.relative(workspaceRoot, targetPath);
    const trashTarget = await getUniquePath(path.join(trashRoot, rel));
    await fs.promises.mkdir(path.dirname(trashTarget), { recursive: true });
    await vscode.workspace.fs.rename(item.data.resourceUri, vscode.Uri.file(trashTarget), { overwrite: false });
    pushUndoEntry({
      label: `Delete ${path.basename(targetPath)}`,
      items: [{ from: trashTarget, to: targetPath }],
    });
    provider.refresh();
    const action = await vscode.window.showInformationMessage('Moved to Android Tools Trash.', 'Restore');
    if (action === 'Restore') {
      await undoLastProjectAction(provider);
    }
  } catch (error) {
    showError(
      `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function undoLastProjectAction(provider: AndroidProjectProvider): Promise<void> {
  try {
    const entry = await undoLastEntry();
    if (!entry) {
      showWarning('Nothing to undo.');
      return;
    }
    provider.refresh();
    showInfo(`Undo complete: ${entry.label}`);
  } catch (error) {
    showError(`Undo failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
