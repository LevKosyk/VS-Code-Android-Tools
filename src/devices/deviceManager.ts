/**
 * Device Manager
 * Discovers and manages connected Android devices using ADB
 */

import { execCommand } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { AdbError } from '../core/errors';
import { AndroidDevice, DeviceStatus } from './types';

/**
 * Parse device status from adb output
 */
function parseDeviceStatus(status: string): DeviceStatus {
  switch (status.toLowerCase()) {
    case 'device':
      return 'online';
    case 'offline':
      return 'offline';
    case 'unauthorized':
      return 'unauthorized';
    default:
      return 'unknown';
  }
}

/**
 * Determine if device ID represents an emulator
 */
function isEmulatorId(deviceId: string): boolean {
  // Emulators have IDs like "emulator-5554"
  return deviceId.startsWith('emulator-');
}

/**
 * Parse a single device line from adb devices output
 * Format: "device_id\tstatus"
 */
function parseDeviceLine(line: string): AndroidDevice | null {
  // Skip header and empty lines
  if (!line || line.startsWith('List of') || line.startsWith('*')) {
    return null;
  }

  const parts = line.split(/\s+/);
  if (parts.length < 2) {
    return null;
  }

  const [id, statusStr] = parts;
  
  return {
    id,
    type: isEmulatorId(id) ? 'emulator' : 'physical',
    status: parseDeviceStatus(statusStr),
  };
}

/**
 * List all connected Android devices and running emulators
 */
export async function listDevices(): Promise<AndroidDevice[]> {
  const sdk = detectSdk();
  
  const result = await execCommand(sdk.adb, ['devices']);
  
  if (result.exitCode !== 0) {
    throw new AdbError('devices', result.stderr, result.exitCode);
  }

  const devices: AndroidDevice[] = [];
  const lines = result.stdout.split('\n');

  for (const line of lines) {
    const device = parseDeviceLine(line.trim());
    if (device) {
      devices.push(device);
    }
  }

  return devices;
}

/**
 * Get detailed info for a specific device
 */
export async function getDeviceInfo(deviceId: string): Promise<Partial<AndroidDevice>> {
  const sdk = detectSdk();
  const info: Partial<AndroidDevice> = {};

  try {
    // Get model
    const modelResult = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'getprop', 'ro.product.model'
    ]);
    if (modelResult.exitCode === 0 && modelResult.stdout) {
      info.model = modelResult.stdout;
    }

    // Get Android version
    const versionResult = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'getprop', 'ro.build.version.release'
    ]);
    if (versionResult.exitCode === 0 && versionResult.stdout) {
      info.androidVersion = versionResult.stdout;
    }
  } catch {
    // Ignore errors for optional info
  }

  return info;
}

/**
 * List devices with detailed information
 */
export async function listDevicesDetailed(): Promise<AndroidDevice[]> {
  const devices = await listDevices();

  // Fetch additional info for online devices in parallel
  const detailedDevices = await Promise.all(
    devices.map(async (device) => {
      if (device.status === 'online') {
        const info = await getDeviceInfo(device.id);
        return { ...device, ...info };
      }
      return device;
    })
  );

  return detailedDevices;
}

/**
 * Check if a specific device is connected
 */
export async function isDeviceConnected(deviceId: string): Promise<boolean> {
  const devices = await listDevices();
  return devices.some(d => d.id === deviceId && d.status === 'online');
}

/**
 * Wait for a device to come online
 */
export async function waitForDevice(deviceId: string, timeoutMs: number = 60000): Promise<boolean> {
  const sdk = detectSdk();
  
  const result = await execCommand(
    sdk.adb, 
    ['-s', deviceId, 'wait-for-device'],
    { timeout: timeoutMs }
  );
  
  return result.exitCode === 0;
}

/**
 * Get running emulator devices only
 */
export async function listRunningEmulators(): Promise<AndroidDevice[]> {
  const devices = await listDevices();
  return devices.filter(d => d.type === 'emulator');
}

/**
 * Get physical devices only
 */
export async function listPhysicalDevices(): Promise<AndroidDevice[]> {
  const devices = await listDevices();
  return devices.filter(d => d.type === 'physical');
}
