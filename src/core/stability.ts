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
  return {
    code: 'EUNKNOWN',
    reason: `${actionName} failed`,
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
  const parts = [`Code: ${issue.code}`, `Reason: ${issue.reason}`, `Action: ${issue.action}`];
  if (issue.details) {
    parts.push(`Details: ${issue.details}`);
  }
  return parts.join('\n');
}
