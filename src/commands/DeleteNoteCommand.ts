import { Command } from './types';
import { Score, ScoreEvent, Note } from '@/types';
import { updateMeasure } from '@/utils/commandHelpers';
import {
  cloneEvent,
  getTupletRun,
  repackTupletRun,
  reservedSlotId,
} from '@/utils/tupletEdit';

/**
 * Deletes a single note. Removing one note of a chord drops just that note (duration and
 * position unchanged). Removing the LAST note of an event is metrically a delete of the event,
 * so it follows the same rules as DeleteEventCommand (#242): a plain event splices out and the
 * measure shifts left; a tuplet member conserves the group's span (pack front + reserved slot)
 * or removes the whole group when it was the last real note. Undo restores a chord note at its
 * ORIGINAL index, and the whole group run for tuplet deletes.
 */
export class DeleteNoteCommand implements Command {
  public readonly type = 'DELETE_NOTE';
  private deletedEventIndex: number = -1;
  private deletedNoteIndex: number = -1;
  private deletedEvent: ScoreEvent | null = null;
  private deletedNote: Note | null = null;
  private wasLastNoteInEvent: boolean = false;
  // Tuplet path (last-note-in-a-tuplet-member):
  private isTupletPath: boolean = false;
  private runStart: number = -1;
  private runSnapshot: ScoreEvent[] | null = null;
  private reservedId: string | null = null;

  constructor(
    private measureIndex: number,
    private eventId: string,
    private noteId: string,
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
      const eventIndex = measure.events.findIndex((e) => e.id === this.eventId);
      if (eventIndex === -1) return false;

      const event = measure.events[eventIndex];
      this.deletedEventIndex = eventIndex;

      const noteIndex = event.notes.findIndex((n) => n.id === this.noteId);
      if (noteIndex === -1) return false;

      this.deletedNote = event.notes[noteIndex];
      this.deletedNoteIndex = noteIndex;

      if (event.notes.length > 1) {
        // One note of a chord → drop just that note; duration and position are unchanged.
        this.wasLastNoteInEvent = false;
        const newNotes = [...event.notes];
        newNotes.splice(noteIndex, 1);
        const newEvents = [...measure.events];
        newEvents[eventIndex] = { ...event, notes: newNotes };
        measure.events = newEvents;
        return true;
      }

      // Last note in the event → metrically a delete of the event.
      this.wasLastNoteInEvent = true;
      this.deletedEvent = event;

      if (event.tuplet) {
        this.isTupletPath = true;
        const run = getTupletRun(measure.events, eventIndex)!;
        const members = measure.events.slice(run.start, run.end + 1);
        this.runStart = run.start;
        this.runSnapshot = members.map(cloneEvent);
        if (!this.reservedId) this.reservedId = reservedSlotId();

        const result = repackTupletRun(members, eventIndex - run.start, this.reservedId);
        const newEvents = [...measure.events];
        if (result.removeGroup) {
          newEvents.splice(run.start, members.length);
        } else {
          newEvents.splice(run.start, members.length, ...result.members);
        }
        measure.events = newEvents;
      } else {
        const newEvents = [...measure.events];
        newEvents.splice(eventIndex, 1);
        measure.events = newEvents;
      }
      return true;
    });
  }

  undo(score: Score): Score {
    if (this.deletedEventIndex === -1 || !this.deletedNote) return score;

    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
      const newEvents = [...measure.events];

      if (!this.wasLastNoteInEvent) {
        // Restore the chord note at its ORIGINAL index (not appended).
        let targetIndex = this.deletedEventIndex;
        let event = newEvents[targetIndex];
        if (!event || event.id !== this.eventId) {
          targetIndex = newEvents.findIndex((e) => e.id === this.eventId);
          if (targetIndex === -1) return false;
          event = newEvents[targetIndex];
        }
        const newNotes = [...event.notes];
        newNotes.splice(Math.min(this.deletedNoteIndex, newNotes.length), 0, this.deletedNote!);
        newEvents[targetIndex] = { ...event, notes: newNotes };
      } else if (this.isTupletPath && this.runSnapshot) {
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
      } else if (this.deletedEvent) {
        newEvents.splice(Math.min(this.deletedEventIndex, newEvents.length), 0, this.deletedEvent);
      }

      measure.events = newEvents;
      return true;
    });
  }
}
