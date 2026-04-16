export type SlowPathStage =
  | 'runPreflight'
  | 'installVariant'
  | 'startApp'
  | 'openRunPanel'
  | 'activateExtension'
  | 'projectModuleScan'
  | 'autoSyncRefreshFanout'
  | `command:${string}`;

export interface SlowPathRecord {
  stage: SlowPathStage;
  fingerprint?: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
}

export interface SlowPathSummaryItem {
  stage: SlowPathStage;
  samples: number;
  failures: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface SlowPathFingerprintSummaryItem {
  stage: SlowPathStage;
  fingerprint: string;
  samples: number;
  failures: number;
  medianMs: number;
  p95Ms: number;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function summarizeSlowPaths(records: SlowPathRecord[], limit = 8): SlowPathSummaryItem[] {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const threshold = Date.now() - weekMs;
  const recent = records.filter(r => r.timestamp >= threshold);
  const grouped = new Map<SlowPathStage, SlowPathRecord[]>();
  for (const row of recent) {
    const current = grouped.get(row.stage) || [];
    current.push(row);
    grouped.set(row.stage, current);
  }
  return Array.from(grouped.entries())
    .map(([stage, rows]) => {
      const durations = rows.map(r => r.durationMs);
      return {
        stage,
        samples: rows.length,
        failures: rows.filter(r => !r.success).length,
        medianMs: Math.round(percentile(durations, 50)),
        p95Ms: Math.round(percentile(durations, 95)),
        maxMs: Math.round(percentile(durations, 100)),
      };
    })
    .sort((a, b) => b.p95Ms - a.p95Ms || b.maxMs - a.maxMs || b.samples - a.samples)
    .slice(0, limit);
}

export function summarizeSlowPathFingerprints(records: SlowPathRecord[], limit = 12): SlowPathFingerprintSummaryItem[] {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const threshold = Date.now() - weekMs;
  const recent = records.filter(r => r.timestamp >= threshold);
  const grouped = new Map<string, SlowPathRecord[]>();
  for (const row of recent) {
    const fp = row.fingerprint || `${row.stage}:${row.success ? 'ok' : 'fail'}`;
    const key = `${row.stage}::${fp}`;
    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  }
  return Array.from(grouped.entries())
    .map(([key, rows]) => {
      const separator = key.indexOf('::');
      const stage = key.slice(0, separator) as SlowPathStage;
      const fingerprint = key.slice(separator + 2);
      const durations = rows.map(r => r.durationMs);
      return {
        stage,
        fingerprint,
        samples: rows.length,
        failures: rows.filter(r => !r.success).length,
        medianMs: Math.round(percentile(durations, 50)),
        p95Ms: Math.round(percentile(durations, 95)),
      };
    })
    .sort((a, b) => b.samples - a.samples || b.p95Ms - a.p95Ms || b.failures - a.failures)
    .slice(0, limit);
}
