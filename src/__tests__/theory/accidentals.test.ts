/**
 * Accidental source-of-truth (Finding 1A).
 *
 * The critical regression: setAccidental/toggleAccidental flipped a redundant
 * `note.accidental` field WITHOUT changing `note.pitch`, so neither sound nor
 * spelling changed (a complete no-op).
 *
 * First-principles oracle: after applying an accidental, the resulting PITCH
 * string must have the intended sounding pitch class (chroma) and alteration
 * (alt) according to Tonal. The legacy `accidental` field must be a strictly
 * derived MIRROR of that pitch. These tests would FAIL if the operation were a
 * no-op (the old pitch would not match the intended chroma/alt).
 */

import { Note } from 'tonal';
import {
  foldAccidentalIntoPitch,
  deriveAccidental,
  deriveAccidentalKind,
} from '@/services/MusicService';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const OCTAVES = [2, 3, 4, 5, 6] as const;
const OPS = ['sharp', 'flat', 'natural'] as const;

/** Expected alteration for each explicit accidental op. */
const altForOp: Record<(typeof OPS)[number], number> = { sharp: 1, flat: -1, natural: 0 };

describe('foldAccidentalIntoPitch is NOT a no-op (oracle: Tonal chroma + alt)', () => {
  // Exhaustive over letters x octaves x ops x starting alteration.
  const startingAccidentals = ['', '#', 'b', '##', 'bb'];

  for (const letter of LETTERS) {
    for (const oct of OCTAVES) {
      for (const startAcc of startingAccidentals) {
        for (const op of OPS) {
          const startPitch = `${letter}${startAcc}${oct}`;
          it(`${startPitch} + ${op} => correct sounding pitch & alteration`, () => {
            const result = foldAccidentalIntoPitch(startPitch, op);
            const rn = Note.get(result);

            // Letter and octave are preserved (the accidental targets the line).
            expect(rn.letter).toBe(letter);
            expect(rn.oct).toBe(oct);

            // The applied alteration matches the requested op (oracle: Tonal alt).
            expect(rn.alt).toBe(altForOp[op]);

            // The sounding pitch class matches what the operation should produce:
            // the natural chroma of the letter shifted by the alteration.
            const naturalChroma = Note.get(`${letter}${oct}`).chroma;
            const expectedChroma = ((naturalChroma + altForOp[op]) % 12 + 12) % 12;
            expect(rn.chroma).toBe(expectedChroma);
          });
        }
      }
    }
  }

  it('cycling none -> sharp -> flat -> natural produces correct spelling at each step', () => {
    // Start: F4 (no explicit accidental in C major).
    let p = 'F4';

    // none -> sharp
    p = foldAccidentalIntoPitch(p, 'sharp');
    expect(p).toBe('F#4');
    expect(Note.get(p).alt).toBe(1);

    // sharp -> flat (applies to the LETTER, not the sharpened pitch)
    p = foldAccidentalIntoPitch(p, 'flat');
    expect(p).toBe('Fb4');
    expect(Note.get(p).alt).toBe(-1);

    // flat -> natural
    p = foldAccidentalIntoPitch(p, 'natural');
    expect(p).toBe('F4');
    expect(Note.get(p).alt).toBe(0);
  });

  it('natural returns the unaltered letter regardless of prior alteration', () => {
    expect(foldAccidentalIntoPitch('C#4', 'natural')).toBe('C4');
    expect(foldAccidentalIntoPitch('Bbb3', 'natural')).toBe('B3');
    expect(foldAccidentalIntoPitch('Fx5', 'natural')).toBe('F5');
  });
});

describe('foldAccidentalIntoPitch null => key-implied spelling', () => {
  it('returns to the key signature spelling when accidental is removed', () => {
    // In G major the F line implies F#.
    expect(foldAccidentalIntoPitch('F4', null, 'G')).toBe('F#4');
    expect(foldAccidentalIntoPitch('F#4', null, 'G')).toBe('F#4');
    // In C major the F line is natural.
    expect(foldAccidentalIntoPitch('F#4', null, 'C')).toBe('F4');
    // In E minor the F line implies F#.
    expect(foldAccidentalIntoPitch('F4', null, 'Em')).toBe('F#4');
  });
});

describe('deriveAccidental: the legacy field is a strictly-derived mirror of pitch', () => {
  it.each([
    ['C4', 'natural'],
    ['F#4', 'sharp'],
    ['Bb3', 'flat'],
    ['Fx5', 'sharp'], // double sharp folds to sharp in the tri-state mirror
    ['Bbb2', 'flat'],
  ])('deriveAccidental(%s) === %s', (pitch, expected) => {
    expect(deriveAccidental(pitch)).toBe(expected);
  });

  it('returns null for rests / invalid pitches', () => {
    expect(deriveAccidental(null)).toBeNull();
    expect(deriveAccidental('')).toBeNull();
  });

  it('the mirror NEVER contradicts the pitch (property over all folds)', () => {
    for (const letter of LETTERS) {
      for (const op of OPS) {
        const pitch = foldAccidentalIntoPitch(`${letter}4`, op);
        const mirror = deriveAccidental(pitch);
        const alt = Note.get(pitch).alt;
        if (alt > 0) expect(mirror).toBe('sharp');
        else if (alt < 0) expect(mirror).toBe('flat');
        else expect(mirror).toBe('natural');
      }
    }
  });
});

describe('deriveAccidentalKind preserves double accidentals (no ±2 collapse)', () => {
  it.each([
    ['Fx4', 'doubleSharp'],
    ['F#4', 'sharp'],
    ['F4', 'natural'],
    ['Fb4', 'flat'],
    ['Fbb4', 'doubleFlat'],
  ])('deriveAccidentalKind(%s) === %s', (pitch, expected) => {
    expect(deriveAccidentalKind(pitch)).toBe(expected);
  });
});
