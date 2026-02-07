/**
 * Android Project TreeDataProvider
 * Provides data for the Android Project View TreeView
 */

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

/**
 * TreeDataProvider for Android Project View
 */
export class AndroidProjectProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private workspaceRoot: string | undefined;
  private projectName: string = 'Android Project';
  private isAndroid: boolean = false;

  constructor() {
    this.updateWorkspace();
  }

  /**
   * Update workspace information
   */
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

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this.updateWorkspace();
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Get tree item representation
   */
  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for a tree node
   */
  async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
    if (!this.workspaceRoot) {
      return [this.createNoWorkspaceItem()];
    }

    if (!this.isAndroid) {
      return [this.createNotAndroidItem()];
    }

    // Root level - return project with categories
    if (!element) {
      return this.getRootChildren();
    }

    // Project root - return categories
    if (element.data.type === 'root') {
      return this.getCategoryNodes();
    }

    // Category - return files
    if (element.data.type === 'category' && element.data.categoryId) {
      return this.getCategoryChildren(element.data.categoryId);
    }

    // Folder - return folder contents
    if (element.data.type === 'folder' && element.data.resourceUri) {
      return this.getFolderChildren(element.data.resourceUri);
    }

    return [];
  }

  /**
   * Get root level children
   */
  private getRootChildren(): ProjectTreeItem[] {
    return [createRootNode(this.projectName)];
  }

  /**
   * Get category nodes
   */
  private getCategoryNodes(): ProjectTreeItem[] {
    return CATEGORY_CONFIGS.map(config => createCategoryNode(config.id));
  }

  /**
   * Get children for a category
   */
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

    // Group files by directory for better organization
    if (categoryId === 'res') {
      return this.groupByDirectory(result.files, result.rootPath);
    }

    // Build package tree for Java/Kotlin
    if (categoryId === 'java') {
      return this.buildPackageTree(result.files, result.rootPath);
    }

    return result.files.map(file => 
      createFileNode(file.uri, file.name, file.isDirectory)
    );
  }

  /**
   * Build hierarchical package tree for Java/Kotlin files
   */
  private async buildPackageTree(
    files: DiscoveredFile[],
    rootPath: string | undefined
  ): Promise<ProjectTreeItem[]> {
    if (!rootPath) {
      return files.map(f => createFileNode(f.uri, f.name, f.isDirectory));
    }

    // Map to store directory nodes
    const rootNodes: ProjectTreeItem[] = [];
    const dirMap = new Map<string, ProjectTreeItem>();

    // Sort files by path to ensure parent folders are processed first
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    for (const file of files) {
      const relPath = file.relativePath;
      const parts = relPath.split(path.sep);
      const fileName = parts.pop()!;
      
      // Determine package path (directory structure)
      // e.g. com/example/app/MainActivity.kt -> com.example.app
      
      // If file is at root of source set
      if (parts.length === 0) {
        rootNodes.push(createFileNode(file.uri, file.name, file.isDirectory));
        continue;
      }

      // Build or find package nodes
      let currentPath = '';
      let parentNode: ProjectTreeItem | undefined;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}.${part}` : part;

        if (!dirMap.has(currentPath)) {
          // Flatten logic: if parent has only one child and it's a folder, merge them?
          // For now, let's build a standard tree first.
          
          // Create package node
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

      // Add file to the package node
      if (parentNode) {
        parentNode.addChild(createFileNode(file.uri, file.name, file.isDirectory));
      }
    }

    // Post-processing: Flatten empty intermediate packages
    // (Optional optimization to match Android Studio's "Compact Middle Packages")
    // e.g. com -> example -> app  becomes com.example.app if no other files

    return this.compactPackages(rootNodes);
  }

  /**
   * Compact empty middle packages (e.g. com -> example -> app  => com.example.app)
   */
  private compactPackages(nodes: ProjectTreeItem[]): ProjectTreeItem[] {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.data.type === 'package' && node.children && node.children.length === 1) {
        const child = node.children[0];
        if (child.data.type === 'package') {
          // Merge with child
          node.label = `${node.label}.${child.label}`;
          node.data.label = node.label; // Update data label too
          node.children = child.children;
          node.data.resourceUri = child.data.resourceUri; // Point to deeper path
          
          // Re-process this node since we pulled up a child
          i--; 
        }
      }
    }
    return nodes;
  }

  /**
   * Group files by their parent directory
   */
  private groupByDirectory(
    files: DiscoveredFile[], 
    rootPath?: string
  ): ProjectTreeItem[] {
    if (!rootPath) {
      return files.map(f => createFileNode(f.uri, f.name, f.isDirectory));
    }

    // Get unique first-level directories
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

    // Create folder nodes
    return Array.from(directories.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, uri]) => createFileNode(uri, name, true));
  }

  /**
   * Get children of a folder
   */
  private async getFolderChildren(uri: vscode.Uri): Promise<ProjectTreeItem[]> {
    const fs = await import('fs').then(m => m.promises);
    
    try {
      const entries = await fs.readdir(uri.fsPath, { withFileTypes: true });
      
      return entries
        .filter(entry => !entry.name.startsWith('.'))
        .sort((a, b) => {
          // Directories first
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

  /**
   * Create a "no workspace" placeholder item
   */
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

  /**
   * Create a "not Android project" placeholder item
   */
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

  /**
   * Create an empty placeholder item
   */
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
