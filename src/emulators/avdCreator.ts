import { execCommand, execCommandLines, execCommandWithInput } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { AvdManagerError, EmulatorError } from '../core/errors';
import { SystemImage, DeviceProfile, CreateAvdOptions } from './types';
export async function listSystemImages(): Promise<SystemImage[]> {
  const sdk = detectSdk();
  if (!sdk.avdmanager) {
    throw new AvdManagerError(
      'list target',
      'avdmanager not found. Install Android SDK Command-line Tools.'
    );
  }
  const result = await execCommand(sdk.avdmanager, ['list', 'target', '-c']);
  if (result.exitCode !== 0) {
    throw new AvdManagerError('list target', result.stderr);
  }
  const sdkmanagerPath = sdk.avdmanager.replace('avdmanager', 'sdkmanager');
  const sdkResult = await execCommand(sdkmanagerPath, ['--list']);
  const images: SystemImage[] = [];
  const lines = sdkResult.stdout.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*(system-images;android-(\d+);([^;]+);([^\s|]+))/);
    if (match) {
      const [, id, apiLevel, tag, abi] = match;
      images.push({
        id,
        apiLevel: parseInt(apiLevel, 10),
        tag,
        abi,
        displayName: `Android ${apiLevel} (${tag}) - ${abi}`,
      });
    }
  }
  if (images.length === 0) {
    throw EmulatorError.noSystemImages();
  }
  images.sort((a, b) => b.apiLevel - a.apiLevel);
  return images;
}
export async function listDeviceProfiles(): Promise<DeviceProfile[]> {
  const sdk = detectSdk();
  if (!sdk.avdmanager) {
    throw new AvdManagerError(
      'list device',
      'avdmanager not found. Install Android SDK Command-line Tools.'
    );
  }
  const result = await execCommand(sdk.avdmanager, ['list', 'device', '-c']);
  if (result.exitCode !== 0) {
    throw new AvdManagerError('list device', result.stderr);
  }
  const profiles: DeviceProfile[] = [];
  const lines = result.stdout.split('\n');
  let currentId = '';
  let currentName = '';
  let currentManufacturer = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('id:')) {
      if (currentId) {
        profiles.push({
          id: currentId,
          name: currentName || currentId,
          manufacturer: currentManufacturer || 'Unknown',
        });
      }
      const match = trimmed.match(/id:\s*\d+\s+or\s+"([^"]+)"/);
      if (match) {
        currentId = match[1];
        currentName = match[1];
        currentManufacturer = '';
      }
    } else if (trimmed.startsWith('Name:')) {
      currentName = trimmed.replace('Name:', '').trim();
    } else if (trimmed.startsWith('OEM:')) {
      currentManufacturer = trimmed.replace('OEM:', '').trim();
    }
  }
  if (currentId) {
    profiles.push({
      id: currentId,
      name: currentName || currentId,
      manufacturer: currentManufacturer || 'Unknown',
    });
  }
  if (profiles.length === 0) {
    profiles.push(
      { id: 'pixel_7', name: 'Pixel 7', manufacturer: 'Google' },
      { id: 'pixel_7_pro', name: 'Pixel 7 Pro', manufacturer: 'Google' },
      { id: 'pixel_6', name: 'Pixel 6', manufacturer: 'Google' },
      { id: 'pixel_5', name: 'Pixel 5', manufacturer: 'Google' },
      { id: 'Nexus 5X', name: 'Nexus 5X', manufacturer: 'LG' },
    );
  }
  return profiles;
}
export async function createAvd(options: CreateAvdOptions): Promise<void> {
  const sdk = detectSdk();
  if (!sdk.avdmanager) {
    throw new AvdManagerError(
      'create avd',
      'avdmanager not found. Install Android SDK Command-line Tools.'
    );
  }
  const args = [
    'create', 'avd',
    '-n', options.name,
    '-k', options.systemImage,
  ];
  if (options.device) {
    args.push('-d', options.device);
  }
  if (options.force) {
    args.push('--force');
  }
  const result = await execCommandWithInput(sdk.avdmanager, args, 'no\n', {
    timeout: 60_000,
  });
  if (result.exitCode !== 0) {
    if (result.stderr.includes('Package path is not valid')) {
      throw new EmulatorError(
        `Invalid system image: ${options.systemImage}`,
        `System image "${options.systemImage}" is not installed.`,
        'Install the system image using:\nsdkmanager "' + options.systemImage + '"'
      );
    }
    if (result.stderr.includes('already exists')) {
      throw new EmulatorError(
        `AVD already exists: ${options.name}`,
        `An emulator named "${options.name}" already exists.`,
        'Use a different name or delete the existing AVD.'
      );
    }
    throw EmulatorError.creationFailed(options.name, result.stderr);
  }
}
export async function deleteAvd(name: string): Promise<void> {
  const sdk = detectSdk();
  if (!sdk.avdmanager) {
    throw new AvdManagerError(
      'delete avd',
      'avdmanager not found. Install Android SDK Command-line Tools.'
    );
  }
  const result = await execCommand(sdk.avdmanager, ['delete', 'avd', '-n', name]);
  if (result.exitCode !== 0) {
    throw new AvdManagerError(`delete avd -n ${name}`, result.stderr);
  }
}
export async function avdExists(name: string): Promise<boolean> {
  const sdk = detectSdk();
  const lines = await execCommandLines(sdk.emulator, ['-list-avds']);
  return lines.includes(name);
}
