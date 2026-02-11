import * as path from 'path';
import { execCommand } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';
import { DeviceFileItem } from './types';

function parseLsLine(line: string): DeviceFileItem | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('total')) {
    return undefined;
  }
  const typeChar = trimmed[0];
  if (typeChar !== 'd' && typeChar !== '-' && typeChar !== 'l') {
    return undefined;
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length < 8) {
    return undefined;
  }
  const size = parseInt(parts[4], 10);
  const name = parts.slice(7).join(' ');
  if (!name || name === '.' || name === '..') {
    return undefined;
  }
  return {
    name,
    path: name,
    isDirectory: typeChar === 'd',
    size: Number.isNaN(size) ? undefined : size,
  };
}

export async function listDevicePath(deviceId: string, remotePath: string): Promise<DeviceFileItem[]> {
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'ls', '-la', remotePath]);
  if (result.exitCode !== 0) {
    return [];
  }
  const items: DeviceFileItem[] = [];
  for (const line of result.stdout.split('\n')) {
    const parsed = parseLsLine(line);
    if (parsed) {
      parsed.path = path.posix.join(remotePath, parsed.name);
      items.push(parsed);
    }
  }
  return items.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export async function pullDeviceFile(deviceId: string, remotePath: string, localPath: string): Promise<boolean> {
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['-s', deviceId, 'pull', remotePath, localPath], { timeout: 120_000 });
  return result.exitCode === 0;
}

export async function pushDeviceFile(deviceId: string, localPath: string, remotePath: string): Promise<boolean> {
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['-s', deviceId, 'push', localPath, remotePath], { timeout: 120_000 });
  return result.exitCode === 0;
}

export async function deleteDevicePath(deviceId: string, remotePath: string): Promise<boolean> {
  const sdk = detectSdk();
  const result = await execCommand(sdk.adb, ['-s', deviceId, 'shell', 'rm', '-rf', remotePath]);
  return result.exitCode === 0;
}
