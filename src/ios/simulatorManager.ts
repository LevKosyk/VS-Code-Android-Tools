import { execCommand, execCommandLines } from '../core/cli';
import { 
  iOSSimulator, 
  iOSDeviceType, 
  iOSRuntime, 
  SimulatorState,
  CreateSimulatorOptions 
} from './types';
export function isIOSAvailable(): boolean {
  return process.platform === 'darwin';
}
function getXcrunPath(): string {
  return 'xcrun';
}
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
function getProductFamily(identifier: string): iOSDeviceType['productFamily'] {
  if (identifier.includes('iPhone')) return 'iPhone';
  if (identifier.includes('iPad')) return 'iPad';
  if (identifier.includes('Watch')) return 'Apple Watch';
  if (identifier.includes('TV')) return 'Apple TV';
  return 'Unknown';
}
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
    for (const [runtimeId, devices] of Object.entries(data.devices || {})) {
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
    deviceTypes.sort((a, b) => {
      const order = { 'iPhone': 0, 'iPad': 1, 'Apple Watch': 2, 'Apple TV': 3, 'Unknown': 4 };
      return order[a.productFamily] - order[b.productFamily];
    });
    return deviceTypes;
  } catch {
    return [];
  }
}
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
    runtimes.sort((a, b) => b.version.localeCompare(a.version));
    return runtimes;
  } catch {
    return [];
  }
}
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
  return result.stdout.trim();
}
export async function bootSimulator(udid: string): Promise<void> {
  if (!isIOSAvailable()) {
    throw new Error('iOS simulators are only available on macOS');
  }
  const result = await execCommand(getXcrunPath(), ['simctl', 'boot', udid]);
  if (result.exitCode !== 0) {
    if (result.stderr.includes('current state: Booted')) {
      return; 
    }
    throw new Error(`Failed to boot simulator: ${result.stderr}`);
  }
  await execCommand('open', ['-a', 'Simulator']);
}
export async function shutdownSimulator(udid: string): Promise<void> {
  if (!isIOSAvailable()) {
    throw new Error('iOS simulators are only available on macOS');
  }
  const result = await execCommand(getXcrunPath(), ['simctl', 'shutdown', udid]);
  if (result.exitCode !== 0) {
    if (result.stderr.includes('current state: Shutdown')) {
      return; 
    }
    throw new Error(`Failed to shutdown simulator: ${result.stderr}`);
  }
}
export async function deleteSimulator(udid: string): Promise<void> {
  if (!isIOSAvailable()) {
    throw new Error('iOS simulators are only available on macOS');
  }
  try {
    await shutdownSimulator(udid);
  } catch {
  }
  const result = await execCommand(getXcrunPath(), ['simctl', 'delete', udid]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to delete simulator: ${result.stderr}`);
  }
}
export async function listRunningSimulators(): Promise<iOSSimulator[]> {
  const all = await listSimulators();
  return all.filter(sim => sim.state === 'Booted');
}
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
