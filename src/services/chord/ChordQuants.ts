/**
 * ChordQuants - Valid position calculation and orphan detection.
 *
 * Handles chord positioning relative to score events.
 * Returns measure-local positions for robust measure operations.
 *
 * @tested src/__tests__/services/ChordService.test.ts
 */

import type { ChordSymbol, Measure, Score } from '@/types';
import { getNoteDuration } from '@/utils/core';
import { TIME_SIGNATURES } from '@/constants';

// ============================================================================
// MEASURE CAPACITY (TILING)
// ============================================================================

/**
 * Computes the total quant span occupied by a measure's events.
 *
 * This is the sum of every event's duration in quants. Chord-anchor positions
 * within a measure are the running prefix-sums of these same durations, so a
 * measure's anchor grid tiles exactly `[0, getMeasureSpan)` with no gaps and no
 * overlap — provided each event duration is itself an exact quant value.
 *
 * @param measure - The measure to measure
 * @returns Total event span in quants (0 for an empty measure)
 */
export const getMeasureSpan = (measure: Measure): number => {
  let span = 0;
  for (const event of measure.events) {
    span += getNoteDuration(event.duration, event.dotted, event.tuplet);
  }
  return span;
};

/**
 * Computes the nominal quant capacity of a measure for a given time signature.
 *
 * Capacity is the time signature's measure width (e.g. 64 for 4/4, 48 for 3/4
 * and 6/8). A correctly-filled (non-pickup) measure's events must tile this
 * capacity exactly: `getMeasureSpan(measure) === getMeasureQuantCapacity(ts)`.
 *
 * @param timeSignature - Time signature string (e.g. '4/4')
 * @returns Measure capacity in quants
 */
export const getMeasureQuantCapacity = (timeSignature: string): number =>
  TIME_SIGNATURES[timeSignature] ?? 64;

// ============================================================================
// VALID POSITION CALCULATION
// ============================================================================

/**
 * Get all valid positions where chords may be placed.
 * A position is valid if at least one staff has an event (note or rest) starting there.
 *
 * @param score - The score to analyze
 * @returns Map of measure index to set of valid local quants within that measure
 */
export const getValidChordQuants = (score: Score): Map<number, Set<number>> => {
  const validPositions = new Map<number, Set<number>>();

  for (const staff of score.staves) {
    for (let measureIndex = 0; measureIndex < staff.measures.length; measureIndex++) {
      const measure = staff.measures[measureIndex];
      let localQuant = 0;

      // Ensure measure entry exists
      if (!validPositions.has(measureIndex)) {
        validPositions.set(measureIndex, new Set<number>());
      }
      const measureQuants = validPositions.get(measureIndex)!;

      for (const event of measure.events) {
        // All events (notes and rests) are valid chord anchor points
        measureQuants.add(localQuant);
        localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
      }
    }
  }

  return validPositions;
};

/**
 * Check if a position is valid for chord placement.
 */
export const isValidChordPosition = (
  validPositions: Map<number, Set<number>>,
  measure: number,
  quant: number
): boolean => {
  const measureQuants = validPositions.get(measure);
  return measureQuants?.has(quant) ?? false;
};

// ============================================================================
// ORPHAN DETECTION
// ============================================================================

/**
 * Find chords that would be orphaned after a score change.
 * Returns chord IDs that no longer have a valid anchor.
 *
 * @param currentScore - Score before the change
 * @param updatedScore - Score after the change
 * @returns Array of orphaned chord IDs
 */
export const findOrphanedChords = (currentScore: Score, updatedScore: Score): string[] => {
  if (!currentScore.chordTrack?.length) return [];

  const newValidPositions = getValidChordQuants(updatedScore);

  return currentScore.chordTrack
    .filter((chord) => !isValidChordPosition(newValidPositions, chord.measure, chord.quant))
    .map((chord) => chord.id);
};

/**
 * Remove orphaned chords from a score.
 *
 * @param score - Score to clean
 * @param orphanedIds - IDs of chords to remove
 * @returns Score with orphaned chords removed
 */
export const removeOrphanedChords = (score: Score, orphanedIds: string[]): Score => {
  if (!orphanedIds.length || !score.chordTrack) return score;

  return {
    ...score,
    chordTrack: score.chordTrack.filter((chord) => !orphanedIds.includes(chord.id)),
  };
};

// ============================================================================
// STRUCTURAL RE-ANCHORING (#242)
// ============================================================================

/**
 * Re-anchor chords when a measure is INSERTED at `insertedIndex`: every chord at or after that
 * bar moves one bar later so the harmony stays over the same music. Anchors are measure-local,
 * so this is an exact index shift — no global-quant round-trip needed.
 */
export const shiftChordsForInsertedMeasure = (
  chordTrack: ChordSymbol[] | undefined,
  insertedIndex: number
): ChordSymbol[] | undefined => {
  if (!chordTrack?.length) return chordTrack;
  return chordTrack.map((chord) =>
    chord.measure >= insertedIndex ? { ...chord, measure: chord.measure + 1 } : chord
  );
};

/**
 * Re-anchor chords when the measure at `deletedIndex` is REMOVED: chords anchored in that bar
 * are dropped (their anchor is gone); chords after it move one bar earlier.
 */
export const shiftChordsForDeletedMeasure = (
  chordTrack: ChordSymbol[] | undefined,
  deletedIndex: number
): ChordSymbol[] | undefined => {
  if (!chordTrack?.length) return chordTrack;
  return chordTrack
    .filter((chord) => chord.measure !== deletedIndex)
    .map((chord) => (chord.measure > deletedIndex ? { ...chord, measure: chord.measure - 1 } : chord));
};
