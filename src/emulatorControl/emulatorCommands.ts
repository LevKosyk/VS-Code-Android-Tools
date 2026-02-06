/**
 * Emulator Control Commands
 * CLI-powered emulator control actions
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execCommand, spawnProcess } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { EmulatorError } from '../core/errors';
import { listRunningEmulators } from '../devices/deviceManager';
import { ActionResult, ScreenOrientation, NetworkStatus } from './types';

/**
 * Rotate emulator screen 90° clockwise
 */
export async function rotateScreen(deviceId: string): Promise<ActionResult> {
  const sdk = detectSdk();

  try {
    // Get current orientation
    const orientResult = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 
      'settings', 'get', 'system', 'user_rotation'
    ]);

    let currentOrientation = parseInt(orientResult.stdout, 10) || 0;
    
    // Rotate 90° clockwise (0 -> 1 -> 2 -> 3 -> 0)
    const newOrientation = ((currentOrientation + 1) % 4) as ScreenOrientation;

    // Disable auto-rotate first
    await execCommand(sdk.adb, [
      '-s', deviceId, 'shell',
      'settings', 'put', 'system', 'accelerometer_rotation', '0'
    ]);

    // Set new orientation
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell',
      'settings', 'put', 'system', 'user_rotation', String(newOrientation)
    ]);

    if (result.exitCode !== 0) {
      return {
        success: false,
        message: `Failed to rotate screen: ${result.stderr}`,
      };
    }

    const orientationNames = ['Portrait', 'Landscape', 'Reverse Portrait', 'Reverse Landscape'];
    return {
      success: true,
      message: `Screen rotated to ${orientationNames[newOrientation]}`,
      data: { orientation: newOrientation },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to rotate screen',
    };
  }
}

/**
 * Capture screenshot and save to workspace
 */
export async function takeScreenshot(deviceId: string): Promise<ActionResult> {
  const sdk = detectSdk();

  // Determine save location
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const baseDir = workspaceFolder?.uri.fsPath || require('os').homedir();
  const screenshotsDir = path.join(baseDir, 'screenshots');

  // Create screenshots directory if needed
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screenshot-${timestamp}.png`;
  const localPath = path.join(screenshotsDir, filename);
  const remotePath = `/sdcard/${filename}`;

  try {
    // Capture on device
    const captureResult = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'screencap', '-p', remotePath
    ]);

    if (captureResult.exitCode !== 0) {
      return {
        success: false,
        message: `Failed to capture screenshot: ${captureResult.stderr}`,
      };
    }

    // Pull to local
    const pullResult = await execCommand(sdk.adb, [
      '-s', deviceId, 'pull', remotePath, localPath
    ]);

    if (pullResult.exitCode !== 0) {
      return {
        success: false,
        message: `Failed to save screenshot: ${pullResult.stderr}`,
      };
    }

    // Clean up remote file
    await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'rm', remotePath]);

    return {
      success: true,
      message: `Screenshot saved to ${filename}`,
      data: { path: localPath },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to take screenshot',
    };
  }
}

/**
 * Cold boot emulator (full restart)
 */
export async function coldBoot(deviceId: string, avdName: string): Promise<ActionResult> {
  const sdk = detectSdk();

  try {
    // Kill current emulator
    await execCommand(sdk.adb, ['-s', deviceId, 'emu', 'kill']);

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start with cold boot flag
    spawnProcess(sdk.emulator, [
      '-avd', avdName,
      '-no-snapshot-load', // Cold boot - don't load snapshot
    ]);

    return {
      success: true,
      message: `Cold booting ${avdName}...`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to cold boot',
    };
  }
}

/**
 * Warm boot emulator (restart with snapshot)
 */
export async function warmBoot(deviceId: string, avdName: string): Promise<ActionResult> {
  const sdk = detectSdk();

  try {
    // Kill current emulator
    await execCommand(sdk.adb, ['-s', deviceId, 'emu', 'kill']);

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start normally (will load last snapshot)
    spawnProcess(sdk.emulator, [
      '-avd', avdName,
    ]);

    return {
      success: true,
      message: `Warm booting ${avdName}...`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to warm boot',
    };
  }
}

/**
 * Wipe emulator data (factory reset)
 */
export async function wipeData(deviceId: string, avdName: string): Promise<ActionResult> {
  const sdk = detectSdk();

  try {
    // Kill current emulator
    await execCommand(sdk.adb, ['-s', deviceId, 'emu', 'kill']);

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start with wipe-data flag
    spawnProcess(sdk.emulator, [
      '-avd', avdName,
      '-wipe-data',
    ]);

    return {
      success: true,
      message: `Wiping data and restarting ${avdName}...`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to wipe data',
    };
  }
}

/**
 * Enable emulator network
 */
export async function enableNetwork(deviceId: string): Promise<ActionResult> {
  const sdk = detectSdk();

  try {
    // Enable WiFi
    await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'svc', 'wifi', 'enable'
    ]);

    // Enable mobile data
    await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'svc', 'data', 'enable'
    ]);

    return {
      success: true,
      message: 'Network enabled',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to enable network',
    };
  }
}

/**
 * Disable emulator network
 */
export async function disableNetwork(deviceId: string): Promise<ActionResult> {
  const sdk = detectSdk();

  try {
    // Disable WiFi
    await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'svc', 'wifi', 'disable'
    ]);

    // Disable mobile data
    await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'svc', 'data', 'disable'
    ]);

    return {
      success: true,
      message: 'Network disabled',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to disable network',
    };
  }
}

/**
 * Get current network status
 */
export async function getNetworkStatus(deviceId: string): Promise<NetworkStatus> {
  const sdk = detectSdk();

  try {
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'dumpsys', 'connectivity'
    ]);

    if (result.stdout.includes('CONNECTED')) {
      return 'enabled';
    } else if (result.stdout.includes('DISCONNECTED')) {
      return 'disabled';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Toggle network (enable if disabled, disable if enabled)
 */
export async function toggleNetwork(deviceId: string): Promise<ActionResult> {
  const status = await getNetworkStatus(deviceId);

  if (status === 'enabled') {
    return disableNetwork(deviceId);
  } else {
    return enableNetwork(deviceId);
  }
}

/**
 * Get AVD name for a running emulator
 */
export async function getAvdNameForDevice(deviceId: string): Promise<string | undefined> {
  const sdk = detectSdk();

  try {
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'emu', 'avd', 'name'
    ]);

    if (result.exitCode === 0) {
      return result.stdout.split('\n')[0].trim();
    }
  } catch {
    // Ignore errors
  }

  return undefined;
}
