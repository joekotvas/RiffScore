import { Score, ChordRecognitionConfig, createDefaultScore } from '@/types';
import { recognizeScoreChords } from '@/services/chord/ChordRecognition';
import { Command } from '@/commands/types';
import { BatchCommand } from '@/commands/BatchCommand';
import { BatchEventPayload } from '@/api.types';
import { logger, LogLevel } from '@/utils/debug';

type Listener = (score: Score) => void;
type BatchListener = (payload: BatchEventPayload) => void;

export class ScoreEngine {
  private state: Score;
  private listeners: Set<Listener> = new Set();
  private batchListeners: Set<BatchListener> = new Set();
  private history: Command[] = [];
  private redoStack: Command[] = [];

  private pendingBatches: BatchEventPayload[] = [];

  private mutationGuards: Array<{
    allows: (before: Score, after: Score) => boolean;
    rejected: boolean;
  }> = [];

  /** Scope validation to one synchronous UI action; other views and host API calls
   * keep their own permissions. Always unwind, including when an action throws. */
  public withMutationGuard<T>(
    allows: (before: Score, after: Score) => boolean,
    action: () => T
  ): { value: T; accepted: boolean } {
    const before = this.state;
    const history = [...this.history];
    const redo = [...this.redoStack];
    const batchCount = this.pendingBatches.length;
    const guard = { allows, rejected: false };
    this.mutationGuards.push(guard);
    try {
      const value = action();
      return { value, accepted: !guard.rejected };
    } catch (error) {
      guard.rejected = true;
      throw error;
    } finally {
      this.mutationGuards.pop();
      if (guard.rejected) {
        this.state = before;
        this.history = history;
        this.redoStack = redo;
        this.pendingBatches.length = batchCount;
      }
      if (this.mutationGuards.length === 0) {
        if (this.state !== before) this.notifyListeners();
        const batches = this.pendingBatches.splice(0);
        batches.forEach((payload) => this.notifyBatchListeners(payload));
      }
    }
  }

  private allowsMutation(next: Score): boolean {
    let allowed = true;
    for (const guard of this.mutationGuards) {
      if (guard.rejected || !guard.allows(this.state, next)) {
        guard.rejected = true;
        allowed = false;
      }
    }
    return allowed;
  }

  constructor(
    initialScore?: Score,
    private recognition?: ChordRecognitionConfig
  ) {
    this.state = recognizeScoreChords(initialScore || createDefaultScore(), recognition);
  }

  public setChordRecognition(config?: ChordRecognitionConfig): void {
    if (
      this.recognition?.enabled === config?.enabled &&
      this.recognition?.staffIndex === config?.staffIndex &&
      this.recognition?.includeBass === config?.includeBass
    )
      return;
    this.recognition = config;
    this.setState(this.state);
  }

  public getHistory(): Command[] {
    return this.history;
  }

  public getRedoStack(): Command[] {
    return this.redoStack;
  }

  public getState(): Score {
    return this.state;
  }

  /** Normalize derived musical data before evaluating an operation's final state. */
  private prepareState(candidate: Score): Score | null {
    if (!candidate || !candidate.staves) {
      logger.logValidationFailure('Attempted to set invalid state in ScoreEngine', candidate);
      return null;
    }
    const next = recognizeScoreChords(candidate, this.recognition);
    return this.allowsMutation(next) ? next : null;
  }

  private commitState(next: Score): void {
    this.state = next;
    if (this.mutationGuards.length === 0) this.notifyListeners();
  }

  public setState(newState: Score): void {
    const next = this.prepareState(newState);
    if (next) this.commitState(next);
  }

  public dispatch(command: Command, options: { addToHistory?: boolean } = {}): boolean {
    logger.logCommand(command.type, command);
    const { addToHistory = true } = options;

    try {
      const next = this.prepareState(command.execute(this.state));
      if (!next) return false;

      if (addToHistory) {
        this.history.push(command);
        this.redoStack = []; // Clear redo stack on new action
      }

      this.commitState(next);
      return true;
    } catch (error) {
      logger.log(`Error executing command ${command.type}`, error, LogLevel.ERROR);
      console.error(error);
      return false;
    }
  }

  /**
   * Commits a batch command to the history stack without executing it.
   * Assumes the state has already been updated by individual commands in the batch.
   */
  public commitBatch(batchCommand: Command) {
    if (this.mutationGuards.some((guard) => guard.rejected)) return;
    logger.log('Committing batch transaction', batchCommand);
    this.history.push(batchCommand);
    this.redoStack = [];

    // Emit batch event if it's a BatchCommand
    if (batchCommand instanceof BatchCommand) {
      const payload: BatchEventPayload = {
        type: 'batch',
        label: batchCommand.label, // commitTransaction(label) threads through to here
        timestamp: Date.now(),
        commands: batchCommand.commands.map((cmd) => ({
          type: cmd.type,
          summary: (cmd as { summary?: string }).summary, // Optional summary if available
        })),
        affectedMeasures: [], // To be implemented if Command tracks measures
      };
      if (this.mutationGuards.length) this.pendingBatches.push(payload);
      else this.notifyBatchListeners(payload);
    }
  }

  public undo() {
    const command = this.history.at(-1);
    if (command) {
      const next = this.prepareState(command.undo(this.state));
      if (!next) return;
      this.history.pop();
      this.redoStack.push(command);
      this.commitState(next);
    }
  }

  public redo() {
    const command = this.redoStack.at(-1);
    if (command) {
      const next = this.prepareState(command.execute(this.state));
      if (!next) return;
      this.redoStack.pop();
      this.history.push(command);
      this.commitState(next);
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeBatch(listener: BatchListener): () => void {
    this.batchListeners.add(listener);
    return () => {
      this.batchListeners.delete(listener);
    };
  }

  private notifyListeners() {
    // An observer failure cannot turn an already committed operation into a refusal.
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (error) {
        logger.log('Score subscriber failed after commit', error, LogLevel.ERROR);
      }
    });
  }

  private notifyBatchListeners(payload: BatchEventPayload) {
    this.batchListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        logger.log('Batch subscriber failed after commit', error, LogLevel.ERROR);
      }
    });
  }
}
