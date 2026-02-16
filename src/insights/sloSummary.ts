import { CommandBudgetSummaryItem } from './commandBudget';

export interface RunActionMetric {
  action: string;
  success: boolean;
  durationMs: number;
  timestamp: number;
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt?: number;
  hadFailure: boolean;
  unexpectedTermination?: boolean;
}

export interface SloSummary {
  runSuccessRate: number;
  medianBuildMs: number;
  medianInstallMs: number;
  crashFreeSessionRate: number;
  totalSessions: number;
  totalActions: number;
  commandBudgets: CommandBudgetSummaryItem[];
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function summarizeSlo(
  metrics: RunActionMetric[],
  sessions: SessionRecord[],
  commandBudgets: CommandBudgetSummaryItem[] = []
): SloSummary {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const threshold = Date.now() - weekMs;
  const recentMetrics = metrics.filter(m => m.timestamp >= threshold);
  const recentSessions = sessions.filter(s => s.startedAt >= threshold);

  const runRows = recentMetrics.filter(m => m.action === 'Run');
  const buildRows = recentMetrics.filter(m => m.action === 'Build');
  const installRows = recentMetrics.filter(m => m.action === 'Install');
  const runSuccessRate = runRows.length > 0
    ? Math.round((runRows.filter(r => r.success).length / runRows.length) * 1000) / 10
    : 0;
  const medianBuildMs = median(buildRows.map(r => r.durationMs));
  const medianInstallMs = median(installRows.map(r => r.durationMs));
  const crashFreeSessionRate = recentSessions.length > 0
    ? Math.round((recentSessions.filter(s => !s.hadFailure && !s.unexpectedTermination).length / recentSessions.length) * 1000) / 10
    : 0;
  return {
    runSuccessRate,
    medianBuildMs,
    medianInstallMs,
    crashFreeSessionRate,
    totalSessions: recentSessions.length,
    totalActions: recentMetrics.length,
    commandBudgets,
  };
}
