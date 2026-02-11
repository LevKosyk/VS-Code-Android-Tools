import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execCommand, spawnProcess } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { EmulatorError } from '../core/errors';
import { listRunningEmulators } from '../devices/deviceManager';
import { ActionResult, ScreenOrientation, NetworkStatus } from './types';
export async function rotateScreen(deviceId: string): Promise<ActionResult> {
  const sdk = detectSdk();
  try {
    const orientResult = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 
      'settings', 'get', 'system', 'user_rotation'
    ]);
    let currentOrientation = parseInt(orientResult.stdout, 10) || 0;
    const newOrientation = ((currentOrientation + 1) % 4) as ScreenOrientation;
    await execCommand(sdk.adb, [
      '-s', deviceId, 'shell',
      'settings', 'put', 'system', 'accelerometer_rotation', '0'
    ]);
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
export async function takeScreenshot(deviceId: string): Promise<ActionResult> {
  const sdk = detectSdk();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const baseDir = workspaceFolder?.uri.fsPath || require('os').homedir();
  const screenshotsDir = path.join(baseDir, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screenshot-${timestamp}.png`;
  const localPath = path.join(screenshotsDir, filename);
  const remotePath = `/sdcard/${filename}`;
  try {
    const captureResult = await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'screencap', '-p', remotePath
    ]);
    if (captureResult.exitCode !== 0) {
      return {
        success: false,
        message: `Failed to capture screenshot: ${captureResult.stderr}`,
      };
    }
    const pullResult = await execCommand(sdk.adb, [
      '-s', deviceId, 'pull', remotePath, localPath
    ]);
    if (pullResult.exitCode !== 0) {
      return {
        success: false,
        message: `Failed to save screenshot: ${pullResult.stderr}`,
      };
    }
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
export async function coldBoot(deviceId: string, avdName: string): Promise<ActionResult> {
  const sdk = detectSdk();
  try {
    await execCommand(sdk.adb, ['-s', deviceId, 'emu', 'kill']);
    await new Promise(resolve => setTimeout(resolve, 2000));
    spawnProcess(sdk.emulator, [
      '-avd', avdName,
      '-no-snapshot-load', 
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
export async function warmBoot(deviceId: string, avdName: string): Promise<ActionResult> {
  const sdk = detectSdk();
  try {
    await execCommand(sdk.adb, ['-s', deviceId, 'emu', 'kill']);
    await new Promise(resolve => setTimeout(resolve, 2000));
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
export async function wipeData(deviceId: string, avdName: string): Promise<ActionResult> {
  const sdk = detectSdk();
  try {
    await execCommand(sdk.adb, ['-s', deviceId, 'emu', 'kill']);
    await new Promise(resolve => setTimeout(resolve, 2000));
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
export async function enableNetwork(deviceId: string): Promise<ActionResult> {
  const sdk = detectSdk();
  try {
    await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'svc', 'wifi', 'enable'
    ]);
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
export async function disableNetwork(deviceId: string): Promise<ActionResult> {
  const sdk = detectSdk();
  try {
    await execCommand(sdk.adb, [
      '-s', deviceId, 'shell', 'svc', 'wifi', 'disable'
    ]);
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
export async function toggleNetwork(deviceId: string): Promise<ActionResult> {
  const status = await getNetworkStatus(deviceId);
  if (status === 'enabled') {
    return disableNetwork(deviceId);
  } else {
    return enableNetwork(deviceId);
  }
}
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
  }
  return undefined;
}

export async function listSnapshots(deviceId: string): Promise<string[]> {
  const sdk = detectSdk();
  try {
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'emu', 'avd', 'snapshot', 'list'
    ]);
    if (result.exitCode !== 0) {
      return [];
    }
    return result.stdout
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.toLowerCase().includes('snapshot'));
  } catch {
    return [];
  }
}

export async function saveSnapshot(deviceId: string, name: string): Promise<ActionResult> {
  const sdk = detectSdk();
  try {
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'emu', 'avd', 'snapshot', 'save', name
    ]);
    if (result.exitCode !== 0) {
      return { success: false, message: result.stderr || 'Failed to save snapshot' };
    }
    return { success: true, message: `Snapshot saved: ${name}` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Failed to save snapshot' };
  }
}

export async function loadSnapshot(deviceId: string, name: string): Promise<ActionResult> {
  const sdk = detectSdk();
  try {
    const result = await execCommand(sdk.adb, [
      '-s', deviceId, 'emu', 'avd', 'snapshot', 'load', name
    ]);
    if (result.exitCode !== 0) {
      return { success: false, message: result.stderr || 'Failed to load snapshot' };
    }
    return { success: true, message: `Snapshot loaded: ${name}` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Failed to load snapshot' };
  }
}
