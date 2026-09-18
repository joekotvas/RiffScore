import type { InteractionConfig } from '@/types';

/** View state, deliberately separate from the musical score and its undo history.
 * API patches override config props until reset; reads are synchronous. */
export class InteractionConfigStore {
  private base: InteractionConfig;
  private overrides: Partial<InteractionConfig> = {};
  private snapshot: InteractionConfig;
  private listeners = new Set<() => void>();

  constructor(base: InteractionConfig) {
    this.base = { ...base };
    this.snapshot = Object.freeze({ ...base });
  }
  getSnapshot = (): InteractionConfig => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setBase(base: InteractionConfig): void {
    this.base = { ...base };
    this.publish();
  }
  update(patch: Partial<InteractionConfig>): void {
    this.overrides = { ...this.overrides, ...patch };
    this.publish();
  }
  reset(): void {
    this.overrides = {};
    this.publish();
  }
  private publish(): void {
    const next = { ...this.base, ...this.overrides };
    if (
      Object.keys(next).every(
        (key) =>
          next[key as keyof InteractionConfig] === this.snapshot[key as keyof InteractionConfig]
      )
    )
      return;
    this.snapshot = Object.freeze(next);
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('[RiffScore] Interaction subscriber failed:', error);
      }
    });
  }
}
