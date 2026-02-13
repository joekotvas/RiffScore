/**
 * Core Score Utilities
 *
 * Fundamental score manipulation utilities including duration calculations,
 * quant breakdown, and score reflow logic.
 *
 * @tested src/__tests__/core.test.ts
 */
import { NOTE_TYPES, TIME_SIGNATURES } from '@/constants';
import { Measure, ScoreEvent } from '@/types';
import { measureId, eventId } from '@/utils/id';

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
 * Flattens all measures into a single array of events and resets ties.
 * Ties are reset because reflow changes bar lines, requiring tie recalculation.
 */
const flattenMeasures = (measures: Measure[]): ScoreEvent[] => {
  return measures.flatMap((m) =>
    m.events.map((e) => ({
      ...e,
      notes: e.notes.map((n) => ({ ...n, tied: false })),
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
 * Reflows the score based on a new time signature.
 * Redistributes events into measures, splitting and tying notes across bar lines.
 *
 * @param measures - Current measures
 * @param newTimeSignature - New time signature string (e.g., '4/4')
 */
export const reflowScore = (measures: Measure[], newTimeSignature: string): Measure[] => {
  const maxQuants = TIME_SIGNATURES[newTimeSignature as keyof typeof TIME_SIGNATURES] || 64;
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
  const pickupTarget = isPickup ? Math.min(calculateTotalQuants(measures[0].events), maxQuants) : 0;

  let isFillingPickup = isPickup;

  // 4. Distribute Events
  allEvents.forEach((event) => {
    const eventDuration = getNoteDuration(event.duration, event.dotted, event.tuplet);
    const currentMax = isFillingPickup ? pickupTarget : maxQuants;
    const available = currentMax - currentMeasureQuants;

    // A. Event fits in current measure
    if (eventDuration <= available) {
      currentMeasureEvents.push(event);
      currentMeasureQuants += eventDuration;
    }
    // B. Event does not fit -> Split needed
    else {
      // 1. Fill the remaining space in current measure
      if (available > 0) {
        const splitParts = createSplitEvents(event, available);
        currentMeasureEvents.push(...splitParts);
      }

      commitMeasure(isFillingPickup);
      if (isFillingPickup) isFillingPickup = false;

      // 2. Handle the overflow (remainder)
      const remainingQuants = eventDuration - available;
      if (remainingQuants > 0) {
        const remainderParts = getBreakdownOfQuants(remainingQuants);

        remainderParts.forEach((part) => {
          const newEvent = {
            ...event,
            id: eventId(),
            duration: part.duration,
            dotted: part.dotted,
            // Remainder inherits the *original* tie status of the event
            // (If the original note was tied to a following note, this remainder keeps that connection)
            notes: event.notes.map((n) => ({ ...n, tied: event.notes[0].tied })),
          };

          // Handle edge case: If a single note is massive (larger than a full measure),
          // strict logic would require a recursive split.
          // For now, we assume standard notes fit within 'maxQuants' or simply overflow.
          if (currentMeasureQuants + part.quants > maxQuants) {
            commitMeasure(false);
          }

          currentMeasureEvents.push(newEvent);
          currentMeasureQuants += part.quants;
        });
      }
    }
  });

  // 5. Cleanup
  if (currentMeasureEvents.length > 0) {
    commitMeasure(isFillingPickup);
  }

  // Ensure score is never completely empty
  if (newMeasures.length === 0) {
    newMeasures.push({ id: measureId(), events: [], isPickup });
  }

  return newMeasures;
};

// --- Type Guards & Helpers ---

export const isRestEvent = (event: ScoreEvent): boolean => !!event.isRest;

export const isNoteEvent = (event: ScoreEvent): boolean =>
  !isRestEvent(event) && (event.notes?.length ?? 0) > 0;

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
