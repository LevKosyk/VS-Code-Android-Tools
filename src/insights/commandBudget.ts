export interface CommandLatencyRecord {
  commandId: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
}

export interface CommandBudgetSummaryItem {
  commandId: string;
  sloMs: number;
  p50Ms: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  samples: number;
  breaches: number;
  breachRatePct: number;
}

export interface CommandSloViolation {
  commandId: string;
  reason: string;
  sloMs: number;
  p95Ms: number;
  p99Ms: number;
  breaches: number;
  samples: number;
}

export const COMMAND_SLO_MS: Record<string, number> = {
  'android-toolkit.openRunPanel': 500,
  'android-toolkit.runSelectedAlias': 90_000,
  'android-toolkit.runAppOnTargetSelected': 90_000,
  'android-toolkit.runAppOnEmulator': 90_000,
  'android-toolkit.runAppOnDevice': 90_000,
  'android-toolkit.gradleSync': 20_000,
  'android-toolkit.runLaunchProfile': 120_000,
  'android-toolkit.analyzeApk': 4_000,
  'android-toolkit.compareApk': 4_000,
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
    const p50Ms = percentile(values, 50);
    const p95Ms = percentile(values, 95);
    const p99Ms = percentile(values, 99);
    const breaches = rows.filter(r => r.durationMs > sloMs).length;
    const breachRatePct = rows.length === 0 ? 0 : Math.round((breaches / rows.length) * 100);
    out.push({ commandId, sloMs, p50Ms, medianMs: p50Ms, p95Ms, p99Ms, samples: rows.length, breaches, breachRatePct });
  }
  return out;
}

export function enforceCommandSloBudgets(
  summary: CommandBudgetSummaryItem[],
  options?: { maxBreachRatePct?: number; maxP99OverSloFactor?: number; minSamples?: number }
): CommandSloViolation[] {
  const maxBreachRatePct = Math.max(0, options?.maxBreachRatePct ?? 15);
  const maxP99OverSloFactor = Math.max(1, options?.maxP99OverSloFactor ?? 1.35);
  const minSamples = Math.max(1, options?.minSamples ?? 8);
  const violations: CommandSloViolation[] = [];
  for (const row of summary) {
    if (row.samples < minSamples) {
      continue;
    }
    if (row.breachRatePct > maxBreachRatePct) {
      violations.push({
        commandId: row.commandId,
        reason: `breach rate ${row.breachRatePct}% > ${maxBreachRatePct}%`,
        sloMs: row.sloMs,
        p95Ms: row.p95Ms,
        p99Ms: row.p99Ms,
        breaches: row.breaches,
        samples: row.samples,
      });
      continue;
    }
    const p99Limit = Math.round(row.sloMs * maxP99OverSloFactor);
    if (row.p99Ms > p99Limit) {
      violations.push({
        commandId: row.commandId,
        reason: `p99 ${row.p99Ms}ms > ${p99Limit}ms (${maxP99OverSloFactor}x slo)`,
        sloMs: row.sloMs,
        p95Ms: row.p95Ms,
        p99Ms: row.p99Ms,
        breaches: row.breaches,
        samples: row.samples,
      });
    }
  }
  return violations;
}
