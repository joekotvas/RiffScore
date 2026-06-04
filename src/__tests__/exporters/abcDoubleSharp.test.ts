/**
 * ABC exporter — double-sharp (`x`) spelling (Phase 1.5 seam fix).
 *
 * `toAbcPitch` used a hand-rolled regex that only matched `#`/`b` spellings, so an
 * `x`-spelled double sharp (e.g. 'Fx4', which Tonal accepts and contract C1 lists
 * as valid) fell through to the 'C' fallback and exported as the wrong pitch. The
 * fix parses via Tonal (the same parser formatNote uses). These tests guard it.
 */

import { generateABC } from '@/exporters/abcExporter';
import { Score } from '@/types';

const scoreWith = (pitch: string): Score => ({
  title: 'T',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 's1',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        { id: 'm1', events: [{ id: 'e1', duration: 'whole', dotted: false, notes: [{ id: 'n1', pitch }] }] },
      ],
    },
  ],
});

describe('ABC double-sharp spelling', () => {
  it('exports Fx4 as a double-sharp on F (not the C fallback)', () => {
    const abc = generateABC(scoreWith('Fx4'), 120);
    // Double-sharp token on the correct letter F (octave 4 -> uppercase 'F').
    expect(abc).toMatch(/\^\^F/);
    // The old regex bug produced the fallback letter C -> '^^C'.
    expect(abc).not.toMatch(/\^\^C/);
  });

  it('exports the equivalent F##4 spelling identically', () => {
    const abc = generateABC(scoreWith('F##4'), 120);
    expect(abc).toMatch(/\^\^F/);
  });

  it('exports a double-flat (Dbb4) correctly', () => {
    const abc = generateABC(scoreWith('Dbb4'), 120);
    expect(abc).toMatch(/__D/);
    expect(abc).not.toMatch(/__C/);
  });
});
