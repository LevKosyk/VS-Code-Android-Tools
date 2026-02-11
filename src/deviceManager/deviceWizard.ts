import * as vscode from 'vscode';
import { Platform, UnifiedDevice } from './types';
import { DeviceManagerProvider } from './deviceManagerProvider';
import { 
  listSystemImages, 
  listDeviceProfiles, 
  createAvd, 
  deleteAvd 
} from '../emulators/avdCreator';
import { startEmulator, stopEmulator } from '../emulators/emulatorManager';
import { 
  isIOSAvailable, 
  listDeviceTypes, 
  listRuntimes, 
  createSimulator, 
  bootSimulator, 
  shutdownSimulator, 
  deleteSimulator 
} from '../ios/simulatorManager';
import { showInfo, showError, withProgress } from '../ui/notifications';
export async function createDeviceWizard(
  preselectedPlatform: Platform | undefined,
  provider: DeviceManagerProvider
): Promise<void> {
  const platform = preselectedPlatform || await selectPlatform();
  if (!platform) return;
  if (platform === 'android') {
    await createAndroidDevice(provider);
  } else {
    await createIOSDevice(provider);
  }
}
async function selectPlatform(): Promise<Platform | undefined> {
  const items: vscode.QuickPickItem[] = [
    {
      label: '$(device-mobile) Android',
      description: 'Create Android Virtual Device (AVD)',
      detail: 'Requires Android SDK',
    },
  ];
  if (isIOSAvailable()) {
    items.push({
      label: '$(device-mobile) iOS',
      description: 'Create iOS Simulator',
      detail: 'Requires Xcode (macOS only)',
    });
  }
  const selected = await vscode.window.showQuickPick(items, {
    title: 'Create Device',
    placeHolder: 'Select platform',
  });
  if (!selected) return undefined;
  return selected.label.includes('Android') ? 'android' : 'ios';
}
async function createAndroidDevice(provider: DeviceManagerProvider): Promise<void> {
  try {
    const name = await vscode.window.showInputBox({
      title: 'Create Android Device (1/3)',
      prompt: 'Enter a name for the emulator',
      placeHolder: 'My_Pixel_7',
      validateInput: (value) => {
        if (!value) return 'Name is required';
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
          return 'Name must start with a letter and contain only letters, numbers, and underscores';
        }
        return undefined;
      },
    });
    if (!name) return;
    const profiles = await withProgress(
      'Loading device profiles...',
      () => listDeviceProfiles()
    );
    const profileItems = profiles.map(p => ({
      label: p.name,
      description: p.manufacturer,
      id: p.id,
    }));
    const selectedProfile = await vscode.window.showQuickPick(profileItems, {
      title: 'Create Android Device (2/3)',
      placeHolder: 'Select device hardware profile',
    });
    if (!selectedProfile) return;
    const images = await withProgress(
      'Loading system images...',
      () => listSystemImages()
    );
    const imageItems = images.map(img => ({
      label: `Android ${img.apiLevel}`,
      description: `${img.tag} - ${img.abi}`,
      detail: img.id,
      id: img.id,
    }));
    const selectedImage = await vscode.window.showQuickPick(imageItems, {
      title: 'Create Android Device (3/3)',
      placeHolder: 'Select Android version',
    });
    if (!selectedImage) return;
    await withProgress(
      `Creating ${name}...`,
      async () => {
        await createAvd({
          name,
          systemImage: selectedImage.id,
          device: selectedProfile.id,
        });
      }
    );
    showInfo(`Created Android emulator: ${name}`);
    provider.refresh();
    const launch = await vscode.window.showInformationMessage(
      `Emulator "${name}" created successfully. Launch it now?`,
      'Launch',
      'Later'
    );
    if (launch === 'Launch') {
      await withProgress(`Launching ${name}...`, () => startEmulator(name));
      provider.refresh();
    }
  } catch (error: any) {
    showError(`Failed to create Android emulator: ${error.message}`);
  }
}
async function createIOSDevice(provider: DeviceManagerProvider): Promise<void> {
  try {
    if (!isIOSAvailable()) {
      showError('iOS simulators are only available on macOS with Xcode installed');
      return;
    }
    const name = await vscode.window.showInputBox({
      title: 'Create iOS Simulator (1/3)',
      prompt: 'Enter a name for the simulator',
      placeHolder: 'My iPhone 15',
    });
    if (!name) return;
    const deviceTypes = await withProgress(
      'Loading device types...',
      () => listDeviceTypes()
    );
    const phoneAndTablet = deviceTypes.filter(
      dt => dt.productFamily === 'iPhone' || dt.productFamily === 'iPad'
    );
    const typeItems = phoneAndTablet.map(dt => ({
      label: dt.name,
      description: dt.productFamily,
      id: dt.identifier,
    }));
    const selectedType = await vscode.window.showQuickPick(typeItems, {
      title: 'Create iOS Simulator (2/3)',
      placeHolder: 'Select device type',
    });
    if (!selectedType) return;
    const runtimes = await withProgress(
      'Loading iOS versions...',
      () => listRuntimes()
    );
    const availableRuntimes = runtimes.filter(rt => rt.isAvailable);
    if (availableRuntimes.length === 0) {
      showError('No iOS runtimes available. Install iOS Simulators via Xcode.');
      return;
    }
    const runtimeItems = availableRuntimes.map(rt => ({
      label: rt.name,
      description: rt.version,
      id: rt.identifier,
    }));
    const selectedRuntime = await vscode.window.showQuickPick(runtimeItems, {
      title: 'Create iOS Simulator (3/3)',
      placeHolder: 'Select iOS version',
    });
    if (!selectedRuntime) return;
    await withProgress(
      `Creating ${name}...`,
      async () => {
        await createSimulator({
          name,
          deviceTypeIdentifier: selectedType.id,
          runtimeIdentifier: selectedRuntime.id,
        });
      }
    );
    showInfo(`Created iOS simulator: ${name}`);
    provider.refresh();
    const boot = await vscode.window.showInformationMessage(
      `Simulator "${name}" created successfully. Boot it now?`,
      'Boot',
      'Later'
    );
    if (boot === 'Boot') {
      const simulators = await require('../ios/simulatorManager').listSimulators();
      const created = simulators.find((s: any) => s.name === name);
      if (created) {
        await withProgress(`Booting ${name}...`, () => bootSimulator(created.udid));
        provider.refresh();
      }
    }
  } catch (error: any) {
    showError(`Failed to create iOS simulator: ${error.message}`);
  }
}
export async function launchDevice(
  device: UnifiedDevice,
  provider: DeviceManagerProvider
): Promise<void> {
  try {
    await withProgress(
      `Launching ${device.name}...`,
      async () => {
        if (device.platform === 'android') {
          await startEmulator(device.platformId);
        } else {
          await bootSimulator(device.platformId);
        }
      }
    );
    showInfo(`Launched ${device.name}`);
    provider.refresh();
  } catch (error: any) {
    showError(`Failed to launch ${device.name}: ${error.message}`);
  }
}
export async function stopDevice(
  device: UnifiedDevice,
  provider: DeviceManagerProvider
): Promise<void> {
  try {
    await withProgress(
      `Stopping ${device.name}...`,
      async () => {
        if (device.platform === 'android') {
          try {
            const { saveSnapshot } = require('../emulatorControl/emulatorCommands');
            await saveSnapshot(device.id, 'auto');
          } catch {
          }
          await stopEmulator(device.id);
        } else {
          await shutdownSimulator(device.platformId);
        }
      }
    );
    showInfo(`Stopped ${device.name}`);
    provider.refresh();
  } catch (error: any) {
    showError(`Failed to stop ${device.name}: ${error.message}`);
  }
}
export async function deleteDevice(
  device: UnifiedDevice,
  provider: DeviceManagerProvider
): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    `Are you sure you want to delete "${device.name}"? This cannot be undone.`,
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') return;
  try {
    await withProgress(
      `Deleting ${device.name}...`,
      async () => {
        if (device.platform === 'android') {
          await deleteAvd(device.platformId);
        } else {
          await deleteSimulator(device.platformId);
        }
      }
    );
    showInfo(`Deleted ${device.name}`);
    provider.refresh();
  } catch (error: any) {
    showError(`Failed to delete ${device.name}: ${error.message}`);
  }
}
