import { Command } from './types';
import { Score, getActiveStaff } from '../types';

/**
 * Command to remove tuplet metadata from a group of events.
 * Converts tuplet notes back to regular notes.
 */
export class RemoveTupletCommand implements Command {
  public readonly type = 'REMOVE_TUPLET';
  private previousStates: Array<{
    eventId: string | number;
    tuplet?: { ratio: [number, number]; groupSize: number; position: number; };
  }> = [];

  constructor(
    private measureIndex: number,
    private eventIndex: number  // Can be any event in the tuplet group
  ) {}

  execute(score: Score): Score {
    const activeStaff = getActiveStaff(score);
    const newMeasures = [...activeStaff.measures];
    
    if (!newMeasures[this.measureIndex]) {
      return score;
    }

    const measure = { ...newMeasures[this.measureIndex] };
    const newEvents = [...measure.events];

    // Find the tuplet group that this event belongs to
    const targetEvent = newEvents[this.eventIndex];
    if (!targetEvent?.tuplet) {
      return score; // Not a tuplet
    }

    const { groupSize, position } = targetEvent.tuplet;
    const startIndex = this.eventIndex - position;

    // Store previous states for undo
    this.previousStates = [];

    // Remove tuplet metadata from all events in the group
    for (let i = 0; i < groupSize; i++) {
      const idx = startIndex + i;
      
      if (idx < 0 || idx >= newEvents.length) {
        continue;
      }

      const event = newEvents[idx];
      
      // Store previous state
      this.previousStates.push({
        eventId: event.id,
        tuplet: event.tuplet ? { ...event.tuplet } : undefined
      });

      // Remove tuplet metadata
      newEvents[idx] = {
        ...event,
        tuplet: undefined
      };
    }

    measure.events = newEvents;
    newMeasures[this.measureIndex] = measure;

    const newStaves = [...score.staves];
    newStaves[0] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }

  undo(score: Score): Score {
    const activeStaff = getActiveStaff(score);
    const newMeasures = [...activeStaff.measures];
    
    if (!newMeasures[this.measureIndex]) {
      return score;
    }

    const measure = { ...newMeasures[this.measureIndex] };
    const newEvents = [...measure.events];

    // Restore previous states
    this.previousStates.forEach(({ eventId, tuplet }) => {
      const eventIndex = newEvents.findIndex(e => e.id === eventId);
      if (eventIndex !== -1) {
        const event = newEvents[eventIndex];
        newEvents[eventIndex] = {
          ...event,
          tuplet
        };
      }
    });

    measure.events = newEvents;
    newMeasures[this.measureIndex] = measure;

    const newStaves = [...score.staves];
    newStaves[0] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }
}
