import { Command } from './types';
import { Score, Staff } from '@/types';
import { canonicalizeKeySignature } from '@/utils/keyResolution';

export class SetKeySignatureCommand implements Command {
  type = 'SET_KEY_SIGNATURE';
  private previousKeySignature: string | null = null;
  private previousStaves: Staff[] | null = null;
  /**
   * The canonical spelling of the requested key. Canonicalizing here (not just at
   * the migrateScore load boundary) keeps the "score.keySignature is always a
   * first-class key" invariant true for EVERY key-change path — both the UI
   * handler and the public `setKeySignature()` API dispatch through this command.
   * Without it, `setKeySignature('Dbm')` would store a key the header glyphs and
   * preamble can't resolve while the inline accidentals silently disagree. (#238)
   */
  private readonly newSignature: string;

  constructor(newSignature: string) {
    this.newSignature = canonicalizeKeySignature(newSignature);
  }

  execute(score: Score): Score {
    this.previousKeySignature = score.keySignature;
    this.previousStaves = score.staves;

    if (this.newSignature === score.keySignature) {
      return score;
    }

    const newStaves = score.staves.map((staff) => ({
      ...staff,
      keySignature: this.newSignature,
    }));

    return {
      ...score,
      keySignature: this.newSignature,
      staves: newStaves,
    };
  }

  undo(score: Score): Score {
    if (!this.previousKeySignature || !this.previousStaves) return score;

    return {
      ...score,
      keySignature: this.previousKeySignature,
      staves: this.previousStaves,
    };
  }
}
