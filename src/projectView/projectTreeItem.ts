import * as vscode from 'vscode';
import { ProjectNodeType, CategoryId, ProjectNodeData, CATEGORY_CONFIGS } from './types';
export class ProjectTreeItem extends vscode.TreeItem {
  public readonly data: ProjectNodeData;
  public children: ProjectTreeItem[] = [];
  constructor(
    data: ProjectNodeData,
    collapsibleState: vscode.TreeItemCollapsibleState,
    children?: ProjectTreeItem[]
  ) {
    if (data.resourceUri) {
      super(data.resourceUri, collapsibleState);
      this.label = data.label;
    } else {
      super(data.label, collapsibleState);
    }
    this.data = data;
    this.description = data.description;
    this.tooltip = this.createTooltip();
    this.contextValue = this.getContextValue();
    if (children) {
      this.children = children;
    }
    if (data.resourceUri) {
      this.resourceUri = data.resourceUri;
    }
    if (!data.resourceUri) {
      this.iconPath = this.getVirtualNodeIcon();
    }
    if (data.type === 'file' && data.resourceUri) {
      this.command = {
        command: 'android-toolkit.openFile',
        title: 'Open File',
        arguments: [data.resourceUri.fsPath],
      };
    }
  }
  public addChild(child: ProjectTreeItem): void {
    this.children.push(child);
    if (this.collapsibleState === vscode.TreeItemCollapsibleState.None) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
  }
  private getContextValue(): string {
    if (this.data.type === 'category' && this.data.categoryId) {
      return `category-${this.data.categoryId}`;
    }
    if (this.data.type === 'folder' && this.data.resourceUri) {
      const folderName = this.data.label.toLowerCase();
      if (this.isResourceFolder(folderName)) {
        return `folder-res-${folderName.split('-')[0]}`;
      }
      return 'folder';
    }
    return this.data.type;
  }
  private isResourceFolder(name: string): boolean {
    const resTypes = ['drawable', 'layout', 'values', 'mipmap', 'raw', 'xml', 'anim', 'menu', 'color', 'font'];
    return resTypes.some(type => name === type || name.startsWith(`${type}-`));
  }
  private getVirtualNodeIcon(): vscode.ThemeIcon | undefined {
    switch (this.data.type) {
      case 'root':
        return new vscode.ThemeIcon('folder-library');
      case 'category':
        return this.getCategoryIcon();
      case 'package':
        return new vscode.ThemeIcon('symbol-package');
      default:
        return undefined;
    }
  }
  private getCategoryIcon(): vscode.ThemeIcon {
    switch (this.data.categoryId) {
      case 'manifests':
        return new vscode.ThemeIcon('symbol-file');
      case 'java':
        return new vscode.ThemeIcon('symbol-class');
      case 'res':
        return new vscode.ThemeIcon('file-media');
      case 'assets':
        return new vscode.ThemeIcon('file-binary');
      case 'gradle':
        return new vscode.ThemeIcon('gear');
      default:
        const config = CATEGORY_CONFIGS.find(c => c.id === this.data.categoryId);
        return new vscode.ThemeIcon(config?.icon || 'folder');
    }
  }
  private createTooltip(): string {
    if (this.data.resourceUri) {
      return this.data.resourceUri.fsPath;
    }
    switch (this.data.type) {
      case 'root':
        return 'Android Project';
      case 'category':
        return this.getCategoryTooltip();
      default:
        return this.data.label;
    }
  }
  private getCategoryTooltip(): string {
    switch (this.data.categoryId) {
      case 'manifests':
        return 'Android manifest files';
      case 'java':
        return 'Java and Kotlin source files';
      case 'res':
        return 'Android resources (layouts, drawables, values, etc.)';
      case 'assets':
        return 'Raw asset files';
      case 'gradle':
        return 'Gradle build configuration files';
      default:
        return this.data.label;
    }
  }
}
export function createRootNode(projectName: string): ProjectTreeItem {
  return new ProjectTreeItem(
    {
      type: 'root',
      label: projectName,
      description: 'Module',
    },
    vscode.TreeItemCollapsibleState.Expanded
  );
}
export function createCategoryNode(categoryId: CategoryId): ProjectTreeItem {
  const config = CATEGORY_CONFIGS.find(c => c.id === categoryId);
  if (!config) {
    throw new Error(`Unknown category: ${categoryId}`);
  }
  return new ProjectTreeItem(
    {
      type: 'category',
      categoryId,
      label: config.label,
    },
    vscode.TreeItemCollapsibleState.Collapsed
  );
}
export function createFileNode(
  uri: vscode.Uri,
  name: string,
  isDirectory: boolean
): ProjectTreeItem {
  return new ProjectTreeItem(
    {
      type: isDirectory ? 'folder' : 'file',
      resourceUri: uri,
      label: name,
    },
    isDirectory 
      ? vscode.TreeItemCollapsibleState.Collapsed 
      : vscode.TreeItemCollapsibleState.None
  );
}

export function createFolderNode(
  uri: vscode.Uri,
  name: string,
  expanded = false
): ProjectTreeItem {
  return new ProjectTreeItem(
    {
      type: 'folder',
      resourceUri: uri,
      label: name,
    },
    expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
  );
}
export function createPackageNode(uri: vscode.Uri, name: string, fullPackage: string): ProjectTreeItem {
  return new ProjectTreeItem(
    {
      type: 'package',
      label: name,
      resourceUri: uri,
      description: '', 
    },
    vscode.TreeItemCollapsibleState.Collapsed
  );
}
