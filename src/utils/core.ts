/**
 * Core Score Utilities
 *
 * Fundamental score manipulation utilities including duration calculations,
 * quant breakdown, and score reflow logic.
 *
 * @tested src/__tests__/core.test.ts
 */
import { NOTE_TYPES, getMeasureCapacity } from '@/constants';
import { Measure, ScoreEvent } from '@/types';
import { measureId, eventId } from '@/utils/id';
import { hasTieTarget } from '@/utils/ties';
import { getTupletRun } from '@/utils/tupletEdit';

// --- Constants ---

const QUANT_BREAKDOWN = [
  { quants: 64, type: 'whole', dotted: false },
  { quants: 48, type: 'half', dotted: true },
  { quants: 32, type: 'half', dotted: false },
  { quants: 24, type: 'quarter', dotted: true },
  { quants: 16, type: 'quarter', dotted: false },
  { quants: 12, type: 'eighth', dotted: true },
  { quants: 8, type: 'eighth', dotted: false },
  { quants: 6, type: 'sixteenth', dotted: true },
  { quants: 4, type: 'sixteenth', dotted: false },
  { quants: 3, type: 'thirtysecond', dotted: true },
  { quants: 2, type: 'thirtysecond', dotted: false },
  { quants: 1, type: 'sixtyfourth', dotted: false },
] as const;

// --- Duration Calculations ---

/**
 * Calculates the duration of a note in quants.
 *
 * Formula: $Duration = Base \times (Dotted ? 1.5 : 1) \times \frac{TupletTarget}{TupletActual}$
 *
 * @param duration - The note type (e.g., 'quarter', 'eighth')
 * @param dotted - Whether the note is dotted
 * @param tuplet - Optional tuplet configuration
 */
export const getNoteDuration = (
  duration: string,
  dotted: boolean = false,
  tuplet?: {
    ratio: [number, number]; // [actual notes, target space] (e.g., 3 notes in space of 2)
  }
): number => {
  const base = NOTE_TYPES[duration]?.duration || 0;
  const dottedValue = dotted ? base * 1.5 : base;

  if (tuplet) {
    // Apply tuplet ratio: (value * target_space) / actual_notes
    return (dottedValue * tuplet.ratio[1]) / tuplet.ratio[0];
  }

  return dottedValue;
};

/**
 * Calculates the total duration of a list of events in quants.
 */
export const calculateTotalQuants = (events: ScoreEvent[]): number => {
  return events.reduce((acc, event) => {
    return acc + getNoteDuration(event.duration, event.dotted, event.tuplet);
  }, 0);
};

/**
 * Decomposes a total number of quants into a list of valid note durations.
 * Uses a greedy algorithm to find the largest fitting notes first.
 *
 * @param quants - Total quants to decompose
 */
export const getBreakdownOfQuants = (quants: number) => {
  let remaining = quants;
  const parts = [];

  for (const opt of QUANT_BREAKDOWN) {
    while (remaining >= opt.quants) {
      parts.push({ duration: opt.type, dotted: opt.dotted, quants: opt.quants });
      remaining -= opt.quants;
    }
    if (remaining === 0) break;
  }
  return parts;
};

// --- Reflow Logic Helpers ---

/**
 * Flattens all measures into a single event stream, cloning events/notes. Authored ties are
 * PRESERVED (Lane E) — reflow keeps the user's ties and a final repairTies pass clears only those
 * whose same-pitch neighbor is no longer adjacent after re-barring (the blanket tied:false reset
 * here used to destroy every user tie on any time-signature change).
 */
const flattenMeasures = (measures: Measure[]): ScoreEvent[] => {
  return measures.flatMap((m) =>
    m.events.map((e) => ({
      ...e,
      notes: e.notes.map((n) => ({ ...n })),
    }))
  );
};

/**
 * Creates split events from a source event based on available quants.
 * This handles the "left side" of a split (fitting into the current measure).
 *
 * @param sourceEvent - The event being split
 * @param availableQuants - How much space is left in the measure
 */
const createSplitEvents = (sourceEvent: ScoreEvent, availableQuants: number): ScoreEvent[] => {
  const parts = getBreakdownOfQuants(availableQuants);

  return parts.map((part) => ({
    ...sourceEvent,
    id: eventId(),
    duration: part.duration,
    dotted: part.dotted,
    // The parts filling the current measure are tied TO the next measure
    notes: sourceEvent.notes.map((n) => ({ ...n, tied: true })),
  }));
};

/**
 * The integral quant footprint of a tuplet group's members. A group's span is always an integral
 * number of quants (the tuplet invariant), so rounding the summed member durations recovers the
 * exact footprint without IEEE-754 drift. Shared by reflow and the fit guard so they agree.
 */
const tupletFootprint = (members: ScoreEvent[]): number =>
  Math.round(members.reduce((sum, m) => sum + getNoteDuration(m.duration, m.dotted, m.tuplet), 0));

/**
 * Whether every tuplet group fits within a single bar of `timeSignature`. Reflow treats a group as
 * atomic (never split), so a group whose footprint exceeds a whole bar has NO valid placement — the
 * caller refuses the change rather than emit an overfull, invalid bar (#256).
 */
export const tupletsFitTimeSignature = (
  staves: { measures: Measure[] }[],
  timeSignature: string
): boolean => {
  const capacity = getMeasureCapacity(timeSignature);
  for (const staff of staves) {
    for (const measure of staff.measures) {
      let i = 0;
      while (i < measure.events.length) {
        const run = measure.events[i].tuplet ? getTupletRun(measure.events, i) : null;
        if (run) {
          const members = measure.events.slice(run.start, run.end + 1);
          if (tupletFootprint(members) > capacity) return false;
          i = run.end + 1;
        } else {
          i += 1;
        }
      }
    }
  }
  return true;
};

/**
 * Reflows the score based on a new time signature.
 * Redistributes events into measures, splitting and tying notes across bar lines.
 *
 * @param measures - Current measures
 * @param newTimeSignature - New time signature string (e.g., '4/4')
 */
export const reflowScore = (measures: Measure[], newTimeSignature: string): Measure[] => {
  // Capacity comes from the single source of truth (derives any n/d, not just the fast-path table),
  // so reflow can never disagree with the validators about how many quants fill a bar.
  const maxQuants = getMeasureCapacity(newTimeSignature);
  const isPickup = measures.length > 0 && measures[0].isPickup;

  // 1. Flatten events to a single stream
  const allEvents = flattenMeasures(measures);

  // 2. Setup new structure
  const newMeasures: Measure[] = [];
  let currentMeasureEvents: ScoreEvent[] = [];
  let currentMeasureQuants = 0;

  // Helper to finalize the current buffer into a measure
  const commitMeasure = (isPickupMeasure = false) => {
    newMeasures.push({
      id: measureId(),
      events: currentMeasureEvents,
      isPickup: isPickupMeasure,
    });
    currentMeasureEvents = [];
    currentMeasureQuants = 0;
  };

  // 3. Calculate Pickup Constraints
  // If we have a pickup, the first measure has a custom capacity (min of actual content or maxQuants)
  // Round to the integral quant scale the atomic-tuplet branch uses (footprint is Math.round'd), so a
  // pickup tuplet isn't seen as "doesn't fit" by sub-quant IEEE-754 drift and pushed to the next bar.
  const pickupTarget = isPickup
    ? Math.min(Math.round(calculateTotalQuants(measures[0].events)), maxQuants)
    : 0;

  let isFillingPickup = isPickup;

  // 4. Distribute Events.
  //   - A TUPLET GROUP is an atomic, indivisible unit (#256): its whole run is placed in the current
  //     bar if it fits, else pushed to the next bar — never split (splitting it via getBreakdownOfQuants
  //     emitted plain fragments still carrying the tuplet object → an incoherent, invalid group).
  //   - A plain event splits-and-ties across the bar line as before.
  let i = 0;
  while (i < allEvents.length) {
    const event = allEvents[i];
    const currentMax = isFillingPickup ? pickupTarget : maxQuants;
    // Never negative: an atomic tuplet larger than the bar can leave currentMeasureQuants > currentMax;
    // a negative `available` would inflate the NEXT plain event's split remainder (eventDuration -
    // available), dropping/adding quants. Clamp so the overfull bar stays contained.
    const available = Math.max(0, currentMax - currentMeasureQuants);

    if (event.tuplet) {
      const run = getTupletRun(allEvents, i);
      const members = run ? allEvents.slice(run.start, run.end + 1) : [event];
      const footprint = tupletFootprint(members);

      // Doesn't fit the remaining space → close the current (possibly under-full) bar and start a
      // fresh one. (A group larger than a whole bar still lands in its own bar rather than looping.)
      if (footprint > available && currentMeasureEvents.length > 0) {
        commitMeasure(isFillingPickup);
        if (isFillingPickup) isFillingPickup = false;
      }
      currentMeasureEvents.push(...members);
      currentMeasureQuants += footprint;
      i = run ? run.end + 1 : i + 1;
      continue;
    }

    const eventDuration = getNoteDuration(event.duration, event.dotted, event.tuplet);

    // A. Event fits in current measure
    if (eventDuration <= available) {
      currentMeasureEvents.push(event);
      currentMeasureQuants += eventDuration;
    }
    // B. Event does not fit -> split-and-tie across the bar line
    else {
      // 1. Fill the remaining space in current measure
      if (available > 0) {
        const splitParts = createSplitEvents(event, available);
        currentMeasureEvents.push(...splitParts);
      }

      commitMeasure(isFillingPickup);
      if (isFillingPickup) isFillingPickup = false;

      // 2. Handle the overflow (remainder). Re-bar in BAR-SIZED chunks: a single note value can
      // exceed a whole bar of the new meter (e.g. a half note reflowed to 3/8) — breaking the entire
      // remainder down at once then placing the fragments would dump an over-capacity fragment into a
      // bar (overfull) and fire the pre-commit on an empty buffer (a spurious empty bar). Instead fill
      // each fresh bar up to maxQuants and split-and-tie at every bar line.
      let remaining = eventDuration - available;
      while (remaining > 0) {
        const chunk = Math.min(remaining, maxQuants);
        const isFinalChunk = chunk === remaining;
        const parts = getBreakdownOfQuants(chunk);

        parts.forEach((part, partIndex) => {
          // Every fragment but the very last ties onward to its continuation; the LAST fragment of the
          // FINAL chunk carries each note's ORIGINAL onward tie, PER-NOTE. repairTies later clears it
          // if that onward target didn't survive re-barring.
          const isLastFragment = isFinalChunk && partIndex === parts.length - 1;
          currentMeasureEvents.push({
            ...event,
            id: eventId(),
            duration: part.duration,
            dotted: part.dotted,
            notes: event.notes.map((n) => ({ ...n, tied: isLastFragment ? !!n.tied : true })),
          });
          currentMeasureQuants += part.quants;
        });

        remaining -= chunk;
        // The bar is now full to maxQuants; close it and continue with a fresh one. The final
        // (under-full) chunk stays buffered for the next event or the cleanup commit.
        if (remaining > 0) commitMeasure(false);
      }
    }
    i++;
  }

  // 5. Cleanup
  if (currentMeasureEvents.length > 0) {
    commitMeasure(isFillingPickup);
  }

  // Ensure score is never completely empty
  if (newMeasures.length === 0) {
    newMeasures.push({ id: measureId(), events: [], isPickup });
  }

  // Lane E: drop ties whose same-pitch neighbor no longer sits immediately after them post-rebar.
  return repairTies(newMeasures);
};

/**
 * Clears ties that no longer resolve to a same-pitch successor (Lane E). Run after reflow re-bars
 * the stream: a user tie survives iff its neighbor is still immediately adjacent; split-internal
 * fragment ties always resolve and are kept. This ONLY clears ties — it never invents one — so two
 * coincidentally-adjacent same-pitch notes the user never tied stay untied.
 */
export const repairTies = (measures: Measure[]): Measure[] =>
  measures.map((measure, measureIndex) => ({
    ...measure,
    events: measure.events.map((event, eventIndex) => ({
      ...event,
      notes: event.notes.map((note) =>
        note.tied &&
        (note.pitch === null ||
          !hasTieTarget(measures, { measureIndex, eventIndex, pitch: note.pitch }))
          ? { ...note, tied: false }
          : note
      ),
    })),
  }));

// --- Type Guards & Helpers ---

export const isRestEvent = (event: ScoreEvent): boolean => !!event.isRest;

export const isNoteEvent = (event: ScoreEvent): boolean =>
  !isRestEvent(event) && (event.notes?.length ?? 0) > 0;

/**
 * A reserved tuplet placeholder slot (#242): occupies its footprint and plays/exports as a
 * rest, but renders blank and is overwritten by input. It IS a rest (`isRestEvent` is true);
 * this only distinguishes it from a notated rest the user entered.
 */
export const isReservedSlot = (event: ScoreEvent): boolean => event.reserved === true;

/**
 * Safe accessor for the first note ID of an event.
 * Useful for maintaining selection state across reflows.
 */
export const getFirstNoteId = (event: ScoreEvent | undefined | null): string | null => {
  return event?.notes?.[0]?.id ?? null;
};

/**
 * Returns current timestamp.
 * Wraps Date.now() for consistency and potential mocking in tests.
 */
export const getTimestamp = (): number => Date.now();
