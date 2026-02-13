/**
 * Chord Service - Modular chord parsing, notation, and voicing.
 *
 * This module re-exports all chord service functionality from focused sub-modules:
 * - ChordParser: Parse and normalize chord symbols
 * - ChordNotationConverter: Convert between notation systems
 * - ChordVoicing: Generate chord voicings for playback
 * - ChordAccessibility: Screen reader friendly names
 * - ChordQuants: Valid quant calculation and orphan detection
 *
 * @tested src/__tests__/services/ChordService.test.ts
 */

// Types
export type {
  ChordParseResult,
  ChordComponents,
  ChordErrorCode,
  ChordNotation,
  ChordQuality,
} from './types';

// Constants
export {
  SOLFEGE_MAP,
  SOLFEGE_TO_LETTER,
  ROMAN_NUMERALS,
  ROMAN_TO_DEGREE,
  QUALITY_NAMES,
} from './constants';

// Utilities
export {
  isMinorChord,
  isDiminishedChord,
  isAugmentedChord,
  parseKeySignature,
  getScaleForKey,
  getQuantsPerMeasure,
} from './utils';

// Parser
export { detectNotation, parseChord, normalizeChordSymbol } from './ChordParser';

// Notation Converter
export {
  getScaleDegree,
  getNonDiatonicAccidental,
  toRomanNumeral,
  fromRomanNumeral,
  toNashville,
  fromNashville,
  toFixedDo,
  toMovableDo,
  applySymbols,
  convertNotation,
} from './ChordNotationConverter';

// Voicing
export { getChordVoicing } from './ChordVoicing';

// Accessibility
export { getAccessibleChordName } from './ChordAccessibility';

// Quants
export { getValidChordQuants, findOrphanedChords, removeOrphanedChords } from './ChordQuants';
