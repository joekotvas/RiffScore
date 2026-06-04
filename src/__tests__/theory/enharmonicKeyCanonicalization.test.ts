/**
 * Enharmonic key-signature canonicalization (#238).
 *
 * The theoretical flat-minor spellings Db/Gb/Cb minor carry 8, 9 and 10 flats
 * respectively (Tonal: alteration -8/-9/-10). They have no drawable signature,
 * no valid MusicXML `<fifths>` (±7), and no standard ABC `K:` field — their only
 * real notation is the enharmonic twin inside the 15 canonical keys:
 *
 *     Db minor -> C# minor (4 sharps)
 *     Gb minor -> F# minor (3 sharps)
 *     Cb minor -> B  minor (2 sharps)
 *
 * `canonicalizeKeySignature` respells these at the load boundary so the header
 * glyphs, the inline accidental resolver, and both exporters all see a
 * first-class key (previously they each fell back to C / fifths 0). Canonical
 * keys — including the enharmonically-valid F#/Gb/Cb majors — pass through
 * untouched. The sounding pitches are never changed; only the key label is.
 *
 * Oracle: Tonal's Key.minorKey(tonic).alteration is the authority for a key's
 * accidental count; these tests do not restate the implementation.
 */

import { Key } from 'tonal';
import { canonicalizeKeySignature, resolveKey } from '@/utils/keyResolution';
import { KEY_SIGNATURES } from '@/constants';
import { migrateScore, Score } from '@/types';
import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { generateABC } from '@/exporters/abcExporter';
import { SetKeySignatureCommand } from '@/commands/SetKeySignatureCommand';

/** The three theoretical flat-minor keys and their canonical enharmonic twins. */
const ENHARMONIC_PAIRS = [
  { theoretical: 'Dbm', canonical: 'C#m', fifths: 4 },
  { theoretical: 'Gbm', canonical: 'F#m', fifths: 3 },
  { theoretical: 'Cbm', canonical: 'Bm', fifths: 2 },
] as const;

describe('#238 canonicalizeKeySignature', () => {
  it('respells the three theoretical flat-minor keys to their canonical twin', () => {
    for (const { theoretical, canonical } of ENHARMONIC_PAIRS) {
      expect(canonicalizeKeySignature(theoretical)).toBe(canonical);
    }
  });

  it('only respells out-of-range keys (oracle: |alteration| > 7)', () => {
    for (const { theoretical } of ENHARMONIC_PAIRS) {
      // Sanity: the oracle agrees these are out of range before canonicalization.
      expect(Math.abs(Key.minorKey(theoretical.slice(0, -1)).alteration)).toBeGreaterThan(7);
    }
  });

  it('returns a key that is a first-class KEY_SIGNATURES member within ±7', () => {
    for (const { theoretical } of ENHARMONIC_PAIRS) {
      const canon = canonicalizeKeySignature(theoretical);
      expect(KEY_SIGNATURES[canon]).toBeDefined();
      expect(Math.abs(resolveKey(canon).alteration)).toBeLessThanOrEqual(7);
    }
  });

  it('leaves all 15 canonical major + minor keys unchanged', () => {
    // Every canonical key is in range, so none should be flipped.
    for (const key of Object.keys(KEY_SIGNATURES)) {
      expect(canonicalizeKeySignature(key)).toBe(key);
    }
  });

  it('never flips an enharmonically-valid canonical key (F# stays F#, not Gb)', () => {
    // F#/Gb and B/Cb majors are BOTH valid (≤7 accidentals); canonicalization
    // must not gratuitously respell a key that is already representable.
    expect(canonicalizeKeySignature('F#')).toBe('F#');
    expect(canonicalizeKeySignature('Gb')).toBe('Gb');
    expect(canonicalizeKeySignature('Cb')).toBe('Cb');
    expect(canonicalizeKeySignature('B')).toBe('B');
  });
});

/** Minimal one-note score carrying an arbitrary key signature. */
const scoreWithKey = (keySignature: string): Score => ({
  title: 'Test',
  timeSignature: '4/4',
  keySignature,
  bpm: 120,
  staves: [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature,
      measures: [
        {
          id: 'm1',
          events: [
            { id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
          ],
        },
      ],
    },
  ],
});

describe('#238 migrateScore normalizes the stored key at the load boundary', () => {
  it('canonicalizes both the score- and staff-level keySignature', () => {
    for (const { theoretical, canonical } of ENHARMONIC_PAIRS) {
      const migrated = migrateScore(scoreWithKey(theoretical));
      expect(migrated.keySignature).toBe(canonical);
      expect(migrated.staves[0].keySignature).toBe(canonical);
    }
  });

  it('is idempotent — re-migrating a canonicalized score is a no-op', () => {
    const once = migrateScore(scoreWithKey('Dbm'));
    const twice = migrateScore(once);
    expect(twice.keySignature).toBe('C#m');
    expect(twice).toEqual(once);
  });

  it('leaves a canonical key untouched', () => {
    const migrated = migrateScore(scoreWithKey('Em'));
    expect(migrated.keySignature).toBe('Em');
    expect(migrated.staves[0].keySignature).toBe('Em');
  });
});

describe('#238 exporters emit the representable enharmonic signature', () => {
  // The exporters canonicalize independently (defense-in-depth), so a raw,
  // un-migrated score still exports correctly rather than falling back to C / 0.
  for (const { theoretical, canonical, fifths } of ENHARMONIC_PAIRS) {
    it(`MusicXML: ${theoretical} exports <fifths>${fifths}</fifths> (not 0)`, () => {
      expect(generateMusicXML(scoreWithKey(theoretical))).toContain(`<fifths>${fifths}</fifths>`);
    });

    it(`ABC: ${theoretical} exports K:${canonical} (not K:C)`, () => {
      const abc = generateABC(scoreWithKey(theoretical), 120);
      expect(abc).toContain(`K:${canonical}`);
      expect(abc).not.toMatch(/^K:C$/m);
    });
  }

  it('regression: a theoretical flat-minor key no longer falls back to C / fifths 0', () => {
    const xml = generateMusicXML(scoreWithKey('Dbm'));
    expect(xml).not.toContain('<fifths>0</fifths>');
  });
});

describe('#238 SetKeySignatureCommand keeps the stored key canonical', () => {
  // The UI picker can only emit canonical keys, but the public setKeySignature()
  // API dispatches this same command with an arbitrary string — so the command,
  // not just migrateScore, must hold the invariant.
  it('canonicalizes the requested key into both score and staves', () => {
    for (const { theoretical, canonical } of ENHARMONIC_PAIRS) {
      const result = new SetKeySignatureCommand(theoretical).execute(scoreWithKey('C'));
      expect(result.keySignature).toBe(canonical);
      result.staves.forEach((s) => expect(s.keySignature).toBe(canonical));
    }
  });

  it('treats a theoretical spelling of the current key as a no-op', () => {
    // Setting Dbm on a score already in C#m is the SAME key — must not churn.
    const current = scoreWithKey('C#m');
    const result = new SetKeySignatureCommand('Dbm').execute(current);
    expect(result).toBe(current);
  });

  it('leaves a canonical key unchanged', () => {
    const result = new SetKeySignatureCommand('Gm').execute(scoreWithKey('C'));
    expect(result.keySignature).toBe('Gm');
  });
});
