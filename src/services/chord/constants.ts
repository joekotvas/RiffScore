/**
 * Chord service constants.
 *
 * Shared constants used across all chord service modules.
 */

// ============================================================================
// SOLFEGE MAPS
// ============================================================================

export const SOLFEGE_MAP: Record<string, string> = {
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
};

export const SOLFEGE_TO_LETTER: Record<string, string> = {
  Do: 'C',
  Re: 'D',
  Mi: 'E',
  Fa: 'F',
  Sol: 'G',
  La: 'A',
  Si: 'B',
};

// ============================================================================
// ROMAN NUMERAL MAPS
// ============================================================================

export const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export const ROMAN_TO_DEGREE: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7,
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7,
};

// ============================================================================
// QUALITY NAME MAP
// ============================================================================

export const QUALITY_NAMES: Record<string, string> = {
  '': 'major',
  m: 'minor',
  dim: 'diminished',
  aug: 'augmented',
  '7': 'dominant seventh',
  maj7: 'major seventh',
  m7: 'minor seventh',
  dim7: 'diminished seventh',
  m7b5: 'minor seventh flat five',
  sus4: 'suspended fourth',
  sus2: 'suspended second',
  '6': 'major sixth',
  m6: 'minor sixth',
  '9': 'dominant ninth',
  maj9: 'major ninth',
  m9: 'minor ninth',
  '11': 'eleventh',
  '13': 'thirteenth',
  add9: 'add nine',
};
