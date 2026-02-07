/**
 * Android Project Tree Item
 * VS Code TreeItem implementation for project nodes
 * 
 * Icon Strategy:
 * - Files/folders with resourceUri: Let VS Code resolve icons from user's active theme
 * - Virtual nodes (root, category): Use semantic ThemeIcon identifiers
 */

import * as vscode from 'vscode';
import { ProjectNodeType, CategoryId, ProjectNodeData, CATEGORY_CONFIGS } from './types';

/**
 * Tree item for Android Project View
 * Icons are resolved by VS Code's theme system when resourceUri is set
 */
export class ProjectTreeItem extends vscode.TreeItem {
  public readonly data: ProjectNodeData;
  public children: ProjectTreeItem[] = [];

  constructor(
    data: ProjectNodeData,
    collapsibleState: vscode.TreeItemCollapsibleState,
    children?: ProjectTreeItem[]
  ) {
    // For items with resourceUri, pass the URI to TreeItem constructor
    // This enables VS Code's native file/folder icon resolution
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

    // Set resourceUri for file explorer features
    if (data.resourceUri) {
      this.resourceUri = data.resourceUri;
    }

    // Only set iconPath for virtual nodes (root, category)
    // For file/folder nodes, VS Code will resolve icons from resourceUri
    if (!data.resourceUri) {
      this.iconPath = this.getVirtualNodeIcon();
    }

    // Set command for file items to open on click
    // Use custom command to ensure proper language activation (Java/Kotlin)
    if (data.type === 'file' && data.resourceUri) {
      this.command = {
        command: 'android-toolkit.openFile',
        title: 'Open File',
        arguments: [data.resourceUri.fsPath],
      };
    }
  }

  /**
   * Add a child node
   */
  public addChild(child: ProjectTreeItem): void {
    this.children.push(child);
    // Ensure state is collapsible if it has children
    if (this.collapsibleState === vscode.TreeItemCollapsibleState.None) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
  }

  /**
   * Get context value for menu contributions
   * Context value determines which context menus are shown
   */
  private getContextValue(): string {
    // Add category-specific context for targeted menu items
    if (this.data.type === 'category' && this.data.categoryId) {
      return `category-${this.data.categoryId}`;
    }
    
    // Add folder type context for res subfolders
    if (this.data.type === 'folder' && this.data.resourceUri) {
      const folderName = this.data.label.toLowerCase();
      if (this.isResourceFolder(folderName)) {
        return `folder-res-${folderName.split('-')[0]}`;
      }
      return 'folder';
    }
    
    return this.data.type;
  }

  /**
   * Check if folder name is a resource folder type
   */
  private isResourceFolder(name: string): boolean {
    const resTypes = ['drawable', 'layout', 'values', 'mipmap', 'raw', 'xml', 'anim', 'menu', 'color', 'font'];
    return resTypes.some(type => name === type || name.startsWith(`${type}-`));
  }

  /**
   * Get icon for virtual nodes (root, category)
   * These don't have resourceUri so we use ThemeIcon
   */
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

  /**
   * Get icon for category nodes
   */
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
      case 'assets':
        return 'Raw asset files';
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
      description: 'Module',
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

/**
 * Create a package node
 */
export function createPackageNode(uri: vscode.Uri, name: string, fullPackage: string): ProjectTreeItem {
  return new ProjectTreeItem(
    {
      type: 'package',
      label: name,
      resourceUri: uri,
      description: '', // Can show full package if needed
    },
    vscode.TreeItemCollapsibleState.Collapsed
  );
}
