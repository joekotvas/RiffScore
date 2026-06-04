/**
 * Single-source clef geometry (Finding 1D).
 *
 * These tests assert REAL geometric/musical correctness from first principles,
 * using INDEPENDENT oracles rather than restating the implementation:
 *
 *  - Tonal (Note.midi / Note.get) supplies an independent diatonic-step count
 *    (letter-name distance) that the offset math must obey.
 *  - The staff-grid invariants (12px per line gap, 6px per diatonic step, top
 *    line at offset 0, middle line at offset 24) come from the documented
 *    coordinate system, NOT from the lookup the code uses.
 *  - Round-trips (pitch -> offset -> pitch and offset -> pitch -> offset) prove
 *    forward and inverse are true inverses for every clef, which is exactly the
 *    property the alto/tenor bug violated.
 *
 * The historical bug: every non-bass clef returned the TREBLE table, so
 * alto/tenor pitches rendered at treble positions, and tenor's reference was
 * itself wrong (a space instead of line 4). The regression tests below would
 * FAIL against that behavior.
 */

import { Note } from 'tonal';
import { getOffsetForPitch, getPitchForOffset } from '@/engines/layout/positioning';

const HALF_STEP = 6; // px per diatonic step
const LINE_GAP = 12; // px per staff line-to-line gap
const MIDDLE_LINE_OFFSET = 24; // documented: middle (3rd) line in every clef

const CLEFS = ['treble', 'bass', 'alto', 'tenor'] as const;

// Middle (3rd) line pitch for each clef, computed independently from the
// canonical clef definitions (NOT read from the code under test):
//   treble: G4 on line 2 -> line 3 is B4
//   bass:   F3 on line 4 -> line 3 is D3
//   alto:   C4 on line 3 (middle line) -> C4
//   tenor:  C4 on line 4 -> line 3 is A3
const MIDDLE_LINE_PITCH: Record<string, string> = {
  treble: 'B4',
  bass: 'D3',
  alto: 'C4',
  tenor: 'A3',
};

// Canonical Middle-C anchors (the headline landmarks of the fix):
const C4_ANCHOR: Record<string, number> = {
  treble: 60, // first ledger line below the bottom line
  bass: -12, // C4 is high above the bass staff
  alto: 24, // Middle C on the middle line
  tenor: 12, // Middle C on the 4th line (the bug had this at 18, a space)
};

/**
 * Independent diatonic-step distance using letter+octave only (accidentals
 * ignored), the same notion a staff uses. We get letter/octave from Tonal so
 * this oracle does not reuse any positioning.ts internals.
 */
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const diatonicSteps = (from: string, to: string): number => {
  const a = Note.get(from);
  const b = Note.get(to);
  const ai = LETTERS.indexOf(a.letter) + (a.oct as number) * 7;
  const bi = LETTERS.indexOf(b.letter) + (b.oct as number) * 7;
  return bi - ai;
};

describe('clef geometry: theory anchors', () => {
  test.each(CLEFS)('%s: middle line pitch lands on the middle line (offset 24)', (clef) => {
    expect(getOffsetForPitch(MIDDLE_LINE_PITCH[clef], clef)).toBe(MIDDLE_LINE_OFFSET);
  });

  test.each(CLEFS)('%s: Middle C (C4) matches its canonical anchor', (clef) => {
    expect(getOffsetForPitch('C4', clef)).toBe(C4_ANCHOR[clef]);
  });

  test('tenor C4 sits on line 4 (offset 12), NOT a space (the 18px bug)', () => {
    const offset = getOffsetForPitch('C4', 'tenor');
    expect(offset).toBe(12);
    // A staff LINE is an even multiple of the line gap from the top line (0).
    expect(offset % LINE_GAP).toBe(0);
  });
});

describe('clef geometry: derived from one diatonic-step formula (Tonal oracle)', () => {
  // Sweep a wide range and assert the offset equals the middle-line anchor
  // minus (diatonic steps above the middle-line pitch) * 6px. This pins the
  // ENTIRE mapping to an independent oracle, not just landmarks.
  const SWEEP: string[] = [];
  for (let oct = 1; oct <= 7; oct++) {
    for (const l of LETTERS) SWEEP.push(`${l}${oct}`);
  }

  test.each(CLEFS)('%s: every pitch obeys offset = 24 - 6 * stepsAboveMiddleLine', (clef) => {
    const middlePitch = MIDDLE_LINE_PITCH[clef];
    for (const pitch of SWEEP) {
      const expected = MIDDLE_LINE_OFFSET - diatonicSteps(middlePitch, pitch) * HALF_STEP;
      expect(getOffsetForPitch(pitch, clef)).toBe(expected);
    }
  });

  test.each(CLEFS)('%s: accidentals never change the staff position', (clef) => {
    for (const base of ['C4', 'F4', 'G3', 'B5', 'D2']) {
      const natural = getOffsetForPitch(base, clef);
      const letter = base.slice(0, 1);
      const oct = base.slice(1);
      expect(getOffsetForPitch(`${letter}#${oct}`, clef)).toBe(natural);
      expect(getOffsetForPitch(`${letter}b${oct}`, clef)).toBe(natural);
      expect(getOffsetForPitch(`${letter}##${oct}`, clef)).toBe(natural);
    }
  });
});

describe('clef geometry: monotonicity (higher pitch => strictly smaller offset)', () => {
  test.each(CLEFS)('%s: ascending C2..C7 sweep is strictly decreasing in offset', (clef) => {
    const pitches: string[] = [];
    for (let oct = 2; oct <= 7; oct++) {
      for (const l of LETTERS) pitches.push(`${l}${oct}`);
    }
    // Sort by true sounding pitch (MIDI) to guarantee strictly ascending input.
    pitches.sort((a, b) => (Note.midi(a) as number) - (Note.midi(b) as number));

    const offsets = pitches.map((p) => getOffsetForPitch(p, clef));
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeLessThan(offsets[i - 1]);
    }
  });
});

describe('clef geometry: forward/inverse round-trips', () => {
  // Every line and space across the printable staff range, including ledger
  // zones above and below. Lines and spaces are 6px apart.
  const GRID_OFFSETS: number[] = [];
  for (let o = -60; o <= 120; o += HALF_STEP) GRID_OFFSETS.push(o);

  test.each(CLEFS)('%s: offset -> pitch -> offset is identity for every line/space', (clef) => {
    for (const o of GRID_OFFSETS) {
      const pitch = getPitchForOffset(o, clef);
      expect(pitch).toBeDefined();
      expect(getOffsetForPitch(pitch!, clef)).toBe(o);
    }
  });

  test.each(CLEFS)('%s: pitch -> offset -> pitch returns the same natural pitch', (clef) => {
    const pitches: string[] = [];
    for (let oct = 1; oct <= 7; oct++) {
      for (const l of LETTERS) pitches.push(`${l}${oct}`);
    }
    for (const pitch of pitches) {
      const offset = getOffsetForPitch(pitch, clef);
      expect(getPitchForOffset(offset, clef)).toBe(pitch);
    }
  });

  test('off-grid offsets (not on a line or space) return undefined', () => {
    for (const clef of CLEFS) {
      expect(getPitchForOffset(3, clef)).toBeUndefined(); // half of a step
      expect(getPitchForOffset(61, clef)).toBeUndefined();
      expect(getPitchForOffset(-5, clef)).toBeUndefined();
    }
  });

  test('getPitchForOffset returns a natural (no-accidental) spelling', () => {
    for (const clef of CLEFS) {
      for (let o = -48; o <= 102; o += HALF_STEP) {
        const pitch = getPitchForOffset(o, clef)!;
        expect(pitch).toMatch(/^[A-G]-?\d+$/); // no #, b
      }
    }
  });
});

describe('clef geometry: alto/tenor regression (the actual bug)', () => {
  // The bug: alto/tenor used the TREBLE table, so a mid-staff pitch landed at
  // its treble position. Assert that does NOT happen by comparing against the
  // treble offset for the same pitch.
  test('alto C4 (offset 24) is NOT at its treble position (offset 60)', () => {
    expect(getOffsetForPitch('C4', 'alto')).toBe(24);
    expect(getOffsetForPitch('C4', 'alto')).not.toBe(getOffsetForPitch('C4', 'treble'));
  });

  test('tenor C4 (offset 12) is NOT at its treble position (offset 60)', () => {
    expect(getOffsetForPitch('C4', 'tenor')).toBe(12);
    expect(getOffsetForPitch('C4', 'tenor')).not.toBe(getOffsetForPitch('C4', 'treble'));
  });

  test('clicking the middle line in alto inserts C4 (not treble B4)', () => {
    // Middle line offset = 24. In alto this must be Middle C; in treble it is B4.
    expect(getPitchForOffset(MIDDLE_LINE_OFFSET, 'alto')).toBe('C4');
    expect(getPitchForOffset(MIDDLE_LINE_OFFSET, 'treble')).toBe('B4');
  });

  test('alto and tenor disagree with treble across a mid-staff range', () => {
    let altoDiffs = 0;
    let tenorDiffs = 0;
    for (const p of ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4']) {
      if (getOffsetForPitch(p, 'alto') !== getOffsetForPitch(p, 'treble')) altoDiffs++;
      if (getOffsetForPitch(p, 'tenor') !== getOffsetForPitch(p, 'treble')) tenorDiffs++;
    }
    expect(altoDiffs).toBe(7);
    expect(tenorDiffs).toBe(7);
  });
});

describe('clef geometry: grand falls back to treble safely', () => {
  test('grand resolves identically to treble (resolved per-staff upstream)', () => {
    for (const p of ['C4', 'G4', 'E2', 'B5']) {
      expect(getOffsetForPitch(p, 'grand')).toBe(getOffsetForPitch(p, 'treble'));
    }
    expect(getPitchForOffset(24, 'grand')).toBe(getPitchForOffset(24, 'treble'));
  });

  test('unknown clef names fall back to treble (no crash)', () => {
    expect(getOffsetForPitch('C4', 'nonsense')).toBe(getOffsetForPitch('C4', 'treble'));
  });
});

describe('clef geometry: rests / invalid input', () => {
  test('null/undefined/empty pitch returns offset 0 (rest baseline)', () => {
    expect(getOffsetForPitch(null, 'treble')).toBe(0);
    expect(getOffsetForPitch(undefined, 'alto')).toBe(0);
    expect(getOffsetForPitch('', 'bass')).toBe(0);
  });

  test('staff line gap is exactly 12px and step is exactly 6px (treble landmark)', () => {
    // E4 (bottom line) to F5 (top line) spans 4 line gaps = 48px in treble.
    expect(getOffsetForPitch('E4', 'treble') - getOffsetForPitch('F5', 'treble')).toBe(4 * LINE_GAP);
    // Adjacent diatonic notes differ by exactly one step (6px).
    expect(getOffsetForPitch('E4', 'treble') - getOffsetForPitch('F4', 'treble')).toBe(HALF_STEP);
  });
});

describe('clef glyph placement agrees with note positions (ScoreHeader/ClefIcon parity)', () => {
  // The glyph baseline must sit on the clef's reference staff line, and that
  // line's offset must equal getOffsetForPitch(referencePitch, clef). This is
  // the property that keeps the drawn clef from contradicting the engraved
  // notes (the "staff contradicts itself" critical finding).
  const REFERENCE_PITCH: Record<string, string> = {
    treble: 'G4',
    bass: 'F3',
    alto: 'C4',
    tenor: 'C4',
  };
  // Reference line (1=bottom..5=top) -> offset (5 - line) * 12.
  const REFERENCE_LINE: Record<string, number> = {
    treble: 2,
    bass: 4,
    alto: 3,
    tenor: 4,
  };

  test.each(CLEFS)('%s: reference pitch sits exactly on the reference line', (clef) => {
    const lineOffset = (5 - REFERENCE_LINE[clef]) * LINE_GAP;
    expect(getOffsetForPitch(REFERENCE_PITCH[clef], clef)).toBe(lineOffset);
  });
});
