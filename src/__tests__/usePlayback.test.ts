/**
 * Comprehensive tests for usePlayback hook.
 * Tests playback state management, start/stop, position tracking, and edge cases.
 */

import { renderHook, act } from '@testing-library/react';
import { usePlayback } from '@/hooks/audio';
import type { Score } from '@/types';
import { parseABC } from '@/importers/abcImporter';

// Mock toneEngine
const mockInitTone = jest.fn().mockResolvedValue(undefined);
const mockScheduleTonePlayback = jest.fn();
const mockStopTonePlayback = jest.fn();
const mockGetState = jest.fn().mockReturnValue({ instrumentState: 'ready' });

jest.mock('../engines/toneEngine', () => ({
  initTone: (...args: any[]) => mockInitTone(...args),
  scheduleTonePlayback: (...args: any[]) => mockScheduleTonePlayback(...args),
  scheduleScorePlayback: (...args: any[]) => mockScheduleTonePlayback(...args), // Mock same as legacy for now or unique mock
  stopTonePlayback: () => mockStopTonePlayback(),
  getState: () => mockGetState(),
}));

// Mock RAF to execute immediately to bypass double-RAF wait in tests
const originalRAF = window.requestAnimationFrame;
beforeAll(() => {
  window.requestAnimationFrame = (cb) => {
    cb(0);
    return 0;
  };
});

afterAll(() => {
  window.requestAnimationFrame = originalRAF;
});

// Mock TimelineService
const mockCreateTimeline = jest.fn().mockReturnValue([
  { measureIndex: 0, quant: 0, time: 0, notes: [{ pitch: 'C4' }] },
  { measureIndex: 0, quant: 16, time: 0.5, notes: [{ pitch: 'D4' }] },
  { measureIndex: 1, quant: 0, time: 2.0, notes: [{ pitch: 'E4' }] },
]);

jest.mock('../services/TimelineService', () => ({
  createTimeline: (...args: any[]) => mockCreateTimeline(...args),
}));

describe('usePlayback', () => {
  const createMockScore = (): Score =>
    ({
      title: 'Test Score',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 'staff-1',
          clef: 'treble' as const,
          keySignature: 'C',
          measures: [
            {
              id: 'm1',
              events: [
                {
                  id: 'e1',
                  notes: [{ id: 'n1', pitch: 'C4' }],
                  duration: 'quarter',
                  dotted: false,
                },
              ],
            },
            {
              id: 'm2',
              events: [
                {
                  id: 'e2',
                  notes: [{ id: 'n2', pitch: 'D4' }],
                  duration: 'quarter',
                  dotted: false,
                },
              ],
            },
          ],
        },
      ],
    }) as Score;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with isPlaying = false', () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      expect(result.current.isPlaying).toBe(false);
    });

    it('should initialize with null playback position', () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      expect(result.current.playbackPosition).toEqual({
        measureIndex: null,
        quant: null,
        duration: 0,
      });
    });

    it('should initialize lastPlayStart at measure 0, quant 0', () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      expect(result.current.lastPlayStart).toEqual({
        measureIndex: 0,
        quant: 0,
      });
    });
  });

  describe('playScore', () => {
    it('should initialize Tone.js on first play', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore();
      });

      expect(mockInitTone).toHaveBeenCalled();
    });

    it('should set isPlaying to true when playing', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore();
      });

      expect(result.current.isPlaying).toBe(true);
    });

    it('should create timeline from score and bpm', async () => {
      const score = createMockScore();
      const bpm = 120;
      const { result } = renderHook(() => usePlayback(score, bpm));

      await act(async () => {
        await result.current.playScore();
      });

      expect(mockCreateTimeline).toHaveBeenCalledWith(score, bpm);
    });

    it('should schedule playback with timeline', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore();
      });

      expect(mockScheduleTonePlayback).toHaveBeenCalled();
      const scheduledArgs = mockScheduleTonePlayback.mock.calls[0];
      expect(scheduledArgs[0]).toEqual(
        expect.arrayContaining([expect.objectContaining({ measureIndex: 0 })])
      );
    });

    it('should update lastPlayStart when starting from specific position', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore(1, 16);
      });

      expect(result.current.lastPlayStart).toEqual({
        measureIndex: 1,
        quant: 16,
      });
    });

    it('should stop existing playback before starting new', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore();
      });

      // Play again
      await act(async () => {
        await result.current.playScore();
      });

      // stopTonePlayback should have been called during second playScore
      expect(mockStopTonePlayback).toHaveBeenCalled();
    });
  });

  it('only schedules the latest seek when animation frames are still pending', async () => {
    const frames: FrameRequestCallback[] = [];
    const immediateRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    try {
      const { result } = renderHook(() => usePlayback(createMockScore(), 120));
      await act(async () => {
        const first = result.current.playScore(0, 0);
        const latest = result.current.playScore(1, 0);
        await Promise.resolve();
        await Promise.resolve();
        while (frames.length) frames.shift()!(0);
        await Promise.all([first, latest]);
      });
      expect(mockScheduleTonePlayback).toHaveBeenCalledTimes(1);
      expect(mockScheduleTonePlayback.mock.calls[0][4]).toBe(2);
      await act(async () => {
        const pending = result.current.playScore(0, 16);
        await Promise.resolve();
        await Promise.resolve();
        result.current.pausePlayback();
        while (frames.length) frames.shift()!(0);
        await pending;
      });
      expect(mockScheduleTonePlayback).toHaveBeenCalledTimes(1);
      expect(result.current.isPlaying).toBe(false);
    } finally {
      window.requestAnimationFrame = immediateRAF;
    }
  });

  it('ignores position and completion callbacks from playback replaced by a seek', async () => {
    const { result } = renderHook(() => usePlayback(createMockScore(), 120));
    await act(async () => {
      await result.current.playScore(0, 0);
    });
    const previous = mockScheduleTonePlayback.mock.calls[0];
    await act(async () => {
      await result.current.playScore(1, 0);
    });
    act(() => {
      previous[5](0, 16, 0.5);
      previous[6]();
    });
    expect(result.current.playbackPosition.measureIndex).toBe(1);
    expect(result.current.isPlaying).toBe(true);
  });

  it('forwards configured accompaniment and rejects audio failures without leaving a playing cursor', async () => {
    const chords = { enabled: true, velocity: 80 };
    const { result } = renderHook(() => usePlayback(createMockScore(), 120, chords));
    mockScheduleTonePlayback.mockRejectedValueOnce(new Error('Audio unavailable'));
    await act(async () => {
      await expect(result.current.playScore()).rejects.toThrow('Audio unavailable');
    });
    expect(mockScheduleTonePlayback.mock.calls[0][3]).toEqual(chords);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isActive).toBe(false);
  });

  it('cancels only its own scheduled playback when the editor unmounts', async () => {
    const { result, unmount } = renderHook(() => usePlayback(createMockScore(), 120));
    await act(async () => {
      await result.current.playScore();
    });
    const signal = mockScheduleTonePlayback.mock.calls[0][7].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    const stops = mockStopTonePlayback.mock.calls.length;
    unmount();
    expect(signal.aborted).toBe(true);
    expect(mockStopTonePlayback).toHaveBeenCalledTimes(stops);
  });

  describe('stopPlayback', () => {
    it('should call stopTonePlayback', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore();
      });

      act(() => {
        result.current.stopPlayback();
      });

      expect(mockStopTonePlayback).toHaveBeenCalled();
    });

    it('should set isPlaying to false', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore();
      });

      act(() => {
        result.current.stopPlayback();
      });

      expect(result.current.isPlaying).toBe(false);
    });

    it('should reset playback position to null', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore();
      });

      act(() => {
        result.current.stopPlayback();
      });

      expect(result.current.playbackPosition).toEqual({
        measureIndex: null,
        quant: null,
        duration: 0,
      });
    });
  });

  describe('handlePlayToggle', () => {
    it('should start playback when not playing', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.handlePlayToggle();
      });

      expect(result.current.isPlaying).toBe(true);
    });

    it('should stop playback when already playing', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore();
      });

      expect(result.current.isPlaying).toBe(true);

      act(() => {
        result.current.handlePlayToggle();
      });

      expect(result.current.isPlaying).toBe(false);
    });
  });

  describe('position callbacks', () => {
    it('should update playbackPosition when callback is invoked', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore();
      });

      // Get the position callback from scheduleScorePlayback call (Arg 5)
      const positionCallback = mockScheduleTonePlayback.mock.calls[0][5];

      // Simulate position update
      act(() => {
        positionCallback(0, 16, 0.5);
      });

      expect(result.current.playbackPosition).toEqual({
        measureIndex: 0,
        quant: 16,
        duration: 0.5,
      });
    });

    it('should reset state when completion callback is invoked', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore();
      });

      // Get the completion callback from scheduleScorePlayback call (Arg 6)
      const completionCallback = mockScheduleTonePlayback.mock.calls[0][6];

      // Simulate playback completion
      act(() => {
        completionCallback();
      });

      expect(result.current.isPlaying).toBe(false);
      expect(result.current.playbackPosition).toEqual({
        measureIndex: null,
        quant: null,
        duration: 0,
      });
    });
  });

  describe('start offset', () => {
    it('resolves the requested measure using musical timing', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore(1, 0); // Start at measure 1
      });

      // Check that scheduleScorePlayback was called with correct start time offset (Arg 4)
      const startOffset = mockScheduleTonePlayback.mock.calls[0][4];
      expect(startOffset).toBe(2.0); // One 4/4 bar at 120 BPM lasts two seconds.
    });

    it.each([
      ['4/4', '"C"C z3 | "G"z4 |', 1, 16, 2.5],
      ['none', '"C"C D E | "G"z4 |', 1, 16, 2],
      ['4/4', '"C"C | "G"z4 |', 1, 16, 1],
    ])(
      'keeps a requested chord-only position after the final melody in %s',
      async (meter, music, measure, quant, offset) => {
        const parsed = parseABC(`X:1\nM:${meter}\nL:1/4\nK:C\n${music}`);
        if (!parsed.ok) throw new Error(parsed.error);
        const { createTimeline } = jest.requireActual('../services/TimelineService');
        mockCreateTimeline.mockReturnValueOnce(createTimeline(parsed.score, 120));
        const { result } = renderHook(() => usePlayback(parsed.score, 120));
        await act(async () => {
          await result.current.playScore(measure, quant);
        });
        expect(mockScheduleTonePlayback.mock.calls[0][4]).toBe(offset);
        expect(result.current.playbackPosition).toMatchObject({ measureIndex: measure, quant });
      }
    );

    it('should use 0 offset for start at beginning', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore(0, 0);
      });

      const startOffset = mockScheduleTonePlayback.mock.calls[0][4];
      expect(startOffset).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty score', async () => {
      const emptyScore: Score = {
        title: 'Empty Score',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [{ id: 'staff-1', clef: 'treble' as const, keySignature: 'C', measures: [] }],
      } as Score;
      mockCreateTimeline.mockReturnValueOnce([]);

      const { result } = renderHook(() => usePlayback(emptyScore, 120));

      await act(async () => {
        await result.current.playScore();
      });

      // Should still schedule (with empty timeline)
      expect(mockScheduleTonePlayback).toHaveBeenCalled();
    });

    it('should handle BPM changes', () => {
      const score = createMockScore();
      const { result, rerender } = renderHook(({ bpm }) => usePlayback(score, bpm), {
        initialProps: { bpm: 120 },
      });

      // BPM change should update the hook dependencies
      rerender({ bpm: 140 });

      // The hook should re-create callbacks with new BPM
      expect(result.current.playScore).toBeDefined();
    });

    it('should only initialize Tone.js once', async () => {
      const score = createMockScore();
      const { result } = renderHook(() => usePlayback(score, 120));

      await act(async () => {
        await result.current.playScore();
      });

      await act(async () => {
        await result.current.playScore();
      });

      // Should only be called once due to isInitialized ref
      expect(mockInitTone).toHaveBeenCalledTimes(1);
    });
  });
});
