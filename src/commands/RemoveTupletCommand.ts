import { Command } from './types';
import { Score, ScoreEvent } from '@/types';
import { updateMeasure } from '@/utils/commandHelpers';
import { getMeasureCapacity } from '@/constants';
import { sumQuants } from '@/utils/tuplet';
import { eventsWithoutTuplet } from '@/utils/tupletEdit';

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
      if (!events[this.eventIndex]?.tuplet) return false;

      // Real members de-tuplet, reserved slots collapse — shared with the API/UI prechecks.
      const newEvents = eventsWithoutTuplet(events, this.eventIndex);

      // Fail closed: stripping the tuplet restores each real member's full (nominal) duration. If
      // that would overflow the measure, leave the score untouched rather than silently create an
      // invalid overfull bar (the call sites pre-check and report the refusal). Pickups are validated
      // at full-bar capacity too (validateMeasure has no pickup exemption), so guard them the same.
      if (sumQuants(newEvents).quants > capacity) return false;

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
