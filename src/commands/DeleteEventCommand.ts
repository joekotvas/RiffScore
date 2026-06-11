import { Command } from './types';
import { Score, ScoreEvent } from '@/types';
import { updateMeasure } from '@/utils/commandHelpers';
import {
  cloneEvent,
  getTupletRun,
  repackTupletRun,
  reservedSlotId,
} from '@/utils/tupletEdit';

/**
 * Deletes an event. A plain (non-tuplet) event is spliced out and the measure shifts left
 * (#242). A tuplet member is removed but the group's span is conserved: remaining content packs
 * to the front and a reserved placeholder slot takes the freed space — unless that was the last
 * real note, in which case the whole tuplet group is removed (and the measure shifts left).
 * Undo is lossless via a snapshot (the event for the plain case; the whole group run for tuplets).
 */
export class DeleteEventCommand implements Command {
  public readonly type = 'DELETE_EVENT';
  private deletedEventIndex: number = -1;
  private deletedEvent: ScoreEvent | null = null;
  // Tuplet path:
  private isTupletPath: boolean = false;
  private runStart: number = -1;
  private runSnapshot: ScoreEvent[] | null = null;
  private reservedId: string | null = null; // minted once; reused on redo for a stable slot id
  private vanish: boolean;

  /**
   * @param options.vanish - When true, the event is removed by a plain splice even if it's a
   *   tuplet member (no reserved-slot repack). Internal callers (overwrite-mode entry,
   *   insert-overflow relocation) need the slot's quant space to actually free up (#242).
   */
  constructor(
    private measureIndex: number,
    private eventId: string,
    private staffIndex: number = 0,
    options: { vanish?: boolean } = {}
  ) {
    this.vanish = options.vanish === true;
  }

  execute(score: Score): Score {
    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
      const eventIndex = measure.events.findIndex((e) => e.id === this.eventId);
      if (eventIndex === -1) return false;

      this.deletedEvent = measure.events[eventIndex];
      this.deletedEventIndex = eventIndex;

      const event = measure.events[eventIndex];
      if (event.tuplet && !this.vanish) {
        this.isTupletPath = true;
        const run = getTupletRun(measure.events, eventIndex)!;
        const members = measure.events.slice(run.start, run.end + 1);
        this.runStart = run.start;
        this.runSnapshot = members.map(cloneEvent);
        if (!this.reservedId) this.reservedId = reservedSlotId();

        const result = repackTupletRun(members, eventIndex - run.start, this.reservedId);
        const newEvents = [...measure.events];
        if (result.removeGroup) {
          newEvents.splice(run.start, members.length); // remove the group → measure shifts left
        } else {
          newEvents.splice(run.start, members.length, ...result.members);
        }
        measure.events = newEvents;
      } else {
        // Plain event: remove it; the rest of the measure shifts left.
        const newEvents = [...measure.events];
        newEvents.splice(eventIndex, 1);
        measure.events = newEvents;
      }
      return true;
    });
  }

  undo(score: Score): Score {
    if (this.deletedEventIndex === -1 || !this.deletedEvent) return score;

    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
      const newEvents = [...measure.events];

      if (this.isTupletPath && this.runSnapshot) {
        // Locate the current run by group id (robust to sibling shifts); replace it (member
        // delete kept the run present) or re-insert it (collapse-group removed it).
        const groupId = this.runSnapshot[0]?.tuplet?.id;
        let curStart = groupId != null ? newEvents.findIndex((e) => e.tuplet?.id === groupId) : -1;
        let curLen = 0;
        if (curStart !== -1) {
          while (curStart + curLen < newEvents.length && newEvents[curStart + curLen].tuplet?.id === groupId) {
            curLen++;
          }
        } else {
          curStart = Math.min(this.runStart, newEvents.length);
          curLen = 0;
        }
        newEvents.splice(curStart, curLen, ...this.runSnapshot.map(cloneEvent));
      } else {
        newEvents.splice(Math.min(this.deletedEventIndex, newEvents.length), 0, this.deletedEvent!);
      }

      measure.events = newEvents;
      return true;
    });
  }
}
