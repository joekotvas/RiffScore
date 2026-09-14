/**
 * Engraving rules for beamed groups (audit finding #9 siblings — stem direction and slant).
 *
 *  - Direction: the note farthest from the middle line decides; equidistant extremes fall
 *    back to the mean of every note; a mean on the line takes stems down. Chords contribute
 *    all of their notes. (Gould, *Behind Bars*.)
 *  - Slant: capped by the interval between the outer anchors (a second → ¼ space, a fifth
 *    or wider → 1 space) and by `BEAMING.MAX_SLOPE`; an inner note beyond both outer notes
 *    on the beam side makes the beam horizontal.
 *  - Stems: after the cap, the note nearest the beam keeps exactly the minimum beamed stem
 *    length and every other stem is at least that long.
 *
 * Render-free: verified against the layout functions with fixed x positions.
 */

import { calculateBeamingGroups, beamGroupDirection, beamRise } from '@/engines/layout/beaming';
import { getOffsetForPitch } from '@/engines/layout/positioning';
import { STEM_BEAMED_LENGTHS } from '@/engines/layout/stems';
import { CONFIG } from '@/config';
import { BEAMING, MIDDLE_LINE_Y } from '@/constants';
import type { ScoreEvent } from '@/types';

const SPACE = CONFIG.lineHeight;

const y = (pitch: string, clef = 'treble') => CONFIG.baseY + getOffsetForPitch(pitch, clef);

const eighths = (pitches: Array<string | string[]>, duration = 'eighth'): ScoreEvent[] =>
  pitches.map((p, i) => ({
    id: `e${i + 1}`,
    duration,
    dotted: false,
    notes: (Array.isArray(p) ? p : [p]).map((pitch, j) => ({ id: `n${i + 1}-${j}`, pitch })),
  }));

const spaced = (events: ScoreEvent[], gap = 40): Record<string, number> =>
  Object.fromEntries(events.map((e, i) => [e.id, 50 + i * gap]));

const rise = (g: { startY: number; endY: number }) => g.endY - g.startY;

/** Beam y at a stem x, from the group's primary line. */
const beamYAt = (g: { startX: number; endX: number; startY: number; endY: number }, x: number) =>
  g.startY + ((g.endY - g.startY) / (g.endX - g.startX)) * (x - g.startX);

describe('beamGroupDirection — farthest note from the middle line decides', () => {
  test('a group whose lowest note is farther from the middle line than its highest takes stems up', () => {
    // G4 is two steps below B4; C5 is one step above. The 4/4 half-bar run G4 A4 B♭4 C5 is one
    // group with stems UP, not "pair up, pair down" as a per-pair average would give.
    expect(beamGroupDirection(['G4', 'A4', 'Bb4', 'C5'].map((p) => y(p)))).toBe('up');
  });

  test('a group whose highest note is farther takes stems down', () => {
    expect(beamGroupDirection(['C5', 'Bb4'].map((p) => y(p)))).toBe('down');
    expect(beamGroupDirection(['A4', 'G4', 'F5'].map((p) => y(p)))).toBe('down');
  });

  test('equidistant extremes fall back to the mean of every note', () => {
    // G4 (2 below) and D5 (2 above) tie; the extra A4 pulls the mean below the line → up.
    expect(beamGroupDirection(['G4', 'D5', 'A4'].map((p) => y(p)))).toBe('up');
    // …and an extra C5 pulls it above → down.
    expect(beamGroupDirection(['G4', 'D5', 'C5'].map((p) => y(p)))).toBe('down');
  });

  test('a mean on the middle line takes stems down (like a single middle-line note)', () => {
    expect(beamGroupDirection(['G4', 'D5'].map((p) => y(p)))).toBe('down');
    expect(beamGroupDirection([MIDDLE_LINE_Y, MIDDLE_LINE_Y])).toBe('down');
  });

  test('chords contribute every note', () => {
    // Top notes alone (C5, D5) would say down; the chord bottoms (E4, F4) are farther → up.
    const groups = calculateBeamingGroups(
      eighths([
        ['E4', 'C5'],
        ['F4', 'D5'],
      ]),
      { e1: 50, e2: 90 }
    );
    expect(groups[0].direction).toBe('up');
  });

  test('an Alberti-style bass bar keeps one direction across its half-bar groups', () => {
    // Bass clef: G2 is four steps below the middle line (D3), G3 three above → up, for both
    // groups of the bar, instead of alternating per beat pair.
    const events = eighths(['G2', 'D3', 'G3', 'D3', 'G2', 'D3', 'G3', 'D3']);
    const groups = calculateBeamingGroups(events, spaced(events, 30), 'bass', '4/4');
    expect(groups.map((g) => g.ids)).toEqual([
      ['e1', 'e2', 'e3', 'e4'],
      ['e5', 'e6', 'e7', 'e8'],
    ]);
    expect(groups.map((g) => g.direction)).toEqual(['up', 'up']);
    // An inner note (G3) sits above both outer notes on the beam side → horizontal beams.
    expect(groups.map(rise)).toEqual([0, 0]);
  });
});

describe('beamRise — engraving caps on the slant', () => {
  test('a second slants a quarter space, whichever way it goes', () => {
    const up = calculateBeamingGroups(eighths(['G4', 'A4']), { e1: 50, e2: 90 })[0];
    expect(up.direction).toBe('up');
    expect(rise(up)).toBeCloseTo(-0.25 * SPACE, 6); // A4 is higher → beam rises (smaller y)

    const down = calculateBeamingGroups(eighths(['C5', 'Bb4']), { e1: 50, e2: 90 })[0];
    expect(down.direction).toBe('down');
    expect(rise(down)).toBeCloseTo(0.25 * SPACE, 6);
  });

  test('third, fourth and fifth slant half, three-quarters and one space', () => {
    const third = calculateBeamingGroups(eighths(['C4', 'E4']), { e1: 50, e2: 90 })[0];
    const fourth = calculateBeamingGroups(eighths(['C4', 'F4']), { e1: 50, e2: 90 })[0];
    const fifth = calculateBeamingGroups(eighths(['C4', 'G4']), { e1: 50, e2: 90 })[0];
    expect(Math.abs(rise(third))).toBeCloseTo(0.5 * SPACE, 6);
    expect(Math.abs(rise(fourth))).toBeCloseTo(0.75 * SPACE, 6);
    expect(Math.abs(rise(fifth))).toBeCloseTo(1 * SPACE, 6);
  });

  test('no leap slants more than one staff space', () => {
    const octave = calculateBeamingGroups(eighths(['C4', 'C5']), { e1: 50, e2: 90 })[0];
    const tenth = calculateBeamingGroups(eighths(['C4', 'E5']), { e1: 50, e2: 90 })[0];
    expect(Math.abs(rise(octave))).toBeCloseTo(SPACE, 6);
    expect(Math.abs(rise(tenth))).toBeCloseTo(SPACE, 6);
    expect(BEAMING.MAX_RISE_SPACES[BEAMING.MAX_RISE_SPACES.length - 1]).toBe(1);
  });

  test('tightly spaced notes are limited by MAX_SLOPE instead of the interval', () => {
    const g = calculateBeamingGroups(eighths(['C4', 'G4'], 'sixteenth'), { e1: 50, e2: 68 })[0];
    const run = g.endX - g.startX;
    expect(Math.abs(rise(g))).toBeCloseTo(BEAMING.MAX_SLOPE * run, 6);
    expect(Math.abs(rise(g))).toBeLessThan(SPACE);
  });

  test('a longer group of four still follows its outer notes', () => {
    const events = eighths(['C4', 'D4', 'E4', 'F4']);
    const g = calculateBeamingGroups(events, spaced(events), 'treble', '4/4')[0];
    expect(g.ids).toHaveLength(4);
    expect(rise(g)).toBeCloseTo(-0.75 * SPACE, 6); // a fourth, rising
  });

  test('an inner note beyond both outer notes makes the beam horizontal', () => {
    const upEvents = eighths(['C4', 'G4', 'C4']);
    const up = calculateBeamingGroups(upEvents, spaced(upEvents), 'treble', '3/8')[0];
    expect(up.direction).toBe('up');
    expect(rise(up)).toBe(0);

    const downEvents = eighths(['E5', 'A4', 'E5']);
    const down = calculateBeamingGroups(downEvents, spaced(downEvents), 'treble', '3/8')[0];
    expect(down.direction).toBe('down');
    expect(rise(down)).toBe(0);
  });

  test('beamRise is pure over anchor ys', () => {
    expect(beamRise([100, 94], 'up', 40)).toBeCloseTo(-3, 6);
    expect(beamRise([100, 76], 'up', 40)).toBeCloseTo(-12, 6);
    expect(beamRise([100, 76], 'up', 20)).toBeCloseTo(-7, 6);
    expect(beamRise([100, 70, 100], 'up', 80)).toBe(0);
    expect(beamRise([100, 100], 'down', 40)).toBe(0);
  });
});

describe('stem lengths after the slant cap', () => {
  test('the note nearest the beam keeps the minimum beamed stem; the others are longer', () => {
    // C4 → G4, stems up: the beam sits a minimum stem above G4; the C4 stem is longer by the
    // uncapped part of the leap.
    const events = eighths(['C4', 'G4']);
    const positions = { e1: 50, e2: 90 };
    const g = calculateBeamingGroups(events, positions)[0];
    const stemXs = g.ids.map((_, i) =>
      i === 0 ? g.startX + BEAMING.EXTENSION_PX : g.endX - BEAMING.EXTENSION_PX
    );
    const lengths = stemXs.map((x, i) => Math.abs(beamYAt(g, x) - y(['C4', 'G4'][i])));
    expect(Math.min(...lengths)).toBeCloseTo(STEM_BEAMED_LENGTHS.default, 6);
    expect(lengths[1]).toBeCloseTo(STEM_BEAMED_LENGTHS.default, 6);
    expect(lengths[0]).toBeGreaterThan(STEM_BEAMED_LENGTHS.default);
  });

  test('a horizontal (concave) beam clears its innermost note by the minimum stem', () => {
    const events = eighths(['C4', 'G4', 'C4']);
    const g = calculateBeamingGroups(events, spaced(events), 'treble', '3/8')[0];
    const innerX = (g.startX + g.endX) / 2;
    expect(Math.abs(beamYAt(g, innerX) - y('G4'))).toBeCloseTo(STEM_BEAMED_LENGTHS.default, 6);
  });
});
