import * as vscode from 'vscode';
import * as path from 'path';
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
export class AndroidProjectProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private workspaceRoot: string | undefined;
  private projectName: string = 'Android Project';
  private isAndroid: boolean = false;
  constructor() {
    this.updateWorkspace();
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
    this.updateWorkspace();
    this._onDidChangeTreeData.fire(undefined);
  }
  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }
  async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
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
      return this.getCategoryChildren(element.data.categoryId);
    }
    if (element.data.type === 'folder' && element.data.resourceUri) {
      return this.getFolderChildren(element.data.resourceUri);
    }
    return [];
  }
  private getRootChildren(): ProjectTreeItem[] {
    return [createRootNode(this.projectName)];
  }
  private getCategoryNodes(): ProjectTreeItem[] {
    return CATEGORY_CONFIGS.map(config => createCategoryNode(config.id));
  }
  private async getCategoryChildren(categoryId: CategoryId): Promise<ProjectTreeItem[]> {
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
    for (const file of files) {
      const relativePath = path.relative(rootPath, file.uri.fsPath);
      const parts = relativePath.split(path.sep);
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
    return Array.from(directories.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, uri]) => createFileNode(uri, name, true));
  }
  private async getFolderChildren(uri: vscode.Uri): Promise<ProjectTreeItem[]> {
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
