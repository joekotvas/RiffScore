import { Command } from './types';
import { Score, ScoreEvent } from '@/types';
import { updateMeasure } from '@/utils/commandHelpers';
import { cloneEvent, getTupletRun, insertTupletMember } from '@/utils/tupletEdit';

/**
 * Insert a member INTO a tuplet group at real-member local index `localIndex` (#242), consuming a
 * reserved slot so the group's span + member count stay fixed — the inverse of a tuplet delete.
 * This is the container-aware insert: `localIndex === realCount` is the end-fill case (filling the
 * next free slot, e.g. via the keyboard ghost cursor); a smaller index inserts BETWEEN members,
 * shifting the rest right. A FULL tuplet (no reserved slot) is a no-op here — the caller pre-checks
 * and surfaces "reject with feedback", and this guards the same way as a safety net.
 *
 * `newMember` supplies identity + content (id, notes, isRest); the group's fixed rhythm
 * (baseDuration, dotted:false) + tuplet metadata are stamped on by {@link insertTupletMember}.
 * Undo restores the group run's exact prior members.
 */
export class InsertTupletMemberCommand implements Command {
  public readonly type = 'INSERT_TUPLET_MEMBER';
  private runStart = -1;
  private runSnapshot: ScoreEvent[] | null = null;
  private didInsert = false;

  constructor(
    private measureIndex: number,
    private anchorEventId: string, // any member of the target group (resolves the run)
    private localIndex: number, // real-member local position; realCount = end-fill
    private newMember: ScoreEvent, // { id, notes, isRest } — rhythm/tuplet stamped on insert
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
      const anchorIdx = measure.events.findIndex((e) => e.id === this.anchorEventId);
      if (anchorIdx < 0) return false;
      const run = getTupletRun(measure.events, anchorIdx);
      if (!run) return false;

      const members = measure.events.slice(run.start, run.end + 1);
      const result = insertTupletMember(members, this.localIndex, cloneEvent(this.newMember));
      if (result.full) return false; // full tuplet — caller already surfaced feedback

      this.runStart = run.start;
      this.runSnapshot = members.map(cloneEvent);
      this.didInsert = true;

      const newEvents = [...measure.events];
      newEvents.splice(run.start, members.length, ...result.members);
      measure.events = newEvents;
      return true;
    });
  }

  undo(score: Score): Score {
    if (!this.didInsert || !this.runSnapshot) return score;
    const snapshot = this.runSnapshot;
    const runStart = this.runStart;
    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
      // Insert consumes one reserved slot and adds one real member → the run length is UNCHANGED,
      // so the inserted run occupies exactly snapshot.length slots. Restore the original run in place
      // (deleting snapshot.length, NOT +1 — that would also eat the event after the tuplet).
      const newEvents = [...measure.events];
      newEvents.splice(runStart, snapshot.length, ...snapshot.map(cloneEvent));
      measure.events = newEvents;
      return true;
    });
  }
}
