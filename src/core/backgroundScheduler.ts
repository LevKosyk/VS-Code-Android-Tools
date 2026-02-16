type TaskFn = () => Promise<void>;

interface TaskState {
  id: string;
  intervalMs: number;
  fn: TaskFn;
  timer?: NodeJS.Timeout;
  running: boolean;
  queued: boolean;
}

export class BackgroundScheduler {
  private readonly tasks = new Map<string, TaskState>();

  register(id: string, intervalMs: number, fn: TaskFn): void {
    const existing = this.tasks.get(id);
    if (existing) {
      this.stop(id);
    }
    this.tasks.set(id, {
      id,
      intervalMs: Math.max(500, intervalMs),
      fn,
      running: false,
      queued: false,
    });
  }

  start(id: string): void {
    const task = this.tasks.get(id);
    if (!task || task.timer) {
      return;
    }
    task.timer = setInterval(() => {
      void this.tick(id);
    }, task.intervalMs);
  }

  async runNow(id: string): Promise<void> {
    await this.tick(id);
  }

  stop(id: string): void {
    const task = this.tasks.get(id);
    if (!task) {
      return;
    }
    if (task.timer) {
      clearInterval(task.timer);
      task.timer = undefined;
    }
    task.running = false;
    task.queued = false;
  }

  stopAll(): void {
    for (const id of this.tasks.keys()) {
      this.stop(id);
    }
  }

  private async tick(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) {
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
      if (task.queued) {
        task.queued = false;
        setTimeout(() => {
          void this.tick(id);
        }, 100);
      }
    }
  }
}
