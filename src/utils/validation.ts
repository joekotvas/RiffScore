import { Note } from 'tonal';
import { logger, LogLevel } from './debug';
import { getNoteDuration, calculateTotalQuants } from './core';
import { sumQuants, quantsEqual } from './tuplet';
import { getMeasureCapacity } from '@/constants';
import { Measure, Score, ScoreEvent } from '@/types';

/**
 * Checks if a pitch string is a valid scientific pitch notation (e.g., "C4", "Bb3").
 * Uses Tonal.js for robust validation.
 * @param pitch - The pitch string to validate
 * @returns True if valid scientific notation, false otherwise
 */
export const isValidPitch = (pitch: string | null): boolean => {
  if (pitch === null) return true; // explicitly valid for "no pitch" (rests/unpitched)
  if (!pitch || typeof pitch !== 'string') return false;

  const n = Note.get(pitch);
  // Ensure it's not empty and has an octave (scientific notation)
  return !n.empty && n.oct !== null;
};

/**
 * Normalizes a duration string to a standard format if possible.
 * Returns the valid duration string or null if invalid.
 *
 * Supports shorthand: 'q' -> 'quarter', 'w' -> 'whole', 'h' -> 'half',
 * '8n' -> 'eighth', '16n' -> 'sixteenth'.
 */
export const parseDuration = (duration: string): string | null => {
  if (!duration) return null;
  const d = duration.toLowerCase().trim();

  // Map of shorthands to standard names
  const map: Record<string, string> = {
    w: 'whole',
    '1n': 'whole',
    whole: 'whole',
    h: 'half',
    '2n': 'half',
    half: 'half',
    q: 'quarter',
    '4n': 'quarter',
    quarter: 'quarter',
    '8n': 'eighth',
    eighth: 'eighth',
    '16n': 'sixteenth',
    sixteenth: 'sixteenth',
    '32n': 'thirtysecond',
    thirtysecond: 'thirtysecond',
  };

  if (map[d]) return map[d];
  return null;
};

/**
 * Clamps a BPM value to the allowed range (default 30-300).
 * Parses string inputs.
 */
export const clampBpm = (bpm: number | string, min = 30, max = 300): number => {
  const val = typeof bpm === 'string' ? parseFloat(bpm) : bpm;

  if (!Number.isFinite(val)) {
    logger.log(`Invalid BPM value "${bpm}", defaulting to 120`, undefined, LogLevel.WARN);
    return 120;
  }

  if (val < min) {
    logger.log(`BPM ${val} too low, clamped to ${min}`, undefined, LogLevel.WARN);
    return min;
  }
  if (val > max) {
    logger.log(`BPM ${val} too high, clamped to ${max}`, undefined, LogLevel.WARN);
    return max;
  }
  return val;
};

/**
 * Checks if a new event with the given duration can fit in the measure.
 * @param events - List of existing events in the measure
 * @param duration - Duration type of the new event
 * @param dotted - Whether the new event is dotted
 * @param maxQuants - Bar capacity in quants (from `getMeasureCapacity`); required so the
 *   check can never silently assume 4/4 (#242).
 * @returns True if it fits, False otherwise
 */
export const canAddEventToMeasure = (
  events: ScoreEvent[],
  duration: string,
  dotted: boolean,
  maxQuants: number
): boolean => {
  const currentTotal = calculateTotalQuants(events);
  const newDur = getNoteDuration(duration, dotted, undefined);
  return currentTotal + newDur <= maxQuants;
};

/**
 * Checks if modifying an event's duration would cause the measure to overflow.
 * @param events - List of events in the measure
 * @param eventId - ID of the event being modified
 * @param targetDuration - The new duration to check
 * @param maxQuants - Bar capacity in quants (from `getMeasureCapacity`); required (#242).
 * @returns True if valid, False otherwise
 */
export const canModifyEventDuration = (
  events: ScoreEvent[],
  eventId: string,
  targetDuration: string,
  maxQuants: number,
  targetDotted?: boolean
): boolean => {
  const eventIndex = events.findIndex((e: ScoreEvent) => e.id === eventId);
  if (eventIndex === -1) return true; // Defensive: If event doesn't exist, we can't strict check

  const currentEvent = events[eventIndex];

  // Calculate total of ALL OTHER events
  const otherEventsQuants = events.reduce((acc: number, e: ScoreEvent, idx: number) => {
    if (idx === eventIndex) return acc;
    return acc + getNoteDuration(e.duration, e.dotted, e.tuplet);
  }, 0);

  // New duration for THIS event. Use the TARGET dotted state when the caller changes it in the same
  // operation (setDuration sets duration AND dotted together); otherwise keep the event's current
  // dotted (a plain duration change). Previously this always used currentEvent.dotted, so a
  // duration+dot change could be mis-judged.
  const dotted = targetDotted ?? currentEvent.dotted;
  const newEventQuants = getNoteDuration(targetDuration, dotted, currentEvent.tuplet);

  return otherEventsQuants + newEventQuants <= maxQuants;
};

/**
 * Checks if toggling an event's dotted status would cause the measure to overflow.
 * @param events - List of events in the measure
 * @param eventId - ID of the event being modified
 * @param maxQuants - Bar capacity in quants (from `getMeasureCapacity`); required (#242).
 * @returns True if valid, False otherwise
 */
export const canToggleEventDot = (
  events: ScoreEvent[],
  eventId: string,
  maxQuants: number
): boolean => {
  const eventIndex = events.findIndex((e: ScoreEvent) => e.id === eventId);
  if (eventIndex === -1) return true;

  const currentEvent = events[eventIndex];

  // Calculate total of ALL OTHER events
  const otherEventsQuants = events.reduce((acc: number, e: ScoreEvent, idx: number) => {
    if (idx === eventIndex) return acc;
    return acc + getNoteDuration(e.duration, e.dotted, e.tuplet);
  }, 0);

  // Calculate new duration for THIS event (with toggled dot)
  const newEventQuants = getNoteDuration(
    currentEvent.duration,
    !currentEvent.dotted,
    currentEvent.tuplet
  );

  return otherEventsQuants + newEventQuants <= maxQuants;
};

// --- Structural invariants (#242) ---

export interface MeasureValidation {
  valid: boolean;
  /** Why the measure is invalid (undefined when valid). */
  reason?: 'overfull' | 'incomplete-tuplet';
  /** Quants currently in the measure (complete tuplet groups counted atomically, so exact). */
  quants: number;
  /** Bar capacity the measure was checked against. */
  capacity: number;
}

/**
 * Measure-integrity invariant (#242): a measure must not exceed its bar capacity and must not
 * contain an incomplete tuplet group. Under-full measures are valid — the model renders the
 * unfilled remainder as an implicit rest (materializing trailing rests is Lane C). Uses atomic
 * tuplet accounting (`sumQuants`) so a legitimately full tuplet bar — e.g. an eighth septuplet
 * — reads as exactly capacity rather than a float-drifted near-miss.
 */
export const validateMeasure = (measure: Measure, capacity: number): MeasureValidation => {
  const { quants, partialTuplet } = sumQuants(measure.events);
  if (partialTuplet) return { valid: false, reason: 'incomplete-tuplet', quants, capacity };
  if (quants > capacity && !quantsEqual(quants, capacity)) {
    return { valid: false, reason: 'overfull', quants, capacity };
  }
  return { valid: true, quants, capacity };
};

export interface ScoreValidationError {
  staffIndex: number;
  /** Measure index, or -1 for a staff-level (grand-staff parity) error. */
  measureIndex: number;
  reason: string;
}

export interface ScoreValidation {
  valid: boolean;
  errors: ScoreValidationError[];
}

/**
 * Validates structural invariants across a whole score (#242): every measure satisfies
 * {@link validateMeasure}, and all staves share the same measure count (grand-staff parity).
 * Returns every violation instead of throwing, so callers can report or repair (fail-soft).
 */
export const validateScore = (score: Score): ScoreValidation => {
  const errors: ScoreValidationError[] = [];
  const capacity = getMeasureCapacity(score.timeSignature);

  const expectedCount = score.staves[0]?.measures.length ?? 0;
  score.staves.forEach((staff, staffIndex) => {
    if (staff.measures.length !== expectedCount) {
      errors.push({
        staffIndex,
        measureIndex: -1,
        reason: `staff has ${staff.measures.length} measures, expected ${expectedCount} (grand-staff parity)`,
      });
    }
    staff.measures.forEach((measure, measureIndex) => {
      const result = validateMeasure(measure, capacity);
      if (!result.valid) {
        errors.push({
          staffIndex,
          measureIndex,
          reason: `${result.reason} (${result.quants}/${result.capacity} quants)`,
        });
      }
    });
  });

  return { valid: errors.length === 0, errors };
};
