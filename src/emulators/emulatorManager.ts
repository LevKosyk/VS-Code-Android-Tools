import { execCommand, execCommandLines, spawnProcess, waitFor } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { EmulatorError } from '../core/errors';
import { listDevices } from '../devices/deviceManager';
import { Avd, AvdStatus } from './types';
const runningEmulators = new Map<string, string>();
export async function listAvds(): Promise<Avd[]> {
  const sdk = detectSdk();
  if (!sdk.emulator) {
    return [];
  }
  const lines = await execCommandLines(sdk.emulator, ['-list-avds']);
  const devices = await listDevices();
  const runningDeviceIds = new Set(
    devices
      .filter(d => d.type === 'emulator' && d.status === 'online')
      .map(d => d.id)
  );
  const runningAvdNames = await getRunningAvdNames();
  const avds: Avd[] = lines.map(name => {
    const isRunning = runningAvdNames.has(name);
    const deviceId = [...runningEmulators.entries()]
      .find(([avdName]) => avdName === name)?.[1];
    return {
      name,
      status: isRunning ? 'running' as AvdStatus : 'stopped' as AvdStatus,
      deviceId: isRunning ? deviceId : undefined,
    };
  });
  return avds;
}
async function getRunningAvdNames(): Promise<Set<string>> {
  const sdk = detectSdk();
  const devices = await listDevices();
  const avdNames = new Set<string>();
  for (const device of devices) {
    if (device.type === 'emulator' && device.status === 'online') {
      try {
        const result = await execCommand(sdk.adb, [
          '-s', device.id, 'emu', 'avd', 'name'
        ]);
        if (result.exitCode === 0) {
          const name = result.stdout.split('\n')[0].trim();
          if (name) {
            avdNames.add(name);
            runningEmulators.set(name, device.id);
          }
        }
      } catch {
      }
    }
  }
  return avdNames;
}
export async function isAvdRunning(avdName: string): Promise<boolean> {
  const runningNames = await getRunningAvdNames();
  return runningNames.has(avdName);
}
export async function startEmulator(avdName: string): Promise<string> {
  const sdk = detectSdk();
  if (!sdk.emulator) {
    throw new EmulatorError(
      'Android Emulator is not installed',
      'Android SDK was found, but the Emulator package is missing.',
      'Install Android Emulator from SDK Manager or connect a physical device.'
    );
  }
  const avds = await listAvds();
  const avd = avds.find(a => a.name === avdName);
  if (!avd) {
    throw EmulatorError.notFound(avdName);
  }
  if (avd.status === 'running') {
    throw EmulatorError.alreadyRunning(avdName);
  }
  if (runningEmulators.has(avdName)) {
    throw EmulatorError.alreadyRunning(avdName);
  }
  const { process: emulatorProcess } = spawnProcess(sdk.emulator, [
    '-avd', avdName,
    '-no-snapshot-save', 
  ]);
  const deviceId = await waitForEmulatorDevice(avdName);
  if (!deviceId) {
    throw new EmulatorError(
      `Failed to start emulator: ${avdName}`,
      `Emulator "${avdName}" failed to start.`,
      'Check the emulator window for error messages.'
    );
  }
  runningEmulators.set(avdName, deviceId);
  const booted = await waitForBoot(deviceId);
  if (!booted) {
    throw EmulatorError.bootTimeout(avdName);
  }
  return deviceId;
}
async function waitForEmulatorDevice(avdName: string): Promise<string | null> {
  const sdk = detectSdk();
  let deviceId: string | null = null;
  const found = await waitFor(
    async () => {
      const devices = await listDevices();
      const emulators = devices.filter(d => 
        d.type === 'emulator' && 
        d.status === 'online' &&
        !runningEmulators.has(avdName)
      );
      for (const emu of emulators) {
        try {
          const result = await execCommand(sdk.adb, [
            '-s', emu.id, 'emu', 'avd', 'name'
          ]);
          const name = result.stdout.split('\n')[0].trim();
          if (name === avdName) {
            deviceId = emu.id;
            return true;
          }
        } catch {
        }
      }
      return false;
    },
    { timeout: 60_000, interval: 2_000 }
  );
  return found ? deviceId : null;
}
export async function waitForBoot(deviceId: string): Promise<boolean> {
  const sdk = detectSdk();
  return waitFor(
    async () => {
      const result = await execCommand(sdk.adb, [
        '-s', deviceId, 'shell', 'getprop', 'sys.boot_completed'
      ]);
      return result.stdout.trim() === '1';
    },
    { timeout: 120_000, interval: 2_000 }
  );
}
export async function stopEmulator(deviceId: string): Promise<void> {
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['-s', deviceId, 'emu', 'kill']);
  if (result.exitCode !== 0) {
    throw new EmulatorError(
      `Failed to stop emulator: ${deviceId}`,
      `Failed to stop emulator.`,
      result.stderr || 'The emulator may have already closed.'
    );
  }
  for (const [avdName, id] of runningEmulators.entries()) {
    if (id === deviceId) {
      runningEmulators.delete(avdName);
      break;
    }
  }
}
export async function stopEmulatorByName(avdName: string): Promise<void> {
  const deviceId = runningEmulators.get(avdName);
  if (!deviceId) {
    const avds = await listAvds();
    const avd = avds.find(a => a.name === avdName && a.status === 'running');
    if (!avd?.deviceId) {
      throw new EmulatorError(
        `Emulator not running: ${avdName}`,
        `Emulator "${avdName}" is not running.`,
        undefined
      );
    }
    await stopEmulator(avd.deviceId);
    return;
  }
  await stopEmulator(deviceId);
}
export function getDeviceIdForAvd(avdName: string): string | undefined {
  return runningEmulators.get(avdName);
}
