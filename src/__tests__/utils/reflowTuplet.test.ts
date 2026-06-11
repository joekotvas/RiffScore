/**
 * #256: reflow (time-signature change) must treat a tuplet group as an atomic, indivisible unit —
 * never split it into plain-duration fragments that still carry the tuplet object (which produced
 * incoherent, validation-failing groups). The whole group moves to the next bar if it doesn't fit.
 */
import { reflowScore, tupletsFitTimeSignature } from '@/utils/core';
import { sumQuants } from '@/utils/tuplet';
import { validateMeasure, validateScore } from '@/utils/validation';
import { getMeasureCapacity } from '@/constants';
import { SetTimeSignatureCommand } from '@/commands/SetTimeSignatureCommand';
import { createDefaultScore, Measure, ScoreEvent, Score } from '@/types';

const q = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});
const trip = (id: string, pitch: string, position: number): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: 'T1' },
});

// 4/4: quarter, quarter, [eighth-triplet ×3], quarter  (the issue's repro)
const source = (): Measure[] => [
  {
    id: 'm0',
    events: [q('a', 'C4'), q('b', 'D4'), trip('t0', 'E4', 0), trip('t1', 'F4', 1), trip('t2', 'G4', 2), q('c', 'A4')],
  },
];

const tupletMembers = (measures: Measure[]) =>
  measures.flatMap((m) => m.events).filter((e) => e.tuplet);

describe('reflowScore keeps tuplets atomic (#256)', () => {
  it('reflow 4/4 → 2/4 keeps the triplet intact and every bar valid', () => {
    const result = reflowScore(source(), '2/4');
    const cap = getMeasureCapacity('2/4');

    // The three triplet members survive as a coherent group: same id, contiguous positions 0/1/2,
    // unchanged eighth duration — NOT split into sixteenth/sixtyfourth fragments.
    const members = tupletMembers(result);
    expect(members).toHaveLength(3);
    expect(members.map((m) => m.duration)).toEqual(['eighth', 'eighth', 'eighth']);
    expect(members.map((m) => m.tuplet?.position)).toEqual([0, 1, 2]);
    expect(members.every((m) => m.tuplet?.id === 'T1')).toBe(true);

    // All three members land in the SAME measure (the group never straddles a bar line).
    const measureOf = (id: string) => result.findIndex((m) => m.events.some((e) => e.id === id));
    expect(new Set(members.map((m) => measureOf(m.id))).size).toBe(1);

    // No measure is flagged partial-tuplet or overfull.
    result.forEach((m) => {
      expect(sumQuants(m.events).partialTuplet).toBe(false);
      expect(validateMeasure(m, cap).valid).toBe(true);
    });
  });

  it('reflow 4/4 → 3/8 still keeps the triplet atomic (no overfull bar from a split group)', () => {
    const result = reflowScore(source(), '3/8');
    const cap = getMeasureCapacity('3/8');
    const members = tupletMembers(result);
    expect(members).toHaveLength(3);
    expect(members.map((m) => m.tuplet?.position)).toEqual([0, 1, 2]);
    const measureOf = (id: string) => result.findIndex((m) => m.events.some((e) => e.id === id));
    expect(new Set(members.map((m) => measureOf(m.id))).size).toBe(1);
    result.forEach((m) => {
      expect(sumQuants(m.events).partialTuplet).toBe(false);
      // never overfull (a split group used to overflow a single bar)
      expect(sumQuants(m.events).quants).toBeLessThanOrEqual(cap);
    });
  });

  it('does not poison the next plain event when a tuplet bar overflows (quants conserved)', () => {
    // A half-note triplet (footprint 64q = a whole note) + a trailing quarter, reflowed to 2/4 (32):
    // the triplet can't fit a 2/4 bar; the clamp must keep the trailing quarter from being inflated.
    const htrip = (id: string, pitch: string, position: number): ScoreEvent => ({
      id,
      duration: 'half',
      dotted: false,
      notes: [{ id: `${id}n`, pitch }],
      tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'half', id: 'HT' },
    });
    const m: Measure[] = [{ id: 'm0', events: [htrip('h0', 'C4', 0), htrip('h1', 'E4', 1), htrip('h2', 'G4', 2), q('c', 'A4')] }];
    const before = m[0].events.reduce((s, e) => s + (e.tuplet ? 32 * (2 / 3) : 16), 0);
    const result = reflowScore(m, '2/4');
    const after = result.flatMap((mm) => mm.events).reduce((s, e) => {
      const base: Record<string, number> = { half: 32, quarter: 16, eighth: 8, whole: 64 };
      return s + (e.tuplet ? (base[e.duration] ?? 0) * (2 / 3) : base[e.duration] ?? 0);
    }, 0);
    expect(Math.round(after)).toBe(Math.round(before)); // total duration conserved (no inflation)
  });

  it('plain (non-tuplet) notes still split-and-tie across the bar line', () => {
    // 4/4 [quarter, half] → 2/4: the half straddles the bar line and splits into two tied quarters.
    const m: Measure[] = [
      {
        id: 'm0',
        events: [
          { id: 'qa', duration: 'quarter', dotted: false, notes: [{ id: 'qan', pitch: 'C4' }] },
          { id: 'h', duration: 'half', dotted: false, notes: [{ id: 'hn', pitch: 'D4' }] },
        ],
      },
    ];
    const result = reflowScore(m, '2/4');
    const notes = result.flatMap((mm) => mm.events);
    expect(notes.length).toBeGreaterThan(2); // the half split into tied fragments
    expect(notes.every((e) => !e.tuplet)).toBe(true);
    expect(notes.some((e) => e.notes.some((n) => n.tied))).toBe(true); // tie created across the bar
  });
});

describe('SetTimeSignatureCommand × tuplets (#256 QA)', () => {
  const htrip = (id: string, pitch: string, position: number): ScoreEvent => ({
    id,
    duration: 'half',
    dotted: false,
    notes: [{ id: `${id}n`, pitch }],
    tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'half', id: 'HT' },
  });
  const etrip = (id: string, pitch: string, position: number, gid: string): ScoreEvent => ({
    id,
    duration: 'eighth',
    dotted: false,
    notes: [{ id: `${id}n`, pitch }],
    tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: gid },
  });

  it('tupletsFitTimeSignature: an eighth-triplet fits 2/4 but a half-triplet does not', () => {
    const eighthTrip = [{ measures: [{ id: 'm', events: [etrip('a', 'C4', 0, 'T'), etrip('b', 'E4', 1, 'T'), etrip('c', 'G4', 2, 'T')] }] }];
    const halfTrip = [{ measures: [{ id: 'm', events: [htrip('a', 'C4', 0), htrip('b', 'E4', 1), htrip('c', 'G4', 2)] }] }];
    expect(tupletsFitTimeSignature(eighthTrip, '2/4')).toBe(true);
    expect(tupletsFitTimeSignature(halfTrip, '2/4')).toBe(false);
  });

  it('keeps grand-staff measure counts equal after reflow (atomic tuplets vs plain notes)', () => {
    const s = createDefaultScore();
    s.timeSignature = '4/4';
    s.staves = [
      // treble: three eighth-triplet GROUPS (48q) — atomic placement spreads them
      {
        ...s.staves[0],
        clef: 'treble',
        measures: [
          {
            id: 'mt',
            events: [
              etrip('t1a', 'C4', 0, 'T1'), etrip('t1b', 'D4', 1, 'T1'), etrip('t1c', 'E4', 2, 'T1'),
              etrip('t2a', 'F4', 0, 'T2'), etrip('t2b', 'G4', 1, 'T2'), etrip('t2c', 'A4', 2, 'T2'),
              etrip('t3a', 'B4', 0, 'T3'), etrip('t3b', 'C5', 1, 'T3'), etrip('t3c', 'D5', 2, 'T3'),
            ],
          },
        ],
      },
      // bass: three quarters (48q) — split-and-tie packs denser
      {
        id: 'sb',
        clef: 'bass',
        keySignature: 'C',
        measures: [{ id: 'mb', events: [q('b1', 'C3'), q('b2', 'E3'), q('b3', 'G3')] }],
      },
    ] as Score['staves'];

    const after = new SetTimeSignatureCommand('3/8').execute(s);
    const counts = after.staves.map((st) => st.measures.length);
    expect(new Set(counts).size).toBe(1); // every staff has the same number of measures
    expect(validateScore(after).valid).toBe(true);
  });

  it('refuses a time-signature change a tuplet cannot fit (model left unchanged)', () => {
    const s = createDefaultScore();
    s.timeSignature = '4/4';
    s.staves = [{ ...s.staves[0], measures: [{ id: 'm0', events: [htrip('a', 'C4', 0), htrip('b', 'E4', 1), htrip('c', 'G4', 2)] }] }];
    const after = new SetTimeSignatureCommand('2/4').execute(s);
    expect(after.timeSignature).toBe('4/4'); // unchanged — the half-triplet can't fit a 2/4 bar
    expect(after).toBe(s);
  });
});
