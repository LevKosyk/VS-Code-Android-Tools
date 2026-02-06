/**
 * Android Toolkit for VS Code
 * Extension entry point - command registration and activation
 */

import * as vscode from 'vscode';

// Core
import { detectSdk, isSdkAvailable } from './core/sdkDetector';
import { AndroidToolkitError } from './core/errors';

// Device Management
import { listDevicesDetailed, listRunningEmulators } from './devices/deviceManager';

// Emulator Management
import { listAvds, startEmulator, stopEmulatorByName } from './emulators/emulatorManager';
import { listSystemImages, listDeviceProfiles, createAvd } from './emulators/avdCreator';

// Project View
import { AndroidProjectProvider } from './projectView/projectTreeProvider';
import { ProjectTreeItem } from './projectView/projectTreeItem';

// Emulator Control
import { EmulatorControlProvider } from './emulatorControl/emulatorControlProvider';
import {
  rotateScreen,
  takeScreenshot,
  coldBoot,
  warmBoot,
  wipeData,
  toggleNetwork,
  getAvdNameForDevice,
} from './emulatorControl/emulatorCommands';

// UI
import { 
  showInfo, 
  showWarning,
  showError, 
  showToolkitError, 
  withProgress 
} from './ui/notifications';
import { createStatusBar, refreshStatusBar } from './ui/statusBar';
import { 
  pickDevice, 
  pickAvd, 
  pickSystemImage, 
  pickDeviceProfile, 
  inputAvdName 
} from './ui/quickPicks';

/**
 * Handle errors consistently
 */
function handleError(error: unknown): void {
  if (error instanceof AndroidToolkitError) {
    showToolkitError(error);
  } else if (error instanceof Error) {
    showError(error.message);
  } else {
    showError('An unexpected error occurred.');
  }
}

/**
 * Select a running emulator for control commands
 */
async function selectEmulator(): Promise<{ deviceId: string; avdName?: string } | undefined> {
  const emulators = await listRunningEmulators();
  
  if (emulators.length === 0) {
    showWarning('No running emulators. Start an emulator first.');
    return undefined;
  }

  if (emulators.length === 1) {
    const avdName = await getAvdNameForDevice(emulators[0].id);
    return { deviceId: emulators[0].id, avdName };
  }

  // Multiple emulators - let user pick
  const items = await Promise.all(
    emulators.map(async (emu) => {
      const avdName = await getAvdNameForDevice(emu.id);
      return {
        label: avdName || emu.id,
        description: emu.id,
        deviceId: emu.id,
        avdName,
      };
    })
  );

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select an emulator',
  });

  return selected ? { deviceId: selected.deviceId, avdName: selected.avdName } : undefined;
}

/**
 * Command: List Devices
 */
async function listDevicesCommand(): Promise<void> {
  try {
    const devices = await withProgress('Scanning for devices...', async () => {
      return listDevicesDetailed();
    });

    if (devices.length === 0) {
      showInfo('No Android devices found. Connect a device or start an emulator.');
      return;
    }

    const device = await pickDevice(devices, {
      title: 'Android Devices',
      placeholder: 'Select a device to see details',
    });

    if (device) {
      const details = [
        `ID: ${device.id}`,
        `Type: ${device.type}`,
        `Status: ${device.status}`,
      ];
      
      if (device.model) {
        details.push(`Model: ${device.model}`);
      }
      if (device.androidVersion) {
        details.push(`Android: ${device.androidVersion}`);
      }

      showInfo(details.join(' | '));
    }
  } catch (error) {
    handleError(error);
  }
}

/**
 * Command: Start Emulator
 */
async function startEmulatorCommand(): Promise<void> {
  try {
    if (!isSdkAvailable()) {
      detectSdk();
    }

    const avds = await withProgress('Loading emulators...', async () => {
      return listAvds();
    });

    const avd = await pickAvd(avds, {
      title: 'Start Emulator',
      filter: 'stopped',
    });

    if (!avd) {
      return;
    }

    await withProgress(`Starting ${avd.name}...`, async (progress) => {
      progress.report({ message: 'Launching emulator...' });
      const deviceId = await startEmulator(avd.name);
      progress.report({ message: 'Waiting for boot...' });
      showInfo(`Emulator ${avd.name} started (${deviceId})`);
      refreshStatusBar();
    });
  } catch (error) {
    handleError(error);
  }
}

/**
 * Command: Stop Emulator
 */
async function stopEmulatorCommand(): Promise<void> {
  try {
    const avds = await withProgress('Loading emulators...', async () => {
      return listAvds();
    });

    const avd = await pickAvd(avds, {
      title: 'Stop Emulator',
      filter: 'running',
    });

    if (!avd) {
      return;
    }

    await withProgress(`Stopping ${avd.name}...`, async () => {
      await stopEmulatorByName(avd.name);
      showInfo(`Emulator ${avd.name} stopped.`);
      refreshStatusBar();
    });
  } catch (error) {
    handleError(error);
  }
}

/**
 * Command: Create Emulator
 */
async function createEmulatorCommand(): Promise<void> {
  try {
    if (!isSdkAvailable()) {
      detectSdk();
    }

    const name = await inputAvdName();
    if (!name) {
      return;
    }

    const images = await withProgress('Loading system images...', async () => {
      return listSystemImages();
    });

    const image = await pickSystemImage(images, {
      title: `Create Emulator: ${name}`,
    });

    if (!image) {
      return;
    }

    const profiles = await withProgress('Loading device profiles...', async () => {
      return listDeviceProfiles();
    });

    const profile = await pickDeviceProfile(profiles, {
      title: `Create Emulator: ${name}`,
    });

    await withProgress(`Creating ${name}...`, async () => {
      await createAvd({
        name,
        systemImage: image.id,
        device: profile?.id,
      });
      showInfo(`Emulator "${name}" created successfully!`);
    });
  } catch (error) {
    handleError(error);
  }
}

/**
 * Create emulator control command handlers
 */
function createEmulatorControlCommands(
  controlProvider: EmulatorControlProvider
): vscode.Disposable[] {
  return [
    // Rotate screen
    vscode.commands.registerCommand(
      'android-toolkit.emulator.rotate',
      async (deviceId?: string) => {
        const target = deviceId ? { deviceId } : await selectEmulator();
        if (!target) { return; }

        const result = await withProgress('Rotating screen...', async () => {
          return rotateScreen(target.deviceId);
        });

        if (result.success) {
          showInfo(result.message);
        } else {
          showError(result.message);
        }
        controlProvider.refresh();
      }
    ),

    // Take screenshot
    vscode.commands.registerCommand(
      'android-toolkit.emulator.screenshot',
      async (deviceId?: string) => {
        const target = deviceId ? { deviceId } : await selectEmulator();
        if (!target) { return; }

        const result = await withProgress('Capturing screenshot...', async () => {
          return takeScreenshot(target.deviceId);
        });

        if (result.success) {
          showInfo(result.message);
          // Open the screenshot
          if (result.data && typeof result.data === 'object' && 'path' in result.data) {
            const uri = vscode.Uri.file(result.data.path as string);
            vscode.commands.executeCommand('vscode.open', uri);
          }
        } else {
          showError(result.message);
        }
      }
    ),

    // Cold boot
    vscode.commands.registerCommand(
      'android-toolkit.emulator.coldBoot',
      async (deviceId?: string, avdName?: string) => {
        const target = deviceId 
          ? { deviceId, avdName } 
          : await selectEmulator();
        if (!target || !target.avdName) {
          showError('Could not determine AVD name for cold boot.');
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Cold boot "${target.avdName}"? This will fully restart the emulator.`,
          'Cold Boot', 'Cancel'
        );

        if (confirm !== 'Cold Boot') { return; }

        const result = await coldBoot(target.deviceId, target.avdName);
        if (result.success) {
          showInfo(result.message);
        } else {
          showError(result.message);
        }
        controlProvider.refresh();
        refreshStatusBar();
      }
    ),

    // Warm boot
    vscode.commands.registerCommand(
      'android-toolkit.emulator.warmBoot',
      async (deviceId?: string, avdName?: string) => {
        const target = deviceId 
          ? { deviceId, avdName } 
          : await selectEmulator();
        if (!target || !target.avdName) {
          showError('Could not determine AVD name for warm boot.');
          return;
        }

        const result = await warmBoot(target.deviceId, target.avdName);
        if (result.success) {
          showInfo(result.message);
        } else {
          showError(result.message);
        }
        controlProvider.refresh();
        refreshStatusBar();
      }
    ),

    // Wipe data
    vscode.commands.registerCommand(
      'android-toolkit.emulator.wipeData',
      async (deviceId?: string, avdName?: string) => {
        const target = deviceId 
          ? { deviceId, avdName } 
          : await selectEmulator();
        if (!target || !target.avdName) {
          showError('Could not determine AVD name for wipe.');
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Wipe all data for "${target.avdName}"? This cannot be undone.`,
          { modal: true },
          'Wipe Data'
        );

        if (confirm !== 'Wipe Data') { return; }

        const result = await wipeData(target.deviceId, target.avdName);
        if (result.success) {
          showInfo(result.message);
        } else {
          showError(result.message);
        }
        controlProvider.refresh();
        refreshStatusBar();
      }
    ),

    // Toggle network
    vscode.commands.registerCommand(
      'android-toolkit.emulator.toggleNetwork',
      async (deviceId?: string) => {
        const target = deviceId ? { deviceId } : await selectEmulator();
        if (!target) { return; }

        const result = await withProgress('Toggling network...', async () => {
          return toggleNetwork(target.deviceId);
        });

        if (result.success) {
          showInfo(result.message);
        } else {
          showError(result.message);
        }
        controlProvider.refresh();
      }
    ),
  ];
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('Android Toolkit activating...');

  // Create status bar
  createStatusBar(context);

  // Create and register Android Project TreeView
  const projectProvider = new AndroidProjectProvider();
  const projectTreeView = vscode.window.createTreeView('androidProjectView', {
    treeDataProvider: projectProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(projectTreeView);

  // Create and register Emulator Control TreeView
  const controlProvider = new EmulatorControlProvider();
  const controlTreeView = vscode.window.createTreeView('emulatorControlView', {
    treeDataProvider: controlProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(controlTreeView);

  // Watch for workspace changes to refresh project tree
  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    projectProvider.refresh();
  });
  context.subscriptions.push(workspaceWatcher);

  // Register commands
  const commands = [
    // Device/Emulator commands
    vscode.commands.registerCommand('android-toolkit.listDevices', listDevicesCommand),
    vscode.commands.registerCommand('android-toolkit.startEmulator', startEmulatorCommand),
    vscode.commands.registerCommand('android-toolkit.stopEmulator', stopEmulatorCommand),
    vscode.commands.registerCommand('android-toolkit.createEmulator', createEmulatorCommand),

    // Project View commands
    vscode.commands.registerCommand('android-toolkit.refreshProjectView', () => projectProvider.refresh()),
    vscode.commands.registerCommand('android-toolkit.openInExplorer', (item: ProjectTreeItem) => {
      if (item.data.resourceUri) {
        vscode.commands.executeCommand('revealInExplorer', item.data.resourceUri);
      }
    }),

    // Emulator Control commands
    vscode.commands.registerCommand('android-toolkit.refreshEmulatorControl', () => controlProvider.refresh()),
    ...createEmulatorControlCommands(controlProvider),

    // Logcat commands
    vscode.commands.registerCommand('android-toolkit.openLogcat', () => {
      const { LogcatPanel } = require('./logcat/logcatPanel');
      LogcatPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('android-toolkit.clearLogcat', () => {
      const { LogcatPanel } = require('./logcat/logcatPanel');
      if (LogcatPanel.currentPanel) {
        LogcatPanel.currentPanel.dispose();
      }
      showInfo('Logcat cleared');
    }),

    // Debug commands
    vscode.commands.registerCommand('android-toolkit.attachDebugger', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.attach();
    }),
    vscode.commands.registerCommand('android-toolkit.detachDebugger', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.detach();
    }),
    vscode.commands.registerCommand('android-toolkit.toggleBreakpoint', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.toggleBreakpoint();
    }),
    vscode.commands.registerCommand('android-toolkit.debugStatus', () => {
      const { debugSession } = require('./debug/debugAdapter');
      debugSession.showStatus();
    }),
  ];

  context.subscriptions.push(...commands);

  console.log('Android Toolkit activated!');
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  // Clean up logcat streams
  const { logcatManager } = require('./logcat/logcatStream');
  logcatManager.stopAll();
  
  // Clean up debug session
  const { debugSession } = require('./debug/debugAdapter');
  debugSession.dispose();
  
  console.log('Android Toolkit deactivated.');
}
