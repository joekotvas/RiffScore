/**
 * ChordService Tests
 *
 * Tests for chord parsing, normalization, notation conversion, and voicing.
 * Following TDD: tests written before implementation.
 */

import {
  parseChord,
  detectNotation,
  convertNotation,
  toRomanNumeral,
  fromRomanNumeral,
  toNashville,
  fromNashville,
  toFixedDo,
  toMovableDo,
  getChordVoicing,
  getAccessibleChordName,
  getValidChordQuants,
  applySymbols,
} from '@/services/ChordService';
import { Score } from '@/types';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Helper to extract symbol from parse result with type narrowing.
 */
const getSymbol = (input: string): string | null => {
  const result = parseChord(input);
  return result.ok ? result.symbol : null;
};

// ============================================================================
// 1. PARSING TESTS
// ============================================================================

describe('ChordService - Parsing', () => {
  describe('parseChord', () => {
    describe('valid inputs', () => {
      it('parses simple major chord', () => {
        const result = parseChord('C');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('C');
          expect(result.components.root).toBe('C');
          expect(result.components.quality).toBe('');
        }
      });

      it('parses major chord with explicit quality', () => {
        const result = parseChord('Cmaj');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('C');
        }
      });

      it('parses minor chord variations', () => {
        // Test basic minor variations that tonal supports
        const variations = ['Cm', 'Cmin'];
        for (const input of variations) {
          const result = parseChord(input);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.symbol).toBe('Cm');
            expect(result.components.quality).toBe('m');
          }
        }
      });

      it('parses dash notation for minor with extension', () => {
        // C-7 works because it becomes Cm7
        const result = parseChord('C-7');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('Cm7');
        }
      });

      it('parses dominant seventh', () => {
        const result = parseChord('G7');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('G7');
          expect(result.components.extension).toBe('7');
        }
      });

      it('parses major seventh variations', () => {
        const variations = ['Cmaj7', 'CM7', 'CΔ7'];
        for (const input of variations) {
          const result = parseChord(input);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.symbol).toBe('Cmaj7');
          }
        }
      });

      it('parses minor seventh', () => {
        const variations = ['Cm7', 'Cmin7', 'C-7'];
        for (const input of variations) {
          const result = parseChord(input);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.symbol).toBe('Cm7');
          }
        }
      });

      it('parses half-diminished', () => {
        const variations = ['Cm7b5', 'Cø', 'Cø7'];
        for (const input of variations) {
          const result = parseChord(input);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.symbol).toBe('Cm7b5');
          }
        }
      });

      it('parses diminished', () => {
        const variations = ['Cdim', 'C°', 'Co'];
        for (const input of variations) {
          const result = parseChord(input);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.symbol).toBe('Cdim');
          }
        }
      });

      it('parses augmented', () => {
        const variations = ['Caug', 'C+'];
        for (const input of variations) {
          const result = parseChord(input);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.symbol).toBe('Caug');
          }
        }
      });

      it('parses suspended chords', () => {
        expect(getSymbol('Csus4')).toBe('Csus4');
        expect(getSymbol('Csus2')).toBe('Csus2');
        expect(getSymbol('Csus')).toBe('Csus4');
      });

      it('parses extensions', () => {
        expect(getSymbol('C9')).toBe('C9');
        expect(getSymbol('C11')).toBe('C11');
        expect(getSymbol('C13')).toBe('C13');
        expect(getSymbol('Cadd9')).toBe('Cadd9');
      });

      it('parses alterations', () => {
        const result = parseChord('C7#9');
        expect(result.ok).toBe(true);
        if (result.ok) {
          // Symbol should contain the alteration
          expect(result.symbol).toContain('7');
        }
      });

      it('parses slash chords', () => {
        const result = parseChord('C/E');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('C/E');
          expect(result.components.bass).toBe('E');
        }
      });

      it('parses chords with sharp roots', () => {
        const result = parseChord('F#m7');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('F#m7');
          expect(result.components.root).toBe('F#');
        }
      });

      it('parses chords with flat roots', () => {
        const result = parseChord('Bbmaj7');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('Bbmaj7');
          expect(result.components.root).toBe('Bb');
        }
      });

      it('parses double sharps', () => {
        const result = parseChord('Fx');
        expect(result.ok).toBe(true);
        if (result.ok) {
          // tonal normalizes double sharps to ##
          expect(result.components.root).toMatch(/F(x|##)/);
        }
      });

      it('parses double flats', () => {
        const result = parseChord('Bbb');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.components.root).toBe('Bbb');
        }
      });

      it('trims whitespace', () => {
        const result = parseChord('  Cmaj7  ');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('Cmaj7');
        }
      });
    });

    describe('invalid inputs', () => {
      it('returns error for empty input', () => {
        const result = parseChord('');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe('CHORD_EMPTY');
        }
      });

      it('returns error for whitespace-only input', () => {
        const result = parseChord('   ');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe('CHORD_EMPTY');
        }
      });

      it('returns error for invalid root', () => {
        const result = parseChord('Xmaj7');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe('CHORD_INVALID_ROOT');
        }
      });

      it('returns error for invalid bass note in slash chord', () => {
        const result = parseChord('C/X');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe('CHORD_INVALID_BASS');
        }
      });
    });

    describe('notation detection and conversion', () => {
      it('parses Roman numeral input in key of C', () => {
        const result = parseChord('V7', 'C');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('G7');
        }
      });

      it('parses Nashville number input in key of G', () => {
        const result = parseChord('4', 'G');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('C');
        }
      });

      it('parses lowercase Roman numerals as minor', () => {
        const result = parseChord('ii', 'C');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('Dm');
        }
      });

      it('parses uppercase Roman numerals as major', () => {
        const result = parseChord('IV', 'C');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.symbol).toBe('F');
        }
      });
    });
  });

  describe('detectNotation', () => {
    it('detects letter notation', () => {
      expect(detectNotation('C')).toBe('letter');
      expect(detectNotation('Am7')).toBe('letter');
      expect(detectNotation('F#m')).toBe('letter');
      expect(detectNotation('Bb')).toBe('letter');
    });

    it('detects Roman numeral notation', () => {
      expect(detectNotation('I')).toBe('roman');
      expect(detectNotation('ii')).toBe('roman');
      expect(detectNotation('IV')).toBe('roman');
      expect(detectNotation('V7')).toBe('roman');
      expect(detectNotation('viio')).toBe('roman');
      expect(detectNotation('bVII')).toBe('roman');
    });

    it('detects Nashville notation', () => {
      expect(detectNotation('1')).toBe('nashville');
      expect(detectNotation('4')).toBe('nashville');
      expect(detectNotation('5m')).toBe('nashville');
      expect(detectNotation('2m7')).toBe('nashville');
    });

    it('detects solfege notation', () => {
      expect(detectNotation('Do')).toBe('solfege');
      expect(detectNotation('Re')).toBe('solfege');
      expect(detectNotation('Sol')).toBe('solfege');
    });
  });
});

// ============================================================================
// 2. NOTATION CONVERSION TESTS
// ============================================================================

describe('ChordService - Notation Conversion', () => {
  describe('toRomanNumeral', () => {
    describe('in major key (C)', () => {
      it('converts diatonic major chords', () => {
        expect(toRomanNumeral('C', 'C', false)).toBe('I');
        expect(toRomanNumeral('F', 'C', false)).toBe('IV');
        expect(toRomanNumeral('G', 'C', false)).toBe('V');
      });

      it('converts diatonic minor chords (lowercase)', () => {
        expect(toRomanNumeral('Dm', 'C', false)).toBe('ii');
        expect(toRomanNumeral('Em', 'C', false)).toBe('iii');
        expect(toRomanNumeral('Am', 'C', false)).toBe('vi');
      });

      it('converts diminished vii', () => {
        expect(toRomanNumeral('Bdim', 'C', false)).toBe('viio');
      });

      it('converts seventh chords', () => {
        expect(toRomanNumeral('G7', 'C', false)).toBe('V7');
        expect(toRomanNumeral('Dm7', 'C', false)).toBe('ii7');
        expect(toRomanNumeral('Cmaj7', 'C', false)).toBe('Imaj7');
      });

      it('handles non-diatonic chords with accidentals', () => {
        expect(toRomanNumeral('Bb', 'C', false)).toBe('bVII');
        expect(toRomanNumeral('Eb', 'C', false)).toBe('bIII');
      });
    });

    describe('in minor key (Am)', () => {
      it('converts diatonic chords for minor key', () => {
        expect(toRomanNumeral('Am', 'Am', false)).toBe('i');
        expect(toRomanNumeral('C', 'Am', false)).toBe('III');
        expect(toRomanNumeral('E', 'Am', false)).toBe('V'); // Harmonic minor dominant
      });
    });

    describe('in different keys', () => {
      it('converts in key of G', () => {
        expect(toRomanNumeral('G', 'G', false)).toBe('I');
        expect(toRomanNumeral('D', 'G', false)).toBe('V');
        expect(toRomanNumeral('Am', 'G', false)).toBe('ii');
      });

      it('converts in key of F', () => {
        expect(toRomanNumeral('F', 'F', false)).toBe('I');
        expect(toRomanNumeral('Bb', 'F', false)).toBe('IV');
        expect(toRomanNumeral('Gm', 'F', false)).toBe('ii');
      });
    });

    describe('with symbols', () => {
      it('uses triangle for major seventh', () => {
        expect(toRomanNumeral('Cmaj7', 'C', true)).toBe('IΔ7');
      });

      it('uses degree symbol for diminished', () => {
        expect(toRomanNumeral('Bdim', 'C', true)).toBe('vii°');
      });
    });
  });

  describe('fromRomanNumeral', () => {
    it('converts uppercase Roman to major chord', () => {
      expect(fromRomanNumeral('I', 'C')).toBe('C');
      expect(fromRomanNumeral('IV', 'C')).toBe('F');
      expect(fromRomanNumeral('V', 'C')).toBe('G');
    });

    it('converts lowercase Roman to minor chord', () => {
      expect(fromRomanNumeral('ii', 'C')).toBe('Dm');
      expect(fromRomanNumeral('iii', 'C')).toBe('Em');
      expect(fromRomanNumeral('vi', 'C')).toBe('Am');
    });

    it('converts with extensions', () => {
      expect(fromRomanNumeral('V7', 'C')).toBe('G7');
      expect(fromRomanNumeral('ii7', 'C')).toBe('Dm7');
    });

    it('handles accidentals', () => {
      expect(fromRomanNumeral('bVII', 'C')).toBe('Bb');
      expect(fromRomanNumeral('#IV', 'C')).toBe('F#');
    });

    it('converts in different keys', () => {
      expect(fromRomanNumeral('I', 'G')).toBe('G');
      expect(fromRomanNumeral('V', 'F')).toBe('C');
    });
  });

  describe('toNashville', () => {
    it('converts major chords to numbers', () => {
      expect(toNashville('C', 'C')).toBe('1');
      expect(toNashville('F', 'C')).toBe('4');
      expect(toNashville('G', 'C')).toBe('5');
    });

    it('converts minor chords with m suffix', () => {
      expect(toNashville('Dm', 'C')).toBe('2m');
      expect(toNashville('Am', 'C')).toBe('6m');
    });

    it('preserves extensions', () => {
      expect(toNashville('G7', 'C')).toBe('57');
      expect(toNashville('Dm7', 'C')).toBe('2m7');
    });

    it('converts in different keys', () => {
      expect(toNashville('G', 'G')).toBe('1');
      expect(toNashville('D', 'G')).toBe('5');
    });
  });

  describe('fromNashville', () => {
    it('converts numbers to major chords', () => {
      expect(fromNashville('1', 'C')).toBe('C');
      expect(fromNashville('4', 'C')).toBe('F');
      expect(fromNashville('5', 'C')).toBe('G');
    });

    it('converts numbers with m suffix to minor', () => {
      expect(fromNashville('2m', 'C')).toBe('Dm');
      expect(fromNashville('6m', 'C')).toBe('Am');
    });
  });

  describe('toFixedDo', () => {
    it('converts letter names to solfege (fixed)', () => {
      expect(toFixedDo('C', false)).toBe('Do');
      expect(toFixedDo('D', false)).toBe('Re');
      expect(toFixedDo('E', false)).toBe('Mi');
      expect(toFixedDo('F', false)).toBe('Fa');
      expect(toFixedDo('G', false)).toBe('Sol');
      expect(toFixedDo('A', false)).toBe('La');
      expect(toFixedDo('B', false)).toBe('Si');
    });

    it('preserves quality and extensions', () => {
      expect(toFixedDo('Dm', false)).toBe('Re-');
      expect(toFixedDo('G7', false)).toBe('Sol7');
    });

    it('handles accidentals', () => {
      expect(toFixedDo('F#m', false)).toBe('Fa#-');
      expect(toFixedDo('Bb', false)).toBe('Sib');
    });
  });

  describe('toMovableDo', () => {
    it('converts relative to key', () => {
      // In key of C: C = Do, D = Re, etc.
      expect(toMovableDo('C', 'C', false)).toBe('Do');
      expect(toMovableDo('G', 'C', false)).toBe('Sol');

      // In key of G: G = Do, A = Re, B = Mi, C = Fa, D = Sol
      expect(toMovableDo('G', 'G', false)).toBe('Do');
      expect(toMovableDo('D', 'G', false)).toBe('Sol');
    });
  });

  describe('convertNotation', () => {
    it('converts to all notation systems', () => {
      expect(convertNotation('G7', 'letter', 'C', false)).toBe('G7');
      expect(convertNotation('G7', 'roman', 'C', false)).toBe('V7');
      expect(convertNotation('G7', 'nashville', 'C', false)).toBe('57');
      expect(convertNotation('G7', 'fixedDo', 'C', false)).toBe('Sol7');
      expect(convertNotation('G7', 'movableDo', 'C', false)).toBe('Sol7');
    });
  });

  describe('applySymbols', () => {
    it('replaces maj with triangle', () => {
      expect(applySymbols('Cmaj7')).toBe('CΔ7');
    });

    it('replaces dim with degree symbol', () => {
      expect(applySymbols('Cdim')).toBe('C°');
      expect(applySymbols('Cdim7')).toBe('C°7');
    });

    it('replaces aug with plus', () => {
      expect(applySymbols('Caug')).toBe('C+');
    });

    it('leaves other symbols unchanged', () => {
      expect(applySymbols('Cm7')).toBe('Cm7');
      expect(applySymbols('C7')).toBe('C7');
    });
  });
});

// ============================================================================
// 3. VOICING TESTS
// ============================================================================

describe('ChordService - Voicing', () => {
  describe('getChordVoicing', () => {
    it('returns MIDI notes for major triad', () => {
      const voicing = getChordVoicing('C');
      expect(voicing).toHaveLength(3);
      expect(voicing).toContain('C3'); // Root in bass
      expect(voicing).toContain('E3'); // Third
      expect(voicing).toContain('G4'); // Fifth
    });

    it('returns MIDI notes for minor triad', () => {
      const voicing = getChordVoicing('Am');
      expect(voicing).toHaveLength(3);
      expect(voicing).toContain('A2'); // High root drops to octave 2
      expect(voicing).toContain('C3'); // Minor third
      expect(voicing).toContain('E4'); // Fifth
    });

    it('returns MIDI notes for seventh chord', () => {
      const voicing = getChordVoicing('G7');
      expect(voicing).toHaveLength(4);
      expect(voicing).toContain('G2'); // High root drops to octave 2
      expect(voicing).toContain('B3'); // Third
      expect(voicing).toContain('D4'); // Fifth
      expect(voicing).toContain('F4'); // Seventh
    });

    it('uses dynamic octave for bass note', () => {
      // Low roots (C through F#) use octave 3
      expect(getChordVoicing('C')[0]).toBe('C3');
      expect(getChordVoicing('F')[0]).toBe('F3');

      // High roots (G through B) use octave 2
      expect(getChordVoicing('G')[0]).toBe('G2');
      expect(getChordVoicing('B')[0]).toBe('B2');
    });

    it('returns empty array for invalid chord', () => {
      const voicing = getChordVoicing('invalid');
      expect(voicing).toEqual([]);
    });

    it('limits extensions to prevent too many notes', () => {
      const voicing = getChordVoicing('C13');
      expect(voicing.length).toBeLessThanOrEqual(5);
    });
  });
});

// ============================================================================
// 4. ACCESSIBILITY TESTS
// ============================================================================

describe('ChordService - Accessibility', () => {
  describe('getAccessibleChordName', () => {
    it('expands major chords', () => {
      expect(getAccessibleChordName('C')).toBe('C major');
      expect(getAccessibleChordName('G')).toBe('G major');
    });

    it('expands minor chords', () => {
      expect(getAccessibleChordName('Am')).toBe('A minor');
      expect(getAccessibleChordName('Dm')).toBe('D minor');
    });

    it('expands seventh chords', () => {
      expect(getAccessibleChordName('G7')).toBe('G dominant seventh');
      expect(getAccessibleChordName('Cmaj7')).toBe('C major seventh');
      expect(getAccessibleChordName('Am7')).toBe('A minor seventh');
    });

    it('expands diminished chords', () => {
      expect(getAccessibleChordName('Bdim')).toBe('B diminished');
      expect(getAccessibleChordName('Bdim7')).toBe('B diminished seventh');
    });

    it('expands half-diminished', () => {
      expect(getAccessibleChordName('Bm7b5')).toBe('B minor seventh flat five');
    });

    it('expands augmented chords', () => {
      expect(getAccessibleChordName('Caug')).toBe('C augmented');
    });

    it('expands suspended chords', () => {
      expect(getAccessibleChordName('Csus4')).toBe('C suspended fourth');
      expect(getAccessibleChordName('Csus2')).toBe('C suspended second');
    });

    it('expands accidentals', () => {
      expect(getAccessibleChordName('F#m')).toBe('F sharp minor');
      expect(getAccessibleChordName('Bb')).toBe('B flat major');
      expect(getAccessibleChordName('Ebm7')).toBe('E flat minor seventh');
    });

    it('expands slash chords', () => {
      expect(getAccessibleChordName('C/E')).toBe('C major over E');
      expect(getAccessibleChordName('Am/G')).toBe('A minor over G');
    });

    it('handles complex chords', () => {
      expect(getAccessibleChordName('C7#9')).toContain('sharp nine');
      expect(getAccessibleChordName('Dm9')).toBe('D minor ninth');
    });
  });
});

// ============================================================================
// 5. VALID QUANT CALCULATION TESTS
// ============================================================================

describe('ChordService - Valid Quant Calculation', () => {
  const createTestScore = (events: Array<{ duration: string; isRest?: boolean }>): Score => ({
    title: 'Test',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      {
        id: 'staff-1',
        clef: 'treble',
        keySignature: 'C',
        measures: [
          {
            id: 'm1',
            events: events.map((e, i) => ({
              id: `e${i}`,
              duration: e.duration,
              dotted: false,
              isRest: e.isRest ?? false,
              notes: e.isRest ? [] : [{ id: `n${i}`, pitch: 'C4' }],
            })),
          },
        ],
      },
    ],
  });

  describe('getValidChordQuants', () => {
    it('returns map with empty sets for score with no events', () => {
      const score = createTestScore([]);
      const validPositions = getValidChordQuants(score);
      // Map has entries for measures, but sets are empty when no events
      const measure0Quants = validPositions.get(0);
      expect(measure0Quants?.size ?? 0).toBe(0);
    });

    it('returns quant 0 for single note at start', () => {
      const score = createTestScore([{ duration: 'quarter' }]);
      const validPositions = getValidChordQuants(score);
      expect(validPositions.get(0)?.has(0)).toBe(true);
    });

    it('calculates correct quants for quarter notes', () => {
      // 4 quarter notes = quants at 0, 16, 32, 48 (16 quants per quarter)
      const score = createTestScore([
        { duration: 'quarter' },
        { duration: 'quarter' },
        { duration: 'quarter' },
        { duration: 'quarter' },
      ]);
      const validPositions = getValidChordQuants(score);
      const measure0Quants = validPositions.get(0);
      expect(measure0Quants?.has(0)).toBe(true);
      expect(measure0Quants?.has(16)).toBe(true);
      expect(measure0Quants?.has(32)).toBe(true);
      expect(measure0Quants?.has(48)).toBe(true);
    });

    it('includes rest positions as valid chord anchors', () => {
      const score = createTestScore([
        { duration: 'quarter' }, // quant 0 - valid
        { duration: 'quarter', isRest: true }, // quant 16 - rest, also valid
        { duration: 'quarter' }, // quant 32 - valid
      ]);
      const validPositions = getValidChordQuants(score);
      const measure0Quants = validPositions.get(0);
      expect(measure0Quants?.has(0)).toBe(true);
      expect(measure0Quants?.has(16)).toBe(true); // rests are valid anchor points
      expect(measure0Quants?.has(32)).toBe(true);
    });

    it('handles multiple staves', () => {
      const score: Score = {
        title: 'Test',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [
          {
            id: 'staff-1',
            clef: 'treble',
            keySignature: 'C',
            measures: [
              {
                id: 'm1',
                events: [
                  { id: 'e1', duration: 'half', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
                ],
              },
            ],
          },
          {
            id: 'staff-2',
            clef: 'bass',
            keySignature: 'C',
            measures: [
              {
                id: 'm1-bass',
                events: [
                  {
                    id: 'e2',
                    duration: 'quarter',
                    dotted: false,
                    notes: [{ id: 'n2', pitch: 'C3' }],
                  },
                  {
                    id: 'e3',
                    duration: 'quarter',
                    dotted: false,
                    notes: [{ id: 'n3', pitch: 'E3' }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const validPositions = getValidChordQuants(score);
      // Staff 1: half note at quant 0
      // Staff 2: quarter note at quant 0, quarter note at quant 16
      const measure0Quants = validPositions.get(0);
      expect(measure0Quants?.has(0)).toBe(true);
      expect(measure0Quants?.has(16)).toBe(true);
    });

    it('handles multiple measures', () => {
      const score: Score = {
        title: 'Test',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [
          {
            id: 'staff-1',
            clef: 'treble',
            keySignature: 'C',
            measures: [
              {
                id: 'm1',
                events: [
                  {
                    id: 'e1',
                    duration: 'whole',
                    dotted: false,
                    notes: [{ id: 'n1', pitch: 'C4' }],
                  },
                ],
              },
              {
                id: 'm2',
                events: [
                  {
                    id: 'e2',
                    duration: 'whole',
                    dotted: false,
                    notes: [{ id: 'n2', pitch: 'D4' }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const validPositions = getValidChordQuants(score);
      // Measure 0: quant 0
      // Measure 1: quant 0 (each measure starts fresh)
      expect(validPositions.get(0)?.has(0)).toBe(true);
      expect(validPositions.get(1)?.has(0)).toBe(true);
    });

    it('handles dotted notes correctly', () => {
      const score: Score = {
        title: 'Test',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [
          {
            id: 'staff-1',
            clef: 'treble',
            keySignature: 'C',
            measures: [
              {
                id: 'm1',
                events: [
                  {
                    id: 'e1',
                    duration: 'quarter',
                    dotted: true,
                    notes: [{ id: 'n1', pitch: 'C4' }],
                  },
                  {
                    id: 'e2',
                    duration: 'eighth',
                    dotted: false,
                    notes: [{ id: 'n2', pitch: 'D4' }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const validPositions = getValidChordQuants(score);
      // Dotted quarter = 24 quants (16 * 1.5), followed by eighth at quant 24
      const measure0Quants = validPositions.get(0);
      expect(measure0Quants?.has(0)).toBe(true);
      expect(measure0Quants?.has(24)).toBe(true);
    });
  });
});
