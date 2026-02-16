export interface CommandLatencyRecord {
  commandId: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
}

export interface CommandBudgetSummaryItem {
  commandId: string;
  sloMs: number;
  medianMs: number;
  p95Ms: number;
  samples: number;
  breaches: number;
}

export const COMMAND_SLO_MS: Record<string, number> = {
  'android-toolkit.openRunPanel': 500,
  'android-toolkit.runSelectedAlias': 90_000,
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function summarizeCommandBudgets(records: CommandLatencyRecord[]): CommandBudgetSummaryItem[] {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const threshold = Date.now() - weekMs;
  const recent = records.filter(r => r.timestamp >= threshold);
  const out: CommandBudgetSummaryItem[] = [];
  for (const [commandId, sloMs] of Object.entries(COMMAND_SLO_MS)) {
    const rows = recent.filter(r => r.commandId === commandId);
    const values = rows.map(r => r.durationMs);
    const medianMs = percentile(values, 50);
    const p95Ms = percentile(values, 95);
    const breaches = rows.filter(r => r.durationMs > sloMs).length;
    out.push({ commandId, sloMs, medianMs, p95Ms, samples: rows.length, breaches });
  }
  return out;
}
