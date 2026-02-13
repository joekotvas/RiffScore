/**
 * ChordNotationConverter - Convert between chord notation systems.
 *
 * Supports: letter, roman numeral, Nashville, fixed-do, movable-do solfege.
 *
 * @tested src/__tests__/services/ChordService.test.ts
 */

import { Chord, Note } from 'tonal';
import type { ChordNotation } from './types';
import { ROMAN_NUMERALS, ROMAN_TO_DEGREE, SOLFEGE_MAP } from './constants';
import {
  getScaleForKey,
  parseKeySignature,
  isMinorChord,
  isDiminishedChord,
  isAugmentedChord,
} from './utils';

// ============================================================================
// SCALE DEGREE HELPERS
// ============================================================================

/**
 * Get scale degree for a pitch in a key.
 */
export const getScaleDegree = (root: string, keySignature: string): number => {
  const pc = Note.pitchClass(root) || root;
  const { keyRoot } = parseKeySignature(keySignature);
  const scale = getScaleForKey(keySignature);

  const idx = scale.findIndex((note) => Note.pitchClass(note) === pc);
  if (idx !== -1) return idx + 1;

  // Handle enharmonics
  const enharmonic = Note.enharmonic(pc);
  const enhIdx = scale.findIndex((note) => Note.pitchClass(note) === enharmonic);
  if (enhIdx !== -1) return enhIdx + 1;

  // Calculate chromatic degree based on letter name
  const noteObj = Note.get(pc);
  const keyNote = Note.get(keyRoot);

  if (noteObj.letter && keyNote.letter) {
    const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const keyIdx = letters.indexOf(keyNote.letter);
    const noteIdx = letters.indexOf(noteObj.letter);
    const degree = ((noteIdx - keyIdx + 7) % 7) + 1;
    return degree;
  }

  // Fallback to chromatic calculation
  const keyMidi = Note.midi(keyRoot + '4') || 60;
  const noteMidi = Note.midi(pc + '4') || 60;
  const semitones = (((noteMidi - keyMidi) % 12) + 12) % 12;

  const degreeMap: Record<number, number> = {
    0: 1,
    1: 1,
    2: 2,
    3: 2,
    4: 3,
    5: 4,
    6: 4,
    7: 5,
    8: 5,
    9: 6,
    10: 7,
    11: 7,
  };
  return degreeMap[semitones];
};

/**
 * Check if a chord root is non-diatonic in the key.
 */
export const getNonDiatonicAccidental = (root: string, keySignature: string): string => {
  const pc = Note.pitchClass(root) || root;
  const scale = getScaleForKey(keySignature);

  // If in scale, no accidental needed
  if (scale.some((note) => Note.pitchClass(note) === pc)) {
    return '';
  }

  // Check if it's a flat or sharp of a scale degree
  const note = Note.get(root);
  if (note.alt && note.alt < 0) return 'b';
  if (note.alt && note.alt > 0) return '#';

  // Compare to expected diatonic note
  const degree = getScaleDegree(root, keySignature);
  const expectedNote = scale[degree - 1];
  if (expectedNote) {
    const expectedAlt = Note.get(expectedNote).alt || 0;
    const actualAlt = note.alt || 0;
    if (actualAlt < expectedAlt) return 'b';
    if (actualAlt > expectedAlt) return '#';
  }

  return '';
};

// ============================================================================
// ROMAN NUMERAL NOTATION
// ============================================================================

/**
 * Convert canonical chord to Roman numeral notation.
 */
export const toRomanNumeral = (
  symbol: string,
  keySignature: string,
  useSymbols: boolean
): string => {
  const parsed = Chord.get(symbol.split('/')[0]);
  if (!parsed.tonic) return symbol;

  const root = parsed.tonic;
  const degree = getScaleDegree(root, keySignature);

  let numeral = ROMAN_NUMERALS[degree - 1] || 'I';

  // Determine quality from symbol using shared utilities
  const isMinor = isMinorChord(symbol);
  const isDim = isDiminishedChord(symbol);

  // Apply case based on quality
  if (isMinor || isDim) {
    numeral = numeral.toLowerCase();
  }

  // Handle accidentals
  const accidental = getNonDiatonicAccidental(root, keySignature);

  // Build extension
  let extension = '';
  if (symbol.includes('maj7')) {
    extension = useSymbols ? 'Δ7' : 'maj7';
  } else if (symbol.includes('7')) {
    extension = '7';
  }

  // Handle diminished symbol
  if (isDim) {
    numeral += useSymbols ? '°' : 'o';
  }

  return `${accidental}${numeral}${extension}`;
};

/**
 * Convert Roman numeral to letter-name notation.
 */
export const fromRomanNumeral = (input: string, keySignature: string): string => {
  const match = input.match(/^(bb?|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/i);
  if (!match) return input;

  const [, accidental = '', numeral, suffix] = match;
  const isLowercase = numeral === numeral.toLowerCase();

  // Get degree
  const degree = ROMAN_TO_DEGREE[numeral.toLowerCase()];
  if (!degree) return input;

  // Get scale
  const scale = getScaleForKey(keySignature);

  // Get root from scale
  let root = scale[degree - 1] || 'C';

  // Apply accidental
  if (accidental === 'b') {
    root = Note.transpose(root, '-1A') || root;
  } else if (accidental === 'bb') {
    root = Note.transpose(root, '-2A') || root;
  } else if (accidental === '#') {
    root = Note.transpose(root, '1A') || root;
  }

  root = Note.pitchClass(root) || root;

  // Determine quality
  const hasExplicitQuality = /^(m|maj|dim|aug|°|\+)/i.test(suffix);
  let quality = '';
  if (!hasExplicitQuality && isLowercase) {
    quality = 'm';
  }

  // Clean suffix
  const cleanSuffix = suffix.replace(/^(m|maj|dim|aug|°|\+)/i, '');

  return `${root}${quality}${cleanSuffix}`;
};

// ============================================================================
// NASHVILLE NUMBER NOTATION
// ============================================================================

/**
 * Convert canonical chord to Nashville number notation.
 */
export const toNashville = (symbol: string, keySignature: string): string => {
  const parsed = Chord.get(symbol.split('/')[0]);
  if (!parsed.tonic) return symbol;

  const root = parsed.tonic;
  const degree = getScaleDegree(root, keySignature);

  const accidental = getNonDiatonicAccidental(root, keySignature);
  const isMinor = isMinorChord(symbol);
  const qualitySuffix = isMinor ? 'm' : '';

  // Extract extension
  let extension = '';
  if (symbol.includes('maj7')) {
    extension = 'maj7';
  } else if (symbol.includes('7')) {
    extension = '7';
  } else if (symbol.includes('9')) {
    extension = '9';
  }

  return `${accidental}${degree}${qualitySuffix}${extension}`;
};

/**
 * Convert Nashville number to letter-name notation.
 */
export const fromNashville = (input: string, keySignature: string): string => {
  const match = input.match(/^(b)?([1-7])(.*)$/);
  if (!match) return input;

  const [, accidental = '', degreeStr, suffix] = match;
  const degree = parseInt(degreeStr, 10);

  // Get scale
  const scale = getScaleForKey(keySignature);

  let root = scale[degree - 1] || 'C';

  // Apply accidental
  if (accidental === 'b') {
    root = Note.transpose(root, '-1A') || root;
  }

  root = Note.pitchClass(root) || root;

  return `${root}${suffix}`;
};

// ============================================================================
// SOLFEGE NOTATION
// ============================================================================

/**
 * Convert canonical chord to fixed-do solfege.
 */
export const toFixedDo = (symbol: string, useSymbols: boolean): string => {
  const parsed = Chord.get(symbol.split('/')[0]);
  if (!parsed.tonic) return symbol;

  const note = Note.get(parsed.tonic);
  const letter = note.letter || 'C';
  const syllable = SOLFEGE_MAP[letter] || 'Do';

  let accidental = '';
  if (note.alt && note.alt > 0) accidental = '#';
  if (note.alt && note.alt < 0) accidental = 'b';

  // Get quality using shared utilities
  let quality = '';
  if (isMinorChord(symbol)) {
    quality = '-';
  } else if (isDiminishedChord(symbol)) {
    quality = useSymbols ? '°' : 'dim';
  } else if (isAugmentedChord(symbol)) {
    quality = useSymbols ? '+' : 'aug';
  }

  // Get extension
  let extension = '';
  if (symbol.includes('maj7')) {
    extension = useSymbols ? 'Δ7' : 'maj7';
  } else if (symbol.includes('7')) {
    extension = '7';
  }

  return `${syllable}${accidental}${quality}${extension}`;
};

/**
 * Convert canonical chord to movable-do solfege.
 */
export const toMovableDo = (symbol: string, keySignature: string, _useSymbols: boolean): string => {
  const parsed = Chord.get(symbol.split('/')[0]);
  if (!parsed.tonic) return symbol;

  const root = parsed.tonic;
  const degree = getScaleDegree(root, keySignature);

  const syllables = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
  const syllable = syllables[degree - 1] || 'Do';

  // Get quality using shared utility
  let quality = '';
  if (isMinorChord(symbol)) {
    quality = '-';
  }

  // Get extension
  let extension = '';
  if (symbol.includes('7')) {
    extension = '7';
  }

  return `${syllable}${quality}${extension}`;
};

// ============================================================================
// SYMBOL FORMATTING
// ============================================================================

/**
 * Apply typographic symbols to chord notation.
 */
export const applySymbols = (symbol: string): string => {
  return symbol
    .replace(/maj7/g, 'Δ7')
    .replace(/dim7?/g, (match) => (match === 'dim7' ? '°7' : '°'))
    .replace(/aug/g, '+');
};

// ============================================================================
// MAIN CONVERTER
// ============================================================================

/**
 * Convert canonical chord to specified notation.
 *
 * @param symbol - Canonical chord symbol
 * @param targetNotation - Target notation system
 * @param keySignature - Key signature for relative notations
 * @param useSymbols - Use typographic symbols (Δ, °, +)
 * @returns Converted chord symbol
 */
export const convertNotation = (
  symbol: string,
  targetNotation: ChordNotation,
  keySignature: string,
  useSymbols: boolean = false
): string => {
  switch (targetNotation) {
    case 'letter':
      return useSymbols ? applySymbols(symbol) : symbol;
    case 'roman':
      return toRomanNumeral(symbol, keySignature, useSymbols);
    case 'nashville':
      return toNashville(symbol, keySignature);
    case 'fixedDo':
      return toFixedDo(symbol, useSymbols);
    case 'movableDo':
      return toMovableDo(symbol, keySignature, useSymbols);
    default:
      return symbol;
  }
};
