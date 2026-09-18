import { calculateMeasureLayout } from '@/engines/layout/measure';
import { calculateSystemLayout } from '@/engines/layout/system';
import { getNoteDuration } from '@/utils/core';
import type { Note, ScoreEvent } from '@/types';

const notes = (pitches: string[], duration = 'sixteenth', tuplet = false): ScoreEvent[] =>
  pitches.map((pitch, i) => ({
    id: `e${i}`,
    duration,
    dotted: false,
    notes: [{ id: `n${i}`, pitch }],
    ...(tuplet
      ? {
          tuplet: {
            id: 'triplet',
            ratio: [3, 2] as [number, number],
            groupSize: 3,
            position: i,
            baseDuration: duration,
          },
        }
      : {}),
  }));

const layout = (events: ScoreEvent[], sync: boolean, key = 'C') => {
  const grid = sync ? calculateSystemLayout([{ events, clef: 'treble' }], key) : undefined;
  return calculateMeasureLayout(events, undefined, 'treble', false, grid, 1, key);
};
const gap = (result: ReturnType<typeof layout>, a = 'e0', b = 'e1') =>
  result.eventPositions[b] - result.eventPositions[a];

describe.each([false, true])('accidental clearance (synchronized=%s)', (sync) => {
  test.each(['eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth'])(
    '%s triplet reserves space before an internal sharp and cancelling natural',
    (duration) => {
      const result = layout(notes(['B4', 'B#4', 'B4'], duration, true), sync);
      // A head extends 7px right; the next accidental starts 23px left of its anchor.
      expect(gap(result)).toBeGreaterThanOrEqual(36);
      expect(gap(result, 'e1', 'e2')).toBeGreaterThanOrEqual(36);
    }
  );

  test.each([false, true])('ordinary notes clear courtesy double flats (tuplet=%s)', (tuplet) => {
    const events = notes(['B4', 'Bbb4', 'A4'], 'sixtyfourth', tuplet);
    events[1].notes[0].accidentalDisplay = 'courtesy';
    // Double flat half-width 10, parentheses + left nudge 10, accidental offset 16.
    expect(gap(layout(events, sync))).toBeGreaterThanOrEqual(49);
  });

  test('a cancelling natural in a sharp key reserves space', () => {
    const result = layout(notes(['F#4', 'F4', 'F#4'], 'sixtyfourth'), sync, 'G');
    expect(gap(result)).toBeGreaterThanOrEqual(36);
  });

  test('suppressed and key-implied accidentals do not add accidental spacing', () => {
    const plain = notes(['B4', 'B4', 'B4'], 'sixtyfourth', true);
    const implied = notes(['F#4', 'F#4', 'F#4'], 'sixtyfourth', true);
    const hidden = notes(['B4', 'B#4', 'B4'], 'sixtyfourth', true);
    hidden.forEach((event) => {
      event.notes[0].accidentalDisplay = 'hide';
    });
    expect(gap(layout(implied, sync, 'G'))).toBeCloseTo(gap(layout(plain, sync)));
    expect(gap(layout(hidden, sync))).toBeCloseTo(gap(layout(plain, sync)));
  });

  test('a displaced chord head clears the following accidental', () => {
    const events = notes(['G4', 'A#4', 'B4'], 'sixtyfourth', true);
    events[0].notes.push({ id: 'second', pitch: 'A4' });
    // Up-stem second moves its upper head 11px right.
    expect(gap(layout(events, sync))).toBeGreaterThanOrEqual(47);
  });

  test('an accidental on a displaced down-stem chord clears the preceding event', () => {
    const events = notes(['E5', 'E5', 'D5'], 'sixtyfourth', true);
    events[1].notes.push({ id: 'second', pitch: 'D#5' });
    expect(gap(layout(events, sync))).toBeGreaterThanOrEqual(47);
  });

  test('dots and flags clear a following courtesy accidental', () => {
    const events = notes(['A4', 'A#4', 'B4'], 'sixtyfourth');
    events[0].dotted = true;
    events[1].notes[0].accidentalDisplay = 'courtesy';
    expect(gap(layout(events, sync))).toBeGreaterThanOrEqual(58);
  });

  test('the accidental after a tuplet clears its final head', () => {
    const events = notes(['B4', 'A4', 'G4'], 'sixtyfourth', true);
    events.push({
      id: 'after',
      duration: 'sixtyfourth',
      dotted: false,
      notes: [{ id: 'after-note', pitch: 'G#4' }],
    });
    expect(gap(layout(events, sync), 'e2', 'after')).toBeGreaterThanOrEqual(36);
  });
});

test('each tuplet member follows shared grid expansion from another staff', () => {
  const upper = notes(['B4', 'A4', 'G4'], 'sixteenth', true);
  const lower = notes(['B4', 'A4', 'G4'], 'sixteenth', true).map((event, i) => ({
    ...event,
    id: `lower-${i}`,
    notes: [
      {
        id: `lower-note-${i}`,
        pitch: i === 1 ? 'A#4' : 'B4',
        accidentalDisplay: 'courtesy',
      } as Note,
    ],
  }));
  const grid = calculateSystemLayout([{ events: upper }, { events: lower, clef: 'treble' }]);
  const actual = calculateMeasureLayout(upper, undefined, 'treble', false, grid);
  let quant = 0;
  for (const event of upper) {
    expect(actual.eventPositions[event.id]).toBeCloseTo(grid[quant]);
    quant += getNoteDuration(event.duration, event.dotted, event.tuplet);
  }
  expect(gap(actual)).toBeGreaterThan(gap(layout(upper, false)));
});
