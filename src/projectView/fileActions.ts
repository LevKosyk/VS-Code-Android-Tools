import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AndroidProjectProvider } from './projectTreeProvider';
import { ProjectTreeItem } from './projectTreeItem';
import { CATEGORY_CONFIGS, CategoryId } from './types';

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

export async function createFolderCommand(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  const baseDir = getTargetDirectory(item);
  if (!baseDir) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const folderName = await vscode.window.showInputBox({
    title: 'Create Folder',
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
    vscode.window.showWarningMessage(`Folder already exists: ${folderName}`);
    return;
  }
  try {
    await fs.promises.mkdir(folderPath, { recursive: true });
    provider.refresh();
    vscode.window.showInformationMessage(`Created folder: ${folderName}`);
  } catch (error) {
    vscode.window.showErrorMessage(
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
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const fileName = await vscode.window.showInputBox({
    title: 'Create File',
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
    vscode.window.showWarningMessage(`File already exists: ${fileName}`);
    return;
  }
  try {
    await fs.promises.mkdir(baseDir, { recursive: true });
    await fs.promises.writeFile(filePath, '', 'utf-8');
    provider.refresh();
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    vscode.window.showInformationMessage(`Created file: ${fileName}`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function renameItemCommand(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  if (!item?.data.resourceUri) {
    vscode.window.showErrorMessage('Select a file or folder to rename.');
    return;
  }
  const currentPath = item.data.resourceUri.fsPath;
  const currentName = path.basename(currentPath);
  const newName = await vscode.window.showInputBox({
    title: 'Rename',
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
    vscode.window.showErrorMessage('A file or folder with that name already exists.');
    return;
  }
  try {
    await vscode.workspace.fs.rename(
      vscode.Uri.file(currentPath),
      vscode.Uri.file(newPath),
      { overwrite: false }
    );
    provider.refresh();
    vscode.window.showInformationMessage(`Renamed to ${newName}`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to rename: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function deleteItemCommand(
  item: ProjectTreeItem | undefined,
  provider: AndroidProjectProvider
): Promise<void> {
  if (!item?.data.resourceUri) {
    vscode.window.showErrorMessage('Select a file or folder to delete.');
    return;
  }
  const targetPath = item.data.resourceUri.fsPath;
  const confirm = await vscode.window.showWarningMessage(
    `Delete "${path.basename(targetPath)}"?`,
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') {
    return;
  }
  try {
    await vscode.workspace.fs.delete(item.data.resourceUri, {
      recursive: true,
      useTrash: true,
    });
    provider.refresh();
    vscode.window.showInformationMessage('Deleted');
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
