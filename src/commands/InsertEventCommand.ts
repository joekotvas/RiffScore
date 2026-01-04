import { Command } from './types';
import { Score, ScoreEvent } from '@/types';
import { updateMeasure } from '@/utils/commandHelpers';

/**
 * Command to insert a complete ScoreEvent into a measure.
 *
 * Unlike AddEventCommand (which creates a new event from individual properties),
 * this command accepts a complete ScoreEvent object, preserving all properties
 * including tuplet, tied, and any future additions.
 *
 * @see ADR-014: Complete Event Objects
 *
 * @example
 * // Insert a complete event (preserves all properties)
 * const event: ScoreEvent = { id: 'abc', duration: 'quarter', ... };
 * dispatch(new InsertEventCommand(0, event, 2, 0));
 */
export class InsertEventCommand implements Command {
  public readonly type = 'INSERT_EVENT';

  /**
   * @param measureIndex - Index of the target measure
   * @param event - Complete ScoreEvent object (will be deep-cloned)
   * @param insertIndex - Optional insertion index; undefined = append
   * @param staffIndex - Staff index (default 0)
   */
  constructor(
    private measureIndex: number,
    private event: ScoreEvent,
    private insertIndex?: number,
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
      const newEvents = [...measure.events];

      // Deep clone to ensure independence from input
      // Using JSON parse/stringify for Node.js compatibility (structuredClone requires Node 17+)
      const clonedEvent = JSON.parse(JSON.stringify(this.event)) as ScoreEvent;

      if (this.insertIndex !== undefined && this.insertIndex >= 0 && this.insertIndex <= newEvents.length) {
        newEvents.splice(this.insertIndex, 0, clonedEvent);
      } else {
        newEvents.push(clonedEvent);
      }

      measure.events = newEvents;
      return true;
    });
  }

  undo(score: Score): Score {
    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
      // Filter by event.id rather than by index for robustness
      measure.events = measure.events.filter((e) => e.id !== this.event.id);
      return true;
    });
  }
}
