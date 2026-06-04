/**
 * Clef key-signature accidental positions (#233) + geometry-oracle proof (#235).
 *
 * THE BUG: alto/tenor key-signature accidentals rendered on the WRONG staff lines
 * (e.g. an alto F# glyph drawn on the C4 line) because KEY_SIGNATURE_OFFSETS was
 * hand-authored against the wrong clef reference. The fix DERIVES the offsets from
 * each accidental's conventional pitch + the shared clef geometry, so a key-sig
 * glyph always sits on the same line/space as a note of that pitch.
 *
 * Two layers of proof:
 *   1. Geometry consistency (render-free): every key-sig offset, for every clef,
 *      lands on the line/space of the CORRECT diatonic letter — proven with the
 *      PRODUCTION inverse getPitchForOffset (the same function note hit-testing
 *      uses) and round-tripped through getOffsetForPitch so the key-sig table can
 *      never drift from note positioning.
 *   2. Geometry oracle (render): ScoreHeader's ACTUAL emitted SVG places each
 *      accidental glyph at the offset the clef geometry predicts for that letter.
 */
/* eslint-disable testing-library/render-result-naming-convention */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KEY_SIGNATURES, KEY_SIGNATURE_OFFSETS, type KeySignatureOffsets } from '@/constants';
import { getOffsetForPitch, getPitchForOffset } from '@/engines/layout/positioning';
import { ACCIDENTALS } from '@/constants/SMuFL';
import { ThemeProvider } from '@/context/ThemeContext';
import ScoreHeader from '@/components/Canvas/ScoreHeader';
import { glyphs, firstCodepointHex } from '../helpers/geometry';

const CLEFS: Array<keyof KeySignatureOffsets> = ['treble', 'bass', 'alto', 'tenor'];

// Conventional key-signature band: aboveStaff (-6) to belowStaff (+54). Anything
// outside ~staff ± one ledger would be a wild placement.
const MIN_OFFSET = -12;
const MAX_OFFSET = 60;

describe('#233 key-signature accidentals sit on the correct letter (all clefs)', () => {
  for (const clef of CLEFS) {
    for (const type of ['sharp', 'flat'] as const) {
      it(`${clef} ${type}: each accidental is on a line/space of its OWN letter, on the note grid`, () => {
        for (const [letter, offset] of Object.entries(KEY_SIGNATURE_OFFSETS[clef][type])) {
          // Production inverse: which natural pitch occupies this offset in this clef?
          const pitch = getPitchForOffset(offset, clef);
          expect(pitch).toBeDefined();
          // CORRECTNESS: the glyph's line must belong to its own letter (the bug put
          // alto F# on the C line). Octave is the engraving convention.
          expect(pitch![0]).toBe(letter);
          // CONSISTENCY: the offset is exactly where a note of that pitch sits, so the
          // key-sig table cannot drift from note positioning (the root cause).
          expect(getOffsetForPitch(pitch!, clef)).toBe(offset);
          // SANITY: within the staff band.
          expect(offset).toBeGreaterThanOrEqual(MIN_OFFSET);
          expect(offset).toBeLessThanOrEqual(MAX_OFFSET);
        }
      });
    }
  }

  it('regression: alto & tenor F# are on an F line, NOT a C line (the original bug)', () => {
    expect(getPitchForOffset(KEY_SIGNATURE_OFFSETS.alto.sharp.F, 'alto')![0]).toBe('F');
    expect(getPitchForOffset(KEY_SIGNATURE_OFFSETS.tenor.sharp.F, 'tenor')![0]).toBe('F');
  });
});

// Render a ScoreHeader to an SVG string the geometry helper can parse. baseY=0 so
// each accidental glyph's `y` attribute IS its staff offset.
const noop = () => {};
const renderHeader = (clef: string, keySignature: string): string =>
  renderToStaticMarkup(
    <ThemeProvider>
      <svg>
        <ScoreHeader
          clef={clef}
          keySignature={keySignature}
          timeSignature="4/4"
          baseY={0}
          showTimeSignature={false}
          onClefClick={noop}
          onKeySigClick={noop}
          onTimeSigClick={noop}
        />
      </svg>
    </ThemeProvider>
  );

describe('#235 geometry oracle: rendered key-sig glyphs land where the clef geometry predicts', () => {
  const sharpCp = firstCodepointHex(ACCIDENTALS.sharp);
  const flatCp = firstCodepointHex(ACCIDENTALS.flat);

  // Worst-broken clefs (alto, tenor) for a 5-sharp and 5-flat key, plus treble/bass
  // as the known-good control.
  const cases: Array<{ clef: string; key: string; type: 'sharp' | 'flat' }> = [
    { clef: 'alto', key: 'B', type: 'sharp' },
    { clef: 'tenor', key: 'B', type: 'sharp' },
    { clef: 'alto', key: 'Db', type: 'flat' },
    { clef: 'tenor', key: 'Db', type: 'flat' },
    { clef: 'treble', key: 'B', type: 'sharp' },
    { clef: 'bass', key: 'Db', type: 'flat' },
  ];

  for (const { clef, key, type } of cases) {
    it(`${clef} ${key} (${type}): every rendered glyph is on its letter's line`, () => {
      const svg = renderHeader(clef, key);
      const cp = type === 'sharp' ? sharpCp : flatCp;
      const accidentals = glyphs(svg)
        .filter((g) => g.codepoint === cp)
        .sort((a, b) => a.x - b.x); // left-to-right = key-signature order

      const expectedLetters = KEY_SIGNATURES[key].accidentals;
      expect(accidentals).toHaveLength(expectedLetters.length);

      accidentals.forEach((g, i) => {
        const letter = expectedLetters[i];
        // The emitted y equals the derived constant for that accidental...
        expect(g.y).toBe(KEY_SIGNATURE_OFFSETS[clef as keyof KeySignatureOffsets][type][letter]);
        // ...and (baseY=0) that y resolves to the correct letter's line in this clef.
        expect(getPitchForOffset(g.y, clef)![0]).toBe(letter);
      });
    });
  }
});
