import { execCommand } from '../core/cli';
import { detectSdk } from '../core/sdkDetector';

export interface AppProcessResult {
  pid?: number;
  attempts: number;
  error?: string;
}

export function parseAppPid(output: string): number | undefined {
  const token = output.trim().split(/\s+/).find(Boolean);
  if (!token) {
    return undefined;
  }
  const pid = Number(token);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

export async function waitForAppPid(
  deviceId: string,
  packageName: string,
  options: { attempts?: number; intervalMs?: number; shouldCancel?: () => boolean } = {}
): Promise<AppProcessResult> {
  const attempts = Math.max(1, options.attempts ?? 8);
  const intervalMs = Math.max(0, options.intervalMs ?? 350);
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.shouldCancel?.()) {
      return { attempts: attempt - 1, error: 'Cancelled while waiting for app process.' };
    }
    try {
      const sdk = detectSdk();
      const result = await execCommand(
        sdk.adb,
        ['-s', deviceId, 'shell', 'pidof', packageName],
        { timeout: 5000 }
      );
      const pid = result.exitCode === 0 ? parseAppPid(result.stdout) : undefined;
      if (pid) {
        return { pid, attempts: attempt };
      }
      lastError = result.stderr || `Process ${packageName} is not running yet.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Failed to query app process.';
    }
    if (attempt < attempts && intervalMs > 0) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  return { attempts, error: lastError || `Process ${packageName} was not found.` };
}
