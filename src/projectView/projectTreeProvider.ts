import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CategoryId, CATEGORY_CONFIGS } from './types';
import { 
  ProjectTreeItem, 
  createRootNode, 
  createCategoryNode, 
  createFileNode,
  createPackageNode
} from './projectTreeItem';
import { 
  scanCategory, 
  isAndroidProject, 
  getProjectName,
  DiscoveredFile 
} from './projectScanner';
import { showError, showInfo, showWarning } from '../ui/notifications';
import { pushUndoEntry } from './undoManager';
import { measureAsync } from '../core/perf';
export class AndroidProjectProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private workspaceRoot: string | undefined;
  private projectName: string = 'Android Project';
  private isAndroid: boolean = false;
  public readonly dragAndDropController: AndroidProjectDragAndDropController;
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly treeCache = new Map<string, ProjectTreeItem[]>();
  private readonly pendingCache = new Map<string, Promise<ProjectTreeItem[]>>();
  constructor() {
    this.updateWorkspace();
    this.dragAndDropController = new AndroidProjectDragAndDropController(this);
  }
  private updateWorkspace(): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      this.workspaceRoot = workspaceFolder.uri.fsPath;
      this.isAndroid = isAndroidProject(this.workspaceRoot);
      this.projectName = getProjectName(this.workspaceRoot);
    } else {
      this.workspaceRoot = undefined;
      this.isAndroid = false;
      this.projectName = 'No Workspace';
    }
  }
  refresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.updateWorkspace();
      this.treeCache.clear();
      this.pendingCache.clear();
      this._onDidChangeTreeData.fire(undefined);
      this.refreshTimer = undefined;
    }, 250);
  }
  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }
  async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
    return measureAsync('projectTree:getChildren', async () => {
      if (!this.workspaceRoot) {
        return [this.createNoWorkspaceItem()];
      }
      if (!this.isAndroid) {
        return [this.createNotAndroidItem()];
      }
      if (!element) {
        return this.getRootChildren();
      }
      if (element.data.type === 'root') {
        return this.getCategoryNodes();
      }
      if (element.data.type === 'category' && element.data.categoryId) {
        const key = `category:${element.data.categoryId}`;
        return this.getCachedChildren(key, () => this.getCategoryChildren(element.data.categoryId!));
      }
      if (element.data.type === 'package') {
        if (element.children && element.children.length > 0) {
          return element.children;
        }
        if (element.data.resourceUri) {
          const key = `package:${element.data.resourceUri.fsPath}`;
          return this.getCachedChildren(key, () => this.getFolderChildren(element.data.resourceUri!));
        }
      }
      if (element.data.type === 'folder' && element.data.resourceUri) {
        const key = `folder:${element.data.resourceUri.fsPath}`;
        return this.getCachedChildren(key, () => this.getFolderChildren(element.data.resourceUri!));
      }
      return [];
    });
  }
  private async getCachedChildren(
    key: string,
    loader: () => Promise<ProjectTreeItem[]>
  ): Promise<ProjectTreeItem[]> {
    const cached = this.treeCache.get(key);
    if (cached) {
      return cached;
    }
    const pending = this.pendingCache.get(key);
    if (pending) {
      return pending;
    }
    const loadPromise = loader()
      .then(result => {
        this.treeCache.set(key, result);
        this.pendingCache.delete(key);
        return result;
      })
      .catch(error => {
        this.pendingCache.delete(key);
        throw error;
      });
    this.pendingCache.set(key, loadPromise);
    return loadPromise;
  }
  private getRootChildren(): ProjectTreeItem[] {
    return [createRootNode(this.projectName)];
  }
  private getCategoryNodes(): ProjectTreeItem[] {
    return CATEGORY_CONFIGS.map(config => createCategoryNode(config.id));
  }
  private async getCategoryChildren(categoryId: CategoryId): Promise<ProjectTreeItem[]> {
    return measureAsync(`projectTree:getCategoryChildren:${categoryId}`, async () => {
      if (!this.workspaceRoot) {
        return [];
      }
      const config = CATEGORY_CONFIGS.find(c => c.id === categoryId);
      if (!config) {
        return [];
      }
      const result = await scanCategory(this.workspaceRoot, config);
      if (result.files.length === 0) {
        return [this.createEmptyItem(`No ${config.label.toLowerCase()} found`)];
      }
      if (categoryId === 'res') {
        return this.groupByDirectory(result.files, result.rootPath);
      }
      if (categoryId === 'java') {
        return this.buildPackageTree(result.files, result.rootPath);
      }
      return result.files.map(file =>
        createFileNode(file.uri, file.name, file.isDirectory)
      );
    });
  }
  private async buildPackageTree(
    files: DiscoveredFile[],
    rootPath: string | undefined
  ): Promise<ProjectTreeItem[]> {
    if (!rootPath) {
      return files.map(f => createFileNode(f.uri, f.name, f.isDirectory));
    }
    const rootNodes: ProjectTreeItem[] = [];
    const dirMap = new Map<string, ProjectTreeItem>();
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    for (const file of files) {
      const relPath = file.relativePath;
      const parts = relPath.split(path.sep);
      const fileName = parts.pop()!;
      if (parts.length === 0) {
        rootNodes.push(createFileNode(file.uri, file.name, file.isDirectory));
        continue;
      }
      let currentPath = '';
      let parentNode: ProjectTreeItem | undefined;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}.${part}` : part;
        if (!dirMap.has(currentPath)) {
          const folderUri = vscode.Uri.file(path.join(rootPath, ...currentPath.split('.')));
          const node = createPackageNode(folderUri, part, currentPath);
          dirMap.set(currentPath, node);
          if (parentNode) {
            parentNode.addChild(node);
          } else {
            rootNodes.push(node);
          }
        }
        parentNode = dirMap.get(currentPath);
      }
      if (parentNode) {
        parentNode.addChild(createFileNode(file.uri, file.name, file.isDirectory));
      }
    }
    return this.compactPackages(rootNodes);
  }
  private compactPackages(nodes: ProjectTreeItem[]): ProjectTreeItem[] {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.data.type === 'package' && node.children && node.children.length === 1) {
        const child = node.children[0];
        if (child.data.type === 'package') {
          node.label = `${node.label}.${child.label}`;
          node.data.label = node.label; 
          node.children = child.children;
          node.data.resourceUri = child.data.resourceUri; 
          i--; 
        }
      }
    }
    return nodes;
  }
  private groupByDirectory(
    files: DiscoveredFile[], 
    rootPath?: string
  ): ProjectTreeItem[] {
    if (!rootPath) {
      return files.map(f => createFileNode(f.uri, f.name, f.isDirectory));
    }
    const directories = new Map<string, vscode.Uri>();
    const rootFiles: ProjectTreeItem[] = [];
    for (const file of files) {
      const relativePath = path.relative(rootPath, file.uri.fsPath);
      const parts = relativePath.split(path.sep);
      if (parts.length === 1) {
        rootFiles.push(createFileNode(file.uri, file.name, file.isDirectory));
        continue;
      }
      if (parts.length > 1) {
        const dirName = parts[0];
        if (!directories.has(dirName)) {
          directories.set(
            dirName, 
            vscode.Uri.file(path.join(rootPath, dirName))
          );
        }
      }
    }
    const dirNodes = Array.from(directories.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, uri]) => createFileNode(uri, name, true));
    return [...dirNodes, ...rootFiles];
  }
  private async getFolderChildren(uri: vscode.Uri): Promise<ProjectTreeItem[]> {
    return measureAsync('projectTree:getFolderChildren', async () => {
      const fs = await import('fs').then(m => m.promises);
      try {
        const entries = await fs.readdir(uri.fsPath, { withFileTypes: true });
        return entries
          .filter(entry => !entry.name.startsWith('.'))
          .sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) {
              return a.isDirectory() ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          })
          .map(entry => createFileNode(
            vscode.Uri.file(path.join(uri.fsPath, entry.name)),
            entry.name,
            entry.isDirectory()
          ));
      } catch {
        return [];
      }
    });
  }
  private createNoWorkspaceItem(): ProjectTreeItem {
    return new ProjectTreeItem(
      {
        type: 'root',
        label: 'No workspace open',
        description: 'Open an Android project folder',
      },
      vscode.TreeItemCollapsibleState.None
    );
  }
  private createNotAndroidItem(): ProjectTreeItem {
    return new ProjectTreeItem(
      {
        type: 'root',
        label: 'Not an Android project',
        description: 'Open a folder with AndroidManifest.xml',
      },
      vscode.TreeItemCollapsibleState.None
    );
  }
  private createEmptyItem(message: string): ProjectTreeItem {
    return new ProjectTreeItem(
      {
        type: 'file',
        label: message,
      },
      vscode.TreeItemCollapsibleState.None
    );
  }
}

class AndroidProjectDragAndDropController implements vscode.TreeDragAndDropController<ProjectTreeItem> {
  readonly dragMimeTypes = ['application/vnd.code.tree.androidProjectView', 'text/uri-list'];
  readonly dropMimeTypes = ['application/vnd.code.tree.androidProjectView', 'text/uri-list'];
  constructor(private readonly provider: AndroidProjectProvider) {}
  async handleDrag(
    source: readonly ProjectTreeItem[],
    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
    const uris = source
      .map(item => item.data.resourceUri)
      .filter((u): u is vscode.Uri => Boolean(u));
    if (uris.length === 0) {
      return;
    }
    const payload = JSON.stringify(uris.map(u => u.fsPath));
    dataTransfer.set('application/vnd.code.tree.androidProjectView', new vscode.DataTransferItem(payload));
    dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uris.map(u => u.toString()).join('\n')));
  }
  async handleDrop(
    target: ProjectTreeItem | undefined,
    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      showError('No workspace folder open.');
      return;
    }
    const targetDir = this.getTargetDirectory(target, workspaceRoot);
    if (!targetDir) {
      showError('Select a target folder to move into.');
      return;
    }
    const draggedPaths = await this.getDraggedPaths(dataTransfer);
    if (draggedPaths.length === 0) {
      return;
    }
    const results: string[] = [];
    const successfulMoves: Array<{ src: string; dest: string }> = [];
    const failures: string[] = [];
    const skipped: string[] = [];
    const plannedMoves: Array<{ src: string; dest: string; baseName: string }> = [];
    for (const srcPath of draggedPaths) {
      const normalizedSrc = path.resolve(srcPath);
      const normalizedTarget = path.resolve(targetDir);
      if (!this.isSameOrWithinWorkspace(normalizedSrc, workspaceRoot)) {
        skipped.push(`${path.basename(srcPath)} (outside workspace)`);
        continue;
      }
      if (this.isSamePath(normalizedSrc, normalizedTarget) || this.isSubPath(normalizedTarget, normalizedSrc)) {
        skipped.push(`${path.basename(srcPath)} (invalid target)`);
        continue;
      }
      const baseName = path.basename(srcPath);
      const destPath = await this.getAvailableDestinationPath(normalizedTarget, baseName);
      if (this.isSamePath(destPath, normalizedSrc)) {
        skipped.push(`${baseName} (same location)`);
        continue;
      }
      plannedMoves.push({ src: normalizedSrc, dest: destPath, baseName });
    }
    if (plannedMoves.length === 0) {
      if (skipped.length > 0) {
        showWarning(`Skipped ${skipped.length} item(s): ${skipped.slice(0, 2).join(', ')}`);
      }
      return;
    }
    const previewText = this.buildMovePreviewText(workspaceRoot, plannedMoves);
    const confirm = await vscode.window.showWarningMessage(
      `Drag&Drop preview:\n${previewText}`,
      'Move'
    );
    if (confirm !== 'Move') {
      showInfo('Move cancelled.');
      return;
    }
    for (const move of plannedMoves) {
      try {
        await vscode.workspace.fs.rename(
          vscode.Uri.file(move.src),
          vscode.Uri.file(move.dest),
          { overwrite: false }
        );
        results.push(`${move.baseName} -> ${path.relative(workspaceRoot, move.dest)}`);
        successfulMoves.push({ src: move.src, dest: move.dest });
      } catch (error) {
        failures.push(`${move.baseName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    if (results.length > 0) {
      pushUndoEntry({
        label: `Move ${results.length} item(s)`,
        items: successfulMoves.map(move => ({ from: move.dest, to: move.src })),
      });
    }
    if (results.length > 0) {
      const action = await vscode.window.showInformationMessage(`Moved ${results.length} item(s)`, 'Undo');
      if (action === 'Undo') {
        await vscode.commands.executeCommand('android-toolkit.undoLastProjectAction');
      }
    }
    if (skipped.length > 0) {
      showWarning(`Skipped ${skipped.length} item(s): ${skipped.slice(0, 2).join(', ')}`);
    }
    if (failures.length > 0) {
      showError(`Failed to move ${failures.length} item(s). Check output for details.`);
      failures.forEach(line => showWarning(`Move error: ${line}`));
    }
    this.provider.refresh();
  }
  private isSameOrWithinWorkspace(targetPath: string, workspaceRoot: string): boolean {
    const root = path.resolve(workspaceRoot);
    return this.isSamePath(targetPath, root) || this.isSubPath(targetPath, root);
  }
  private isSubPath(candidate: string, parent: string): boolean {
    const rel = path.relative(parent, candidate);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  }
  private isSamePath(a: string, b: string): boolean {
    if (process.platform === 'linux') {
      return a === b;
    }
    return a.toLowerCase() === b.toLowerCase();
  }
  private async pathExists(fsPath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(fsPath));
      return true;
    } catch {
      return false;
    }
  }
  private async getAvailableDestinationPath(targetDir: string, baseName: string): Promise<string> {
    const parsed = path.parse(baseName);
    let attempt = 0;
    while (attempt < 200) {
      const suffix = attempt === 0 ? '' : ` (${attempt})`;
      const name = `${parsed.name}${suffix}${parsed.ext}`;
      const nextPath = path.join(targetDir, name);
      if (!(await this.pathExists(nextPath))) {
        return nextPath;
      }
      attempt++;
    }
    return path.join(targetDir, `${parsed.name}-${Date.now()}${parsed.ext}`);
  }
  private buildMovePreviewText(
    workspaceRoot: string,
    plannedMoves: Array<{ src: string; dest: string }>
  ): string {
    const maxRows = 8;
    const lines = plannedMoves.slice(0, maxRows).map(move => {
      const from = path.relative(workspaceRoot, move.src) || path.basename(move.src);
      const to = path.relative(workspaceRoot, move.dest) || path.basename(move.dest);
      return `${from} -> ${to}`;
    });
    if (plannedMoves.length > maxRows) {
      lines.push(`...and ${plannedMoves.length - maxRows} more`);
    }
    return lines.join('\n');
  }
  private async getDraggedPaths(dataTransfer: vscode.DataTransfer): Promise<string[]> {
    const internal = dataTransfer.get('application/vnd.code.tree.androidProjectView');
    if (internal) {
      const text = await internal.asString();
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parsed.filter(p => typeof p === 'string');
        }
      } catch {
      }
    }
    const uriList = dataTransfer.get('text/uri-list');
    if (uriList) {
      const text = await uriList.asString();
      return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => vscode.Uri.parse(line).fsPath);
    }
    return [];
  }
  private getTargetDirectory(target: ProjectTreeItem | undefined, workspaceRoot: string): string | undefined {
    if (!target) {
      return workspaceRoot;
    }
    if (target.data.type === 'folder' || target.data.type === 'package') {
      return target.data.resourceUri?.fsPath;
    }
    if (target.data.type === 'file') {
      return target.data.resourceUri ? path.dirname(target.data.resourceUri.fsPath) : workspaceRoot;
    }
    if (target.data.type === 'category' && target.data.categoryId) {
      const config = CATEGORY_CONFIGS.find(c => c.id === target.data.categoryId);
      if (config) {
        for (const rootPath of config.rootPaths) {
          const fullPath = path.join(workspaceRoot, rootPath);
          if (fs.existsSync(fullPath)) {
            return fullPath;
          }
        }
      }
    }
    return workspaceRoot;
  }
}
