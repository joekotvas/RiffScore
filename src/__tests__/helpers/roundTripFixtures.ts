/**
 * Compact score builders for the importer round-trip suites (ABC and MusicXML share them).
 *
 *   ev('F#4:q.')                 a dotted quarter F♯4
 *   ev('C4-:h')                  a half note tied to the next
 *   ev('Bb4!:q') / ev('Bb4?:q')  a forced / a courtesy (parenthesized) accidental glyph
 *   ev(['E4:q', 'G4'])           a chord (the first spec sets the value)
 *   ev({ rest: '8.' })           a dotted eighth rest
 *   tuplet([3, 2], ['C4:8', 'D4:8', 'E4:8'])   a triplet; `base` overrides the tuplet's base value
 */

import type { Score, ScoreEvent } from '@/types';

let seq = 0;
export const nid = (): string => `n${++seq}`;

export type Spec = string | { rest: string } | string[];

export const DUR: Record<string, string> = {
  w: 'whole',
  h: 'half',
  q: 'quarter',
  '8': 'eighth',
  '16': 'sixteenth',
  '32': 'thirtysecond',
  '64': 'sixtyfourth',
};

export const ev = (spec: Spec, tuplet?: ScoreEvent['tuplet']): ScoreEvent => {
  const parse = (s: string) => {
    const m = s.match(/^([^:]+?)(-)?([!?])?(?::([a-z0-9]+?)(\.)?)?$/)!;
    return {
      pitch: m[1],
      tied: !!m[2],
      display: m[3] === '!' ? 'show' : m[3] === '?' ? 'courtesy' : undefined,
      duration: DUR[m[4] ?? 'q'],
      dotted: !!m[5],
    };
  };
  if (typeof spec === 'object' && !Array.isArray(spec)) {
    const d = spec.rest.replace('.', '');
    const id = nid();
    return {
      id,
      duration: DUR[d],
      dotted: spec.rest.endsWith('.'),
      isRest: true,
      notes: [{ id: `${id}-rest`, pitch: null, isRest: true }],
      ...(tuplet ? { tuplet } : {}),
    };
  }
  const specs = (Array.isArray(spec) ? spec : [spec]).map(parse);
  return {
    id: nid(),
    duration: specs[0].duration,
    dotted: specs[0].dotted,
    notes: specs.map((s) => ({
      id: nid(),
      pitch: s.pitch,
      ...(s.tied ? { tied: true } : {}),
      ...(s.display ? { accidentalDisplay: s.display as 'show' | 'courtesy' } : {}),
    })),
    ...(tuplet ? { tuplet } : {}),
  };
};

/** The duration name a spec denotes ('C4:8' → 'eighth', { rest: 'q' } → 'quarter'). */
export const specDuration = (spec: Spec): string => {
  const text = typeof spec === 'string' ? spec : Array.isArray(spec) ? spec[0] : `z:${spec.rest}`;
  return DUR[text.split(':')[1]?.replace('.', '') ?? 'q'];
};

export const tuplet = (ratio: [number, number], specs: Spec[], base?: string): ScoreEvent[] => {
  const id = `t${++seq}`;
  const baseDuration = base ?? specDuration(specs[0]);
  return specs.map((s, position) =>
    ev(s, { ratio, groupSize: specs.length, position, id, baseDuration })
  );
};

export interface StaffSpec {
  clef: 'treble' | 'bass' | 'alto' | 'tenor';
  measures: (ScoreEvent[] | { pickup: ScoreEvent[] })[];
}

export const score = (
  opts: {
    title?: string;
    timeSignature?: string;
    keySignature?: string;
    bpm?: number;
    chords?: [number, number, string][];
  },
  ...staves: StaffSpec[]
): Score => ({
  title: opts.title ?? 'Fixture',
  timeSignature: opts.timeSignature ?? '4/4',
  keySignature: opts.keySignature ?? 'C',
  bpm: opts.bpm ?? 120,
  staves: staves.map((st) => ({
    id: nid(),
    clef: st.clef,
    keySignature: opts.keySignature ?? 'C',
    measures: st.measures.map((m) =>
      Array.isArray(m) ? { id: nid(), events: m } : { id: nid(), events: m.pickup, isPickup: true }
    ),
  })),
  chordTrack: (opts.chords ?? []).map(([measure, quant, symbol]) => ({
    id: nid(),
    measure,
    quant,
    symbol,
  })),
});
