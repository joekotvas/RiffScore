/**
 * Minor-key correctness (Finding 1B).
 *
 * First-principles oracle: Tonal's `Key.minorKey(tonic)` is the authority for a
 * minor key's natural scale and signature. These tests assert that the app's
 * key resolution + accidental theory agree with that oracle for ALL 15 minor
 * keys — they do NOT restate the implementation.
 *
 * Regression target: `Key.majorKey('Em').scale === []` made every minor key
 * silently wrong (redundant accidentals on render, naturals on entry).
 */

import { Key, Note } from 'tonal';
import { resolveKey, getEffectiveScale, parseKey } from '@/utils/keyResolution';
import { needsAccidental, applyKeySignature, getScaleNotes } from '@/services/MusicService';
import { getKeyAccidental } from '@/utils/accidentalContext';

// The 15 minor keys, derived independently from Tonal's relative-minor mapping.
const MAJOR_ROOTS = [
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Cb',
] as const;

const MINOR_KEYS = MAJOR_ROOTS.map((maj) => `${Key.majorKey(maj).minorRelative}m`);

describe('minor key resolution (oracle: Tonal Key.minorKey)', () => {
  it('regression: Key.majorKey on a minor string is empty (the bug we fix)', () => {
    // Documents WHY the resolver exists. If Tonal ever changes this, revisit.
    expect(Key.majorKey('Em').scale).toEqual([]);
    expect(Key.minorKey('E').natural.scale.length).toBe(7);
  });

  it.each(MINOR_KEYS)('%s resolves to the natural-minor scale and signature', (minorKey) => {
    const tonic = minorKey.slice(0, -1);
    const oracle = Key.minorKey(tonic);
    const resolved = resolveKey(minorKey);

    expect(parseKey(minorKey)).toEqual({ tonic, mode: 'minor' });
    expect(resolved.mode).toBe('minor');
    expect(resolved.scale).toEqual([...oracle.natural.scale]);
    expect(resolved.alteration).toBe(oracle.alteration);

    // MusicService must expose the same (mode-aware) scale.
    expect(getScaleNotes(minorKey)).toEqual([...oracle.natural.scale]);
    expect(getEffectiveScale(minorKey)).toHaveLength(7);
  });

  it.each(MINOR_KEYS)(
    '%s: the set of sharped/flatted letters equals the natural-minor signature',
    (minorKey) => {
      const tonic = minorKey.slice(0, -1);
      const oracleScale = Key.minorKey(tonic).natural.scale;

      // Oracle: which letters are altered in this signature, and how.
      const oracleAltered = new Map<string, 'sharp' | 'flat'>();
      oracleScale.forEach((pc) => {
        const n = Note.get(pc);
        if (n.alt > 0) oracleAltered.set(n.letter, 'sharp');
        else if (n.alt < 0) oracleAltered.set(n.letter, 'flat');
      });

      // The app's per-letter key accidental must match the oracle for every letter.
      for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
        const expected = oracleAltered.get(letter) ?? 'natural';
        expect(getKeyAccidental(letter, minorKey)).toBe(expected);
      }
    }
  );
});

describe('minor key: render (needsAccidental) suppresses diatonic, shows foreign', () => {
  it('E minor: diatonic F# shows NO accidental; an F natural contradicts the key', () => {
    // F# is the single sharp of E minor -> diatonic, no glyph.
    expect(needsAccidental('F#4', 'Em')).toEqual({ show: false, type: null });
    // F natural is foreign in E minor -> must print a natural to cancel the key.
    expect(needsAccidental('F4', 'Em')).toEqual({ show: true, type: 'natural' });
  });

  it.each(MINOR_KEYS)('%s: every diatonic scale degree renders WITHOUT an accidental', (minorKey) => {
    const tonic = minorKey.slice(0, -1);
    const scale = Key.minorKey(tonic).natural.scale;
    scale.forEach((pc) => {
      const pitch = `${pc}4`;
      // A note that IS in the key must not print a redundant accidental.
      expect(needsAccidental(pitch, minorKey).show).toBe(false);
    });
  });

  it.each(MINOR_KEYS)(
    '%s: the raised leading tone (harmonic minor) prints as a chromatic accidental',
    (minorKey) => {
      const tonic = minorKey.slice(0, -1);
      // Harmonic minor raises the 7th by a semitone vs natural minor.
      const harmonicScale = Key.minorKey(tonic).harmonic.scale;
      const naturalScale = Key.minorKey(tonic).natural.scale;
      const leadingTone = harmonicScale[6];

      // Only assert when the raised 7th genuinely differs from natural minor.
      if (leadingTone !== naturalScale[6]) {
        const pitch = `${leadingTone}4`;
        expect(needsAccidental(pitch, minorKey).show).toBe(true);
      }
    }
  );
});

describe('minor key: entry (applyKeySignature) snaps to the diatonic pitch', () => {
  it('clicking the F line in E minor yields F#4 (not F natural)', () => {
    expect(applyKeySignature('F4', 'Em')).toBe('F#4');
  });

  it('clicking the B line in D minor yields Bb4', () => {
    expect(applyKeySignature('B4', 'Dm')).toBe('Bb4');
  });

  it.each(MINOR_KEYS)('%s: each natural-letter click snaps to that key degree', (minorKey) => {
    const tonic = minorKey.slice(0, -1);
    const scale = Key.minorKey(tonic).natural.scale;
    scale.forEach((pc) => {
      const letter = Note.get(pc).letter;
      const snapped = applyKeySignature(`${letter}4`, minorKey);
      // The snapped pitch class must equal the scale degree's pitch class.
      expect(Note.get(snapped).pc).toBe(pc);
      // And it must sound at the same chroma the oracle expects.
      expect(Note.get(snapped).chroma).toBe(Note.get(pc).chroma);
    });
  });
});

describe('major keys are unaffected by the resolver', () => {
  it.each(['C', 'G', 'D', 'F', 'Bb', 'F#', 'Cb'])('%s resolves to the major scale', (key) => {
    expect(resolveKey(key).mode).toBe('major');
    expect(resolveKey(key).scale).toEqual([...Key.majorKey(key).scale]);
  });

  it("treats a 'maj' suffix as major, not minor", () => {
    expect(parseKey('Cmaj')).toEqual({ tonic: 'C', mode: 'major' });
  });
});
