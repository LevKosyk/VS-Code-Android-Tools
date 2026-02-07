/**
 * iOS Simulator Manager
 * Wrapper for xcrun simctl commands
 */

import { execCommand, execCommandLines } from '../core/cli';
import { 
  iOSSimulator, 
  iOSDeviceType, 
  iOSRuntime, 
  SimulatorState,
  CreateSimulatorOptions 
} from './types';

/**
 * Check if running on macOS with Xcode
 */
export function isIOSAvailable(): boolean {
  return process.platform === 'darwin';
}

/**
 * Get xcrun path (uses system PATH)
 */
function getXcrunPath(): string {
  return 'xcrun';
}

/**
 * Parse simulator state from simctl output
 */
function parseState(state: string): SimulatorState {
  switch (state) {
    case 'Booted':
      return 'Booted';
    case 'Shutdown':
      return 'Shutdown';
    default:
      return 'Unknown';
  }
}

/**
 * Extract product family from device type identifier
 */
function getProductFamily(identifier: string): iOSDeviceType['productFamily'] {
  if (identifier.includes('iPhone')) return 'iPhone';
  if (identifier.includes('iPad')) return 'iPad';
  if (identifier.includes('Watch')) return 'Apple Watch';
  if (identifier.includes('TV')) return 'Apple TV';
  return 'Unknown';
}

/**
 * List all iOS simulators
 */
export async function listSimulators(): Promise<iOSSimulator[]> {
  if (!isIOSAvailable()) {
    return [];
  }

  try {
    const result = await execCommand(getXcrunPath(), ['simctl', 'list', 'devices', '-j']);
    
    if (result.exitCode !== 0) {
      console.error('Failed to list simulators:', result.stderr);
      return [];
    }

    const data = JSON.parse(result.stdout);
    const simulators: iOSSimulator[] = [];

    // Parse devices grouped by runtime
    for (const [runtimeId, devices] of Object.entries(data.devices || {})) {
      // Extract runtime name from identifier
      // com.apple.CoreSimulator.SimRuntime.iOS-17-2 -> iOS 17.2
      const runtimeMatch = runtimeId.match(/SimRuntime\.([^-]+)-(\d+)-?(\d*)/);
      const runtime = runtimeMatch 
        ? `${runtimeMatch[1]} ${runtimeMatch[2]}${runtimeMatch[3] ? '.' + runtimeMatch[3] : ''}`
        : runtimeId;

      for (const device of devices as any[]) {
        simulators.push({
          udid: device.udid,
          name: device.name,
          deviceType: device.deviceTypeIdentifier?.split('.').pop()?.replace(/-/g, ' ') || 'Unknown',
          runtime,
          state: parseState(device.state),
          isAvailable: device.isAvailable !== false,
        });
      }
    }

    return simulators;
  } catch (error) {
    console.error('Error listing simulators:', error);
    return [];
  }
}

/**
 * List available device types
 */
export async function listDeviceTypes(): Promise<iOSDeviceType[]> {
  if (!isIOSAvailable()) {
    return [];
  }

  try {
    const result = await execCommand(getXcrunPath(), ['simctl', 'list', 'devicetypes', '-j']);
    
    if (result.exitCode !== 0) {
      return [];
    }

    const data = JSON.parse(result.stdout);
    const deviceTypes: iOSDeviceType[] = [];

    for (const dt of data.devicetypes || []) {
      deviceTypes.push({
        identifier: dt.identifier,
        name: dt.name,
        productFamily: getProductFamily(dt.identifier),
      });
    }

    // Sort: iPhones first, then iPads, then others
    deviceTypes.sort((a, b) => {
      const order = { 'iPhone': 0, 'iPad': 1, 'Apple Watch': 2, 'Apple TV': 3, 'Unknown': 4 };
      return order[a.productFamily] - order[b.productFamily];
    });

    return deviceTypes;
  } catch {
    return [];
  }
}

/**
 * List available iOS runtimes
 */
export async function listRuntimes(): Promise<iOSRuntime[]> {
  if (!isIOSAvailable()) {
    return [];
  }

  try {
    const result = await execCommand(getXcrunPath(), ['simctl', 'list', 'runtimes', '-j']);
    
    if (result.exitCode !== 0) {
      return [];
    }

    const data = JSON.parse(result.stdout);
    const runtimes: iOSRuntime[] = [];

    for (const rt of data.runtimes || []) {
      runtimes.push({
        identifier: rt.identifier,
        name: rt.name,
        version: rt.version,
        buildversion: rt.buildversion,
        isAvailable: rt.isAvailable !== false,
      });
    }

    // Sort by version descending
    runtimes.sort((a, b) => b.version.localeCompare(a.version));

    return runtimes;
  } catch {
    return [];
  }
}

/**
 * Create a new simulator
 */
export async function createSimulator(options: CreateSimulatorOptions): Promise<string> {
  if (!isIOSAvailable()) {
    throw new Error('iOS simulators are only available on macOS');
  }

  const result = await execCommand(getXcrunPath(), [
    'simctl', 'create',
    options.name,
    options.deviceTypeIdentifier,
    options.runtimeIdentifier,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create simulator: ${result.stderr}`);
  }

  // simctl create returns the UDID
  return result.stdout.trim();
}

/**
 * Boot a simulator
 */
export async function bootSimulator(udid: string): Promise<void> {
  if (!isIOSAvailable()) {
    throw new Error('iOS simulators are only available on macOS');
  }

  const result = await execCommand(getXcrunPath(), ['simctl', 'boot', udid]);

  if (result.exitCode !== 0) {
    // Check if already booted
    if (result.stderr.includes('current state: Booted')) {
      return; // Already booted, not an error
    }
    throw new Error(`Failed to boot simulator: ${result.stderr}`);
  }

  // Open Simulator.app to show the device
  await execCommand('open', ['-a', 'Simulator']);
}

/**
 * Shutdown a simulator
 */
export async function shutdownSimulator(udid: string): Promise<void> {
  if (!isIOSAvailable()) {
    throw new Error('iOS simulators are only available on macOS');
  }

  const result = await execCommand(getXcrunPath(), ['simctl', 'shutdown', udid]);

  if (result.exitCode !== 0) {
    // Check if already shutdown
    if (result.stderr.includes('current state: Shutdown')) {
      return; // Already shutdown, not an error
    }
    throw new Error(`Failed to shutdown simulator: ${result.stderr}`);
  }
}

/**
 * Delete a simulator
 */
export async function deleteSimulator(udid: string): Promise<void> {
  if (!isIOSAvailable()) {
    throw new Error('iOS simulators are only available on macOS');
  }

  // Shutdown first if running
  try {
    await shutdownSimulator(udid);
  } catch {
    // Ignore shutdown errors
  }

  const result = await execCommand(getXcrunPath(), ['simctl', 'delete', udid]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to delete simulator: ${result.stderr}`);
  }
}

/**
 * Get running simulators only
 */
export async function listRunningSimulators(): Promise<iOSSimulator[]> {
  const all = await listSimulators();
  return all.filter(sim => sim.state === 'Booted');
}

/**
 * Check if Xcode command line tools are available
 */
export async function checkXcodeAvailable(): Promise<boolean> {
  if (!isIOSAvailable()) {
    return false;
  }

  try {
    const result = await execCommand('xcode-select', ['-p']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
