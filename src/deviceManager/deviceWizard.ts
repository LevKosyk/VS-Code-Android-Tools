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
import { showInfo, showError, withProgress } from '../ui/notifications';
export async function createDeviceWizard(
  preselectedPlatform: Platform | undefined,
  provider: DeviceManagerProvider
): Promise<void> {
  const platform = preselectedPlatform || await selectPlatform();
  if (!platform) return;
  await createAndroidDevice(provider);
}
async function selectPlatform(): Promise<Platform | undefined> {
  const items: vscode.QuickPickItem[] = [
    {
      label: '$(device-mobile) Android',
      description: 'Create Android Virtual Device (AVD)',
      detail: 'Requires Android SDK',
    },
  ];
  const selected = await vscode.window.showQuickPick(items, {
    title: 'Create Device',
    placeHolder: 'Select platform',
  });
  if (!selected) return undefined;
  return 'android';
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
export async function launchDevice(
  device: UnifiedDevice,
  provider: DeviceManagerProvider
): Promise<void> {
  try {
    await withProgress(
      `Launching ${device.name}...`,
      async () => {
        await startEmulator(device.platformId);
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
        try {
          const { saveSnapshot } = require('../emulatorControl/emulatorCommands');
          await saveSnapshot(device.id, 'auto');
        } catch {
        }
        await stopEmulator(device.id);
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
        await deleteAvd(device.platformId);
      }
    );
    showInfo(`Deleted ${device.name}`);
    provider.refresh();
  } catch (error: any) {
    showError(`Failed to delete ${device.name}: ${error.message}`);
  }
}
