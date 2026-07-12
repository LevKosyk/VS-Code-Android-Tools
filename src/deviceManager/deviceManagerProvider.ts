import * as vscode from 'vscode';
import { 
  Platform, 
  DeviceState, 
  UnifiedDevice, 
  DeviceNodeType, 
  DeviceNodeData, 
  DeviceAction 
} from './types';
import { listAvds } from '../emulators/emulatorManager';
import { listDevicesDetailed } from '../devices/deviceManager';
export class DeviceManagerItem extends vscode.TreeItem {
  public readonly data: DeviceNodeData;
  constructor(
    data: DeviceNodeData,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.data = data;
    this.contextValue = this.getContextValue();
    this.setIcon();
    this.setTooltip();
    this.setCommand();
  }
  private getContextValue(): string {
    if (this.data.type === 'device' && this.data.device) {
      return `device-${this.data.device.platform}-${this.data.device.state}`;
    }
    return this.data.type;
  }
  private setIcon(): void {
    switch (this.data.type) {
      case 'platform':
        this.iconPath = new vscode.ThemeIcon('device-mobile');
        break;
      case 'device':
        if (this.data.device?.kind === 'physical') {
          this.iconPath = new vscode.ThemeIcon(
            'device-mobile',
            this.data.device.state === 'running' ? new vscode.ThemeColor('testing.iconPassed') : undefined
          );
        } else if (this.data.device?.state === 'running') {
          this.iconPath = new vscode.ThemeIcon('vm-running', new vscode.ThemeColor('testing.iconPassed'));
        } else {
          this.iconPath = new vscode.ThemeIcon('vm');
        }
        break;
      case 'action':
        this.iconPath = this.getActionIcon();
        break;
      case 'create':
        this.iconPath = new vscode.ThemeIcon('add');
        break;
      case 'placeholder':
        this.iconPath = new vscode.ThemeIcon('info');
        break;
    }
  }
  private getActionIcon(): vscode.ThemeIcon {
    switch (this.data.action) {
      case 'launch':
        return new vscode.ThemeIcon('play');
      case 'stop':
        return new vscode.ThemeIcon('debug-stop');
      case 'delete':
        return new vscode.ThemeIcon('trash');
      default:
        return new vscode.ThemeIcon('circle');
    }
  }
  private setTooltip(): void {
    if (this.data.type === 'device' && this.data.device) {
      const d = this.data.device;
      this.tooltip = `${d.name}\n${d.deviceType}\n${d.osVersion}\nStatus: ${d.state}`;
    } else if (this.data.type === 'platform') {
      this.tooltip = 'Android Emulators';
    }
  }
  private setCommand(): void {
    if (this.data.type === 'action' && this.data.device && this.data.action) {
      this.command = {
        command: `android-toolkit.deviceManager.${this.data.action}`,
        title: this.data.action,
        arguments: [this.data.device],
      };
    } else if (this.data.type === 'create') {
      this.command = {
        command: 'android-toolkit.createDevice',
        title: 'Create Device',
        arguments: [this.data.platform],
      };
    }
  }
}
export class DeviceManagerProvider implements vscode.TreeDataProvider<DeviceManagerItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DeviceManagerItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  // OPTIMIZATION: Add cache with TTL (5 seconds) to reduce device queries
  private readonly deviceCache = new Map<string, { items: any; timestamp: number }>();
  private readonly CACHE_TTL_MS = 5000;
  
  refresh(): void {
    // OPTIMIZATION: Clear cache on refresh to force fresh data
    this.deviceCache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }
  getTreeItem(element: DeviceManagerItem): vscode.TreeItem {
    return element;
  }
  async getChildren(element?: DeviceManagerItem): Promise<DeviceManagerItem[]> {
    if (!element) {
      return this.getPlatformNodes();
    }
    if (element.data.type === 'platform' && element.data.platform) {
      return this.getDevicesForPlatform(element.data.platform);
    }
    if (element.data.type === 'device' && element.data.device) {
      return this.getDeviceActions(element.data.device);
    }
    return [];
  }
  private async getPlatformNodes(): Promise<DeviceManagerItem[]> {
    const nodes: DeviceManagerItem[] = [];
    nodes.push(new DeviceManagerItem(
      { type: 'platform', platform: 'android' },
      'Android',
      vscode.TreeItemCollapsibleState.Expanded
    ));
    nodes.push(new DeviceManagerItem(
      { type: 'create' },
      'Create Device',
      vscode.TreeItemCollapsibleState.None
    ));
    return nodes;
  }
  private async getDevicesForPlatform(platform: Platform): Promise<DeviceManagerItem[]> {
    return this.getAndroidDevices();
  }
  private async getAndroidDevices(): Promise<DeviceManagerItem[]> {
    try {
      const avds = await listAvds();
      const connectedDevices = await listDevicesDetailed();
      const physicalDevices = connectedDevices.filter(device => device.type === 'physical');
      if (avds.length === 0 && physicalDevices.length === 0) {
        return [new DeviceManagerItem(
          { type: 'placeholder', message: 'No emulators found' },
          'No emulators. Create one to get started.',
          vscode.TreeItemCollapsibleState.None
        )];
      }
      const physicalItems = physicalDevices.map(item => {
        const online = item.status === 'online';
        const device: UnifiedDevice = {
          id: item.id,
          name: item.model || item.id,
          platform: 'android',
          state: online ? 'running' : 'unknown',
          deviceType: 'Physical Android Device',
          osVersion: item.androidVersion ? `Android ${item.androidVersion}` : 'Android',
          platformId: item.id,
          kind: 'physical',
        };
        const suffix = online ? '' : ` (${item.status})`;
        return new DeviceManagerItem(
          { type: 'device', device },
          `${device.name}${suffix}`,
          vscode.TreeItemCollapsibleState.None
        );
      });
      const emulatorItems = avds.map(avd => {
        const device: UnifiedDevice = {
          id: avd.deviceId || avd.name,
          name: avd.name,
          platform: 'android',
          state: avd.status === 'running' ? 'running' : 'stopped',
          deviceType: 'Android Virtual Device',
          osVersion: 'Android',
          platformId: avd.name,
          kind: 'emulator',
        };
        return new DeviceManagerItem(
          { type: 'device', device },
          avd.name,
          vscode.TreeItemCollapsibleState.Collapsed
        );
      });
      return [...physicalItems, ...emulatorItems];
    } catch (error) {
      return [new DeviceManagerItem(
        { type: 'placeholder', message: 'Error loading' },
        'Failed to load Android emulators',
        vscode.TreeItemCollapsibleState.None
      )];
    }
  }
  private getDeviceActions(device: UnifiedDevice): DeviceManagerItem[] {
    if (device.kind === 'physical') {
      return [];
    }
    const actions: DeviceManagerItem[] = [];
    if (device.state === 'running') {
      actions.push(new DeviceManagerItem(
        { type: 'action', action: 'stop', device },
        'Stop',
        vscode.TreeItemCollapsibleState.None
      ));
    } else {
      actions.push(new DeviceManagerItem(
        { type: 'action', action: 'launch', device },
        'Launch',
        vscode.TreeItemCollapsibleState.None
      ));
    }
    actions.push(new DeviceManagerItem(
      { type: 'action', action: 'delete', device },
      'Delete',
      vscode.TreeItemCollapsibleState.None
    ));
    return actions;
  }
}
