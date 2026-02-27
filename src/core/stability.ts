export interface ToolkitIssue {
  code: string;
  reason: string;
  action: string;
  details?: string;
}

export interface GuardOptions {
  timeoutMs?: number;
  retries?: number;
  shouldCancel?: () => boolean;
}

export interface GuardResult<T> {
  ok: boolean;
  value?: T;
  issue?: ToolkitIssue;
}

const DEFAULT_TIMEOUT_MS = 180_000;

function timeoutIssue(actionName: string, timeoutMs: number): ToolkitIssue {
  return {
    code: 'ETIMEDOUT',
    reason: `${actionName} timed out after ${Math.round(timeoutMs / 1000)}s`,
    action: 'Retry the action. If it keeps timing out, run Gradle sync and verify device/SDK.',
  };
}
function cancelledIssue(actionName: string): ToolkitIssue {
  return {
    code: 'ECANCELLED',
    reason: `${actionName} was cancelled`,
    action: 'Retry when ready.',
  };
}

export function normalizeIssue(actionName: string, error: unknown): ToolkitIssue {
  const text = error instanceof Error ? error.message : String(error || 'Unknown error');
  const lower = text.toLowerCase();
  const buildToolsVersion = text.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
  if (/android sdk not found|sdk location not found|sdk\.dir is missing|android sdk.*not configured/.test(lower)) {
    return {
      code: 'ESDK_MISSING',
      reason: `${actionName} failed: Android SDK path is missing or invalid.`,
      action: 'Set ANDROID_SDK_ROOT (or sdk.dir in local.properties), then run Android: Gradle Doctor.',
      details: text,
    };
  }
  if (/illegalargumentexception:\s*25\.0\.1|what went wrong:\s*25\.0\.1|kotlincoreenvironment|kotlinlanguageserver/.test(lower)) {
    return {
      code: 'EJDK_RUNTIME',
      reason: `${actionName} failed: incompatible Java runtime detected (JDK 25 issue).`,
      action: 'Run Android: Use JDK 21 Path, reload VS Code window, and retry.',
      details: text,
    };
  }
  if (/build tools|build-tools/.test(lower) && buildToolsVersion) {
    return {
      code: 'EBUILD_TOOLS',
      reason: `${actionName} failed: required Android Build Tools ${buildToolsVersion} is missing.`,
      action: `Install with sdkmanager "build-tools;${buildToolsVersion}" and run Gradle sync.`,
      details: text,
    };
  }
  if (/install_failed_[a-z_]+/i.test(text)) {
    const token = text.match(/install_failed_[a-z_]+/i)?.[0]?.toUpperCase() || 'INSTALL_FAILED';
    return {
      code: 'EAPK_INSTALL',
      reason: `${actionName} failed during APK install (${token}).`,
      action: 'Uninstall existing app from device/emulator, verify signing/variant, and reinstall.',
      details: text,
    };
  }
  if (/device unauthorized|unauthorized/.test(lower)) {
    return {
      code: 'EDEVICE_AUTH',
      reason: `${actionName} failed: device is unauthorized for ADB.`,
      action: 'Accept the ADB prompt on device and run Android: Select Device.',
      details: text,
    };
  }
  if (/device offline|no devices|device not found|adb server/.test(lower)) {
    return {
      code: 'EDEVICE_OFFLINE',
      reason: `${actionName} failed: ADB cannot reach an online device.`,
      action: 'Start emulator or reconnect device, then run Android: Select Device.',
      details: text,
    };
  }
  if (/task .* not found|cannot locate tasks/.test(lower)) {
    return {
      code: 'EGRADLE_TASK',
      reason: `${actionName} failed: Gradle task/variant not found.`,
      action: 'Run Android: Select Build Variant and verify module/variant names.',
      details: text,
    };
  }
  return {
    code: 'EUNKNOWN',
    reason: `${actionName} failed: unexpected error.`,
    action: 'Open Gradle output and verify SDK/JDK/device configuration.',
    details: text,
  };
}

export async function runGuarded<T>(
  actionName: string,
  work: () => Promise<T>,
  options: GuardOptions = {}
): Promise<GuardResult<T>> {
  const retries = Math.max(0, options.retries ?? 0);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let attempt = 0;
  let lastIssue: ToolkitIssue | undefined;

  while (attempt <= retries) {
    if (options.shouldCancel?.()) {
      return { ok: false, issue: cancelledIssue(actionName) };
    }
    let timeoutId: NodeJS.Timeout | undefined;
    try {
      const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('__ANDROID_TOOLS_TIMEOUT__'));
        }, timeoutMs);
      });
      const value = await Promise.race<T>([work(), timeoutPromise]);
      return { ok: true, value };
    } catch (error) {
      const issue =
        error instanceof Error && error.message === '__ANDROID_TOOLS_TIMEOUT__'
          ? timeoutIssue(actionName, timeoutMs)
          : normalizeIssue(actionName, error);
      lastIssue = issue;
      attempt++;
      if (attempt > retries) {
        return { ok: false, issue: lastIssue };
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  return { ok: false, issue: lastIssue ?? normalizeIssue(actionName, 'Unknown failure') };
}

export function issueToMultiline(issue: ToolkitIssue): string {
  const parts = [
    `Code: ${issue.code}`,
    `What happened: ${issue.reason}`,
    `What to do: ${issue.action}`,
  ];
  if (issue.details) {
    parts.push(`Technical details: ${issue.details}`);
  }
  return parts.join('\n');
}
