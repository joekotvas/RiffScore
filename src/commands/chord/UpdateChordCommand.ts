import { Command } from '../types';
import { Score, ChordSymbol } from '@/types';
import { updateChordTrack } from '@/utils/commandHelpers';

/**
 * Update an existing chord symbol.
 *
 * Supports updating the symbol text and/or quant position.
 * If quant is changed, the chord track is re-sorted.
 *
 * @example
 * ```typescript
 * // Change chord symbol
 * dispatch(new UpdateChordCommand('chord_123', { symbol: 'Dm7' }));
 *
 * // Move chord to different position
 * dispatch(new UpdateChordCommand('chord_123', { quant: 48 }));
 *
 * // Update both
 * dispatch(new UpdateChordCommand('chord_123', { symbol: 'Em', quant: 72 }));
 * ```
 *
 * @throws {Error} If chordId is empty
 * @throws {Error} If updates.symbol is provided but empty after trimming
 * @throws {Error} If updates.quant is negative
 *
 * @tested src/__tests__/commands/chord/ChordCommands.test.ts
 */
export class UpdateChordCommand implements Command {
  readonly type = 'UPDATE_CHORD';
  private previousChord: ChordSymbol | null = null;
  private validatedUpdates: Partial<Pick<ChordSymbol, 'symbol' | 'quant'>>;

  /**
   * @param chordId - ID of the chord to update
   * @param updates - Properties to update (symbol and/or quant)
   */
  constructor(
    private chordId: string,
    updates: Partial<Pick<ChordSymbol, 'symbol' | 'quant'>>
  ) {
    if (!chordId || !chordId.trim()) {
      throw new Error('UpdateChordCommand: chordId cannot be empty');
    }
    if (updates.symbol !== undefined) {
      const trimmed = updates.symbol.trim();
      if (!trimmed) {
        throw new Error('UpdateChordCommand: symbol cannot be empty');
      }
      updates = { ...updates, symbol: trimmed };
    }
    if (updates.quant !== undefined && updates.quant < 0) {
      throw new Error(`UpdateChordCommand: quant must be >= 0, got ${updates.quant}`);
    }
    this.validatedUpdates = updates;
  }

  execute(score: Score): Score {
    return updateChordTrack(score, (chordTrack) => {
      const idx = chordTrack.findIndex((c) => c.id === this.chordId);
      if (idx === -1) return false;

      // Store previous state for undo
      this.previousChord = { ...chordTrack[idx] };

      // Apply validated updates
      chordTrack[idx] = { ...chordTrack[idx], ...this.validatedUpdates };

      // If quant changed, re-sort the chord track
      if (this.validatedUpdates.quant !== undefined) {
        chordTrack.sort((a, b) => a.quant - b.quant);
      }

      return chordTrack;
    });
  }

  undo(score: Score): Score {
    if (!this.previousChord) return score;

    return updateChordTrack(score, (chordTrack) => {
      const idx = chordTrack.findIndex((c) => c.id === this.chordId);
      if (idx === -1) return false;

      // Restore previous state
      chordTrack[idx] = { ...this.previousChord! };

      // Re-sort if quant was changed
      if (this.validatedUpdates.quant !== undefined) {
        chordTrack.sort((a, b) => a.quant - b.quant);
      }

      return chordTrack;
    });
  }
}
