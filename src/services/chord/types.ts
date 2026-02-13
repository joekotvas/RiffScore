/**
 * Chord service type definitions.
 *
 * Shared types used across all chord service modules.
 *
 * @tested src/__tests__/services/ChordService.test.ts
 */

import type { ChordDisplayConfig } from '@/types';

// ============================================================================
// PARSE RESULT TYPES
// ============================================================================

/**
 * Result of chord parsing operation.
 */
export type ChordParseResult =
  | { ok: true; symbol: string; components: ChordComponents }
  | { ok: false; code: ChordErrorCode; message: string };

export interface ChordComponents {
  root: string; // 'C', 'F#', 'Bb'
  quality: string; // '', 'm', 'dim', 'aug'
  extension: string; // '7', 'maj7', '9', etc.
  alterations: string[]; // ['#5', 'b9']
  bass: string | null; // 'E' for C/E, null otherwise
}

export type ChordErrorCode =
  | 'CHORD_EMPTY'
  | 'CHORD_INVALID_ROOT'
  | 'CHORD_INVALID_QUALITY'
  | 'CHORD_INVALID_BASS';

// ============================================================================
// NOTATION TYPES
// ============================================================================

export type ChordNotation = ChordDisplayConfig['notation'];

// ============================================================================
// QUALITY DETECTION
// ============================================================================

export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented';
