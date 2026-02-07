/**
 * Emulator Control TreeView
 * TreeView showing running emulators with control actions
 */

import * as vscode from 'vscode';
import { listRunningEmulators } from '../devices/deviceManager';
import { getAvdNameForDevice, getNetworkStatus } from './emulatorCommands';
import { NetworkStatus } from './types';

/**
 * Tree item types
 */
type ControlNodeType = 'emulator' | 'action' | 'placeholder';

/**
 * Action identifiers
 */
type ActionId = 'rotate' | 'screenshot' | 'coldBoot' | 'warmBoot' | 'wipeData' | 'toggleNetwork';

/**
 * Control tree item data
 */
interface ControlNodeData {
  type: ControlNodeType;
  deviceId?: string;
  avdName?: string;
  actionId?: ActionId;
  networkStatus?: NetworkStatus;
}

/**
 * Emulator control tree item
 */
export class EmulatorControlItem extends vscode.TreeItem {
  public readonly data: ControlNodeData;

  constructor(
    data: ControlNodeData,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.data = data;
    this.contextValue = data.type;

    this.setIcon();
    this.setTooltip();
    this.setCommand();
  }

  private setIcon(): void {
    switch (this.data.type) {
      case 'emulator':
        this.iconPath = new vscode.ThemeIcon('vm-running');
        break;
      case 'action':
        this.iconPath = this.getActionIcon();
        break;
      case 'placeholder':
        this.iconPath = new vscode.ThemeIcon('info');
        break;
    }
  }

  private getActionIcon(): vscode.ThemeIcon {
    switch (this.data.actionId) {
      case 'rotate':
        return new vscode.ThemeIcon('sync');
      case 'screenshot':
        return new vscode.ThemeIcon('device-camera');
      case 'coldBoot':
        return new vscode.ThemeIcon('debug-restart');
      case 'warmBoot':
        return new vscode.ThemeIcon('refresh');
      case 'wipeData':
        return new vscode.ThemeIcon('trash');
      case 'toggleNetwork':
        return new vscode.ThemeIcon(
          this.data.networkStatus === 'enabled' ? 'radio-tower' : 'circle-slash'
        );
      default:
        return new vscode.ThemeIcon('circle');
    }
  }

  private setTooltip(): void {
    switch (this.data.actionId) {
      case 'rotate':
        this.tooltip = 'Rotate screen 90° clockwise';
        break;
      case 'screenshot':
        this.tooltip = 'Capture screenshot and save to workspace';
        break;
      case 'coldBoot':
        this.tooltip = 'Cold boot (full restart without snapshot)';
        break;
      case 'warmBoot':
        this.tooltip = 'Warm boot (restart with snapshot)';
        break;
      case 'wipeData':
        this.tooltip = 'Wipe all data (factory reset)';
        break;
      case 'toggleNetwork':
        this.tooltip = this.data.networkStatus === 'enabled' 
          ? 'Disable network' 
          : 'Enable network';
        break;
      case undefined:
        if (this.data.type === 'emulator') {
          this.tooltip = `Device: ${this.data.deviceId}`;
        }
        break;
    }
  }

  private setCommand(): void {
    if (this.data.type === 'action' && this.data.deviceId && this.data.actionId) {
      this.command = {
        command: `android-toolkit.emulator.${this.data.actionId}`,
        title: this.label as string,
        arguments: [this.data.deviceId, this.data.avdName],
      };
    }
  }
}

/**
 * Emulator control tree data provider
 */
export class EmulatorControlProvider implements vscode.TreeDataProvider<EmulatorControlItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<EmulatorControlItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /**
   * Refresh the tree
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: EmulatorControlItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: EmulatorControlItem): Promise<EmulatorControlItem[]> {
    // Root level - show running emulators
    if (!element) {
      return this.getEmulatorNodes();
    }

    // Emulator level - show actions
    if (element.data.type === 'emulator') {
      return this.getActionNodes(
        element.data.deviceId!,
        element.data.avdName,
        element.data.networkStatus
      );
    }

    return [];
  }

  private async getEmulatorNodes(): Promise<EmulatorControlItem[]> {
    try {
      const emulators = await listRunningEmulators();

      if (emulators.length === 0) {
        return [
          new EmulatorControlItem(
            { type: 'placeholder' },
            'No running emulators',
            vscode.TreeItemCollapsibleState.None
          ),
        ];
      }

      const items: EmulatorControlItem[] = [];

      for (const emu of emulators) {
        const avdName = await getAvdNameForDevice(emu.id);
        const networkStatus = await getNetworkStatus(emu.id);

        items.push(
          new EmulatorControlItem(
            {
              type: 'emulator',
              deviceId: emu.id,
              avdName,
              networkStatus,
            },
            avdName || emu.id,
            vscode.TreeItemCollapsibleState.Expanded
          )
        );
      }

      return items;
    } catch {
      return [
        new EmulatorControlItem(
          { type: 'placeholder' },
          'Failed to load emulators',
          vscode.TreeItemCollapsibleState.None
        ),
      ];
    }
  }

  private getActionNodes(
    deviceId: string,
    avdName?: string,
    networkStatus?: NetworkStatus
  ): EmulatorControlItem[] {
    const actions: { id: ActionId; label: string }[] = [
      { id: 'rotate', label: 'Rotate Screen' },
      { id: 'screenshot', label: 'Take Screenshot' },
      { id: 'coldBoot', label: 'Cold Boot' },
      { id: 'warmBoot', label: 'Warm Boot' },
      { id: 'wipeData', label: 'Wipe Data' },
      { 
        id: 'toggleNetwork', 
        label: networkStatus === 'enabled' ? 'Disable Network' : 'Enable Network' 
      },
    ];

    return actions.map(action => 
      new EmulatorControlItem(
        {
          type: 'action',
          deviceId,
          avdName,
          actionId: action.id,
          networkStatus,
        },
        action.label,
        vscode.TreeItemCollapsibleState.None
      )
    );
  }
}
