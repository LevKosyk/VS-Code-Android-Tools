import * as vscode from 'vscode';
import { AndroidDevice } from '../devices/types';
import { Avd, SystemImage, DeviceProfile } from '../emulators/types';
interface QuickPickItemWithData<T> extends vscode.QuickPickItem {
  data: T;
}
export async function pickDevice(
  devices: AndroidDevice[],
  options: { title?: string; placeholder?: string } = {}
): Promise<AndroidDevice | undefined> {
  if (devices.length === 0) {
    vscode.window.showWarningMessage('No Android devices found.');
    return undefined;
  }
  const items: QuickPickItemWithData<AndroidDevice>[] = devices.map(device => ({
    label: device.id,
    description: `${device.type} • ${device.status}`,
    detail: device.model ? `${device.model} (Android ${device.androidVersion || 'unknown'})` : undefined,
    data: device,
  }));
  const selected = await vscode.window.showQuickPick(items, {
    title: options.title || 'Select Android Device',
    placeHolder: options.placeholder || 'Choose a device',
  });
  return selected?.data;
}
export async function pickAvd(
  avds: Avd[],
  options: { 
    title?: string; 
    placeholder?: string;
    filter?: 'all' | 'running' | 'stopped';
  } = {}
): Promise<Avd | undefined> {
  let filteredAvds = avds;
  if (options.filter === 'running') {
    filteredAvds = avds.filter(a => a.status === 'running');
  } else if (options.filter === 'stopped') {
    filteredAvds = avds.filter(a => a.status === 'stopped');
  }
  if (filteredAvds.length === 0) {
    const message = options.filter === 'running'
      ? 'No running emulators found.'
      : options.filter === 'stopped'
        ? 'No stopped emulators available. Run "Android: Create Emulator" to create one.'
        : 'No emulators found. Run "Android: Create Emulator" to create one.';
    vscode.window.showWarningMessage(message);
    return undefined;
  }
  const items: QuickPickItemWithData<Avd>[] = filteredAvds.map(avd => ({
    label: avd.name,
    description: avd.status === 'running' ? '$(debug-start) Running' : '$(debug-stop) Stopped',
    detail: avd.deviceId ? `Device: ${avd.deviceId}` : undefined,
    data: avd,
  }));
  const selected = await vscode.window.showQuickPick(items, {
    title: options.title || 'Select Emulator',
    placeHolder: options.placeholder || 'Choose an emulator',
  });
  return selected?.data;
}
export async function pickSystemImage(
  images: SystemImage[],
  options: { title?: string } = {}
): Promise<SystemImage | undefined> {
  if (images.length === 0) {
    vscode.window.showWarningMessage(
      'No system images found. Install system images using Android SDK Manager.'
    );
    return undefined;
  }
  const items: QuickPickItemWithData<SystemImage>[] = images.map(image => ({
    label: `Android ${image.apiLevel}`,
    description: `${image.tag} • ${image.abi}`,
    detail: image.id,
    data: image,
  }));
  const selected = await vscode.window.showQuickPick(items, {
    title: options.title || 'Select System Image',
    placeHolder: 'Choose an Android version',
  });
  return selected?.data;
}
export async function pickDeviceProfile(
  profiles: DeviceProfile[],
  options: { title?: string } = {}
): Promise<DeviceProfile | undefined> {
  const items: QuickPickItemWithData<DeviceProfile>[] = profiles.map(profile => ({
    label: profile.name,
    description: profile.manufacturer,
    data: profile,
  }));
  const noProfile: QuickPickItemWithData<DeviceProfile | null> = {
    label: '$(dash) Use default profile',
    description: 'No specific device',
    data: null as unknown as DeviceProfile,
  };
  const selected = await vscode.window.showQuickPick(
    [noProfile, ...items] as QuickPickItemWithData<DeviceProfile>[],
    {
      title: options.title || 'Select Device Profile',
      placeHolder: 'Choose a device type',
    }
  );
  if (selected && selected.label.includes('default')) {
    return undefined;
  }
  return selected?.data;
}
export async function inputAvdName(): Promise<string | undefined> {
  const name = await vscode.window.showInputBox({
    title: 'Create New Emulator',
    prompt: 'Enter a name for the new emulator',
    placeHolder: 'my_emulator',
    validateInput: (value) => {
      if (!value) {
        return 'Name is required';
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
        return 'Name can only contain letters, numbers, underscores, and hyphens';
      }
      if (value.length > 64) {
        return 'Name must be 64 characters or less';
      }
      return undefined;
    },
  });
  return name;
}
