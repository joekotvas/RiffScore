/**
 * Score migration tests (schemaVersion + lossless chord-track accumulation).
 *
 * These assert structural/rhythmic correctness from first principles, not the
 * implementation's own arithmetic:
 *  - Idempotency: migrate(migrate(x)) deep-equals migrate(x); the result is
 *    stamped with SCHEMA_VERSION.
 *  - Accumulation (not modulo): a legacy global-quant chord track migrates to
 *    monotonically-increasing, correct measure-local positions, including cases
 *    the old `global % quantsPerMeasure` logic provably mis-placed (pickup bars
 *    and ragged measure widths).
 *
 * @tested src/types.ts (migrateScore / migrateChordTrack / SCHEMA_VERSION)
 */

import { migrateScore, SCHEMA_VERSION, type Score, type ChordSymbol } from '@/types';
import { getNoteDuration } from '@/utils/core';

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

/**
 * Independent oracle: the legacy global quant of a chord that sits at the START
 * of measure index `m` equals the SUM of the actual spans of measures 0..m-1.
 * (The chord subsystem builds anchors by accumulating real measure spans, so the
 * global quant was the running prefix sum — NOT m * nominalWidth.)
 */
const spanOf = (events: EventSpec[]): number =>
  events.reduce((acc, e) => acc + getNoteDuration(e.duration, e.dotted ?? false), 0);

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

describe('migrateChordTrack — lossless accumulation (not modulo)', () => {
  const chords = (s: Score): ChordSymbol[] => s.chordTrack ?? [];

  it('full 4/4 bars: chords map to the bars accumulation predicts', () => {
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
        legacyChord('c2', 64 + 16, 'G'), // bar 2 would be wrong... see below
      ],
    };
    // c2 global = 80 = 64 (bar0) + 16 -> bar 1, local 16.
    const out = chords(migrateScore(legacy));
    expect(out.find((c) => c.id === 'c0')).toMatchObject({ measure: 0, quant: 0 });
    expect(out.find((c) => c.id === 'c1')).toMatchObject({ measure: 1, quant: 0 });
    expect(out.find((c) => c.id === 'c2')).toMatchObject({ measure: 1, quant: 16 });
  });

  it('PICKUP bar: a chord at the start of bar 1 is NOT mis-placed into the pickup', () => {
    // Pickup bar 0 holds a single quarter (16 quants); bars 1+ are full (64).
    // Legacy global quant for "start of bar 1" = span(pickup) = 16 (accumulated).
    const pickupSpan = spanOf([{ id: 'p', duration: 'quarter' }]); // 16
    expect(pickupSpan).toBe(16);

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
            measure('m0', [{ id: 'p', duration: 'quarter' }], true), // pickup
            measure('m1', [{ id: 'a', duration: 'whole' }]),
            measure('m2', [{ id: 'b', duration: 'whole' }]),
          ],
        },
      ],
      chordTrack: [
        legacyChord('c0', 0, 'C'), // pickup, quant 0
        legacyChord('c1', pickupSpan, 'F'), // start of bar 1
        legacyChord('c2', pickupSpan + 64, 'G'), // start of bar 2
      ],
    };

    const out = chords(migrateScore(legacy));

    // First-principles expectation (accumulation): c1 sits at the START of bar 1.
    const c1 = out.find((c) => c.id === 'c1')!;
    expect(c1).toMatchObject({ measure: 1, quant: 0 });

    // The OLD modulo logic (global % 64) would have produced measure 0, quant 16
    // (inside the 16-quant pickup, past its end) — assert we are NOT that.
    expect(c1).not.toMatchObject({ measure: 0, quant: 16 });

    expect(out.find((c) => c.id === 'c0')).toMatchObject({ measure: 0, quant: 0 });
    expect(out.find((c) => c.id === 'c2')).toMatchObject({ measure: 2, quant: 0 });
  });

  it('RAGGED widths: chords accumulate over an underfilled middle bar', () => {
    // Bar 0 full (64). Bar 1 deliberately half-full (32). Bar 2 full (64).
    // Global quant for start of bar 2 = 64 + 32 = 96 (accumulated real spans).
    const legacy = {
      title: 'Ragged',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            measure('m0', [{ id: 'a', duration: 'whole' }]), // 64
            measure('m1', [{ id: 'b', duration: 'half' }]), // 32
            measure('m2', [{ id: 'c', duration: 'whole' }]), // 64
          ],
        },
      ],
      chordTrack: [
        legacyChord('c0', 0, 'C'),
        legacyChord('c1', 64, 'F'), // start of bar 1
        legacyChord('c2', 64 + 32, 'G'), // start of bar 2 (accumulation: 96)
      ],
    };

    const out = chords(migrateScore(legacy));
    expect(out.find((c) => c.id === 'c1')).toMatchObject({ measure: 1, quant: 0 });

    const c2 = out.find((c) => c.id === 'c2')!;
    expect(c2).toMatchObject({ measure: 2, quant: 0 });
    // Modulo(96, 64) = measure 1, quant 32 — i.e. END of the half-bar, wrong bar.
    expect(c2).not.toMatchObject({ measure: 1, quant: 32 });
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
