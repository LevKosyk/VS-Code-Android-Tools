/**
 * Emulator Service
 * Emulator-specific operations (network profiles, lifecycle)
 */

import { execCommand } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { 
  NetworkProfile, 
  NetworkStatus, 
  ServiceResult,
  EmulatorStatus,
  BatteryInfo,
  MemoryInfo,
} from './types';
import { AdbService } from './adbService';
import { listRunningEmulators } from '../devices/deviceManager';
import { getAvdNameForDevice } from '../emulatorControl/emulatorCommands';

/**
 * Network profile configurations
 * Values for emulator console network command
 */
const NETWORK_PROFILES: Record<NetworkProfile, { delay: number; speed: string }> = {
  full: { delay: 0, speed: 'full' },
  lte: { delay: 50, speed: 'lte' },
  '3g': { delay: 100, speed: 'umts' },
  '2g': { delay: 300, speed: 'edge' },
  edge: { delay: 500, speed: 'gprs' },
  offline: { delay: 0, speed: 'gsm' },
};

/**
 * Emulator info with extended details
 */
export interface EmulatorInfo {
  deviceId: string;
  avdName: string;
  state: 'booting' | 'running' | 'offline';
  androidVersion?: string;
  apiLevel?: number;
  abi?: string;
  resolution?: string;
}

/**
 * Singleton Emulator service
 */
class EmulatorServiceClass {

  /**
   * List running emulators with details
   */
  async listRunning(): Promise<EmulatorInfo[]> {
    const emulators = await listRunningEmulators();
    
    const results: EmulatorInfo[] = [];
    
    for (const emu of emulators) {
      const avdName = await getAvdNameForDevice(emu.id);
      
      let info: EmulatorInfo = {
        deviceId: emu.id,
        avdName: avdName || emu.id,
        state: emu.status === 'online' ? 'running' : 'offline',
      };

      // Get additional properties if online
      if (emu.status === 'online') {
        try {
          const props = await AdbService.getDeviceProperties(emu.id);
          info.androidVersion = props.androidVersion;
          info.apiLevel = props.apiLevel;
          info.abi = props.abi;
          info.resolution = props.screenResolution;
        } catch {
          // Ignore errors for optional info
        }
      }

      results.push(info);
    }

    return results;
  }

  /**
   * Get full status for a running emulator
   */
  async getStatus(deviceId: string): Promise<EmulatorStatus | null> {
    try {
      const avdName = await getAvdNameForDevice(deviceId);
      if (!avdName) {
        return null;
      }

      const [battery, memory] = await Promise.all([
        AdbService.getBatteryInfo(deviceId),
        AdbService.getMemoryInfo(deviceId),
      ]);

      const networkStatus = await this.getNetworkStatus(deviceId);

      return {
        deviceId,
        avdName,
        state: 'running',
        battery,
        memory,
        network: networkStatus,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get network connectivity status
   */
  async getNetworkStatus(deviceId: string): Promise<NetworkStatus> {
    const sdk = detectSdk();

    try {
      const result = await execCommand(sdk.adb, [
        '-s', deviceId, 'shell', 'dumpsys', 'connectivity'
      ]);

      if (result.stdout.includes('CONNECTED')) {
        return 'connected';
      } else if (result.stdout.includes('DISCONNECTED')) {
        return 'disconnected';
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Set network profile
   */
  async setNetworkProfile(deviceId: string, profile: NetworkProfile): Promise<ServiceResult> {
    const sdk = detectSdk();
    const config = NETWORK_PROFILES[profile];

    if (profile === 'offline') {
      // Disable both wifi and data
      await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'svc', 'wifi', 'disable']);
      await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'svc', 'data', 'disable']);
      return { success: true, message: 'Network disabled (offline mode)' };
    }

    // Enable network first
    await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'svc', 'wifi', 'enable']);
    await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'svc', 'data', 'enable']);

    // Set network speed/delay via emulator console
    // Note: This requires telnet to emulator console (port from device ID)
    const portMatch = deviceId.match(/emulator-(\d+)/);
    if (portMatch) {
      const port = portMatch[1];
      
      // Use network delay and speed commands
      await execCommand(sdk.adb, [
        '-s', deviceId, 'emu', 'network', 'delay', config.delay.toString()
      ]);
      await execCommand(sdk.adb, [
        '-s', deviceId, 'emu', 'network', 'speed', config.speed
      ]);
    }

    return { success: true, message: `Network profile set to ${profile}` };
  }

  /**
   * Toggle network on/off
   */
  async toggleNetwork(deviceId: string): Promise<ServiceResult> {
    const status = await this.getNetworkStatus(deviceId);
    const sdk = detectSdk();

    if (status === 'connected') {
      await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'svc', 'wifi', 'disable']);
      await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'svc', 'data', 'disable']);
      return { success: true, message: 'Network disabled' };
    } else {
      await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'svc', 'wifi', 'enable']);
      await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'svc', 'data', 'enable']);
      return { success: true, message: 'Network enabled' };
    }
  }
}

// Export singleton instance
export const EmulatorService = new EmulatorServiceClass();
