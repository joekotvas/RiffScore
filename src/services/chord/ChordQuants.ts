/**
 * ChordQuants - Valid position calculation and orphan detection.
 *
 * Handles chord positioning relative to score events.
 * Returns measure-local positions for robust measure operations.
 *
 * @tested src/__tests__/services/ChordService.test.ts
 */

import type { Score } from '@/types';
import { getNoteDuration } from '@/utils/core';

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
