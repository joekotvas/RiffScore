/**
 * Duration/dot overflow feedback (#242 Lane D).
 *
 * The UI path must NEVER silently drop a duration/dot change that won't fit the bar — it rejects
 * with user-facing feedback (and dispatches nothing); a change that fits clears any stale feedback.
 *
 * @see src/hooks/editor/useModifiers.ts handleDurationChange / handleDotToggle
 */

// Mock the audio engine to avoid WebAudio under jsdom (as the other hook/render tests do).
jest.mock('@/engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

import { renderHook, act } from '@testing-library/react';
import { RefObject } from 'react';
import { useModifiers } from '@/hooks/editor/useModifiers';
import { createDefaultSelection, createDefaultScore, Score, Selection, ScoreEvent } from '@/types';

const q = (id: string): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [{ id: `${id}n`, pitch: 'C4' }],
});

const scoreWith = (events: ScoreEvent[]): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.staves = [{ ...s.staves[0], measures: [{ id: 'm0', events }] }];
  return s;
};

const tools = () => ({
  handleDurationChange: jest.fn(),
  handleDotToggle: jest.fn(() => false),
  handleAccidentalToggle: jest.fn(() => null),
  handleTieToggle: jest.fn(() => false),
  isDotted: false,
  activeTie: false,
  activeAccidental: null as 'flat' | 'natural' | 'sharp' | null,
});

const sel = (eventId: string): Selection => ({
  ...createDefaultSelection(),
  measureIndex: 0,
  eventId,
  noteId: `${eventId}n`,
  staffIndex: 0,
  selectedNotes: [],
});

describe('useModifiers duration overflow feedback', () => {
  it('emits feedback and dispatches nothing when a duration change overflows the bar', () => {
    const scoreRef = { current: scoreWith([q('a'), q('b'), q('c'), q('d')]) } as RefObject<Score>; // full 4/4
    const setFeedback = jest.fn();
    const dispatch = jest.fn();

    const { result } = renderHook(() =>
      useModifiers({
        scoreRef,
        selection: sel('a'),
        currentQuantsPerMeasure: 64,
        tools: tools(),
        dispatch,
        setFeedback,
      })
    );

    act(() => result.current.handleDurationChange('whole', true));

    expect(dispatch).not.toHaveBeenCalled();
    // A gentle "didn't fit" notice — warning severity, not a hard error.
    expect(setFeedback).toHaveBeenCalledWith(expect.stringContaining('not enough room'), 'warning');
  });

  it('clears feedback and dispatches when a duration change fits', () => {
    const scoreRef = { current: scoreWith([q('a')]) } as RefObject<Score>; // under-full
    const setFeedback = jest.fn();
    const dispatch = jest.fn();

    const { result } = renderHook(() =>
      useModifiers({
        scoreRef,
        selection: sel('a'),
        currentQuantsPerMeasure: 64,
        tools: tools(),
        dispatch,
        setFeedback,
      })
    );

    act(() => result.current.handleDurationChange('half', true));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(setFeedback).toHaveBeenCalledWith(null);
  });
});

describe('useModifiers dot overflow feedback', () => {
  const half = (id: string): ScoreEvent => ({ ...q(id), duration: 'half' });

  it('emits feedback and dispatches nothing when adding a dot overflows the bar', () => {
    // Two half notes exactly fill 4/4 (64); dotting one would need an extra quarter → overflow.
    const scoreRef = { current: scoreWith([half('a'), half('b')]) } as RefObject<Score>;
    const setFeedback = jest.fn();
    const dispatch = jest.fn();

    const { result } = renderHook(() =>
      useModifiers({
        scoreRef,
        selection: sel('a'),
        currentQuantsPerMeasure: 64,
        tools: tools(),
        dispatch,
        setFeedback,
      })
    );

    act(() => result.current.handleDotToggle());

    expect(dispatch).not.toHaveBeenCalled();
    // A gentle "didn't fit" notice — warning severity, not a hard error.
    expect(setFeedback).toHaveBeenCalledWith(expect.stringContaining('not enough room'), 'warning');
  });

  it('clears feedback and dispatches when adding a dot fits', () => {
    const scoreRef = { current: scoreWith([q('a')]) } as RefObject<Score>; // plenty of room
    const setFeedback = jest.fn();
    const dispatch = jest.fn();

    const { result } = renderHook(() =>
      useModifiers({
        scoreRef,
        selection: sel('a'),
        currentQuantsPerMeasure: 64,
        tools: tools(),
        dispatch,
        setFeedback,
      })
    );

    act(() => result.current.handleDotToggle());

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(setFeedback).toHaveBeenCalledWith(null);
  });
});
