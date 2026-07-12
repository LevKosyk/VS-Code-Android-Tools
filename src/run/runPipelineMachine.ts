export type RunPipelineState =
  | 'idle'
  | 'preflight'
  | 'build'
  | 'install'
  | 'launch'
  | 'verify'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

const ORDER: RunPipelineState[] = ['idle', 'preflight', 'build', 'install', 'launch', 'verify', 'succeeded'];

export interface RunPipelineTransition {
  from: RunPipelineState;
  to: RunPipelineState;
  at: number;
}

export class RunPipelineMachine {
  private current: RunPipelineState = 'idle';
  private readonly history: RunPipelineTransition[] = [];

  get state(): RunPipelineState { return this.current; }
  get transitions(): readonly RunPipelineTransition[] { return this.history; }

  transition(next: RunPipelineState): void {
    if (this.current === 'failed' || this.current === 'cancelled' || this.current === 'succeeded') {
      throw new Error(`Run Pipeline is terminal (${this.current}); cannot transition to ${next}.`);
    }
    const terminalFailure = next === 'failed' || next === 'cancelled';
    const currentIndex = ORDER.indexOf(this.current);
    const nextIndex = ORDER.indexOf(next);
    if (!terminalFailure && (nextIndex < 0 || nextIndex <= currentIndex)) {
      throw new Error(`Invalid Run Pipeline transition: ${this.current} -> ${next}.`);
    }
    this.history.push({ from: this.current, to: next, at: Date.now() });
    this.current = next;
  }

  fail(): void {
    if (this.current !== 'failed' && this.current !== 'cancelled' && this.current !== 'succeeded') {
      this.transition('failed');
    }
  }

  cancel(): void {
    if (this.current !== 'failed' && this.current !== 'cancelled' && this.current !== 'succeeded') {
      this.transition('cancelled');
    }
  }
}
