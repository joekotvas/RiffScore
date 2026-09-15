/**
 * Differential fuzz: random, valid ABC tunes must sound identical to abcjs.
 *
 * A generator builds tunes from every construct the importer supports (keys with modes, clef and
 * octave properties, all three unit lengths, simple and compound meters, notes with accidentals
 * and octave marks, every length form, rests, chords, ties, tuplets, broken rhythm) and both
 * parsers' sounding onsets per staff are compared. The seed is fixed so the run is reproducible.
 *
 * Two abcjs behaviours are deliberately kept out of the generator because RiffScore follows the
 * ABC 2.1 text instead: bare `(5` `(7` `(9` in compound meters (abcjs: always "in the time of
 * 2"), and a whole-note rest beside other notes (abcjs: silently a whole-bar rest).
 */

import fc from 'fast-check';
import abcjs from 'abcjs';
import { Note } from 'tonal';
import { parseABC } from '@/importers/abcImporter';
import { getNoteDuration } from '@/utils/core';
import { getMeasureCapacity } from '@/constants';
import type { Score } from '@/types';

type Onset = string; // `${microWholeNotes}:${midi}`
const key = (t: number, midi: number): Onset => `${Math.round(t * 1e6)}:${midi}`;

const oracleOnsets = (abc: string): Onset[][] => {
  const tune = abcjs.parseOnly(abc)[0];
  tune.setUpAudio({});
  const staves: Onset[][] = [];
  const time: number[] = [];
  const mult: number[] = [];
  for (const line of tune.lines) {
    (line.staff ?? []).forEach((staff, si) => {
      staves[si] ??= [];
      time[si] ??= 0;
      mult[si] ??= 1;
      for (const item of (staff.voices?.[0] ?? []) as any[]) {
        if (item.el_type !== 'note') continue;
        if (item.startTriplet) mult[si] = item.tripletMultiplier;
        const duration = item.duration * mult[si];
        if (item.endTriplet) mult[si] = 1;
        for (const p of item.midiPitches ?? []) staves[si].push(key(time[si], p.pitch));
        time[si] += duration;
      }
    });
  }
  return staves.map((s) => s.sort());
};

const scoreOnsets = (score: Score): Onset[][] =>
  score.staves.map((staff) => {
    const onsets: Onset[] = [];
    let t = 0;
    let tiedIn = new Set<string>();
    for (const measure of staff.measures) {
      if (measure.events.length === 0) {
        t += getMeasureCapacity(score.timeSignature) / 64;
        tiedIn = new Set();
        continue;
      }
      for (const event of measure.events) {
        if (!event.isRest) {
          for (const note of event.notes) {
            if (!tiedIn.has(note.pitch!)) onsets.push(key(t, Note.midi(note.pitch!)!));
          }
        }
        tiedIn = new Set(
          event.isRest ? [] : event.notes.filter((n) => n.tied).map((n) => n.pitch!)
        );
        t += getNoteDuration(event.duration, event.dotted, event.tuplet) / 64;
      }
    }
    return onsets.sort();
  });

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const METERS = ['4/4', '3/4', '2/4', '6/8', '9/8', '2/2', '3/8', '12/8'];
const UNITS = ['1/4', '1/8', '1/16'];
const KEYS = [
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
  'Am',
  'Em',
  'Dm',
  'Gm',
  'Bm',
  'F#m',
  'C#m',
  'Ebm',
  'Ador',
  'Dmix',
  'Gmix',
  'Edor',
  'Bphr',
  'Flyd',
  'Amaj',
  'A minor',
  'Gm clef=bass',
  'D octave=-1',
];
// No '2' / '4' / '8': with L:1/16, 1/8 or 1/4 those can make a rest exactly one whole note long.
const REST_LENGTHS = ['', '', '3', '/', '//', '3/2', '/2', '3/4', '6', '5', '7'];
const LENGTHS = ['', '', '', '2', '3', '4', '/', '//', '3/2', '/2', '3/4', '6', '8', '5', '7'];
const ACCIDENTALS = ['', '', '', '', '^', '_', '=', '^^', '__'];
const LETTERS = [...'CDEFGABcdefgab'];
const OCTAVES = ['', '', '', ',', "'", ',,', "''"];
const TUPLETS: Record<string, number> = {
  '(3': 3,
  '(3:2:3': 3,
  '(2:3:2': 2,
  '(5:4:5': 5,
  '(5:3:5': 5,
  '(4:3:4': 4,
  '(2': 2,
  '(4': 4,
  '(6': 6,
  '(7:4:7': 7,
  '(9:8:9': 9,
};

const pitch = fc
  .tuple(fc.constantFrom(...ACCIDENTALS), fc.constantFrom(...LETTERS), fc.constantFrom(...OCTAVES))
  .map(([a, l, o]) => `${a}${l}${o}`);
const note = fc.tuple(pitch, fc.constantFrom(...LENGTHS)).map(([p, d]) => `${p}${d}`);
const rest = fc
  .tuple(fc.constantFrom('z', 'x'), fc.constantFrom(...REST_LENGTHS))
  .map(([r, d]) => `${r}${d}`);
const chord = fc
  .tuple(fc.array(pitch, { minLength: 2, maxLength: 3 }), fc.constantFrom(...LENGTHS))
  .map(([ps, d]) => `[${ps.join('')}]${d}`);
const tuplet = fc.constantFrom(...Object.keys(TUPLETS)).chain((marker) =>
  fc
    .array(fc.oneof(pitch, fc.constant('z')), {
      minLength: TUPLETS[marker],
      maxLength: TUPLETS[marker],
    })
    .map((members) => `${marker}${members.join('')}`)
);
const broken = fc
  .tuple(pitch, fc.constantFrom('>', '<', '>>'), pitch, fc.constantFrom('', '2'))
  .map(([a, sign, b, d]) => `${a}${d}${sign}${b}${d}`);
const tie = fc
  .tuple(pitch, fc.constantFrom('2', '', '4'))
  .map(([p, d]) => `${p}${d}-${p.replace(/^[_^=]+/, '')}${d}`);
const item = fc.oneof(
  { weight: 6, arbitrary: note },
  { weight: 2, arbitrary: rest },
  { weight: 1, arbitrary: chord },
  { weight: 1, arbitrary: tuplet },
  { weight: 1, arbitrary: broken },
  { weight: 1, arbitrary: tie }
);
const bar = fc.array(item, { minLength: 1, maxLength: 6 }).map((items) => items.join(' '));
const tune = fc
  .record({
    meter: fc.constantFrom(...METERS),
    unit: fc.constantFrom(...UNITS),
    k: fc.constantFrom(...KEYS),
    bars: fc.array(bar, { minLength: 1, maxLength: 8 }),
  })
  .map(
    ({ meter, unit, k, bars }) =>
      `X:1\nT:Fuzz\nM:${meter}\nL:${unit}\nK:${k}\n${bars.join(' | ')} |`
  );

describe('ABC importer — differential fuzz against abcjs', () => {
  it('hears every generated tune exactly as abcjs does', () => {
    fc.assert(
      fc.property(tune, (abc) => {
        const imported = parseABC(abc);
        expect(imported.ok).toBe(true);
        if (!imported.ok) return;
        expect(scoreOnsets(imported.score)).toEqual(oracleOnsets(abc));
      }),
      { numRuns: 300, seed: 20260914 }
    );
  });
});
