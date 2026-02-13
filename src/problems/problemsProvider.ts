import * as vscode from 'vscode';

export interface AndroidProblemFix {
  id: string;
  label: string;
}

export interface AndroidProblemEntry {
  id: string;
  action: string;
  title: string;
  details?: string;
  moduleName?: string;
  variant?: string;
  deviceId?: string;
  location?: { file: string; line: number; column?: number };
  fixes?: AndroidProblemFix[];
  createdAt: number;
}

export class AndroidProblemTreeItem extends vscode.TreeItem {
  constructor(
    public readonly entry: AndroidProblemEntry,
    public readonly kind: 'problem' | 'fix' | 'location',
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(kind === 'problem' ? entry.title : kind === 'location' ? 'Open source location' : `Fix: ${entry.title}`, collapsibleState);

    if (kind === 'problem') {
      this.iconPath = new vscode.ThemeIcon('error');
      this.description = [entry.moduleName, entry.variant, entry.deviceId].filter(Boolean).join(' | ');
      this.tooltip = this.buildTooltip(entry);
      this.contextValue = 'android-problem';
    }

    if (kind === 'fix') {
      this.iconPath = new vscode.ThemeIcon('wrench');
      this.contextValue = 'android-problem-fix';
    }

    if (kind === 'location') {
      this.iconPath = new vscode.ThemeIcon('go-to-file');
      this.contextValue = 'android-problem-location';
    }
  }

  private buildTooltip(entry: AndroidProblemEntry): string {
    const lines: string[] = [];
    lines.push(entry.title);
    if (entry.action) {
      lines.push(`Action: ${entry.action}`);
    }
    if (entry.details) {
      lines.push('');
      lines.push(entry.details);
    }
    return lines.join('\n');
  }
}

export class AndroidProblemsProvider implements vscode.TreeDataProvider<AndroidProblemTreeItem> {
  private readonly items: AndroidProblemEntry[] = [];
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<AndroidProblemTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  getTreeItem(element: AndroidProblemTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AndroidProblemTreeItem): Thenable<AndroidProblemTreeItem[]> {
    if (!element) {
      return Promise.resolve(this.items.map((entry) => new AndroidProblemTreeItem(entry, 'problem', vscode.TreeItemCollapsibleState.Collapsed)));
    }
    if (element.kind !== 'problem') {
      return Promise.resolve([]);
    }
    const children: AndroidProblemTreeItem[] = [];
    if (element.entry.location) {
      children.push(new AndroidProblemTreeItem(element.entry, 'location', vscode.TreeItemCollapsibleState.None));
    }
    for (const fix of element.entry.fixes || []) {
      const fixEntry: AndroidProblemEntry = {
        ...element.entry,
        id: `${element.entry.id}:fix:${fix.id}`,
        title: fix.label,
        fixes: [{ id: fix.id, label: fix.label }],
      };
      children.push(new AndroidProblemTreeItem(fixEntry, 'fix', vscode.TreeItemCollapsibleState.None));
    }
    return Promise.resolve(children);
  }

  add(entry: Omit<AndroidProblemEntry, 'id' | 'createdAt'>): AndroidProblemEntry {
    const createdAt = Date.now();
    const item: AndroidProblemEntry = {
      ...entry,
      id: `${createdAt}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt,
    };
    this.items.unshift(item);
    if (this.items.length > 100) {
      this.items.length = 100;
    }
    this.refresh();
    return item;
  }

  clear(): void {
    this.items.length = 0;
    this.refresh();
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }
}
