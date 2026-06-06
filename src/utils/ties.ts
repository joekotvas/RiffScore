/**
 * Tie-target resolution (#242 Lane E) — the single definition of what a tie connects to.
 *
 * A tie is forward-only: `note.tied` means "this note ties to the same-pitch note in the
 * IMMEDIATE next event" — the next event in the measure, or the first event of the next measure
 * (cross-barline). A rest or a reserved tuplet slot is never a tie target. Render, export, the
 * authoring gate, and the reflow repair pass all route through this so they can never disagree
 * (previously three sites re-implemented "next same-pitch note" independently, and creation had
 * no validation at all).
 */
import { Measure } from '@/types';

export interface TieTarget {
  measureIndex: number;
  eventIndex: number;
  noteIndex: number;
}

/**
 * The note a tie from `loc` would connect to, or null if there is none (next event is a rest /
 * reserved slot / a different pitch / nonexistent). Strict immediate lookahead — a rest right
 * after a tied note breaks the tie (no skip-and-chain).
 */
export const findTieTarget = (
  measures: Measure[],
  loc: { measureIndex: number; eventIndex: number; pitch: string }
): TieTarget | null => {
  const current = measures[loc.measureIndex];
  if (!current) return null;

  let targetMeasure = loc.measureIndex;
  let targetEvent = loc.eventIndex + 1;
  if (targetEvent >= current.events.length) {
    // Cross the barline to the first event of the immediate next measure.
    targetMeasure = loc.measureIndex + 1;
    targetEvent = 0;
  }

  const event = measures[targetMeasure]?.events[targetEvent];
  if (!event || event.isRest || event.reserved) return null;

  const noteIndex = event.notes.findIndex((n) => n.pitch === loc.pitch && !n.isRest);
  return noteIndex === -1 ? null : { measureIndex: targetMeasure, eventIndex: targetEvent, noteIndex };
};

/** Whether a tie from `loc` resolves to a valid same-pitch successor. */
export const hasTieTarget = (
  measures: Measure[],
  loc: { measureIndex: number; eventIndex: number; pitch: string }
): boolean => findTieTarget(measures, loc) !== null;
