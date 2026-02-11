import * as vscode from 'vscode';
import { detectSdk, isSdkAvailable } from './core/sdkDetector';
import { AndroidToolsError } from './core/errors';
import { checkLanguageExtensions, ensureLanguageMode } from './core/languageSupport';
import { listDevicesDetailed, listRunningEmulators } from './devices/deviceManager';
import { listAvds, startEmulator, stopEmulatorByName } from './emulators/emulatorManager';
import { listSystemImages, listDeviceProfiles, createAvd } from './emulators/avdCreator';
import { AndroidProjectProvider } from './projectView/projectTreeProvider';
import { ProjectTreeItem } from './projectView/projectTreeItem';
import {
  createResourceFlow,
  createFolderFlow,
  createAssetFlow,
  createLocaleFlow,
} from './projectView/androidCreator';
import {
  createFileCommand,
  createFolderCommand,
  renameItemCommand,
  deleteItemCommand,
} from './projectView/fileActions';
import { createAndroidProjectWizard } from './projectView/projectCreator';
import { EmulatorControlProvider } from './emulatorControl/emulatorControlProvider';
import { EmulatorControlPanel } from './emulatorControl/emulatorPanel';
import {
  rotateScreen,
  takeScreenshot,
  coldBoot,
  warmBoot,
  wipeData,
  toggleNetwork,
  getAvdNameForDevice,
} from './emulatorControl/emulatorCommands';
import { AdbService, EmulatorService, EmulatorStateService, DEFAULT_LOCATION_PRESETS } from './services';
import { ProfilerPanel } from './profiler/profilerPanel';
import { 
  DeviceManagerProvider,
  createDeviceWizard,
  launchDevice,
  stopDevice,
  deleteDevice,
  UnifiedDevice,
} from './deviceManager';
import { AndroidXmlSymbolProvider, GradleSymbolProvider } from './codeStructure';
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
import { execCommand } from './core/cli';
import { findApplicationId } from './core/androidProject';
import * as path from 'path';
import * as fs from 'fs';
function handleError(error: unknown): void {
  if (error instanceof AndroidToolsError) {
    showToolkitError(error);
  } else if (error instanceof Error) {
    showError(error.message);
  } else {
    showError('An unexpected error occurred.');
  }
}
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
function getGradleCommand(workspaceRoot: string): string {
  const wrapper = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
  const wrapperPath = path.join(workspaceRoot, wrapper);
  if (fs.existsSync(wrapperPath)) {
    return wrapperPath;
  }
  return 'gradle';
}
async function assembleDebug(workspaceRoot: string): Promise<boolean> {
  const gradleCmd = getGradleCommand(workspaceRoot);
  const result = await execCommand(gradleCmd, ['assembleDebug'], {
    cwd: workspaceRoot,
    timeout: 300_000,
  });
  return result.exitCode === 0;
}
function findDebugApk(workspaceRoot: string): string | undefined {
  const debugDir = path.join(workspaceRoot, 'app', 'build', 'outputs', 'apk', 'debug');
  if (!fs.existsSync(debugDir)) {
    return undefined;
  }
  const files = fs.readdirSync(debugDir).filter(f => f.endsWith('.apk'));
  if (files.length === 0) {
    return undefined;
  }
  const fullPaths = files.map(f => path.join(debugDir, f));
  fullPaths.sort((a, b) => {
    const aTime = fs.statSync(a).mtimeMs;
    const bTime = fs.statSync(b).mtimeMs;
    return bTime - aTime;
  });
  return fullPaths[0];
}
async function runAppOnEmulator(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    showError('No workspace folder open.');
    return;
  }
  const emulators = await listRunningEmulators();
  if (emulators.length === 0) {
    showWarning('No running emulators. Start an emulator first.');
    return;
  }
  const targetDevice = emulators.length === 1
    ? emulators[0]
    : await pickDevice(emulators, { title: 'Select Emulator', placeholder: 'Choose a running emulator' });
  if (!targetDevice) {
    return;
  }
  const built = await withProgress('Building debug APK...', async () => {
    return assembleDebug(workspaceFolder.uri.fsPath);
  });
  if (!built) {
    showError('Failed to build debug APK.');
    return;
  }
  const apkPath = findDebugApk(workspaceFolder.uri.fsPath);
  if (!apkPath) {
    showError('Debug APK not found. Run a build and try again.');
    return;
  }
  await withProgress('Installing APK...', async () => {
    const result = await AdbService.installApk(targetDevice.id, apkPath);
    result.success ? showInfo(result.message) : showError(result.message);
  });
  let packageName = findApplicationId(workspaceFolder.uri.fsPath);
  if (!packageName) {
    packageName = await vscode.window.showInputBox({
      prompt: 'Application package name (applicationId)',
      placeHolder: 'com.example.app',
    });
  }
  if (!packageName) {
    return;
  }
  await withProgress('Starting app...', async () => {
    const result = await AdbService.startApp(targetDevice.id, packageName);
    result.success ? showInfo(result.message) : showError(result.message);
  });
}
function createEmulatorControlCommands(
  controlProvider: EmulatorControlProvider
): vscode.Disposable[] {
  return [
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
          if (result.data && typeof result.data === 'object' && 'path' in result.data) {
            const uri = vscode.Uri.file(result.data.path as string);
            vscode.commands.executeCommand('vscode.open', uri);
          }
        } else {
          showError(result.message);
        }
      }
    ),
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
export function activate(context: vscode.ExtensionContext): void {
  console.log('Android Toolkit activating...');
  createStatusBar(context);
  const projectProvider = new AndroidProjectProvider();
  const projectTreeView = vscode.window.createTreeView('androidProjectView', {
    treeDataProvider: projectProvider,
    showCollapseAll: true,
    dragAndDropController: projectProvider.dragAndDropController,
  });
  context.subscriptions.push(projectTreeView);
  const controlProvider = new EmulatorControlProvider();
  const controlTreeView = vscode.window.createTreeView('emulatorControlView', {
    treeDataProvider: controlProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(controlTreeView);
  const deviceManagerProvider = new DeviceManagerProvider();
  const deviceManagerTreeView = vscode.window.createTreeView('deviceManagerView', {
    treeDataProvider: deviceManagerProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(deviceManagerTreeView);
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'xml', scheme: 'file' },
      new AndroidXmlSymbolProvider()
    ),
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'gradle', scheme: 'file' },
      new GradleSymbolProvider()
    ),
    vscode.languages.registerDocumentSymbolProvider(
      { pattern: '**/*.gradle.kts' },
      new GradleSymbolProvider()
    )
  );
  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    projectProvider.refresh();
  });
  context.subscriptions.push(workspaceWatcher);
  const commands = [
    vscode.commands.registerCommand('android-toolkit.listDevices', listDevicesCommand),
    vscode.commands.registerCommand('android-toolkit.startEmulator', startEmulatorCommand),
    vscode.commands.registerCommand('android-toolkit.stopEmulator', stopEmulatorCommand),
    vscode.commands.registerCommand('android-toolkit.createEmulator', createEmulatorCommand),
    vscode.commands.registerCommand('android-toolkit.refreshProjectView', () => projectProvider.refresh()),
    vscode.commands.registerCommand('android-toolkit.openInExplorer', (item: ProjectTreeItem) => {
      if (item.data.resourceUri) {
        vscode.commands.executeCommand('revealInExplorer', item.data.resourceUri);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.createResource', (item?: ProjectTreeItem) => {
      createResourceFlow(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createFolder', (item?: ProjectTreeItem) => {
      createFolderFlow(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createAsset', (item?: ProjectTreeItem) => {
      createAssetFlow(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createLocale', (item?: ProjectTreeItem) => {
      createLocaleFlow(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createClass', (item?: ProjectTreeItem) => {
      const { createClassFlow } = require('./projectView/androidCreator');
      createClassFlow(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createFile', (item?: ProjectTreeItem) => {
      createFileCommand(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createFolderGeneric', (item?: ProjectTreeItem) => {
      createFolderCommand(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.renameItem', (item?: ProjectTreeItem) => {
      renameItemCommand(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.deleteItem', (item?: ProjectTreeItem) => {
      deleteItemCommand(item, projectProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.createProject', () => {
      createAndroidProjectWizard();
    }),
    vscode.commands.registerCommand('android-toolkit.runAppOnEmulator', () => {
      runAppOnEmulator();
    }),
    vscode.commands.registerCommand('android-toolkit.refreshDeviceManager', () => deviceManagerProvider.refresh()),
    vscode.commands.registerCommand('android-toolkit.createDevice', (platform?: string) => {
      createDeviceWizard(platform as any, deviceManagerProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.deviceManager.launch', (device: UnifiedDevice) => {
      launchDevice(device, deviceManagerProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.deviceManager.stop', (device: UnifiedDevice) => {
      stopDevice(device, deviceManagerProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.deviceManager.delete', (device: UnifiedDevice) => {
      deleteDevice(device, deviceManagerProvider);
    }),
    vscode.commands.registerCommand('android-toolkit.refreshEmulatorControl', () => controlProvider.refresh()),
    ...createEmulatorControlCommands(controlProvider),
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
    vscode.commands.registerCommand('android-toolkit.openEmulatorPanel', () => {
      EmulatorControlPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('android-toolkit.installApk', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators. Start an emulator first.');
        return;
      }
      const deviceId = emulators[0].id;
      const apkUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        filters: { 'APK Files': ['apk'] },
        title: 'Select APK to Install',
      });
      if (apkUri && apkUri[0]) {
        await withProgress('Installing APK...', async () => {
          const result = await AdbService.installApk(deviceId, apkUri[0].fsPath);
          if (result.success) {
            showInfo(result.message);
          } else {
            showError(result.message);
          }
        });
      }
    }),
    vscode.commands.registerCommand('android-toolkit.uninstallApp', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      const deviceId = emulators[0].id;
      const packages = await AdbService.listPackages(deviceId);
      const pkg = await vscode.window.showQuickPick(packages, { placeHolder: 'Select app to uninstall' });
      if (pkg) {
        const result = await AdbService.uninstallApp(deviceId, pkg);
        result.success ? showInfo(result.message) : showError(result.message);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.restartApp', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      const deviceId = emulators[0].id;
      const packages = await AdbService.listPackages(deviceId);
      const pkg = await vscode.window.showQuickPick(packages, { placeHolder: 'Select app to restart' });
      if (pkg) {
        await withProgress('Restarting app...', async () => {
          const result = await AdbService.restartApp(deviceId, pkg);
          result.success ? showInfo(result.message) : showError(result.message);
        });
      }
    }),
    vscode.commands.registerCommand('android-toolkit.setLocation', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      const deviceId = emulators[0].id;
      const presets = DEFAULT_LOCATION_PRESETS.map(p => ({ label: p.name, id: p.id, lat: p.latitude, lng: p.longitude }));
      const selected = await vscode.window.showQuickPick(presets, { placeHolder: 'Select location preset' });
      if (selected) {
        const result = await AdbService.setLocation(deviceId, selected.lat, selected.lng);
        result.success ? showInfo(result.message) : showError(result.message);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.startRecording', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      const result = await AdbService.startScreenRecording(emulators[0].id);
      result.success ? showInfo(result.message) : showError(result.message);
    }),
    vscode.commands.registerCommand('android-toolkit.stopRecording', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      await withProgress('Stopping recording...', async () => {
        const result = await AdbService.stopScreenRecording(emulators[0].id);
        if (result.success && result.data) {
          showInfo(result.message);
          vscode.commands.executeCommand('vscode.open', vscode.Uri.file(result.data));
        } else {
          showError(result.message);
        }
      });
    }),
    vscode.commands.registerCommand('android-toolkit.setBattery', async () => {
      const emulators = await listRunningEmulators();
      if (emulators.length === 0) {
        showWarning('No running emulators.');
        return;
      }
      const levelInput = await vscode.window.showInputBox({
        prompt: 'Battery level (0-100)',
        value: '50',
        validateInput: (value) => {
          if (value.trim() === '') {
            return 'Enter a value between 0 and 100';
          }
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
            return 'Battery level must be between 0 and 100';
          }
          return undefined;
        },
      });
      if (levelInput === undefined) {
        return;
      }
      const statusPick = await vscode.window.showQuickPick(
        [
          { label: 'Charging', value: 'charging' },
          { label: 'Discharging', value: 'discharging' },
          { label: 'Not Charging', value: 'not-charging' },
          { label: 'Full', value: 'full' },
          { label: 'Leave Status Unchanged', value: 'unchanged' },
        ],
        { placeHolder: 'Set battery status' }
      );
      if (!statusPick) {
        return;
      }
      const level = parseInt(levelInput, 10);
      const levelResult = await AdbService.setBatteryLevel(emulators[0].id, level);
      levelResult.success ? showInfo(levelResult.message) : showError(levelResult.message);
      if (statusPick.value !== 'unchanged') {
        const statusResult = await AdbService.setBatteryStatus(
          emulators[0].id,
          statusPick.value as 'charging' | 'discharging' | 'not-charging' | 'full'
        );
        statusResult.success ? showInfo(statusResult.message) : showError(statusResult.message);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.openFile', async (uriOrPath: vscode.Uri | string) => {
      try {
        let uri: vscode.Uri;
        if (typeof uriOrPath === 'string') {
          uri = vscode.Uri.file(uriOrPath);
        } else if (uriOrPath instanceof vscode.Uri) {
          uri = uriOrPath;
        } else {
          uri = vscode.Uri.file(String(uriOrPath));
        }
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await ensureLanguageMode(doc);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open file: ${error}`);
      }
    }),
    vscode.commands.registerCommand('android-toolkit.openProfiler', () => {
      ProfilerPanel.createOrShow(context.extensionUri);
    }),
  ];
  context.subscriptions.push(...commands);
  checkLanguageExtensions().catch(console.error);
  EmulatorStateService.getInstance().startMonitoring();
  console.log('Android Tools activated!');
}
export function deactivate(): void {
  const { logcatManager } = require('./logcat/logcatStream');
  logcatManager.stopAll();
  const { debugSession } = require('./debug/debugAdapter');
  debugSession.dispose();
  EmulatorStateService.getInstance().stopMonitoring();
  console.log('Android Tools deactivated.');
}
