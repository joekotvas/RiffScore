import { Command } from '../types';
import { Score, ChordSymbol } from '@/types';
import { updateChordTrack } from '@/utils/commandHelpers';

/**
 * Remove a chord symbol by its ID.
 *
 * The removed chord is stored internally for undo support.
 * If the chord doesn't exist, execute() returns the score unchanged.
 *
 * @example
 * ```typescript
 * // Remove a chord
 * dispatch(new RemoveChordCommand('chord_abc123'));
 * ```
 *
 * @throws {Error} If chordId is empty
 *
 * @tested src/__tests__/commands/chord/ChordCommands.test.ts
 */
export class RemoveChordCommand implements Command {
  readonly type = 'REMOVE_CHORD';
  private removedChord: ChordSymbol | null = null;
  private removedIndex: number = -1;
  private validatedChordId: string;

  /**
   * @param chordId - ID of the chord to remove
   */
  constructor(chordId: string) {
    if (!chordId || !chordId.trim()) {
      throw new Error('RemoveChordCommand: chordId cannot be empty');
    }
    this.validatedChordId = chordId.trim();
  }

  execute(score: Score): Score {
    return updateChordTrack(score, (chordTrack) => {
      const idx = chordTrack.findIndex((c) => c.id === this.validatedChordId);
      if (idx === -1) return false;

      // Store for undo
      this.removedChord = chordTrack[idx];
      this.removedIndex = idx;

      // Remove the chord
      chordTrack.splice(idx, 1);
      return chordTrack;
    });
  }

  undo(score: Score): Score {
    if (!this.removedChord) return score;

    return updateChordTrack(score, (chordTrack) => {
      // Re-insert at original position
      chordTrack.splice(this.removedIndex, 0, this.removedChord!);
      return chordTrack;
    });
  }
}
