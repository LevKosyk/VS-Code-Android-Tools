/**
 * Status Bar Integration
 * Shows Android device/emulator status in VS Code status bar
 */

import * as vscode from 'vscode';
import { listDevices } from '../devices/deviceManager';
import { listAvds } from '../emulators/emulatorManager';

let statusBarItem: vscode.StatusBarItem | undefined;
let updateInterval: NodeJS.Timeout | undefined;

/**
 * Create and show the status bar item
 */
export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );

  statusBarItem.command = 'android-toolkit.listDevices';
  statusBarItem.tooltip = 'Click to list Android devices';
  
  context.subscriptions.push(statusBarItem);

  // Initial update
  updateStatusBar();

  // Periodic updates (every 5 seconds)
  updateInterval = setInterval(updateStatusBar, 5000);
  context.subscriptions.push({
    dispose: () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    },
  });

  statusBarItem.show();

  return statusBarItem;
}

/**
 * Update status bar with current device count
 */
async function updateStatusBar(): Promise<void> {
  if (!statusBarItem) {
    return;
  }

  try {
    const devices = await listDevices();
    const onlineDevices = devices.filter(d => d.status === 'online');
    const runningEmulators = onlineDevices.filter(d => d.type === 'emulator');
    const physicalDevices = onlineDevices.filter(d => d.type === 'physical');

    const parts: string[] = [];

    if (physicalDevices.length > 0) {
      parts.push(`$(device-mobile) ${physicalDevices.length}`);
    }

    if (runningEmulators.length > 0) {
      parts.push(`$(vm) ${runningEmulators.length}`);
    }

    if (parts.length > 0) {
      statusBarItem.text = `$(android) ${parts.join(' ')}`;
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.text = '$(android) No devices';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  } catch {
    statusBarItem.text = '$(android) SDK error';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }
}

/**
 * Force immediate status bar update
 */
export function refreshStatusBar(): void {
  updateStatusBar();
}

/**
 * Dispose the status bar item
 */
export function disposeStatusBar(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = undefined;
  }
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = undefined;
  }
}
