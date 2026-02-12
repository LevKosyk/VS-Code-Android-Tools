import * as vscode from 'vscode';
import { listGradleTasks, GradleTaskInfo, runGradleTaskWithResult } from './gradleService';
import { showGradleOutput } from './gradleOutput';
import { showError, showInfo } from '../ui/notifications';

type NodeType = 'group' | 'task';

interface TaskNodeData {
  type: NodeType;
  label: string;
  task?: GradleTaskInfo;
}

class GradleTaskItem extends vscode.TreeItem {
  public readonly data: TaskNodeData;
  constructor(data: TaskNodeData, collapsible: vscode.TreeItemCollapsibleState) {
    super(data.label, collapsible);
    this.data = data;
    this.contextValue = data.type;
    if (data.type === 'task' && data.task) {
      this.description = data.task.description;
      this.command = {
        command: 'android-toolkit.runGradleTask',
        title: 'Run Task',
        arguments: [data.task],
      };
    }
  }
}

export class GradleTasksProvider implements vscode.TreeDataProvider<GradleTaskItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GradleTaskItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private cached: GradleTaskInfo[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: GradleTaskItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GradleTaskItem): Promise<GradleTaskItem[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return [new GradleTaskItem({ type: 'group', label: 'No workspace open' }, vscode.TreeItemCollapsibleState.None)];
    }
    if (!element) {
      this.cached = await listGradleTasks(workspaceRoot);
      const groups = Array.from(new Set(this.cached.map(t => t.group))).sort();
      return groups.map(g => new GradleTaskItem({ type: 'group', label: g }, vscode.TreeItemCollapsibleState.Collapsed));
    }
    if (element.data.type === 'group') {
      const tasks = this.cached.filter(t => t.group === element.data.label);
      return tasks.map(t => new GradleTaskItem({ type: 'task', label: t.fullName, task: t }, vscode.TreeItemCollapsibleState.None));
    }
    return [];
  }
}

export async function runGradleTaskCommand(task: GradleTaskInfo): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const result = await runGradleTaskWithResult(workspaceRoot, task.fullName);
  showGradleOutput(task.fullName, result, workspaceRoot);
  result.exitCode === 0
    ? showInfo(`Task completed: ${task.fullName}`)
    : showError(`Task failed: ${task.fullName}`);
}
