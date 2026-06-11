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

const q = (id: string, pitch: string | null, tied = false): ScoreEvent =>
  pitch === null
    ? { id, duration: 'quarter', dotted: false, isRest: true, notes: [{ id: `${id}n`, pitch: null, isRest: true }] }
    : { id, duration: 'quarter', dotted: false, notes: [{ id: `${id}n`, pitch, tied }] };

const scoreOf = (events: ScoreEvent[]): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.staves = [{ ...s.staves[0], measures: [{ id: 'm0', events }] }];
  return s;
};

const tieCount = (score: Score): number => {
  const { container, unmount } = renderScore(score);
  const n = container.querySelectorAll('.riff-Tie').length;
  unmount();
  return n;
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
});
