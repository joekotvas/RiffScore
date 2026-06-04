/**
 * Chord service shared utilities.
 *
 * DRY extraction of commonly used patterns across chord service modules.
 *
 * @tested src/__tests__/services/ChordService.test.ts
 */

import { TIME_SIGNATURES } from '@/constants';
import { parseKey, getEffectiveScale } from '@/utils/keyResolution';

// ============================================================================
// QUALITY DETECTION (DRY - used in 7+ places)
// ============================================================================

/**
 * Check if a chord symbol represents a minor chord.
 * Handles edge cases like 'maj7' not being minor.
 */
export const isMinorChord = (symbol: string): boolean => {
  // Match 'm' but not 'maj'
  return (
    (symbol.includes('m') && !symbol.includes('maj')) ||
    symbol.includes('m7') ||
    symbol.includes('m9') ||
    symbol.includes('m6')
  );
};

/**
 * Check if a chord symbol represents a diminished chord.
 */
export const isDiminishedChord = (symbol: string): boolean => {
  return symbol.includes('dim') || symbol.includes('°');
};

/**
 * Check if a chord symbol represents an augmented chord.
 */
export const isAugmentedChord = (symbol: string): boolean => {
  return symbol.includes('aug') || symbol.includes('+');
};

// ============================================================================
// SCALE LOOKUP (DRY - used in 5+ places)
// ============================================================================

/**
 * Parse a key signature to extract root and mode.
 *
 * Delegates to the shared mode-aware resolver (`@/utils/keyResolution`) so the
 * chord module and the core theory path can never diverge. The previous
 * `keySignature.replace('m', ...)` heuristic mis-handled keys whose tonic
 * contains 'm'-like substrings; the shared parser only treats a TRAILING 'm'
 * (not part of 'maj') as minor.
 */
export const parseKeySignature = (keySignature: string): { keyRoot: string; isMinor: boolean } => {
  const { tonic, mode } = parseKey(keySignature);
  return { keyRoot: tonic, isMinor: mode === 'minor' };
};

/**
 * Get the scale for a key signature.
 * Uses natural minor for minor keys (via the shared resolver).
 */
export const getScaleForKey = (keySignature: string): readonly string[] =>
  getEffectiveScale(keySignature);

// ============================================================================
// QUANTS PER MEASURE (DRY - duplicated in hooks/api/chords.ts)
// ============================================================================

/**
 * Calculate quants per measure for a time signature.
 *
 * @param timeSignature - Time signature string (e.g., '4/4', '3/4')
 * @returns Number of quants per measure
 */
export const getQuantsPerMeasure = (timeSignature: string): number => {
  return TIME_SIGNATURES[timeSignature as keyof typeof TIME_SIGNATURES] || 64;
};
