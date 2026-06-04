/**
 * Score migration tests (schemaVersion + nominal chord-track decode).
 *
 * These assert structural/rhythmic correctness from first principles, not the
 * implementation's own arithmetic:
 *  - Idempotency: migrate(migrate(x)) deep-equals migrate(x); the result is
 *    stamped with SCHEMA_VERSION.
 *  - Nominal decode: a legacy global-quant chord track decodes via the engine's
 *    nominal convention (measure = floor(g/nominal), quant = g % nominal) — the
 *    exact inverse of how toneEngine re-encodes chord time for playback, so
 *    positions round-trip. (No legacy ragged-bar data exists to preserve.)
 *
 * @tested src/types.ts (migrateScore / migrateChordTrack / SCHEMA_VERSION)
 */

import { migrateScore, SCHEMA_VERSION, type Score, type ChordSymbol } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface EventSpec {
  id: string;
  duration: string;
  dotted?: boolean;
}

const ev = (s: EventSpec) => ({
  id: s.id,
  duration: s.duration,
  dotted: s.dotted ?? false,
  notes: [{ id: `${s.id}-n`, pitch: 'C4' }],
});

const measure = (id: string, events: EventSpec[], isPickup = false) => ({
  id,
  events: events.map(ev),
  ...(isPickup ? { isPickup: true } : {}),
});

// Build the OLD chord format: { id, quant (GLOBAL), symbol } — no `measure` field.
const legacyChord = (id: string, globalQuant: number, symbol: string) => ({
  id,
  quant: globalQuant,
  symbol,
});

// ---------------------------------------------------------------------------
// IDEMPOTENCY
// ---------------------------------------------------------------------------

describe('migrateScore — idempotency & versioning', () => {
  const makeStavesScore = (): Partial<Score> => ({
    title: 'Idem',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      {
        id: 's1',
        clef: 'treble',
        keySignature: 'C',
        measures: [
          measure('m0', [{ id: 'a', duration: 'whole' }]),
          measure('m1', [{ id: 'b', duration: 'whole' }]),
        ],
      },
    ],
    // Legacy global chord track to exercise the migration path too.
    chordTrack: [legacyChord('c0', 0, 'C'), legacyChord('c1', 64, 'G')] as unknown as Score['chordTrack'],
  });

  it('stamps schemaVersion = SCHEMA_VERSION after migration', () => {
    const migrated = migrateScore(makeStavesScore());
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('migrate(migrate(x)) deep-equals migrate(x)', () => {
    const once = migrateScore(makeStavesScore());
    const twice = migrateScore(once);
    expect(twice).toEqual(once);
  });

  it('is idempotent for a legacy single-staff (no staves) score', () => {
    const legacy = {
      title: 'Old',
      timeSignature: '3/4',
      keySignature: 'G',
      bpm: 90,
      clef: 'bass',
      measures: [measure('m0', [{ id: 'a', duration: 'half', dotted: true }])],
      chordTrack: [legacyChord('c0', 0, 'G'), legacyChord('c1', 48, 'D')],
    };
    const once = migrateScore(legacy);
    const twice = migrateScore(once);
    expect(once.schemaVersion).toBe(SCHEMA_VERSION);
    expect(twice).toEqual(once);
    expect(once.staves).toHaveLength(1);
    expect(once.staves[0].clef).toBe('bass');
  });

  it('an already-current score is returned without re-deriving chord positions', () => {
    const current = migrateScore(makeStavesScore());
    // Mutating nothing, re-migrating must not shift any chord position.
    const again = migrateScore(current);
    expect(again.chordTrack).toEqual(current.chordTrack);
  });
});

// ---------------------------------------------------------------------------
// ACCUMULATION (not modulo)
// ---------------------------------------------------------------------------

describe('migrateChordTrack — nominal global->local decode (round-trips playback)', () => {
  const chords = (s: Score): ChordSymbol[] => s.chordTrack ?? [];

  it('full 4/4 bars: global quant decodes to measure = floor(g/64), quant = g % 64', () => {
    // Three full 4/4 bars (64 quants each).
    const bars = [
      [{ id: 'a', duration: 'whole' }],
      [{ id: 'b', duration: 'whole' }],
      [{ id: 'c', duration: 'whole' }],
    ];
    const legacy = {
      title: 'T',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: bars.map((b, i) => measure(`m${i}`, b)),
        },
      ],
      chordTrack: [
        legacyChord('c0', 0, 'C'), // start of bar 0
        legacyChord('c1', 64, 'F'), // start of bar 1
        legacyChord('c2', 80, 'G'), // bar 1, local 16
      ],
    };
    // Nominal decode: c2 global 80 -> floor(80/64)=1, 80%64=16 -> measure 1, quant 16.
    const out = chords(migrateScore(legacy));
    expect(out.find((c) => c.id === 'c0')).toMatchObject({ measure: 0, quant: 0 });
    expect(out.find((c) => c.id === 'c1')).toMatchObject({ measure: 1, quant: 0 });
    expect(out.find((c) => c.id === 'c2')).toMatchObject({ measure: 1, quant: 16 });
  });

  it("decode ignores a pickup/ragged bar's actual content (nominal, not accumulated)", () => {
    // Codex P1 case: a pickup bar holds only a quarter (16 quants), but a legacy
    // chord at global 64 still means "start of bar 1" under the nominal convention
    // the engine uses everywhere (toneEngine re-encodes as measure * 64 + quant).
    // The pickup's real span must NOT shift it (the accumulation bug gave quant 48).
    const legacy = {
      title: 'Pickup',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            measure('m0', [{ id: 'p', duration: 'quarter' }], true), // pickup (16 quants)
            measure('m1', [{ id: 'a', duration: 'whole' }]),
            measure('m2', [{ id: 'b', duration: 'whole' }]),
          ],
        },
      ],
      chordTrack: [
        legacyChord('c0', 0, 'C'), // pickup, quant 0
        legacyChord('c1', 64, 'F'), // start of bar 1 (nominal)
        legacyChord('c2', 128, 'G'), // start of bar 2 (nominal)
      ],
    };

    const out = chords(migrateScore(legacy));

    expect(out.find((c) => c.id === 'c0')).toMatchObject({ measure: 0, quant: 0 });
    const c1 = out.find((c) => c.id === 'c1')!;
    expect(c1).toMatchObject({ measure: 1, quant: 0 });
    // NOT shifted by the pickup's real span (the accumulation regression gave quant 48).
    expect(c1).not.toMatchObject({ measure: 1, quant: 48 });
    expect(out.find((c) => c.id === 'c2')).toMatchObject({ measure: 2, quant: 0 });
  });

  it('round-trips the global position exactly (measure * nominal + quant === global)', () => {
    // The invariant that keeps migration consistent with toneEngine, which
    // re-encodes a chord as `measure * quantsPerMeasure + quant` for playback.
    const NOMINAL = 64; // 4/4
    const globals = [0, 16, 48, 64, 80, 127, 128, 200];
    const legacy = {
      title: 'RT',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: [measure('m0', [{ id: 'a', duration: 'whole' }])],
        },
      ],
      chordTrack: globals.map((g, i) => legacyChord(`c${i}`, g, 'C')),
    };

    const out = chords(migrateScore(legacy));
    out.forEach((c, i) => {
      expect(c.measure * NOMINAL + c.quant).toBe(globals[i]);
      expect(c.quant).toBeGreaterThanOrEqual(0);
      expect(c.quant).toBeLessThan(NOMINAL);
    });
  });

  it('produces monotonically non-decreasing absolute positions for an ascending track', () => {
    const legacy = {
      title: 'Mono',
      timeSignature: '3/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            measure('m0', [{ id: 'a', duration: 'half', dotted: true }]), // 48 = full 3/4
            measure('m1', [{ id: 'b', duration: 'half', dotted: true }]),
            measure('m2', [{ id: 'c', duration: 'half', dotted: true }]),
          ],
        },
      ],
      chordTrack: [
        legacyChord('c0', 0, 'C'),
        legacyChord('c1', 16, 'D'),
        legacyChord('c2', 48, 'E'),
        legacyChord('c3', 48 + 32, 'F'),
        legacyChord('c4', 96, 'G'),
      ],
    };

    const out = chords(migrateScore(legacy));
    // Absolute position oracle: measure index * full-3/4-width (48) + local quant.
    // (All bars here are nominal width, so accumulation == nominal here.)
    const absolute = (c: ChordSymbol) => c.measure * 48 + c.quant;
    const positions = out
      .slice()
      .sort((a, b) => a.measure - b.measure || a.quant - b.quant)
      .map(absolute);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
    }
    // And the absolute positions must equal the original global quants exactly.
    expect(positions.sort((a, b) => a - b)).toEqual([0, 16, 48, 80, 96]);
  });

  it('leaves an already-measure-local chord track unchanged (no double migration)', () => {
    const score: Partial<Score> = {
      title: 'New',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: [measure('m0', [{ id: 'a', duration: 'whole' }])],
        },
      ],
      chordTrack: [
        { id: 'c0', measure: 0, quant: 0, symbol: 'C' },
        { id: 'c1', measure: 0, quant: 16, symbol: 'G' },
      ],
    };
    const out = chords(migrateScore(score));
    expect(out).toEqual([
      { id: 'c0', measure: 0, quant: 0, symbol: 'C' },
      { id: 'c1', measure: 0, quant: 16, symbol: 'G' },
    ]);
  });

  it('preserves chord identity and symbol through migration', () => {
    const legacy = {
      title: 'IdSym',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: [measure('m0', [{ id: 'a', duration: 'whole' }])],
        },
      ],
      chordTrack: [legacyChord('keep-me', 0, 'Cmaj7')],
    };
    const out = chords(migrateScore(legacy));
    expect(out[0].id).toBe('keep-me');
    expect(out[0].symbol).toBe('Cmaj7');
  });
});
