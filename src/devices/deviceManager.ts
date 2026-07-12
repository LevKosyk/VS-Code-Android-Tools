import { execCommand } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { AdbError } from '../core/errors';
import { AndroidDevice, DeviceStatus } from './types';
type DeviceCacheEntry = {
  at: number;
  devices: AndroidDevice[];
};
const DEVICE_CACHE_TTL_MS = 3000;
let deviceCache: DeviceCacheEntry | undefined;
let devicesInFlight: Promise<AndroidDevice[]> | undefined;
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
function isEmulatorId(deviceId: string): boolean {
  return deviceId.startsWith('emulator-');
}
export function parseDeviceLine(line: string): AndroidDevice | null {
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
export function parseAdbDevicesOutput(output: string): AndroidDevice[] {
  return output.split(/\r?\n/).map(line => parseDeviceLine(line.trim())).filter((item): item is AndroidDevice => item !== null);
}
export async function listDevices(): Promise<AndroidDevice[]> {
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['devices']);
  if (result.exitCode !== 0) {
    throw new AdbError('devices', result.stderr, result.exitCode);
  }
  return parseAdbDevicesOutput(result.stdout);
}
export async function getDeviceInfo(deviceId: string): Promise<Partial<AndroidDevice>> {
  const sdk = detectSdk();
  const info: Partial<AndroidDevice> = {};
  try {
    const propsResult = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'getprop', 'ro.product.model;getprop ro.build.version.release'
    ]);
    if (propsResult.exitCode === 0 && propsResult.stdout) {
      const lines = propsResult.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (lines[0]) {
        info.model = lines[0];
      }
      if (lines[1]) {
        info.androidVersion = lines[1];
      }
    }
  } catch {
  }
  return info;
}
export async function listDevicesDetailed(): Promise<AndroidDevice[]> {
  if (deviceCache && Date.now() - deviceCache.at < DEVICE_CACHE_TTL_MS) {
    return deviceCache.devices;
  }
  if (devicesInFlight) {
    return devicesInFlight;
  }
  devicesInFlight = (async () => {
    const devices = await listDevices();
    const detailedDevices = await Promise.all(
      devices.map(async (device) => {
        if (device.status === 'online') {
          const info = await getDeviceInfo(device.id);
          return { ...device, ...info };
        }
        return device;
      })
    );
    deviceCache = { at: Date.now(), devices: detailedDevices };
    return detailedDevices;
  })();
  try {
    return await devicesInFlight;
  } finally {
    devicesInFlight = undefined;
  }
}
export function invalidateDeviceCache(): void {
  deviceCache = undefined;
  devicesInFlight = undefined;
}
export async function isDeviceConnected(deviceId: string): Promise<boolean> {
  const devices = await listDevices();
  return devices.some(d => d.id === deviceId && d.status === 'online');
}
export async function waitForDevice(deviceId: string, timeoutMs: number = 60000): Promise<boolean> {
  const sdk = detectSdk();
  const result = await execCommand(
    sdk.adb, 
    ['-s', deviceId, 'wait-for-device'],
    { timeout: timeoutMs }
  );
  return result.exitCode === 0;
}
export async function listRunningEmulators(): Promise<AndroidDevice[]> {
  const devices = await listDevices();
  return devices.filter(d => d.type === 'emulator');
}
export async function listPhysicalDevices(): Promise<AndroidDevice[]> {
  const devices = await listDevices();
  return devices.filter(d => d.type === 'physical');
}
