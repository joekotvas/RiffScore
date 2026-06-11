import { Command } from './types';
import { Score } from '@/types';
import { tupletId as createTupletId } from '@/utils/id';
import { isValidTupletRatio } from '@/utils/tuplet';

/**
 * Command to apply tuplet metadata to a group of consecutive events.
 * Converts a sequence of regular notes into a tuplet (e.g., triplet, quintuplet).
 */
export class ApplyTupletCommand implements Command {
  public readonly type = 'APPLY_TUPLET';
  private previousStates: Array<{
    eventId: string;
    tuplet?: { ratio: [number, number]; groupSize: number; position: number };
  }> = [];

  constructor(
    private measureIndex: number,
    private startEventIndex: number,
    private groupSize: number,
    private ratio: [number, number], // e.g., [3, 2] for triplet
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    const staff = score.staves[this.staffIndex];
    if (!staff) return score;
    const newMeasures = [...staff.measures];

    if (!newMeasures[this.measureIndex]) {
      return score; // Measure not found
    }

    const measure = { ...newMeasures[this.measureIndex] };
    const newEvents = [...measure.events];

    // Validate that we have enough events for the tuplet
    if (this.startEventIndex + this.groupSize > newEvents.length) {
      return score; // Not enough events
    }

    // Integrality guard (#237/#242): reject a ratio that wouldn't tile an integer number of
    // quants (e.g. inSpaceOf 0 → zero-length members). The base is the first member's
    // duration, matching how the group's quants are computed below.
    const baseDuration = newEvents[this.startEventIndex].duration;
    if (!isValidTupletRatio(baseDuration, this.ratio)) {
      return score; // Invalid tuplet ratio — leave the score untouched
    }

    // Store previous states for undo
    this.previousStates = [];

    // Generate a unique ID for this tuplet group
    const tupletId = createTupletId();

    // Apply tuplet metadata to the group of events
    for (let i = 0; i < this.groupSize; i++) {
      const eventIndex = this.startEventIndex + i;

      if (eventIndex >= newEvents.length) {
        break; // Not enough events
      }

      const event = newEvents[eventIndex];

      // Store previous state
      this.previousStates.push({
        eventId: event.id,
        tuplet: event.tuplet ? { ...event.tuplet } : undefined,
      });

      // Apply tuplet metadata. The base duration (the tuplet's "unit", e.g. eighth for an
      // eighth-note triplet) is taken from the first event in the group — callers select
      // same-duration notes to form a tuplet, so the first note's duration is the unit.
      newEvents[eventIndex] = {
        ...event,
        tuplet: {
          ratio: this.ratio,
          groupSize: this.groupSize,
          position: i,
          baseDuration,
          id: tupletId,
        },
      };
    }

    measure.events = newEvents;
    newMeasures[this.measureIndex] = measure;

    const newStaves = [...score.staves];
    newStaves[this.staffIndex] = { ...staff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }

  undo(score: Score): Score {
    const staff = score.staves[this.staffIndex];
    if (!staff) return score;
    const newMeasures = [...staff.measures];

    if (!newMeasures[this.measureIndex]) {
      return score;
    }

    const measure = { ...newMeasures[this.measureIndex] };
    const newEvents = [...measure.events];

    // Restore previous states
    this.previousStates.forEach(({ eventId, tuplet }) => {
      const eventIndex = newEvents.findIndex((e) => e.id === eventId);
      if (eventIndex !== -1) {
        const event = newEvents[eventIndex];
        newEvents[eventIndex] = {
          ...event,
          tuplet,
        };
      }
    });

    measure.events = newEvents;
    newMeasures[this.measureIndex] = measure;

    const newStaves = [...score.staves];
    newStaves[this.staffIndex] = { ...staff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }
}
