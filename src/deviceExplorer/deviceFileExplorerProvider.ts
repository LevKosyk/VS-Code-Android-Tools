import * as vscode from 'vscode';
import { listDevices } from '../devices/deviceManager';
import { DeviceExplorerNodeType, DeviceFileItem } from './types';
import { listDevicePath } from './deviceFileService';

interface DeviceNodeData {
  type: DeviceExplorerNodeType;
  deviceId?: string;
  path?: string;
  file?: DeviceFileItem;
}

class DeviceExplorerItem extends vscode.TreeItem {
  public readonly data: DeviceNodeData;
  constructor(data: DeviceNodeData, label: string, collapsible: vscode.TreeItemCollapsibleState) {
    super(label, collapsible);
    this.data = data;
    this.contextValue = data.type;
    if (data.type === 'device') {
      this.iconPath = new vscode.ThemeIcon('device-mobile');
    }
    if (data.type === 'folder') {
      this.iconPath = new vscode.ThemeIcon('folder');
    }
    if (data.type === 'file') {
      this.iconPath = new vscode.ThemeIcon('file');
    }
  }
}

export class DeviceFileExplorerProvider implements vscode.TreeDataProvider<DeviceExplorerItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DeviceExplorerItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: DeviceExplorerItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DeviceExplorerItem): Promise<DeviceExplorerItem[]> {
    if (!element) {
      const devices = await listDevices();
      if (devices.length === 0) {
        return [new DeviceExplorerItem({ type: 'placeholder' }, 'No devices', vscode.TreeItemCollapsibleState.None)];
      }
      return devices.map(d => new DeviceExplorerItem(
        { type: 'device', deviceId: d.id, path: '/sdcard' },
        `${d.id} (${d.type})`,
        vscode.TreeItemCollapsibleState.Collapsed
      ));
    }
    if (element.data.type === 'device' && element.data.deviceId) {
      return this.getPathChildren(element.data.deviceId, element.data.path || '/sdcard');
    }
    if (element.data.type === 'folder' && element.data.deviceId && element.data.path) {
      return this.getPathChildren(element.data.deviceId, element.data.path);
    }
    return [];
  }

  private async getPathChildren(deviceId: string, remotePath: string): Promise<DeviceExplorerItem[]> {
    const items = await listDevicePath(deviceId, remotePath);
    if (items.length === 0) {
      return [new DeviceExplorerItem({ type: 'placeholder' }, 'Empty', vscode.TreeItemCollapsibleState.None)];
    }
    return items.map(item => {
      const type: DeviceExplorerNodeType = item.isDirectory ? 'folder' : 'file';
      return new DeviceExplorerItem(
        { type, deviceId, path: item.path, file: item },
        item.name,
        item.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
      );
    });
  }
}
