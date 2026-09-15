/**
 * Ink-aware minimum advance: an unbeamed note's flag and a short rest's glyph are wider than
 * their rhythmic floors, so the next event's glyph must clear them (NOTE_SPACING.INK: flag
 * extent by stem side, rest and head half-widths, a gap). Beamed runs are not bound except
 * before a short rest. Both width engines apply it so grand-staff synchronization agrees.
 */
import { inkAdvance, hasFlag } from '@/engines/layout/ink';
import { beamedEventIds, groupBeamableEvents } from '@/engines/layout/beaming';
import { calculateMeasureLayout } from '@/engines/layout/measure';
import { calculateSystemLayout } from '@/engines/layout/system';
import { getNoteWidth } from '@/engines/layout/positioning';
import { NOTE_SPACING } from '@/constants';
import type { ScoreEvent } from '@/types';

const { FLAG_RIGHT, HEAD_HALF, REST_HALF, GAP } = NOTE_SPACING.INK;
const note = (id: string, duration: string, pitch = 'A4'): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});
const rest = (id: string, duration: string): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  isRest: true,
  notes: [],
});
const advance = (layout: ReturnType<typeof calculateMeasureLayout>, a: string, b: string) =>
  layout.eventPositions[b] - layout.eventPositions[a];

describe('inkAdvance', () => {
  test("a flagged note before a note: flag + gap + the next head's left half", () => {
    expect(inkAdvance(note('a', 'sixtyfourth'), note('b', 'quarter'), true, 'up')).toBe(
      FLAG_RIGHT.up + GAP + HEAD_HALF
    );
    expect(inkAdvance(note('a', 'eighth'), note('b', 'quarter'), true, 'down')).toBe(
      FLAG_RIGHT.down + GAP + HEAD_HALF
    );
    expect(inkAdvance(note('a', 'quarter'), note('b', 'quarter'), true, 'up')).toBe(0); // no flag
    expect(inkAdvance(note('a', 'sixtyfourth'), note('b', 'sixtyfourth'), false, 'up')).toBe(0); // beamed
  });
  test('short rests bind on both sides; a beamed note before a short rest binds; long rests do not', () => {
    expect(inkAdvance(rest('r', 'sixtyfourth'), rest('s', 'thirtysecond'), false)).toBe(
      REST_HALF.sixtyfourth + GAP + REST_HALF.thirtysecond
    );
    expect(inkAdvance(note('a', 'sixtyfourth'), rest('r', 'sixtyfourth'), false)).toBe(
      HEAD_HALF + GAP + REST_HALF.sixtyfourth
    );
    expect(inkAdvance(rest('r', 'quarter'), note('b', 'quarter'), false)).toBe(0);
    expect(inkAdvance(rest('r', 'sixtyfourth'), undefined, false)).toBe(
      REST_HALF.sixtyfourth + GAP
    ); // barline
    expect(hasFlag('sixteenth')).toBe(true);
    expect(hasFlag('half')).toBe(false);
  });
});

describe('beamedEventIds follows the meter', () => {
  test('a lone eighth between rests is flagged; a pair is beamed', () => {
    const events = [
      note('a', 'eighth'),
      rest('r', 'eighth'),
      note('b', 'eighth'),
      note('c', 'eighth'),
      rest('h', 'half'),
    ];
    const beamed = beamedEventIds(events, '4/4');
    expect(beamed.has('a')).toBe(false);
    expect(beamed.has('b')).toBe(true);
    expect(beamed.has('c')).toBe(true);
    expect(groupBeamableEvents(events, '4/4').map((g) => g.map((e) => e.id))).toEqual([['b', 'c']]);
  });
});

describe('measure layout reserves flag and rest ink', () => {
  test('the reported bar: a flagged 64th, then 64th/32nd/16th/8th rests, never crowd', () => {
    const events = [
      note('n', 'sixtyfourth', 'B4'),
      rest('r64', 'sixtyfourth'),
      rest('r32', 'thirtysecond'),
      rest('r16', 'sixteenth'),
      rest('r8', 'eighth'),
      rest('q', 'quarter'),
      rest('h', 'half'),
    ];
    const layout = calculateMeasureLayout(events, undefined, 'treble');
    // B4 sits on the middle line → stem down → flag on the down side; the rests are wide.
    expect(advance(layout, 'n', 'r64')).toBeGreaterThanOrEqual(
      FLAG_RIGHT.down + GAP + REST_HALF.sixtyfourth
    );
    expect(advance(layout, 'r64', 'r32')).toBeGreaterThanOrEqual(
      REST_HALF.sixtyfourth + GAP + REST_HALF.thirtysecond
    );
    expect(advance(layout, 'r32', 'r16')).toBeGreaterThanOrEqual(
      REST_HALF.thirtysecond + GAP + REST_HALF.sixteenth
    );
    expect(advance(layout, 'r16', 'r8')).toBeGreaterThanOrEqual(
      REST_HALF.sixteenth + GAP + REST_HALF.eighth
    );
  });
  test('an up-stem flagged 64th (A4) reserves the up-stem flag; a beamed run keeps the rhythmic floor', () => {
    const flagged = calculateMeasureLayout(
      [
        note('n', 'sixtyfourth', 'A4'),
        rest('r', 'sixtyfourth'),
        rest('h', 'half'),
        rest('q', 'quarter'),
        rest('e', 'eighth'),
        rest('s', 'sixteenth'),
        rest('t', 'thirtysecond'),
      ],
      undefined,
      'treble'
    );
    expect(advance(flagged, 'n', 'r')).toBe(FLAG_RIGHT.up + GAP + REST_HALF.sixtyfourth);
    const run = Array.from({ length: 16 }, (_, i) => note(`b${i}`, 'sixtyfourth', 'A4'));
    const beamed = calculateMeasureLayout(
      [...run, rest('h', 'half'), rest('q', 'quarter')],
      undefined,
      'treble'
    );
    expect(advance(beamed, 'b0', 'b1')).toBe(getNoteWidth('sixtyfourth', false));
  });
  test('the last note of a beamed run still clears a short rest that follows it', () => {
    const run = Array.from({ length: 16 }, (_, i) => note(`b${i}`, 'sixtyfourth', 'A4'));
    const layout = calculateMeasureLayout(
      [
        ...run,
        rest('r', 'sixtyfourth'),
        rest('t', 'thirtysecond'),
        rest('s', 'sixteenth'),
        rest('e', 'eighth'),
        rest('q', 'quarter'),
        rest('h', 'half'),
      ],
      undefined,
      'treble'
    );
    expect(advance(layout, 'b15', 'r')).toBe(HEAD_HALF + GAP + REST_HALF.sixtyfourth);
  });
  test('quarters and longer are untouched', () => {
    const layout = calculateMeasureLayout(
      [note('a', 'quarter'), note('b', 'quarter'), note('c', 'half')],
      undefined,
      'treble'
    );
    expect(advance(layout, 'a', 'b')).toBe(getNoteWidth('quarter', false));
  });
});

describe('the grand-staff synchronizer reserves the same ink', () => {
  test('a flagged 64th in one staff forces the synchronized segment wide enough', () => {
    const upper = [
      note('n', 'sixtyfourth', 'A4'),
      rest('r', 'sixtyfourth'),
      rest('t', 'thirtysecond'),
      rest('s', 'sixteenth'),
      rest('e', 'eighth'),
      rest('q', 'quarter'),
      rest('h', 'half'),
    ];
    const lower = [rest('w', 'whole')];
    const quantToX = calculateSystemLayout(
      [{ events: upper }, { events: lower }],
      'C',
      undefined,
      '4/4'
    );
    expect(quantToX[1] - quantToX[0]).toBeGreaterThanOrEqual(
      FLAG_RIGHT.up + GAP + REST_HALF.sixtyfourth
    );
    expect(quantToX[2] - quantToX[1]).toBeGreaterThanOrEqual(
      REST_HALF.sixtyfourth + GAP + REST_HALF.thirtysecond
    );
  });
  test('meter matters: six eighths in 6/8 beam in threes, so none reserve a flag', () => {
    const events = Array.from({ length: 6 }, (_, i) => note(`e${i}`, 'eighth'));
    expect(beamedEventIds(events, '6/8').size).toBe(6);
    const layout = calculateMeasureLayout(
      events,
      undefined,
      'treble',
      false,
      undefined,
      1,
      'C',
      undefined,
      '6/8'
    );
    expect(advance(layout, 'e0', 'e1')).toBe(getNoteWidth('eighth', false));
  });
});
