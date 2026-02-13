/**
 * Chord query utilities.
 *
 * Shared helpers for finding chords in a chord track.
 * Used by API methods and components.
 *
 * @tested src/__tests__/hooks/api/chords.test.ts
 */

import type { ChordSymbol } from '@/types';

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
 * Find a chord at a specific quant position.
 *
 * @param chordTrack - The chord track to search
 * @param quant - Quant position to search at
 * @returns The chord if found, null otherwise
 */
export const findChordAtQuant = (
  chordTrack: ChordSymbol[] | undefined,
  quant: number
): ChordSymbol | null => {
  if (!chordTrack) return null;
  return chordTrack.find((c) => c.quant === quant) ?? null;
};

/**
 * Find the index of a chord by ID.
 *
 * @param chordTrack - The chord track to search
 * @param chordId - ID of the chord to find
 * @returns The index if found, -1 otherwise
 */
export const findChordIndex = (
  chordTrack: ChordSymbol[] | undefined,
  chordId: string
): number => {
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
