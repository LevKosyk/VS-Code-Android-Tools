type ScopeState = {
  currentId: number;
  cancelledIds: Set<number>;
};

export class OperationManager {
  private scopes = new Map<string, ScopeState>();

  start(scope: string): number {
    const state = this.getScope(scope);
    state.currentId += 1;
    return state.currentId;
  }

  cancel(scope: string): void {
    const state = this.getScope(scope);
    state.cancelledIds.add(state.currentId);
  }

  isCancelled(scope: string, id: number): boolean {
    const state = this.getScope(scope);
    return state.cancelledIds.has(id);
  }

  finish(scope: string, id: number): void {
    const state = this.getScope(scope);
    state.cancelledIds.delete(id);
  }

  private getScope(scope: string): ScopeState {
    const existing = this.scopes.get(scope);
    if (existing) {
      return existing;
    }
    const next: ScopeState = { currentId: 0, cancelledIds: new Set<number>() };
    this.scopes.set(scope, next);
    return next;
  }
}

export const operationManager = new OperationManager();
