/**
 * ChordAccessibility - Screen reader friendly chord names.
 *
 * Converts chord symbols to spoken text for accessibility.
 *
 * @tested src/__tests__/services/ChordService.test.ts
 */

import { Chord } from 'tonal';

// ============================================================================
// ACCESSIBILITY
// ============================================================================

/**
 * Convert chord symbol to screen-reader-friendly name.
 *
 * @param symbol - Chord symbol (e.g., 'C#maj7', 'Bbm7')
 * @returns Spoken text (e.g., 'C sharp major seventh', 'B flat minor seventh')
 */
export const getAccessibleChordName = (symbol: string): string => {
  // Handle slash chords
  let bassPart = '';
  let chordPart = symbol;

  if (symbol.includes('/')) {
    const parts = symbol.split('/');
    chordPart = parts[0];
    bassPart = parts[1];
  }

  const parsed = Chord.get(chordPart);
  if (!parsed.tonic) return symbol;

  // Expand root accidentals
  const rootName = parsed.tonic.replace(/#/g, ' sharp').replace(/b/g, ' flat');

  // Determine quality name - order matters! Check specific patterns first
  let qualityName = 'major';

  if (chordPart.includes('m7b5')) {
    qualityName = 'minor seventh flat five';
  } else if (chordPart.includes('maj7')) {
    qualityName = 'major seventh';
  } else if (chordPart.includes('maj9')) {
    qualityName = 'major ninth';
  } else if (chordPart.includes('dim7')) {
    qualityName = 'diminished seventh';
  } else if (chordPart.includes('dim')) {
    qualityName = 'diminished';
  } else if (chordPart.includes('aug')) {
    qualityName = 'augmented';
  } else if (chordPart.includes('m9')) {
    qualityName = 'minor ninth';
  } else if (chordPart.includes('m7')) {
    qualityName = 'minor seventh';
  } else if (chordPart.includes('m6')) {
    qualityName = 'minor sixth';
  } else if (chordPart.match(/m(?!aj)/)) {
    qualityName = 'minor';
  } else if (chordPart.includes('sus4')) {
    qualityName = 'suspended fourth';
  } else if (chordPart.includes('sus2')) {
    qualityName = 'suspended second';
  } else if (chordPart.includes('7#9')) {
    qualityName = 'dominant seventh sharp nine';
  } else if (chordPart.includes('13')) {
    qualityName = 'thirteenth';
  } else if (chordPart.includes('11')) {
    qualityName = 'eleventh';
  } else if (chordPart.includes('9')) {
    qualityName = 'dominant ninth';
  } else if (chordPart.includes('7')) {
    qualityName = 'dominant seventh';
  } else if (chordPart.includes('6')) {
    qualityName = 'major sixth';
  }

  // Handle bass note
  let bassName = '';
  if (bassPart) {
    bassName = ` over ${bassPart.replace(/#/g, ' sharp').replace(/b/g, ' flat')}`;
  }

  return `${rootName} ${qualityName}${bassName}`.trim();
};
