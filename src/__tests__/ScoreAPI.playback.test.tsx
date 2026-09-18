/**
 * ScoreAPI Playback Integration Tests
 *
 * Tests the playback API methods (play, pause, stop, rewind, setInstrument)
 * using mocked toneEngine functions.
 */

import { render, act } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import { ThemeProvider } from '@/context/ThemeContext';
import type { MusicEditorAPI } from '../api.types';

const getAPI = (id: string): MusicEditorAPI => {
  return window.riffScore.get(id) as MusicEditorAPI;
};

// Mock the toneEngine module - must include all exported functions
jest.mock('@/engines/toneEngine', () => ({
  initTone: jest.fn().mockResolvedValue(undefined),
  scheduleTonePlayback: jest.fn(),
  scheduleScorePlayback: jest.fn(),
  stopTonePlayback: jest.fn(),
  setInstrument: jest.fn(),
  isPlaying: jest.fn().mockReturnValue(false),
  isSamplerLoaded: jest.fn().mockReturnValue(true),
  getInstrumentState: jest.fn().mockReturnValue('ready'),
  getSelectedInstrument: jest.fn().mockReturnValue('bright'),
  getInstrumentOptions: jest.fn().mockReturnValue([
    { id: 'bright', name: 'Bright Synth' },
    { id: 'mellow', name: 'Mellow Synth' },
    { id: 'organ', name: 'Organ Synth' },
    { id: 'piano', name: 'Piano Samples' },
  ]),
  getState: jest.fn().mockReturnValue({
    instrumentState: 'ready',
    selectedInstrument: 'bright',
    samplerLoaded: true,
    isPlaying: false,
  }),
  playNote: jest.fn(),
  setTempo: jest.fn(),
}));

// Mock the TimelineService
jest.mock('@/services/TimelineService', () => ({
  createTimeline: jest.fn().mockReturnValue([
    {
      time: 0,
      duration: 0.5,
      pitch: 'C4',
      frequency: 261.63,
      type: 'note',
      measureIndex: 0,
      eventIndex: 0,
      staffIndex: 0,
      quant: 0,
    },
    {
      time: 0.5,
      duration: 0.5,
      pitch: 'D4',
      frequency: 293.66,
      type: 'note',
      measureIndex: 0,
      eventIndex: 1,
      staffIndex: 0,
      quant: 16,
    },
  ]),
}));

import {
  initTone,
  scheduleScorePlayback,
  stopTonePlayback,
  setInstrument as toneSetInstrument,
  isPlaying as toneIsPlaying,
} from '@/engines/toneEngine';
import { createTimeline } from '@/services/TimelineService';
import { DEFAULT_CHORD_PLAYBACK } from '@/types';

describe('ScoreAPI Playback Methods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (toneIsPlaying as jest.Mock).mockReturnValue(false);
  });

  const renderWithTheme = (id: string) => {
    return render(
      <ThemeProvider>
        <RiffScore id={id} />
      </ThemeProvider>
    );
  };

  describe('play()', () => {
    test('initializes Tone.js and starts playback', async () => {
      renderWithTheme('play-test');
      const api = getAPI('play-test');

      await act(async () => {
        await api.play();
      });

      expect(initTone).toHaveBeenCalled();
      expect(createTimeline).toHaveBeenCalled();
      expect(scheduleScorePlayback).toHaveBeenCalled();
    });

    test('plays from specific measure and quant', async () => {
      renderWithTheme('play-position');
      const api = getAPI('play-position');

      await act(async () => {
        await api.play(2, 32);
      });

      expect(scheduleScorePlayback).toHaveBeenCalled();
      // The schedule call should attempt to find the start offset
    });

    test('routes through scheduleScorePlayback with the score + chord config (chord parity)', async () => {
      // Regression: api.play() previously used the melody-only scheduleTonePlayback,
      // silently dropping the chord track it advertises. It must now pass the full
      // score and a chord-playback config to the chord-capable scheduler, exactly
      // as the UI's usePlayback does. (#242 carve-out: api-play-ignores-chords.)
      renderWithTheme('play-chords');
      const api = getAPI('play-chords');

      await act(async () => {
        await api.play();
      });

      expect(scheduleScorePlayback).toHaveBeenCalledTimes(1);
      const args = (scheduleScorePlayback as jest.Mock).mock.calls[0];
      // Signature: (timeline, score, bpm, chordConfig, startTimeOffset, onPos, onDone)
      const [, scoreArg, , chordConfigArg] = args;
      expect(scoreArg).toHaveProperty('staves'); // the actual Score, not just a timeline
      expect(chordConfigArg).toEqual(DEFAULT_CHORD_PLAYBACK);
      expect(chordConfigArg.enabled).toBe(true);
    });

    test('honors configured chord playback (enabled:false / custom velocity), not forced defaults', async () => {
      // Regression (Codex review of #250): api.play() must respect the embedder's
      // configured chord playback — config.chord.playback, the same value
      // getChordPlayback() reports — rather than forcing DEFAULT_CHORD_PLAYBACK on
      // every call. Otherwise a score configured with chord playback OFF would still
      // schedule chords through the API.
      render(
        <ThemeProvider>
          <RiffScore
            id="play-chords-off"
            config={{ chord: { playback: { enabled: false, velocity: 30 } } }}
          />
        </ThemeProvider>
      );
      const api = getAPI('play-chords-off');

      await act(async () => {
        await api.play();
      });

      expect(scheduleScorePlayback).toHaveBeenCalledTimes(1);
      const chordConfigArg = (scheduleScorePlayback as jest.Mock).mock.calls[0][3];
      expect(chordConfigArg).toEqual({ enabled: false, velocity: 30 });
    });

    test('play() is chainable (returns this)', async () => {
      renderWithTheme('play-chain');
      const api = getAPI('play-chain');

      let result;
      await act(async () => {
        result = await api.play();
      });

      expect(result).toBe(api);
    });
  });

  describe('pause()', () => {
    test('stops playback without resetting position', async () => {
      renderWithTheme('pause-test');
      const api = getAPI('pause-test');
      await act(async () => {
        await api.play();
      });

      act(() => {
        api.pause();
      });

      expect(stopTonePlayback).not.toHaveBeenCalled();
      expect((scheduleScorePlayback as jest.Mock).mock.calls[0][7].signal.aborted).toBe(true);
    });

    test('pause() is chainable', () => {
      renderWithTheme('pause-chain');
      const api = getAPI('pause-chain');

      let result;
      act(() => {
        result = api.pause();
      });

      expect(result).toBe(api);
    });
  });

  describe('stop()', () => {
    test('stops playback and resets position', async () => {
      renderWithTheme('stop-test');
      const api = getAPI('stop-test');
      await act(async () => {
        await api.play();
      });

      act(() => {
        api.stop();
      });

      expect(stopTonePlayback).not.toHaveBeenCalled();
      expect((scheduleScorePlayback as jest.Mock).mock.calls[0][7].signal.aborted).toBe(true);
    });

    test('stop() is chainable', () => {
      renderWithTheme('stop-chain');
      const api = getAPI('stop-chain');

      let result;
      act(() => {
        result = api.stop();
      });

      expect(result).toBe(api);
    });
  });

  describe('rewind()', () => {
    test('rewinds to beginning by default', () => {
      renderWithTheme('rewind-default');
      const api = getAPI('rewind-default');

      act(() => {
        api.rewind();
      });

      expect(stopTonePlayback).not.toHaveBeenCalled();
    });

    test('rewinds to specific measure', () => {
      renderWithTheme('rewind-measure');
      const api = getAPI('rewind-measure');

      act(() => {
        api.rewind(3);
      });

      expect(stopTonePlayback).not.toHaveBeenCalled();
    });

    test('restarts playback if was playing', async () => {
      (toneIsPlaying as jest.Mock).mockReturnValue(true);
      renderWithTheme('rewind-playing');
      const api = getAPI('rewind-playing');
      await act(async () => {
        await api.play();
      });

      act(() => {
        api.rewind(2);
      });

      expect(stopTonePlayback).not.toHaveBeenCalled();
      // The restart happens via setTimeout, so we need to wait
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      // scheduleScorePlayback should be called again for the restart
      expect(scheduleScorePlayback).toHaveBeenCalled();
    });

    test('rewind() is chainable', () => {
      renderWithTheme('rewind-chain');
      const api = getAPI('rewind-chain');

      let result;
      act(() => {
        result = api.rewind();
      });

      expect(result).toBe(api);
    });
  });

  describe('setInstrument()', () => {
    test('sets the view instrument used by its transport', async () => {
      renderWithTheme('instrument-test');
      const api = getAPI('instrument-test');

      act(() => {
        api.setInstrument('piano');
      });

      await act(async () => {
        await api.play();
      });
      expect(toneSetInstrument).toHaveBeenCalledWith('piano');
    });

    test('accepts all valid instrument types', async () => {
      renderWithTheme('instrument-types');
      const api = getAPI('instrument-types');

      const instruments = ['bright', 'mellow', 'organ', 'piano'];

      for (const inst of instruments) {
        act(() => {
          api.setInstrument(inst);
        });
        await act(async () => {
          await api.play();
        });
        expect(toneSetInstrument).toHaveBeenCalledWith(inst);
      }
    });

    test('setInstrument() is chainable', () => {
      renderWithTheme('instrument-chain');
      const api = getAPI('instrument-chain');

      let result;
      act(() => {
        result = api.setInstrument('mellow');
      });

      expect(result).toBe(api);
    });
  });

  describe('Playback Workflow', () => {
    test('play -> pause -> play resumes', async () => {
      renderWithTheme('workflow-resume');
      const api = getAPI('workflow-resume');

      // Start playback
      await act(async () => {
        await api.play();
      });

      // Pause
      act(() => {
        api.pause();
      });

      // Clear mock to verify resume call
      jest.clearAllMocks();

      // Resume (should not reinitialize)
      await act(async () => {
        await api.play();
      });

      // initTone should not be called again (already initialized)
      // But scheduleScorePlayback should be called
      expect(scheduleScorePlayback).toHaveBeenCalled();
    });

    test('stop resets position to beginning', async () => {
      renderWithTheme('workflow-stop');
      const api = getAPI('workflow-stop');

      // Play from position 2
      await act(async () => {
        await api.play(2, 32);
      });

      // Stop
      act(() => {
        api.stop();
      });

      jest.clearAllMocks();

      // Play again - should start from beginning (position is reset)
      await act(async () => {
        await api.play();
      });

      expect(scheduleScorePlayback).toHaveBeenCalled();
    });
  });
});

it('retains resume position per API instance without leaking it into another editor', async () => {
  render(
    <>
      <RiffScore id="resume-first" />
      <RiffScore id="resume-second" />
    </>
  );
  await act(async () => {
    await getAPI('resume-first').play(1, 16);
  });
  await act(async () => {
    await getAPI('resume-second').play();
  });
  expect(jest.mocked(scheduleScorePlayback).mock.calls.at(-1)?.[4]).toBe(0);
});

it('starts at the requested rest position instead of skipping ahead to a melody onset', async () => {
  render(
    <RiffScore id="rest-start" config={{ score: { abc: 'X:1\nM:4/4\nL:1/4\nK:C\n"C"z2 C2|' } }} />
  );
  jest.mocked(createTimeline).mockReturnValueOnce([
    {
      time: 1,
      duration: 1,
      pitch: 'C4',
      frequency: 261.63,
      type: 'note',
      measureIndex: 0,
      eventIndex: 1,
      staffIndex: 0,
      quant: 32,
    },
  ]);
  await act(async () => {
    await getAPI('rest-start').play(0, 0);
  });
  expect(jest.mocked(scheduleScorePlayback).mock.calls.at(-1)?.[4]).toBe(0);
});

test('API, playback events and custom controls share one transport with synchronous seek and score edits', async () => {
  let controls: import('../components/Layout/ScoreControls').ScoreControls | undefined;
  render(
    <RiffScore
      id="coherent"
      renderControls={(value) => {
        controls = value;
        return null;
      }}
    />
  );
  const api = getAPI('coherent');
  const listener = jest.fn();
  const off = api.on('playback', listener);
  await act(async () => {
    api.select(0).addNote('C4');
    await api.seek(1, 16).setInstrument('organ').play();
  });
  expect(api.getPlaybackState()).toMatchObject({ isPlaying: true, measureIndex: 1, quant: 16 });
  expect(controls?.isPlaying).toBe(true);
  expect(controls?.instrument).toBe('organ');
  expect(toneSetInstrument).toHaveBeenLastCalledWith('organ');
  expect(
    (scheduleScorePlayback as jest.Mock).mock.calls.at(-1)[1].staves[0].measures[0].events
  ).toHaveLength(1);
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({ isPlaying: true, quant: 16 })
  );
  act(() => controls?.pause());
  expect(api.getPlaybackState().isPlaying).toBe(false);
  off();
});

test('invalid transport positions fail softly without scheduling or moving the cursor', async () => {
  render(<RiffScore id="invalid-position" />);
  const api = getAPI('invalid-position');
  const before = api.getPlaybackState();
  await act(async () => {
    await api.play(-1, NaN);
  });
  expect(api.result).toMatchObject({ ok: false, code: 'INVALID_PLAYBACK_POSITION' });
  expect(api.getPlaybackState()).toEqual(before);
});

test('an explicit start measure starts at its beginning rather than carrying a paused quant', async () => {
  render(<RiffScore id="measure-start" />);
  const api = getAPI('measure-start');
  await act(async () => {
    api.seek(0, 32);
    await api.play(1);
  });
  expect(api.getPlaybackState()).toMatchObject({ measureIndex: 1, quant: 0 });
});
