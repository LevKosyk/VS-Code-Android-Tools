/**
 * ADB Service
 * Centralized ADB operations for device management
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execCommand, spawnProcess } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import {
  DeviceProperties,
  BatteryInfo,
  BatteryStatus,
  MemoryInfo,
  StorageInfo,
  RecordingSession,
  ServiceResult,
  PackageInfo,
} from './types';

/**
 * Singleton ADB service for all device operations
 */
class AdbServiceClass {
  private activeRecordings = new Map<string, RecordingSession>();

  /**
   * Get comprehensive device properties
   */
  async getDeviceProperties(deviceId: string): Promise<DeviceProperties> {
    const sdk = detectSdk();

    const props = await Promise.all([
      this.getProperty(deviceId, 'ro.product.model'),
      this.getProperty(deviceId, 'ro.product.manufacturer'),
      this.getProperty(deviceId, 'ro.build.version.release'),
      this.getProperty(deviceId, 'ro.build.version.sdk'),
      this.getProperty(deviceId, 'ro.product.cpu.abi'),
      this.getProperty(deviceId, 'ro.serialno'),
    ]);

    // Get screen resolution
    const wmResult = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'wm', 'size'
    ]);
    const resMatch = wmResult.stdout.match(/(\d+x\d+)/);

    return {
      model: props[0] || 'Unknown',
      manufacturer: props[1] || 'Unknown',
      androidVersion: props[2] || 'Unknown',
      apiLevel: parseInt(props[3], 10) || 0,
      abi: props[4] || 'Unknown',
      serialNumber: props[5] || deviceId,
      screenResolution: resMatch?.[1] || 'Unknown',
    };
  }

  /**
   * Get a single device property
   */
  private async getProperty(deviceId: string, prop: string): Promise<string> {
    const sdk = detectSdk();
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'getprop', prop
    ]);
    return result.exitCode === 0 ? result.stdout.trim() : '';
  }

  /**
   * Get battery information
   */
  async getBatteryInfo(deviceId: string): Promise<BatteryInfo> {
    const sdk = detectSdk();
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'dumpsys', 'battery'
    ]);

    const output = result.stdout;
    
    const levelMatch = output.match(/level:\s*(\d+)/);
    const statusMatch = output.match(/status:\s*(\d+)/);
    const pluggedMatch = output.match(/plugged:\s*(\d+)/);
    const tempMatch = output.match(/temperature:\s*(\d+)/);

    const statusMap: { [key: number]: BatteryStatus } = {
      1: 'unknown',
      2: 'charging',
      3: 'discharging',
      4: 'not-charging',
      5: 'full',
    };

    const pluggedMap: { [key: number]: 'ac' | 'usb' | 'wireless' | 'none' } = {
      0: 'none',
      1: 'ac',
      2: 'usb',
      4: 'wireless',
    };

    return {
      level: levelMatch ? parseInt(levelMatch[1], 10) : 0,
      status: statusMap[parseInt(statusMatch?.[1] || '1', 10)] || 'unknown',
      plugged: pluggedMap[parseInt(pluggedMatch?.[1] || '0', 10)] || 'none',
      temperature: tempMatch ? parseInt(tempMatch[1], 10) / 10 : 0,
    };
  }

  /**
   * Get memory information
   */
  async getMemoryInfo(deviceId: string): Promise<MemoryInfo> {
    const sdk = detectSdk();
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'cat', '/proc/meminfo'
    ]);

    const totalMatch = result.stdout.match(/MemTotal:\s*(\d+)/);
    const availMatch = result.stdout.match(/MemAvailable:\s*(\d+)/);

    const totalKb = totalMatch ? parseInt(totalMatch[1], 10) : 0;
    const availKb = availMatch ? parseInt(availMatch[1], 10) : 0;
    const totalMb = Math.round(totalKb / 1024);
    const availableMb = Math.round(availKb / 1024);

    return {
      totalMb,
      availableMb,
      usedPercent: totalMb > 0 ? Math.round(((totalMb - availableMb) / totalMb) * 100) : 0,
    };
  }

  /**
   * Get storage information
   */
  async getStorageInfo(deviceId: string): Promise<StorageInfo> {
    const sdk = detectSdk();
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'df', '/data'
    ]);

    const lines = result.stdout.split('\n');
    if (lines.length < 2) {
      return { totalGb: 0, usedGb: 0, availableGb: 0 };
    }

    const parts = lines[1].split(/\s+/);
    // Format: Filesystem Size Used Available Use% Mounted
    const totalKb = parseInt(parts[1], 10) || 0;
    const usedKb = parseInt(parts[2], 10) || 0;
    const availKb = parseInt(parts[3], 10) || 0;

    return {
      totalGb: Math.round(totalKb / 1024 / 1024 * 10) / 10,
      usedGb: Math.round(usedKb / 1024 / 1024 * 10) / 10,
      availableGb: Math.round(availKb / 1024 / 1024 * 10) / 10,
    };
  }

  /**
   * Install APK on device
   */
  async installApk(deviceId: string, apkPath: string): Promise<ServiceResult> {
    const sdk = detectSdk();

    if (!fs.existsSync(apkPath)) {
      return { success: false, message: `APK file not found: ${apkPath}` };
    }

    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'install', '-r', apkPath
    ], { timeout: 120_000 });

    if (result.exitCode !== 0 || result.stdout.includes('Failure')) {
      return { success: false, message: `Install failed: ${result.stderr || result.stdout}` };
    }

    return { success: true, message: `APK installed successfully` };
  }

  /**
   * Uninstall app by package name
   */
  async uninstallApp(deviceId: string, packageName: string): Promise<ServiceResult> {
    const sdk = detectSdk();

    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'uninstall', packageName
    ]);

    if (result.exitCode !== 0) {
      return { success: false, message: `Uninstall failed: ${result.stderr}` };
    }

    return { success: true, message: `${packageName} uninstalled` };
  }

  /**
   * Force stop an app
   */
  async forceStopApp(deviceId: string, packageName: string): Promise<ServiceResult> {
    const sdk = detectSdk();

    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'am', 'force-stop', packageName
    ]);

    if (result.exitCode !== 0) {
      return { success: false, message: `Force stop failed: ${result.stderr}` };
    }

    return { success: true, message: `${packageName} stopped` };
  }

  /**
   * Start an app using monkey
   */
  async startApp(deviceId: string, packageName: string): Promise<ServiceResult> {
    const sdk = detectSdk();

    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'monkey',
      '-p', packageName,
      '-c', 'android.intent.category.LAUNCHER', '1'
    ]);

    if (result.exitCode !== 0 || result.stdout.includes('No activities')) {
      return { success: false, message: `Failed to start app: ${result.stderr || result.stdout}` };
    }

    return { success: true, message: `${packageName} started` };
  }

  /**
   * Restart an app (force stop + start)
   */
  async restartApp(deviceId: string, packageName: string): Promise<ServiceResult> {
    await this.forceStopApp(deviceId, packageName);
    await new Promise(r => setTimeout(r, 500));
    return this.startApp(deviceId, packageName);
  }

  /**
   * List installed packages
   */
  async listPackages(deviceId: string, includeSystem = false): Promise<string[]> {
    const sdk = detectSdk();
    const args = ['-s', deviceId, 'shell', 'pm', 'list', 'packages'];
    
    if (!includeSystem) {
      args.push('-3'); // Third-party only
    }

    const result = await execCommand(sdk.adb, args);
    
    return result.stdout
      .split('\n')
      .filter(line => line.startsWith('package:'))
      .map(line => line.replace('package:', '').trim());
  }

  /**
   * Start screen recording
   */
  async startScreenRecording(deviceId: string): Promise<ServiceResult<RecordingSession>> {
    if (this.activeRecordings.has(deviceId)) {
      return { 
        success: false, 
        message: 'Recording already in progress for this device' 
      };
    }

    const sdk = detectSdk();
    const timestamp = Date.now();
    const remotePath = `/sdcard/recording-${timestamp}.mp4`;

    // Start recording in background (max 180 seconds)
    const { process } = spawnProcess(sdk.adb, [
      '-s', deviceId, 'shell', 'screenrecord',
      '--time-limit', '180',
      remotePath
    ]);

    const session: RecordingSession = {
      deviceId,
      remotePath,
      startTime: timestamp,
      process,
    };

    this.activeRecordings.set(deviceId, session);

    return { 
      success: true, 
      message: 'Recording started',
      data: session,
    };
  }

  /**
   * Stop screen recording and pull the file
   */
  async stopScreenRecording(deviceId: string): Promise<ServiceResult<string>> {
    const session = this.activeRecordings.get(deviceId);
    
    if (!session) {
      return { success: false, message: 'No active recording for this device' };
    }

    const sdk = detectSdk();

    // Kill the screenrecord process
    await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'pkill', '-l', 'SIGINT', 'screenrecord'
    ]);

    // Wait for file to finalize
    await new Promise(r => setTimeout(r, 2000));

    // Determine save location
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const baseDir = workspaceFolder?.uri.fsPath || require('os').homedir();
    const recordingsDir = path.join(baseDir, 'recordings');

    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    const filename = `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
    const localPath = path.join(recordingsDir, filename);

    // Pull the file
    const pullResult = await execCommand(sdk.adb, [
      '-s', deviceId, 'pull', session.remotePath, localPath
    ]);

    // Clean up remote file
    await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'rm', session.remotePath]);

    this.activeRecordings.delete(deviceId);

    if (pullResult.exitCode !== 0) {
      return { success: false, message: `Failed to save recording: ${pullResult.stderr}` };
    }

    return { 
      success: true, 
      message: `Recording saved to ${filename}`,
      data: localPath,
    };
  }

  /**
   * Check if recording is in progress
   */
  isRecording(deviceId: string): boolean {
    return this.activeRecordings.has(deviceId);
  }

  /**
   * Set GPS location on emulator
   */
  async setLocation(deviceId: string, latitude: number, longitude: number): Promise<ServiceResult> {
    const sdk = detectSdk();

    // Use geo fix command (longitude first!)
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'emu', 'geo', 'fix',
      longitude.toString(), latitude.toString()
    ]);

    if (result.exitCode !== 0) {
      return { success: false, message: `Failed to set location: ${result.stderr}` };
    }

    return { 
      success: true, 
      message: `Location set to ${latitude}, ${longitude}` 
    };
  }

  /**
   * Set battery level (emulator only)
   */
  async setBatteryLevel(deviceId: string, level: number): Promise<ServiceResult> {
    const sdk = detectSdk();
    const clampedLevel = Math.max(0, Math.min(100, level));

    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'emu', 'power', 'capacity', clampedLevel.toString()
    ]);

    if (result.exitCode !== 0) {
      return { success: false, message: `Failed to set battery: ${result.stderr}` };
    }

    return { success: true, message: `Battery set to ${clampedLevel}%` };
  }

  /**
   * Set battery status
   * 1=unknown, 2=charging, 3=discharging, 4=not charging, 5=full
   */
  async setBatteryStatus(deviceId: string, status: 'charging' | 'discharging' | 'not-charging' | 'full'): Promise<ServiceResult> {
    const sdk = detectSdk();
    
    let statusVal = '1';
    switch (status) {
      case 'charging': statusVal = '2'; break;
      case 'discharging': statusVal = '3'; break;
      case 'not-charging': statusVal = '4'; break;
      case 'full': statusVal = '5'; break;
    }

    // Try dumpsys first (works on devices too)
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'dumpsys', 'battery', 'set', 'status', statusVal
    ]);

    if (result.exitCode === 0) {
      return { success: true, message: `Battery status set to ${status}` };
    } else {
      return { success: false, message: `Failed to set battery status: ${result.stderr}` };
    }
  }

  /**
   * Reset battery to system default
   */
  async resetBattery(deviceId: string): Promise<ServiceResult> {
    const sdk = detectSdk();
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'dumpsys', 'battery', 'reset'
    ]);
    return { success: result.exitCode === 0, message: result.exitCode === 0 ? 'Battery reset' : 'Failed to reset' };
  }
}

// Export singleton instance
export const AdbService = new AdbServiceClass();
