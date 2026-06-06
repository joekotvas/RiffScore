import { Command } from './types';
import { Score, Staff, ChordSymbol } from '@/types';
import { reflowScore } from '@/utils/core';
import { findOrphanedChords, removeOrphanedChords } from '@/services/chord/ChordQuants';

export class SetTimeSignatureCommand implements Command {
  type = 'SET_TIME_SIGNATURE';
  private previousTimeSignature: string | null = null;
  private previousStaves: Staff[] | null = null;
  private previousChordTrack: ChordSymbol[] | undefined = undefined;

  constructor(private newSignature: string) {}

  execute(score: Score): Score {
    this.previousTimeSignature = score.timeSignature;
    this.previousStaves = score.staves;
    this.previousChordTrack = score.chordTrack;

    if (this.newSignature === score.timeSignature) {
      return score;
    }

    const newStaves = score.staves.map((staff) => ({
      ...staff,
      measures: reflowScore(staff.measures, this.newSignature),
    }));

    const reflowed: Score = {
      ...score,
      timeSignature: this.newSignature,
      staves: newStaves,
    };

    // Reflow re-bars the events. Chords whose (measure, quant) no longer resolves to ANY valid
    // anchor are dropped (no phantom chords). Chords whose coordinate still resolves are kept
    // as-is and may now sit over different music — full global-time re-anchoring that moves them
    // to follow their original event is a follow-up (#255; needs #237's exact tuplet grid for
    // robust fractional-position matching).
    const orphanedIds = findOrphanedChords(score, reflowed);
    return removeOrphanedChords(reflowed, orphanedIds);
  }

  undo(score: Score): Score {
    if (!this.previousTimeSignature || !this.previousStaves) return score;

    return {
      ...score,
      timeSignature: this.previousTimeSignature,
      staves: this.previousStaves,
      chordTrack: this.previousChordTrack,
    };
  }
}
