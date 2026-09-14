/**
 * ABC importer vs abcjs — a reference-oracle comparison.
 *
 * abcjs (dev-only, never bundled) is an independent, widely used ABC implementation. For a
 * corpus of hand-written tunes and of every ABC the exporter produces, both parsers must agree
 * on the sounding music: the set of (onset time, MIDI pitch) pairs per staff, where tied
 * continuations are not onsets and rests/tuplets/broken rhythm only move time. This catches
 * accidental-memory, key, octave, length and tuplet-ratio bugs that self-referential tests miss.
 */

import abcjs from 'abcjs';
import { MELODIES } from '@/data/melodies';
import { generateABC } from '@/exporters/abcExporter';
import { parseABC } from '@/importers/abcImporter';
import { getNoteDuration } from '@/utils/core';
import { getMeasureCapacity } from '@/constants';
import { migrateScore } from '@/types';
import type { Score } from '@/types';
import { Note } from 'tonal';

type Onset = string; // `${microWholeNotes}:${midi}`

const key = (t: number, midi: number): Onset => `${Math.round(t * 1e6)}:${midi}`;

/** Sounding onsets per staff as abcjs hears the tune. */
const oracleOnsets = (abc: string): Onset[][] => {
  const tune = abcjs.parseOnly(abc)[0];
  tune.setUpAudio({});
  const staves: Onset[][] = [];
  const time: number[] = [];
  const mult: number[] = [];
  for (const line of tune.lines) {
    (line.staff ?? []).forEach((staff, si) => {
      const voice = staff.voices?.[0] ?? [];
      staves[si] ??= [];
      time[si] ??= 0;
      mult[si] ??= 1;
      for (const item of voice as any[]) {
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

/** Sounding onsets per staff of an imported score. */
const scoreOnsets = (score: Score): Onset[][] =>
  score.staves.map((staff) => {
    const onsets: Onset[] = [];
    let t = 0;
    let previous: { pitches: Set<string> } | null = null;
    for (const measure of staff.measures) {
      if (measure.events.length === 0) {
        t += getMeasureCapacity(score.timeSignature) / 64; // an empty bar is a whole-bar rest
        previous = null;
        continue;
      }
      for (const event of measure.events) {
        const tiedIn = previous?.pitches ?? new Set<string>();
        if (!event.isRest) {
          for (const note of event.notes) {
            if (tiedIn.has(note.pitch!)) continue; // a tie continuation is not a new onset
            onsets.push(key(t, Note.midi(note.pitch!)!));
          }
        }
        previous = {
          pitches: new Set(
            event.isRest ? [] : event.notes.filter((n) => n.tied).map((n) => n.pitch!)
          ),
        };
        t += getNoteDuration(event.duration, event.dotted, event.tuplet) / 64;
      }
    }
    return onsets.sort();
  });

const chordNames = (abc: string): string[] => {
  const tune = abcjs.parseOnly(abc)[0];
  const names: string[] = [];
  for (const line of tune.lines) {
    for (const item of (line.staff?.[0]?.voices?.[0] ?? []) as any[]) {
      for (const c of item.chord ?? []) if (c.position === 'default') names.push(c.name);
    }
  }
  return names;
};

const expectAgreement = (abc: string) => {
  const imported = parseABC(abc);
  if (!imported.ok) throw new Error(`import failed: ${imported.error}\n${abc}`);
  const ours = scoreOnsets(imported.score);
  const theirs = oracleOnsets(abc);
  expect(ours.length).toBe(theirs.length);
  ours.forEach((staff, i) => expect(staff).toEqual(theirs[i]));
  expect(ours.flat().length).toBeGreaterThan(0);
  return imported.score;
};

const corpus: Record<string, string> = {
  'Twinkle (L:1/4)': 'X:1\nT:Twinkle\nM:4/4\nL:1/4\nK:C\nC C G G | A A G2 | F F E E | D D C2 |',
  'key signatures and bar-local accidentals':
    'X:1\nM:4/4\nL:1/8\nK:G\nF ^F =F F | f F c ^c | C c ^C c | _B B =B b |',
  'flat key with naturals and double accidentals':
    'X:1\nM:4/4\nL:1/8\nK:Bb\nB =B B b | E _E =E e | ^^F __B ^^f __b | F B E A |',
  'minor key and modes':
    'X:1\nM:4/4\nL:1/8\nK:Em\nE F G A | B c d e |\n[K:Ador] A B c d | e f g a |',
  'octaves, commas and apostrophes': "X:1\nM:4/4\nL:1/8\nK:C\nC, C c c' | C,, c'' B, b' |",
  'lengths and broken rhythm':
    'X:1\nM:4/4\nL:1/8\nK:D\nA2 B3/2 c/2 d> e f<g | A4- A4 | A6 z2 | A>>B c3 d/ e/ f/ g/ |',
  'rests and multi-length rests': 'X:1\nM:4/4\nL:1/8\nK:C\nz2 C2 z C z/ D/ | z4 E4 | z8 |',
  'chords and chord ties':
    'X:1\nM:4/4\nL:1/8\nK:C\n[CEG]2 [C2E2G2] [CEG]/ [CEG]/ [ceg]2- | [ceg]2 [C-EG] [CEG] [_BDF]2 |',
  'tuplets (3, (5:4:5, (3:2:2, and 6/8 duplets':
    'X:1\nM:4/4\nL:1/8\nK:C\n(3ABc d2 (5:4:5ABcde | (3:2:2A2B c2 d2 e2 |\n[M:6/8] (2AB c3 |',
  'tied accidentals over the bar line':
    'X:1\nM:4/4\nL:1/4\nK:C\n^F4- | F2 F2 | [^F^c]4- | [Fc]2 F2 | ^F2 F2- | F2 F2 |',
  'a lone whole-note rest is a whole-bar rest in any meter':
    'X:1\nM:3/4\nL:1/4\nK:C\nC D E | z4 | F2 G |\n[M:6/8] z8 | A3 B3 |',
  'pickup bar and 3/4': 'X:1\nM:3/4\nL:1/4\nK:F\nC | F2 A | B3 | A2 z |',
  '6/8 jig with repeats (imported once)':
    'X:1\nM:6/8\nL:1/8\nK:G\n|:G3 GAB|A3 ABd|edd gdd|edB dBA|\nG3 GAB|A3 ABd|edd gdB|AGF G3:|',
  'two voices with clefs':
    'X:1\nM:4/4\nL:1/4\nK:C\nV:1 clef=treble\nV:2 clef=bass\nV:1\nC D E F | G2 A B |\nV:2\nC, E, G, C | E,2 F, G, |',
  'octave shift on a voice': 'X:1\nM:4/4\nL:1/4\nK:C\nV:1 octave=-1\nC D E F | G A B c |',
  'chord symbols': 'X:1\nM:4/4\nL:1/4\nK:G\n"G"G B "D7"A c | "Em"e2 "C"c "G"d |',
};

describe('ABC importer agrees with abcjs on the sounding music', () => {
  it.each(Object.entries(corpus))('%s', (_name, abc) => {
    expectAgreement(abc);
  });

  it('places chord symbols where abcjs does', () => {
    const score = expectAgreement(corpus['chord symbols']);
    expect(score.chordTrack?.map((c) => c.symbol)).toEqual(chordNames(corpus['chord symbols']));
  });
});

describe('the exporter output is heard the same by abcjs and the importer', () => {
  it.each(MELODIES.map((m) => [m.title, m.score] as const))('%s', (_title, melody) => {
    const score = migrateScore(melody);
    expectAgreement(generateABC(score, score.bpm));
  });
});
