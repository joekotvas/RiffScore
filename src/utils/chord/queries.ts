/**
 * Chord query utilities.
 *
 * Shared helpers for finding chords in a chord track.
 * Used by API methods and components.
 *
 * @tested src/__tests__/hooks/api/chords.test.ts
 */

import type { ChordSymbol } from '@/types';

/** Position for chord lookup */
export interface ChordPosition {
  measure: number;
  quant: number;
}

/**
 * Find a chord by ID in the chord track.
 *
 * @param chordTrack - The chord track to search
 * @param chordId - ID of the chord to find
 * @returns The chord if found, null otherwise
 */
export const findChordById = (
  chordTrack: ChordSymbol[] | undefined,
  chordId: string
): ChordSymbol | null => {
  if (!chordTrack) return null;
  return chordTrack.find((c) => c.id === chordId) ?? null;
};

/**
 * Find a chord at a specific position.
 *
 * @param chordTrack - The chord track to search
 * @param position - Measure-local position to search at
 * @returns The chord if found, null otherwise
 */
export const findChordAt = (
  chordTrack: ChordSymbol[] | undefined,
  position: ChordPosition
): ChordSymbol | null => {
  if (!chordTrack) return null;
  return (
    chordTrack.find((c) => c.measure === position.measure && c.quant === position.quant) ?? null
  );
};

/**
 * Find all chords in a specific measure.
 *
 * @param chordTrack - The chord track to search
 * @param measureIndex - Measure index to search
 * @returns Array of chords in the measure (may be empty)
 */
export const findChordsInMeasure = (
  chordTrack: ChordSymbol[] | undefined,
  measureIndex: number
): ChordSymbol[] => {
  if (!chordTrack) return [];
  return chordTrack.filter((c) => c.measure === measureIndex);
};

/**
 * Find the index of a chord by ID.
 *
 * @param chordTrack - The chord track to search
 * @param chordId - ID of the chord to find
 * @returns The index if found, -1 otherwise
 */
export const findChordIndex = (chordTrack: ChordSymbol[] | undefined, chordId: string): number => {
  if (!chordTrack) return -1;
  return chordTrack.findIndex((c) => c.id === chordId);
};

/**
 * Get the chord at a specific index.
 *
 * @param chordTrack - The chord track to access
 * @param index - Index to access
 * @returns The chord if index is valid, null otherwise
 */
export const getChordAtIndex = (
  chordTrack: ChordSymbol[] | undefined,
  index: number
): ChordSymbol | null => {
  if (!chordTrack || index < 0 || index >= chordTrack.length) return null;
  return chordTrack[index];
};
