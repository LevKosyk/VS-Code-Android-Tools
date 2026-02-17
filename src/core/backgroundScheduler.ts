type TaskFn = () => Promise<void>;
type ShouldRunFn = () => boolean;

interface TaskState {
  id: string;
  intervalMs: number;
  fn: TaskFn;
  shouldRun?: ShouldRunFn;
  nextRunAt: number;
  running: boolean;
  queued: boolean;
  enabled: boolean;
}

export class BackgroundScheduler {
  private readonly tasks = new Map<string, TaskState>();
  private ticker: NodeJS.Timeout | undefined;
  private readonly tickMs: number;

  constructor(tickMs = 400) {
    this.tickMs = Math.max(200, tickMs);
  }

  register(id: string, intervalMs: number, fn: TaskFn, options?: { shouldRun?: ShouldRunFn }): void {
    const existing = this.tasks.get(id);
    if (existing) {
      this.stop(id);
    }
    this.tasks.set(id, {
      id,
      intervalMs: Math.max(500, intervalMs),
      fn,
      shouldRun: options?.shouldRun,
      nextRunAt: Date.now() + Math.max(500, intervalMs),
      running: false,
      queued: false,
      enabled: false,
    });
  }

  start(id: string): void {
    const task = this.tasks.get(id);
    if (!task) {
      return;
    }
    task.enabled = true;
    this.ensureTicker();
  }

  async runNow(id: string): Promise<void> {
    await this.tick(id);
  }

  stop(id: string): void {
    const task = this.tasks.get(id);
    if (!task) {
      return;
    }
    task.enabled = false;
    task.running = false;
    task.queued = false;
    this.maybeStopTicker();
  }

  stopAll(): void {
    for (const id of this.tasks.keys()) {
      this.stop(id);
    }
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }

  private async tick(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) {
      return;
    }
    if (!task.enabled) {
      return;
    }
    if (task.shouldRun && !task.shouldRun()) {
      task.nextRunAt = Date.now() + task.intervalMs;
      return;
    }
    if (task.running) {
      task.queued = true;
      return;
    }
    task.running = true;
    try {
      await task.fn();
    } finally {
      task.running = false;
      task.nextRunAt = Date.now() + task.intervalMs;
      if (task.queued) {
        task.queued = false;
        setTimeout(() => {
          void this.tick(id);
        }, 100);
      }
    }
  }

  private ensureTicker(): void {
    if (this.ticker) {
      return;
    }
    this.ticker = setInterval(() => {
      const now = Date.now();
      for (const task of this.tasks.values()) {
        if (!task.enabled || task.running) {
          continue;
        }
        if (task.nextRunAt <= now) {
          void this.tick(task.id);
        }
      }
    }, this.tickMs);
  }

  private maybeStopTicker(): void {
    if (!this.ticker) {
      return;
    }
    const hasEnabled = Array.from(this.tasks.values()).some(t => t.enabled);
    if (hasEnabled) {
      return;
    }
    clearInterval(this.ticker);
    this.ticker = undefined;
  }
}
