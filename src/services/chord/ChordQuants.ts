/**
 * ChordQuants - Valid quant calculation and orphan detection.
 *
 * Handles chord positioning relative to score events.
 *
 * @tested src/__tests__/services/ChordService.test.ts
 */

import type { Score } from '@/types';
import { getNoteDuration } from '@/utils/core';
import { getQuantsPerMeasure } from './utils';

// ============================================================================
// VALID QUANT CALCULATION
// ============================================================================

/**
 * Get all valid quant positions where chords may be placed.
 * A position is valid if at least one staff has an event (note or rest) starting there.
 *
 * @param score - The score to analyze
 * @returns Set of valid global quant positions
 */
export const getValidChordQuants = (score: Score): Set<number> => {
  const validQuants = new Set<number>();
  const quantsPerMeasure = getQuantsPerMeasure(score.timeSignature);

  for (const staff of score.staves) {
    for (let mIdx = 0; mIdx < staff.measures.length; mIdx++) {
      const measure = staff.measures[mIdx];
      let localQuant = 0;

      for (const event of measure.events) {
        // All events (notes and rests) are valid chord anchor points
        const globalQuant = mIdx * quantsPerMeasure + localQuant;
        validQuants.add(globalQuant);
        localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
      }
    }
  }

  return validQuants;
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
export const findOrphanedChords = (
  currentScore: Score,
  updatedScore: Score
): string[] => {
  if (!currentScore.chordTrack?.length) return [];

  const newValidQuants = getValidChordQuants(updatedScore);

  return currentScore.chordTrack
    .filter((chord) => !newValidQuants.has(chord.quant))
    .map((chord) => chord.id);
};

/**
 * Remove orphaned chords from a score.
 *
 * @param score - Score to clean
 * @param orphanedIds - IDs of chords to remove
 * @returns Score with orphaned chords removed
 */
export const removeOrphanedChords = (
  score: Score,
  orphanedIds: string[]
): Score => {
  if (!orphanedIds.length || !score.chordTrack) return score;

  return {
    ...score,
    chordTrack: score.chordTrack.filter((chord) => !orphanedIds.includes(chord.id)),
  };
};
