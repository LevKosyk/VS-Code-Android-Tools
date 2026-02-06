/**
 * Android Project Tree Item
 * VS Code TreeItem implementation for project nodes
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectNodeType, CategoryId, ProjectNodeData, CATEGORY_CONFIGS } from './types';

/**
 * Tree item for Android Project View
 */
export class ProjectTreeItem extends vscode.TreeItem {
  public readonly data: ProjectNodeData;

  constructor(
    data: ProjectNodeData,
    collapsibleState: vscode.TreeItemCollapsibleState,
    children?: ProjectTreeItem[]
  ) {
    super(data.label, collapsibleState);

    this.data = data;
    this.description = data.description;
    this.tooltip = this.createTooltip();
    this.contextValue = data.type;

    // Set icon based on node type
    this.iconPath = this.getIcon();

    // Set command for clickable items
    if (data.resourceUri) {
      this.resourceUri = data.resourceUri;
      
      if (data.type === 'file') {
        this.command = {
          command: 'vscode.open',
          title: 'Open File',
          arguments: [data.resourceUri],
        };
      }
    }
  }

  /**
   * Get icon for this node
   */
  private getIcon(): vscode.ThemeIcon | undefined {
    switch (this.data.type) {
      case 'root':
        return new vscode.ThemeIcon('folder-library');
      
      case 'category':
        return this.getCategoryIcon();
      
      case 'folder':
        return new vscode.ThemeIcon('folder');
      
      case 'file':
        return this.getFileIcon();
      
      default:
        return undefined;
    }
  }

  /**
   * Get icon for category nodes
   */
  private getCategoryIcon(): vscode.ThemeIcon {
    const config = CATEGORY_CONFIGS.find(c => c.id === this.data.categoryId);
    
    switch (this.data.categoryId) {
      case 'manifests':
        return new vscode.ThemeIcon('symbol-file');
      case 'java':
        return new vscode.ThemeIcon('symbol-class');
      case 'res':
        return new vscode.ThemeIcon('file-media');
      case 'gradle':
        return new vscode.ThemeIcon('gear');
      default:
        return new vscode.ThemeIcon(config?.icon || 'folder');
    }
  }

  /**
   * Get icon for file nodes based on extension
   */
  private getFileIcon(): vscode.ThemeIcon {
    if (!this.data.resourceUri) {
      return new vscode.ThemeIcon('file');
    }

    const ext = path.extname(this.data.resourceUri.fsPath).toLowerCase();

    switch (ext) {
      case '.xml':
        return new vscode.ThemeIcon('code');
      case '.java':
        return new vscode.ThemeIcon('symbol-class');
      case '.kt':
        return new vscode.ThemeIcon('symbol-class');
      case '.gradle':
      case '.kts':
        return new vscode.ThemeIcon('gear');
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.webp':
      case '.svg':
        return new vscode.ThemeIcon('file-media');
      case '.properties':
        return new vscode.ThemeIcon('settings-gear');
      default:
        return new vscode.ThemeIcon('file');
    }
  }

  /**
   * Create tooltip for this node
   */
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

  /**
   * Get tooltip for category nodes
   */
  private getCategoryTooltip(): string {
    switch (this.data.categoryId) {
      case 'manifests':
        return 'Android manifest files';
      case 'java':
        return 'Java and Kotlin source files';
      case 'res':
        return 'Android resources (layouts, drawables, values, etc.)';
      case 'gradle':
        return 'Gradle build configuration files';
      default:
        return this.data.label;
    }
  }
}

/**
 * Create a root node
 */
export function createRootNode(projectName: string): ProjectTreeItem {
  return new ProjectTreeItem(
    {
      type: 'root',
      label: projectName,
    },
    vscode.TreeItemCollapsibleState.Expanded
  );
}

/**
 * Create a category node
 */
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

/**
 * Create a file node
 */
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
