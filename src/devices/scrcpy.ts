import * as fs from 'fs';
import * as path from 'path';
import { execCommand, spawnProcess } from '../core/cli';

export function configuredScrcpyPath(configuredPath?: string): string {
  const value = configuredPath?.trim();
  return value || 'scrcpy';
}

export async function isScrcpyAvailable(command: string): Promise<boolean> {
  if ((path.isAbsolute(command) || command.includes(path.sep)) && !fs.existsSync(command)) return false;
  const result = await execCommand(command, ['--version'], { timeout: 5000 });
  return result.exitCode === 0 && /scrcpy/i.test(`${result.stdout}\n${result.stderr}`);
}

export function launchScrcpy(command: string, deviceId: string): void {
  spawnProcess(command, ['--serial', deviceId]);
}
