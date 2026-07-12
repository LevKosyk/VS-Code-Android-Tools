import { CommandOptions, ExecResult, execCommand } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';

type CommandRunner = (command: string, args?: string[], options?: CommandOptions) => Promise<ExecResult>;

export async function recoverAdbDevice(
  deviceId: string,
  runner: CommandRunner = execCommand,
  adbPath?: string
): Promise<{ success: boolean; stage: 'server' | 'reconnect' | 'wait'; message: string }> {
  const adb = adbPath || detectSdk().adb;
  const server = await runner(adb, ['start-server'], { timeout: 30_000 });
  if (server.exitCode !== 0) return { success: false, stage: 'server', message: server.stderr || 'Failed to start ADB server.' };
  const reconnect = await runner(adb, ['reconnect', deviceId], { timeout: 30_000 });
  if (reconnect.exitCode !== 0 && !/unknown command/i.test(reconnect.stderr)) {
    return { success: false, stage: 'reconnect', message: reconnect.stderr || 'ADB reconnect failed.' };
  }
  const wait = await runner(adb, ['-s', deviceId, 'wait-for-device'], { timeout: 30_000 });
  return {
    success: wait.exitCode === 0,
    stage: 'wait',
    message: wait.exitCode === 0 ? `ADB device recovered: ${deviceId}` : wait.stderr || 'Device did not return online.',
  };
}
