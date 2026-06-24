/**
 * Tie rendering (#242 Lane E): a tie renders ONLY when it resolves to a same-pitch successor.
 * The old "hanging stub" (a short curve drawn when no target was found) is gone — a tied flag
 * whose target was deleted or turned into a rest draws nothing.
 *
 * @see src/components/Canvas/Staff.tsx renderTies, src/utils/ties.ts
 */

/* eslint-disable testing-library/no-container */

// Mock the audio engine to avoid WebAudio errors under jsdom (as the other render tests do).
jest.mock('@/engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

import { renderScore } from '../helpers/visual';
import { createDefaultScore, Score, ScoreEvent } from '@/types';
import { TIE } from '@/constants';
import { calculateMeasureLayout } from '@/engines/layout';

const q = (id: string, pitch: string | null, tied = false): ScoreEvent =>
  pitch === null
    ? { id, duration: 'quarter', dotted: false, isRest: true, notes: [{ id: `${id}n`, pitch: null, isRest: true }] }
    : { id, duration: 'quarter', dotted: false, notes: [{ id: `${id}n`, pitch, tied }] };

const scoreOf = (events: ScoreEvent[], keySignature = 'C'): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.keySignature = keySignature;
  s.staves = [{ ...s.staves[0], keySignature, measures: [{ id: 'm0', events }] }];
  return s;
};

const tieCount = (score: Score): number => {
  const { container, unmount } = renderScore(score);
  const n = container.querySelectorAll('.riff-Tie').length;
  unmount();
  return n;
};

const firstMoveX = (path: Element): number => {
  const d = path.getAttribute('d') ?? '';
  const match = d.match(/M\s+(-?\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unable to parse tie path: ${d}`);
  return Number(match[1]);
};

const translateX = (group: Element): number => {
  const transform = group.getAttribute('transform') ?? '';
  const match = transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unable to parse transform: ${transform}`);
  return Number(match[1]);
};

describe('tie rendering', () => {
  it('draws a tie curve when it resolves to a same-pitch successor', () => {
    expect(tieCount(scoreOf([q('a', 'C4', true), q('b', 'C4'), q('c', 'E4'), q('d', 'F4')]))).toBe(1);
  });

  it('draws NO tie (no hanging stub) when the target is a rest', () => {
    expect(tieCount(scoreOf([q('a', 'C4', true), q('r', null), q('c', 'E4'), q('d', 'F4')]))).toBe(0);
  });

  it('draws NO tie when the tied note is the last in the score', () => {
    expect(tieCount(scoreOf([q('a', 'C4'), q('b', 'C4'), q('c', 'C4'), q('d', 'C4', true)]))).toBe(0);
  });

  it('anchors tie X to the rendered notehead under a non-C key signature (#249)', () => {
    const score = scoreOf(
      [q('a', 'F#4', true), q('b', 'F#4'), q('c', 'G4'), q('d', 'A4')],
      'G'
    );
    const { canvas, unmount } = renderScore(score);
    try {
      const tie = canvas.querySelector('.riff-Tie');
      const chord = canvas.querySelector('[data-testid="chord-a"]');
      const notehead = chord?.querySelector('.NoteHead');
      const measure = chord?.closest('.Measure');

      expect(tie).not.toBeNull();
      expect(chord).not.toBeNull();
      expect(notehead).not.toBeNull();
      expect(measure).not.toBeNull();

      const expectedStartX =
        translateX(measure!) + Number(notehead!.getAttribute('x')) + 10 + TIE.START_GAP;
      expect(firstMoveX(tie!)).toBeCloseTo(expectedStartX, 2);
    } finally {
      unmount();
    }
  });
});

describe('tie layout stays on the notehead when a system is justified (#249, stretch ≠ 1.0)', () => {
  // The renderer draws ties (Staff.tsx renderTies) and noteheads (Measure → useMeasureLayout)
  // from the SAME measure layout: both share measureStartXs, so tie-X == notehead-X reduces
  // to the two paths agreeing on `eventPositions`. In the unstretched path both read the
  // centralized legacyLayout. In the justified (stretch ≠ 1.0) path the Measure recomputes via
  // useMeasureLayout(events, …, forcedEventPositions = legacyLayout.eventPositions, stretch, key)
  // and renderTies recomputes via calculateMeasureLayout(events, …, undefined, stretch, key).
  // calculateMeasureLayout's forcedEventPositions is QUANT-keyed while legacyLayout.eventPositions
  // is ID-keyed, so today the forced map is a no-op in BOTH paths and they coincide. This pins
  // that contract: if a future change makes forced positions effective for the Measure without
  // also threading them into renderTies, this test fails — a tie would drift off its notehead.
  const events: ScoreEvent[] = [
    { id: 'a', duration: 'quarter', dotted: false, notes: [{ id: 'an', pitch: 'F#4', tied: true }] },
    { id: 'b', duration: 'quarter', dotted: false, notes: [{ id: 'bn', pitch: 'F#4' }] },
    { id: 'c', duration: 'quarter', dotted: false, notes: [{ id: 'cn', pitch: 'G4' }] },
    { id: 'd', duration: 'quarter', dotted: false, notes: [{ id: 'dn', pitch: 'A4' }] },
  ];
  const clef = 'treble';
  const key = 'G'; // non-C: accidental width is in play for the F#4s
  const stretch = 1.5;

  it('the Measure layout and the tie layout produce identical event positions when stretched', () => {
    // What Staff.tsx forwards to the Measure as forcedEventPositions (id-keyed).
    const legacyPositions = calculateMeasureLayout(events, undefined, clef, false, undefined, 1.0, key)
      .eventPositions;

    const measurePath = calculateMeasureLayout(events, undefined, clef, false, legacyPositions, stretch, key)
      .eventPositions;
    const tiePath = calculateMeasureLayout(events, undefined, clef, false, undefined, stretch, key)
      .eventPositions;

    expect(tiePath).toEqual(measurePath);

    // Sanity: the stretch is non-trivial, so the equality above is not vacuous.
    const unstretched = calculateMeasureLayout(events, undefined, clef, false, undefined, 1.0, key)
      .eventPositions;
    expect(tiePath).not.toEqual(unstretched);
  });
});
