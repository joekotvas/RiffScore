/**
 * Navigable "stops" model (#242) — the single source of truth for where keyboard navigation can
 * land inside a measure. A measure is a fixed-span container; a tuplet is a fixed-span container
 * nested inside it. Both expose their members AND their unfilled free space as navigable positions:
 *
 *   - `note`        — a real (sounding or notated-rest) event; tuplet members are notes too.
 *   - `tupletFill`  — the free space of an INCOMPLETE tuplet (it has a reserved slot). Stepping here
 *                     shows a ghost cursor; Enter fills the slot. Reserved slots are NOT their own
 *                     `note` stops — they surface only as this ghost (so you never "land on blank").
 *   - `append`      — the measure's own trailing free space (room for one more event).
 *
 * The ordering mirrors the score: real members in order, then the tuplet's fill ghost (if any),
 * then the next event, … then the measure's append ghost (if the bar has room). This is the
 * recursive "fixed unit inside a fixed-size unit" the navigation is designed around.
 *
 * @see src/utils/navigation/horizontal.ts (consumes these for step-through + ghost cursors)
 */
import { ScoreEvent, Measure } from '@/types';
import { getNoteDuration, getFirstNoteId, calculateTotalQuants } from '../core';
import { getTupletRun } from '../tupletEdit';
import { quantsEqual } from '../tuplet';

export type NavStop =
  | { kind: 'note'; eventId: string; noteId: string | null; quant: number }
  | {
      kind: 'tupletFill';
      /** The reserved slot to fill (commit target + ghost anchor). */
      reservedId: string;
      /** Array index of that reserved slot (for preview positioning via eventPositions). */
      reservedIndex: number;
      /** The tuplet's per-member rhythm, for the ghost. */
      baseDuration: string;
      /** Quant position of the free slot within the measure. */
      quant: number;
    }
  | { kind: 'append'; quant: number };

/**
 * Build the ordered navigable stops for a measure. `capacity` is the measure's quant capacity
 * (so the trailing `append` stop is included only when the bar has room for more).
 */
export const getStops = (measure: Measure, capacity: number): NavStop[] => {
  const events = measure.events ?? [];
  const stops: NavStop[] = [];
  let i = 0;
  let quant = 0;

  while (i < events.length) {
    const e = events[i];

    if (e.tuplet) {
      const run = getTupletRun(events, i);
      if (!run) {
        // Defensive: treat as a lone event.
        if (!e.reserved) stops.push({ kind: 'note', eventId: e.id, noteId: getFirstNoteId(e), quant });
        quant += getNoteDuration(e.duration, e.dotted, e.tuplet);
        i += 1;
        continue;
      }
      const members = events.slice(run.start, run.end + 1);
      let memberQuant = quant;
      let firstReserved: { slot: ScoreEvent; index: number; quant: number } | null = null;
      members.forEach((m, localIdx) => {
        if (m.reserved) {
          if (!firstReserved) {
            firstReserved = { slot: m, index: run.start + localIdx, quant: memberQuant };
          }
        } else {
          stops.push({ kind: 'note', eventId: m.id, noteId: getFirstNoteId(m), quant: memberQuant });
        }
        memberQuant += getNoteDuration(m.duration, m.dotted, m.tuplet);
      });
      // One fill ghost for the group's free space (reserved slots pack to the end, so this sits
      // right after the last real member).
      if (firstReserved) {
        const fr = firstReserved as { slot: ScoreEvent; index: number; quant: number };
        stops.push({
          kind: 'tupletFill',
          reservedId: fr.slot.id,
          reservedIndex: fr.index,
          baseDuration: fr.slot.tuplet?.baseDuration ?? fr.slot.duration,
          quant: fr.quant,
        });
      }
      quant = memberQuant;
      i = run.end + 1;
    } else {
      if (!e.reserved) stops.push({ kind: 'note', eventId: e.id, noteId: getFirstNoteId(e), quant });
      quant += getNoteDuration(e.duration, e.dotted, e.tuplet);
      i += 1;
    }
  }

  // The measure's own trailing free space (room for at least a sliver more).
  const total = calculateTotalQuants(events);
  if (total < capacity && !quantsEqual(total, capacity)) {
    stops.push({ kind: 'append', quant: total });
  }

  return stops;
};
