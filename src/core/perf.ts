type OutputChannelLike = {
  appendLine: (value: string) => void;
};

let channelRef: OutputChannelLike | undefined;
const PERF_ENABLED = true;
const SLOW_THRESHOLD_MS = 300;

function getVscodeModule():
  | { window: { createOutputChannel: (name: string) => OutputChannelLike } }
  | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('vscode');
  } catch {
    return undefined;
  }
}

function channel(): OutputChannelLike | undefined {
  if (!PERF_ENABLED) {
    return undefined;
  }
  if (!channelRef) {
    const vscode = getVscodeModule();
    if (!vscode) {
      return undefined;
    }
    channelRef = vscode.window.createOutputChannel('Android Tools Perf');
  }
  return channelRef;
}

export function logPerf(label: string, durationMs: number): void {
  const out = channel();
  if (!out) {
    return;
  }
  if (durationMs < SLOW_THRESHOLD_MS) {
    return;
  }
  out.appendLine(`[${new Date().toISOString()}] ${label} ${durationMs.toFixed(1)}ms`);
}

export async function measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    logPerf(label, Date.now() - start);
  }
}
