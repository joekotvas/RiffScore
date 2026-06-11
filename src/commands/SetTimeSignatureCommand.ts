import { Command } from './types';
import { Score, Staff, ChordSymbol, ScoreEvent } from '@/types';
import { reflowScore, tupletsFitTimeSignature } from '@/utils/core';
import { measureId } from '@/utils/id';
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

    // A tuplet group is atomic (reflow never splits it); a group whose footprint exceeds a whole bar
    // of the new meter has no valid placement. Refuse rather than emit an overfull, invalid bar — the
    // call sites pre-check this and surface feedback, this is defense-in-depth. (#256)
    if (!tupletsFitTimeSignature(score.staves, this.newSignature)) {
      return score;
    }

    const reflowedStaves = score.staves.map((staff) => ({
      ...staff,
      measures: reflowScore(staff.measures, this.newSignature),
    }));

    // Atomic tuplet placement can leave staves with different measure counts (a tuplet that doesn't
    // fit the remaining space is pushed to a fresh bar, while a plain run on another staff packs
    // denser). Pad shorter staves with empty bars so the grand-staff timeline stays aligned —
    // exporters and playback index every staff by staves[0]'s measure count. (#256 QA)
    const maxLen = Math.max(0, ...reflowedStaves.map((s) => s.measures.length));
    const newStaves = reflowedStaves.map((staff) =>
      staff.measures.length < maxLen
        ? {
            ...staff,
            measures: [
              ...staff.measures,
              ...Array.from({ length: maxLen - staff.measures.length }, () => ({
                id: measureId(),
                events: [] as ScoreEvent[],
              })),
            ],
          }
        : staff
    );

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
