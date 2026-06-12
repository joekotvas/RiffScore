import { Command } from './types';
import { Score, ScoreEvent } from '@/types';
import { updateMeasure } from '@/utils/commandHelpers';
import { getMeasureCapacity } from '@/constants';
import { sumQuants } from '@/utils/tuplet';

/**
 * Command to remove tuplet metadata from a group of events.
 * Converts tuplet notes back to regular notes; the group's reserved (free-space) slots collapse.
 */
export class RemoveTupletCommand implements Command {
  public readonly type = 'REMOVE_TUPLET';
  // Snapshot of the measure's events before execute — a whole-array undo is exact regardless of how
  // many reserved slots were dropped (which would otherwise shift indices).
  private prevEvents: ScoreEvent[] | null = null;

  constructor(
    private measureIndex: number,
    private eventIndex: number, // Can be any event in the tuplet group
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    const capacity = getMeasureCapacity(score.timeSignature);
    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
      const events = measure.events;
      const targetEvent = events[this.eventIndex];

      if (!targetEvent?.tuplet) return false;

      const { groupSize, position } = targetEvent.tuplet;
      const startIndex = this.eventIndex - position;
      const groupEnd = startIndex + groupSize;

      // Real members de-tuplet (restore their plain duration); reserved slots are a tuplet-only
      // construct, so they're DROPPED — the freed space collapses (matching the model's
      // "delete shifts left" rule), rather than leaving an orphaned reserved rest in plain space.
      const newEvents = events.flatMap((e, idx) => {
        if (idx < startIndex || idx >= groupEnd) return [e];
        if (e.reserved) return [];
        return [{ ...e, tuplet: undefined }];
      });

      // Fail closed: stripping the tuplet restores each real member's full (nominal) duration. If
      // that would overflow the measure, leave the score untouched rather than silently create an
      // invalid overfull bar (the API pre-checks and reports the refusal).
      if (!measure.isPickup && sumQuants(newEvents).quants > capacity) return false;

      this.prevEvents = events;
      measure.events = newEvents;
      return true;
    });
  }

  undo(score: Score): Score {
    if (!this.prevEvents) return score;
    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
      measure.events = this.prevEvents as ScoreEvent[];
      return true;
    });
  }
}
