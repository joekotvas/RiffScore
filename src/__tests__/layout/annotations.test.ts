import {
  prepareAnnotations,
  annotationTextWidth,
  type ScoreAnnotations,
} from '@/components/Canvas/ScoreAnnotations';
import { calculateScoreLayout } from '@/engines/layout/scoreLayout';
import { calculateSystemLayout } from '@/engines/layout/system';
import { calculatePageLayout } from '@/services/PageLayoutService';
import { getPitchInfo } from '@/utils/pitchInfo';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';
import { LYRICS } from '@/constants';
import type { Score, ScoreEvent } from '@/types';

const event = (id: string, duration = 'quarter', pitches = ['C4']): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: pitches.map((pitch, i) => ({ id: `${id}-${i}`, pitch })),
});
const fixture = (): Score => ({
  title: 'Annotations',
  keySignature: 'C',
  timeSignature: '4/4',
  bpm: 100,
  staves: ['upper', 'lower'].map((id, index) => ({
    id,
    clef: index ? 'bass' : 'treble',
    keySignature: 'C',
    measures: [
      {
        id: `${id}-m`,
        events: [event(`${id}-1`, 'eighth', ['C4', 'E4', 'G4']), event(`${id}-2`, 'eighth')],
      },
    ],
  })),
});
const annotations: ScoreAnnotations = {
  notehead: ({ note }) => ({ label: note.pitch ?? '' }),
  rows: [
    {
      id: 'pitch',
      label: 'Pitch',
      staffIds: ['upper'],
      text: (event) => event.notes.map((note) => note.pitch ?? ''),
    },
    { id: 'long', label: 'Custom', staffIds: ['upper'], text: () => 'Long annotation' },
  ],
};

test('view projection is detached; lane rows reserve chord depth and honor existing lyrics', () => {
  const score = fixture();
  score.staves[0].lyricLines = 2;
  const before = JSON.stringify(score);
  const prepared = prepareAnnotations(score, annotations);
  expect(JSON.stringify(score)).toBe(before);
  expect(prepared.score.staves[0].lyricLines).toBe(6);
  expect(prepared.score.staves[1]).toBe(score.staves[1]);
  expect(prepared.rows.map((row) => row.line)).toEqual([2, 5]);
  expect(prepareAnnotations(score).score).toBe(score);
  expect(prepared.eventWidths.get('upper-1')).toBe(annotationTextWidth('Long annotation'));
});

test('callbacks cannot mutate score through musical facts; note results are copied', () => {
  const score = fixture();
  const result = { label: 'C' };
  const prepared = prepareAnnotations(score, {
    notehead: (context) => {
      expect(Object.isFrozen(context)).toBe(true);
      expect(Object.isFrozen(context.notes)).toBe(true);
      expect(Object.isFrozen(context.note)).toBe(true);
      return result;
    },
  });
  result.label = 'D';
  expect(prepared.noteheads.get('upper-1-0')?.label).toBe('C');
});

test('rests skip notehead callback but retain event facts for custom rhythm rows', () => {
  const score = fixture();
  score.staves[0].measures[0].events = [{ ...event('rest'), isRest: true, notes: [] }];
  const head = jest.fn(() => null);
  const contexts: number[] = [];
  prepareAnnotations(score, {
    notehead: head,
    rows: [
      {
        id: 'r',
        label: 'Rhythm',
        staffIds: ['upper'],
        text: (context) => {
          contexts.push(context.quant);
          expect(context.isRest).toBe(true);
          return 'rest';
        },
      },
    ],
  });
  expect(head).toHaveBeenCalledTimes(4); // only the lower staff's pitched notes
  expect(contexts).toEqual([0]);
});

test('duplicate row identity is rejected early', () => {
  expect(() =>
    prepareAnnotations(fixture(), { rows: [annotations.rows![0], annotations.rows![0]] })
  ).toThrow('unique');
});

test('long text cannot overlap at shared quant boundaries or extend beyond measure edges', () => {
  const measures = [
    { events: [event('a', 'quarter'), event('b', 'quarter')] },
    { events: [event('c', 'eighth'), event('d', 'eighth'), event('e', 'quarter')] },
  ];
  const baseline = calculateSystemLayout(measures);
  const grid = calculateSystemLayout(
    measures,
    'C',
    undefined,
    '4/4',
    new Map([
      ['a', 160],
      ['b', 160],
    ])
  );
  const quants = Object.keys(baseline)
    .map(Number)
    .sort((a, b) => a - b);
  expect(grid[0]).toBeGreaterThanOrEqual(80);
  expect(grid[quants[2]] - grid[0]).toBeGreaterThanOrEqual(168);
  expect(grid[quants[3]] - grid[quants[2]]).toBeGreaterThanOrEqual(88);
  expect(grid[quants[1]]).toBeGreaterThan(grid[0]);
  expect(calculateSystemLayout(measures, 'C', undefined, '4/4', new Map())).toEqual(baseline);
});

test('rows expand scroll height and keep subsequent staves clear', () => {
  const score = fixture();
  const plain = calculateScoreLayout(score);
  const prepared = prepareAnnotations(score, annotations);
  const layout = calculateScoreLayout(prepared.score, { eventWidths: prepared.eventWidths });
  expect(layout.staves[0].measures[0].width).toBeGreaterThan(plain.staves[0].measures[0].width);
  const baseline = layout.vertical!.textBaselines![0];
  expect(layout.vertical!.offsets[1]).toBeGreaterThan(baseline + 3 * LYRICS.LINE_HEIGHT);
  expect(layout.vertical!.bottom).toBeGreaterThan(plain.vertical!.bottom);
});

test('page breaks, padding, and baselines use the same row reservations at nondefault staff scale', () => {
  const score = fixture();
  score.staves.forEach((staff) => {
    const m = staff.measures[0];
    staff.measures = Array.from({ length: 12 }, (_, i) => ({
      ...m,
      id: `${m.id}-${i}`,
      events: m.events.map((e) => ({
        ...e,
        id: `${e.id}-${i}`,
        notes: e.notes.map((n) => ({ ...n, id: `${n.id}-${i}` })),
      })),
    }));
  });
  const prepared = prepareAnnotations(score, annotations);
  const config = { ...DEFAULT_LAYOUT_CONFIG, staffSize: 125 };
  const plain = calculatePageLayout(score, config);
  const pages = calculatePageLayout(prepared.score, config, prepared.eventWidths);
  expect(pages.pages.flatMap((page) => page.systems).length).toBeGreaterThan(
    plain.pages.flatMap((page) => page.systems).length
  );
  for (const system of pages.pages.flatMap((page) => page.systems)) {
    expect(system.staffOffsets[1]).toBeGreaterThan(
      system.textBaselines![0] + 3 * LYRICS.LINE_HEIGHT * 1.25
    );
    expect(system.y - system.paddingTop).toBeGreaterThanOrEqual(pages.contentArea.y - 0.001);
  }
});

test('pitch facts retain written octave, double alterations, enharmonic identity, and invalid input', () => {
  expect(getPitchInfo('B#3')).toEqual({ letter: 'B', alteration: 1, octave: 3, chroma: 0 });
  expect(getPitchInfo('Ebb4')?.alteration).toBe(-2);
  expect(getPitchInfo('Db4')?.letter).toBe('D');
  expect(getPitchInfo('bad pitch')).toBeNull();
});

test('annotation spacing accounts for accidentals and each staff’s actual event centers, including rests', () => {
  const score = fixture();
  score.staves[0].measures[0].events = [
    event('sharp', 'sixteenth', ['C#4']),
    event('natural', 'sixteenth', ['D4']),
    { ...event('rest', 'sixteenth'), notes: [], isRest: true },
  ];
  const prepared = prepareAnnotations(score, {
    rows: [{ id: 'wide', label: 'Wide', text: () => '01234567890123456789' }],
  });
  const layout = calculateScoreLayout(prepared.score, { eventWidths: prepared.eventWidths });
  const measure = layout.staves[0].measures[0];
  const positions = ['sharp', 'natural', 'rest'].map((id) => measure.events[id].localX);
  expect(positions[0]).toBeGreaterThanOrEqual(80);
  expect(positions[1] - positions[0]).toBeGreaterThanOrEqual(168);
  expect(positions[2] - positions[1]).toBeGreaterThanOrEqual(168);
  expect(measure.width - positions[2]).toBeGreaterThanOrEqual(80);
});
