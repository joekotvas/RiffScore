import { Command } from './types';
import { Score } from '@/types';
import { updateMeasure } from '@/utils/commandHelpers';
import { getMeasureCapacity } from '@/constants';
import { sumQuants } from '@/utils/tuplet';

/**
 * Command to remove tuplet metadata from a group of events.
 * Converts tuplet notes back to regular notes.
 */
export class RemoveTupletCommand implements Command {
  public readonly type = 'REMOVE_TUPLET';
  private previousStates: Array<{
    eventId: string;
    tuplet?: { ratio: [number, number]; groupSize: number; position: number };
  }> = [];

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

      const newEvents = [...events];
      for (let i = 0; i < groupSize; i++) {
        const idx = startIndex + i;
        if (idx < 0 || idx >= newEvents.length) continue;
        newEvents[idx] = { ...newEvents[idx], tuplet: undefined };
      }

      // Fail closed: stripping the tuplet restores each member's full (nominal) duration, EXPANDING
      // the bar's footprint. If that would overflow the measure, leave the score untouched rather
      // than silently create an invalid overfull bar (the API pre-checks and reports the refusal).
      if (!measure.isPickup && sumQuants(newEvents).quants > capacity) return false;

      this.previousStates = [];
      for (let i = 0; i < groupSize; i++) {
        const idx = startIndex + i;
        if (idx < 0 || idx >= events.length) continue;
        this.previousStates.push({
          eventId: events[idx].id,
          tuplet: events[idx].tuplet ? { ...events[idx].tuplet } : undefined,
        });
      }

      measure.events = newEvents;
      return true;
    });
  }

  undo(score: Score): Score {
    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
      const newEvents = [...measure.events];

      this.previousStates.forEach(({ eventId, tuplet }) => {
        const eventIndex = newEvents.findIndex((e) => e.id === eventId);
        if (eventIndex !== -1) {
          newEvents[eventIndex] = { ...newEvents[eventIndex], tuplet };
        }
      });

      measure.events = newEvents;
      return true;
    });
  }
}
