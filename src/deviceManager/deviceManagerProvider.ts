/**
 * Device Manager TreeView Provider
 * Unified view for Android and iOS device management
 */

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
import { listRunningEmulators } from '../devices/deviceManager';
import { 
  isIOSAvailable, 
  listSimulators, 
  checkXcodeAvailable 
} from '../ios/simulatorManager';

/**
 * Device Manager tree item
 */
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
        this.iconPath = this.data.platform === 'android'
          ? new vscode.ThemeIcon('device-mobile')
          : new vscode.ThemeIcon('device-mobile');
        break;
      case 'device':
        if (this.data.device?.state === 'running') {
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
      this.tooltip = this.data.platform === 'android' 
        ? 'Android Emulators'
        : 'iOS Simulators';
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

/**
 * Device Manager TreeDataProvider
 */
export class DeviceManagerProvider implements vscode.TreeDataProvider<DeviceManagerItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DeviceManagerItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /**
   * Refresh the tree
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: DeviceManagerItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DeviceManagerItem): Promise<DeviceManagerItem[]> {
    // Root level - show platforms
    if (!element) {
      return this.getPlatformNodes();
    }

    // Platform level - show devices
    if (element.data.type === 'platform' && element.data.platform) {
      return this.getDevicesForPlatform(element.data.platform);
    }

    // Device level - show actions
    if (element.data.type === 'device' && element.data.device) {
      return this.getDeviceActions(element.data.device);
    }

    return [];
  }

  /**
   * Get platform header nodes
   */
  private async getPlatformNodes(): Promise<DeviceManagerItem[]> {
    const nodes: DeviceManagerItem[] = [];

    // Android is always available (we may show error inside)
    nodes.push(new DeviceManagerItem(
      { type: 'platform', platform: 'android' },
      '🤖 Android',
      vscode.TreeItemCollapsibleState.Expanded
    ));

    // iOS only on macOS
    if (isIOSAvailable()) {
      nodes.push(new DeviceManagerItem(
        { type: 'platform', platform: 'ios' },
        '🍎 iOS',
        vscode.TreeItemCollapsibleState.Expanded
      ));
    }

    // Create Device action
    nodes.push(new DeviceManagerItem(
      { type: 'create' },
      '➕ Create Device',
      vscode.TreeItemCollapsibleState.None
    ));

    return nodes;
  }

  /**
   * Get devices for a platform
   */
  private async getDevicesForPlatform(platform: Platform): Promise<DeviceManagerItem[]> {
    if (platform === 'android') {
      return this.getAndroidDevices();
    } else {
      return this.getIOSDevices();
    }
  }

  /**
   * Get Android emulators
   */
  private async getAndroidDevices(): Promise<DeviceManagerItem[]> {
    try {
      const avds = await listAvds();
      const runningEmulators = await listRunningEmulators();

      if (avds.length === 0) {
        return [new DeviceManagerItem(
          { type: 'placeholder', message: 'No emulators found' },
          'No emulators. Create one to get started.',
          vscode.TreeItemCollapsibleState.None
        )];
      }

      return avds.map(avd => {
        const running = runningEmulators.find(e => 
          e.id.includes(avd.name) || avd.deviceId === e.id
        );

        const device: UnifiedDevice = {
          id: avd.deviceId || avd.name,
          name: avd.name,
          platform: 'android',
          state: avd.status === 'running' ? 'running' : 'stopped',
          deviceType: 'Android Virtual Device',
          osVersion: 'Android',
          platformId: avd.name,
        };

        const stateIcon = device.state === 'running' ? '🟢' : '⚪';
        
        return new DeviceManagerItem(
          { type: 'device', device },
          `${stateIcon} ${avd.name}`,
          vscode.TreeItemCollapsibleState.Collapsed
        );
      });
    } catch (error) {
      return [new DeviceManagerItem(
        { type: 'placeholder', message: 'Error loading' },
        'Failed to load Android emulators',
        vscode.TreeItemCollapsibleState.None
      )];
    }
  }

  /**
   * Get iOS simulators
   */
  private async getIOSDevices(): Promise<DeviceManagerItem[]> {
    try {
      const xcodeAvailable = await checkXcodeAvailable();
      if (!xcodeAvailable) {
        return [new DeviceManagerItem(
          { type: 'placeholder', message: 'Xcode required' },
          'Xcode Command Line Tools not found',
          vscode.TreeItemCollapsibleState.None
        )];
      }

      const simulators = await listSimulators();
      
      // Filter to only available simulators, limit to avoid clutter
      const available = simulators
        .filter(sim => sim.isAvailable)
        .slice(0, 20);

      if (available.length === 0) {
        return [new DeviceManagerItem(
          { type: 'placeholder', message: 'No simulators' },
          'No iOS simulators found',
          vscode.TreeItemCollapsibleState.None
        )];
      }

      return available.map(sim => {
        const device: UnifiedDevice = {
          id: sim.udid,
          name: sim.name,
          platform: 'ios',
          state: sim.state === 'Booted' ? 'running' : 'stopped',
          deviceType: sim.deviceType,
          osVersion: sim.runtime,
          platformId: sim.udid,
        };

        const stateIcon = device.state === 'running' ? '🟢' : '⚪';

        return new DeviceManagerItem(
          { type: 'device', device },
          `${stateIcon} ${sim.name}`,
          vscode.TreeItemCollapsibleState.Collapsed
        );
      });
    } catch {
      return [new DeviceManagerItem(
        { type: 'placeholder', message: 'Error' },
        'Failed to load iOS simulators',
        vscode.TreeItemCollapsibleState.None
      )];
    }
  }

  /**
   * Get actions for a device
   */
  private getDeviceActions(device: UnifiedDevice): DeviceManagerItem[] {
    const actions: DeviceManagerItem[] = [];

    if (device.state === 'running') {
      actions.push(new DeviceManagerItem(
        { type: 'action', action: 'stop', device },
        '⏹ Stop',
        vscode.TreeItemCollapsibleState.None
      ));
    } else {
      actions.push(new DeviceManagerItem(
        { type: 'action', action: 'launch', device },
        '▶️ Launch',
        vscode.TreeItemCollapsibleState.None
      ));
    }

    actions.push(new DeviceManagerItem(
      { type: 'action', action: 'delete', device },
      '🗑 Delete',
      vscode.TreeItemCollapsibleState.None
    ));

    return actions;
  }
}
