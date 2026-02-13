/**
 * ChordParser - Parse and normalize chord symbols.
 *
 * Handles multiple input notations (letter, roman, nashville, solfege)
 * and normalizes to canonical letter-name format.
 *
 * @tested src/__tests__/services/ChordService.test.ts
 */

import { Chord, Note } from 'tonal';
import type { ChordParseResult, ChordComponents } from './types';
import { SOLFEGE_TO_LETTER } from './constants';
import { fromRomanNumeral, fromNashville } from './ChordNotationConverter';

// ============================================================================
// NOTATION DETECTION
// ============================================================================

/**
 * Detect the notation system of input string.
 */
export const detectNotation = (input: string): 'letter' | 'roman' | 'nashville' | 'solfege' => {
  // Roman numerals - match valid numerals I-VII with optional accidentals
  const romanPattern = /^(bb?|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)/i;
  if (romanPattern.test(input)) return 'roman';

  // Nashville - starts with 1-7
  if (/^[1-7]/.test(input)) return 'nashville';

  // Solfege - Do, Re, Mi, Fa, Sol, La, Si
  if (/^(Do|Re|Mi|Fa|Sol|La|Si)/i.test(input)) return 'solfege';

  return 'letter';
};

// ============================================================================
// INPUT CONVERSION
// ============================================================================

/**
 * Convert solfege to letter-name notation.
 */
const fromSolfege = (input: string): string => {
  const match = input.match(/^(Do|Re|Mi|Fa|Sol|La|Si)(#|b)?(.*)$/i);
  if (!match) return input;

  const [, syllable, accidental = '', suffix] = match;
  // Normalize to title-case to match SOLFEGE_TO_LETTER keys (Do, Re, Mi...)
  const normalizedSyllable = syllable.charAt(0).toUpperCase() + syllable.slice(1).toLowerCase();
  const letter = SOLFEGE_TO_LETTER[normalizedSyllable] || 'C';

  return `${letter}${accidental}${suffix}`;
};

/**
 * Convert non-letter notation to letter notation.
 */
const convertToLetter = (
  input: string,
  notation: 'roman' | 'nashville' | 'solfege',
  keySignature: string
): string => {
  switch (notation) {
    case 'roman':
      return fromRomanNumeral(input, keySignature);
    case 'nashville':
      return fromNashville(input, keySignature);
    case 'solfege':
      return fromSolfege(input);
    default:
      return input;
  }
};

// ============================================================================
// NORMALIZATION
// ============================================================================

/**
 * Extract components from parsed chord.
 */
const extractComponents = (chord: ReturnType<typeof Chord.get>): ChordComponents => {
  const root = chord.tonic || '';
  let quality = '';
  let extension = '';
  const alterations: string[] = [];
  const bass: string | null = null;

  // Determine quality (tonal returns capitalized: 'Minor', 'Diminished', 'Augmented')
  const qualityLower = chord.quality?.toLowerCase() ?? '';
  if (qualityLower === 'minor' || chord.aliases?.includes('m')) {
    quality = 'm';
  } else if (qualityLower === 'diminished' || chord.aliases?.includes('dim')) {
    quality = 'dim';
  } else if (qualityLower === 'augmented' || chord.aliases?.includes('aug')) {
    quality = 'aug';
  }

  // Determine extension
  if (chord.type?.includes('seventh')) {
    if (chord.type.includes('major')) {
      extension = 'maj7';
    } else {
      extension = '7';
    }
  } else if (chord.type?.includes('ninth')) {
    extension = '9';
  } else if (chord.type?.includes('eleventh')) {
    extension = '11';
  } else if (chord.type?.includes('thirteenth')) {
    extension = '13';
  }

  // Extract alterations from intervals
  if (chord.intervals) {
    for (const interval of chord.intervals) {
      if (interval.includes('#') || interval.includes('b')) {
        alterations.push(interval);
      }
    }
  }

  return { root, quality, extension, alterations, bass };
};

/**
 * Normalize a chord symbol to canonical form.
 */
export const normalizeChordSymbol = (input: string): string => {
  const chord = Chord.get(input);
  if (!chord.tonic) return input;

  let symbol = chord.tonic;

  // Check for minor by looking at input directly (more reliable than tonal's detection)
  const qualityLower = chord.quality?.toLowerCase() ?? '';
  const isMinor =
    qualityLower === 'minor' ||
    input.includes('m7') ||
    input.includes('m9') ||
    input.includes('m6') ||
    (input.match(/m(?!aj)/) && !input.includes('dim'));

  // Check for diminished
  const isDim =
    qualityLower === 'diminished' ||
    input.includes('dim') ||
    chord.aliases?.some((a) => a === 'dim' || a === '°');

  // Check for augmented
  const isAug =
    qualityLower === 'augmented' ||
    input.includes('aug') ||
    chord.aliases?.some((a) => a === 'aug' || a === '+');

  // Add quality
  if (isDim) {
    symbol += 'dim';
  } else if (isAug) {
    symbol += 'aug';
  } else if (isMinor) {
    symbol += 'm';
  }

  // Handle half-diminished first (before general seventh handling)
  if (input.includes('m7b5') || chord.type?.includes('half-diminished')) {
    return chord.tonic + 'm7b5';
  }

  // Handle suspended - check before extensions
  if (input.includes('sus2') || chord.type?.includes('suspended second')) {
    symbol += 'sus2';
    return symbol;
  } else if (
    input.includes('sus4') ||
    input.includes('sus') ||
    chord.type?.includes('suspended fourth')
  ) {
    symbol += 'sus4';
    return symbol;
  }

  // Add extensions
  if (input.includes('maj7') || chord.type?.includes('major seventh')) {
    symbol += 'maj7';
  } else if (input.includes('7') || chord.type?.includes('seventh')) {
    symbol += '7';
  }

  // Handle other extensions
  if (input.includes('add9')) {
    symbol = symbol.replace(/7$/, '') + 'add9';
  } else if (input.match(/\d+/) && !symbol.match(/\d+/)) {
    const extMatch = input.match(/(\d+)/);
    if (extMatch) {
      symbol += extMatch[1];
    }
  }

  return symbol;
};

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse user input into canonical chord format.
 * Accepts multiple input notations and normalizes to letter-name.
 *
 * @param input - User input chord string
 * @param keySignature - Key signature for relative notation (default 'C')
 * @returns Parse result with canonical symbol and components, or error
 */
export const parseChord = (input: string, keySignature: string = 'C'): ChordParseResult => {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, code: 'CHORD_EMPTY', message: 'Enter a chord symbol' };
  }

  // Handle slash chords
  let chordPart = trimmed;
  let bassPart: string | null = null;

  if (trimmed.includes('/') && !trimmed.startsWith('/')) {
    const parts = trimmed.split('/');
    chordPart = parts[0];
    bassPart = parts[1];

    // Validate bass note
    if (bassPart) {
      const bassNote = Note.get(bassPart);
      if (!bassNote.name) {
        return { ok: false, code: 'CHORD_INVALID_BASS', message: 'Invalid bass note' };
      }
    }
  }

  // Detect notation system
  const notation = detectNotation(chordPart);

  // Convert to letter-name if needed
  const letterInput =
    notation === 'letter' ? chordPart : convertToLetter(chordPart, notation, keySignature);

  // Normalize common aliases before parsing
  // Order matters! Process longer patterns first
  const normalizedInput = letterInput
    .replace(/min7/gi, 'm7')
    .replace(/minor7/gi, 'm7')
    .replace(/-7/g, 'm7')
    .replace(/min/gi, 'm')
    .replace(/minor/gi, 'm')
    .replace(/-$/g, 'm') // Trailing dash = minor
    .replace(/Δ7/g, 'maj7')
    .replace(/Δ/g, 'maj7')
    .replace(/°7/g, 'dim7')
    .replace(/°/g, 'dim')
    .replace(/ø7?/g, 'm7b5')
    .replace(/\+/g, 'aug')
    .replace(/M7/g, 'maj7')
    .replace(/major/gi, '');

  // Parse with tonal
  const parsed = Chord.get(normalizedInput);
  if (!parsed.tonic) {
    return { ok: false, code: 'CHORD_INVALID_ROOT', message: 'Unrecognized chord' };
  }

  // Build canonical symbol
  let canonical = normalizeChordSymbol(normalizedInput);

  // Add bass note back
  if (bassPart) {
    canonical += '/' + Note.get(bassPart).pc;
  }

  const components = extractComponents(parsed);
  components.bass = bassPart ? Note.get(bassPart).pc || null : null;

  return {
    ok: true,
    symbol: canonical,
    components,
  };
};
