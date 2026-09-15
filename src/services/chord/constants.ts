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
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
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

// ============================================================================
// MUSICXML CHORD KINDS
// ============================================================================

/**
 * MusicXML `<kind>` of each canonical chord-symbol suffix (the parser's output vocabulary).
 * The MusicXML exporter writes from this table and the importer reads its inverse, so the two
 * cannot drift apart. Where two suffixes share a kind ('' and 'maj'), the first is canonical.
 */
export const MUSICXML_CHORD_KINDS: Record<string, string> = {
  '': 'major',
  maj: 'major',
  m: 'minor',
  aug: 'augmented',
  dim: 'diminished',
  '7': 'dominant',
  maj7: 'major-seventh',
  m7: 'minor-seventh',
  dim7: 'diminished-seventh',
  aug7: 'augmented-seventh',
  m7b5: 'half-diminished',
  mmaj7: 'major-minor',
  '6': 'major-sixth',
  m6: 'minor-sixth',
  '9': 'dominant-ninth',
  maj9: 'major-ninth',
  m9: 'minor-ninth',
  '11': 'dominant-11th',
  maj11: 'major-11th',
  m11: 'minor-11th',
  '13': 'dominant-13th',
  maj13: 'major-13th',
  m13: 'minor-13th',
  sus2: 'suspended-second',
  sus4: 'suspended-fourth',
  '5': 'power',
};
