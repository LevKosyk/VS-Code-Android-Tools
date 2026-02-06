/**
 * Emulator Manager
 * Manages Android emulator lifecycle: list, start, stop, boot detection
 */

import { execCommand, execCommandLines, spawnProcess, waitFor } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { EmulatorError } from '../core/errors';
import { listDevices } from '../devices/deviceManager';
import { Avd, AvdStatus } from './types';

/**
 * Map of running emulator AVD names to device IDs
 * Used to prevent duplicate launches
 */
const runningEmulators = new Map<string, string>();

/**
 * List all available AVDs
 */
export async function listAvds(): Promise<Avd[]> {
  const sdk = detectSdk();
  
  const lines = await execCommandLines(sdk.emulator, ['-list-avds']);
  
  // Get running emulators to determine status
  const devices = await listDevices();
  const runningDeviceIds = new Set(
    devices
      .filter(d => d.type === 'emulator' && d.status === 'online')
      .map(d => d.id)
  );

  // Get AVD names for running emulators
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

/**
 * Get AVD names for currently running emulators
 */
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
          // First line is the AVD name
          const name = result.stdout.split('\n')[0].trim();
          if (name) {
            avdNames.add(name);
            runningEmulators.set(name, device.id);
          }
        }
      } catch {
        // Ignore errors for individual emulators
      }
    }
  }

  return avdNames;
}

/**
 * Check if an AVD is currently running
 */
export async function isAvdRunning(avdName: string): Promise<boolean> {
  const runningNames = await getRunningAvdNames();
  return runningNames.has(avdName);
}

/**
 * Start an emulator by AVD name
 * 
 * @throws EmulatorError if AVD not found or already running
 */
export async function startEmulator(avdName: string): Promise<string> {
  const sdk = detectSdk();

  // Check if AVD exists
  const avds = await listAvds();
  const avd = avds.find(a => a.name === avdName);
  
  if (!avd) {
    throw EmulatorError.notFound(avdName);
  }

  // Check if already running
  if (avd.status === 'running') {
    throw EmulatorError.alreadyRunning(avdName);
  }

  // Also check our internal tracking
  if (runningEmulators.has(avdName)) {
    throw EmulatorError.alreadyRunning(avdName);
  }

  // Start the emulator
  const { process: emulatorProcess } = spawnProcess(sdk.emulator, [
    '-avd', avdName,
    '-no-snapshot-save', // Start fresh for reliability
  ]);

  // Wait for emulator to appear in device list
  const deviceId = await waitForEmulatorDevice(avdName);
  
  if (!deviceId) {
    throw new EmulatorError(
      `Failed to start emulator: ${avdName}`,
      `Emulator "${avdName}" failed to start.`,
      'Check the emulator window for error messages.'
    );
  }

  // Track this emulator
  runningEmulators.set(avdName, deviceId);

  // Wait for boot completion
  const booted = await waitForBoot(deviceId);
  
  if (!booted) {
    throw EmulatorError.bootTimeout(avdName);
  }

  return deviceId;
}

/**
 * Wait for a new emulator device to appear
 */
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

      // Check each new emulator for matching AVD name
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
          // Emulator may not be ready yet
        }
      }

      return false;
    },
    { timeout: 60_000, interval: 2_000 }
  );

  return found ? deviceId : null;
}

/**
 * Wait for emulator boot to complete
 */
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

/**
 * Stop a running emulator
 */
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

  // Remove from tracking
  for (const [avdName, id] of runningEmulators.entries()) {
    if (id === deviceId) {
      runningEmulators.delete(avdName);
      break;
    }
  }
}

/**
 * Stop an emulator by AVD name
 */
export async function stopEmulatorByName(avdName: string): Promise<void> {
  const deviceId = runningEmulators.get(avdName);
  
  if (!deviceId) {
    // Try to find it by querying running emulators
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

/**
 * Get the device ID for a running AVD
 */
export function getDeviceIdForAvd(avdName: string): string | undefined {
  return runningEmulators.get(avdName);
}
