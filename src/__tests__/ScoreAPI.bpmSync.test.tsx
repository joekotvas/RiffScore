/**
 * ScoreAPI.bpmSync.test.tsx
 *
 * Toolbar tempo ↔ score.bpm sync (issue #22).
 *
 * The toolbar's tempo input is a working/playback tempo. It is seeded from the score's
 * authoritative `score.bpm` and follows it whenever that tempo changes — every LOAD_SCORE
 * (api.loadScore, the ABC/JSON importer, the melody library, api.reset) and every SET_BPM
 * (api.setBpm, undo/redo) — while a manual toolbar edit only changes what the toolbar's Play
 * button plays and never writes back to the score (the asymmetric sync #22 asks for).
 *
 * Regression: the toolbar used to hold a `useState(120)` that nothing updated, so loading a score
 * with a different tempo left the input on 120 and the toolbar transport playing at 120.
 */

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import { resetPlaybackState } from '@/hooks/api/playback';
import type { MusicEditorAPI } from '../api.types';
import { Score } from '../types';

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
  getInstrumentOptions: jest.fn().mockReturnValue([{ id: 'bright', name: 'Bright Synth' }]),
  getState: jest.fn().mockReturnValue({
    instrumentState: 'ready',
    selectedInstrument: 'bright',
    samplerLoaded: true,
    isPlaying: false,
  }),
  playNote: jest.fn(),
  setTempo: jest.fn(),
}));

// A one-event timeline is enough for both transports to schedule playback.
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
  ]),
}));

import { scheduleScorePlayback } from '@/engines/toneEngine';
import { createTimeline } from '@/services/TimelineService';

const getAPI = (id: string): MusicEditorAPI => window.riffScore.get(id) as MusicEditorAPI;

const scoreWithBpm = (bpm: number): Score => ({
  title: `Score at ${bpm}`,
  timeSignature: '4/4',
  keySignature: 'C',
  bpm,
  staves: [
    { id: 'staff-1', clef: 'treble', keySignature: 'C', measures: [{ id: 'm1', events: [] }] },
  ],
});

/** The toolbar's tempo input (PlaybackControls). */
const tempoInput = () => screen.getByRole('textbox', { name: /tempo/i }) as HTMLInputElement;

/** Commit a manual toolbar edit the way a user does: type, then leave the field. */
const typeTempo = (value: string) => {
  fireEvent.change(tempoInput(), { target: { value } });
  fireEvent.blur(tempoInput());
};

const scheduledCalls = () => (scheduleScorePlayback as jest.Mock).mock.calls;

/** Tempo the most recent transport start was scheduled at (3rd arg of scheduleScorePlayback). */
const lastScheduledBpm = () => scheduledCalls()[scheduledCalls().length - 1][2];

/**
 * Press the toolbar's Play button and resolve once usePlayback has scheduled the transport
 * (it does so after a double requestAnimationFrame). Pauses first if a run is in progress.
 */
const pressToolbarPlay = async () => {
  const pause = screen.queryByRole('button', { name: 'Pause' });
  if (pause) fireEvent.click(pause);
  const before = scheduledCalls().length;
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  await waitFor(() => expect(scheduledCalls().length).toBeGreaterThan(before));
};

describe('Toolbar tempo follows score.bpm (#22)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlaybackState();
    Element.prototype.scrollTo = jest.fn();
  });

  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
  });

  test('seeds the toolbar from the initial score tempo', () => {
    render(<RiffScore id="bpm-seed" config={{ score: { bpm: 96 } }} />);
    expect(tempoInput()).toHaveValue('96');
  });

  test('loadScore with bpm 90 updates the toolbar tempo and the toolbar transport plays at 90', async () => {
    render(<RiffScore id="bpm-load" />);
    const api = getAPI('bpm-load');
    expect(tempoInput()).toHaveValue('120');

    act(() => {
      api.loadScore(scoreWithBpm(90));
    });

    expect(api.getScore().bpm).toBe(90);
    expect(tempoInput()).toHaveValue('90');

    await pressToolbarPlay();
    expect(createTimeline).toHaveBeenLastCalledWith(expect.objectContaining({ bpm: 90 }), 90);
    expect(lastScheduledBpm()).toBe(90);
  });

  test('api.import of an ABC tune (Q:3/8=120 → 180 quarter-note bpm) re-syncs the toolbar', () => {
    render(<RiffScore id="bpm-import" />);
    const api = getAPI('bpm-import');

    act(() => {
      api.import('abc', 'X:1\nT:Jig\nM:6/8\nL:1/8\nQ:3/8=120\nK:G\nGAB cBA | GAB cBA |]');
    });

    expect(api.result.ok).toBe(true);
    expect(api.getScore().bpm).toBe(180);
    expect(tempoInput()).toHaveValue('180');
  });

  test('a manual toolbar edit after a load still works and stays a working tempo (score untouched)', async () => {
    render(<RiffScore id="bpm-manual" />);
    const api = getAPI('bpm-manual');
    act(() => {
      api.loadScore(scoreWithBpm(90));
    });

    typeTempo('100');

    expect(tempoInput()).toHaveValue('100');
    await pressToolbarPlay();
    expect(lastScheduledBpm()).toBe(100);

    // #22: the toolbar value is a working tempo — it does not write back to the score, so the
    // score keeps its own tempo and the API transport (which plays score.bpm) still runs at 90.
    expect(api.getScore().bpm).toBe(90);
    await act(async () => {
      await api.play();
    });
    expect(lastScheduledBpm()).toBe(90);
    expect(tempoInput()).toHaveValue('100');
  });

  test('api.setBpm (SET_BPM) and its undo re-sync the toolbar, even over a manual edit', () => {
    render(<RiffScore id="bpm-set" />);
    const api = getAPI('bpm-set');

    typeTempo('100');
    expect(tempoInput()).toHaveValue('100');

    act(() => {
      api.setBpm(75);
    });
    expect(api.getScore().bpm).toBe(75);
    expect(tempoInput()).toHaveValue('75');

    act(() => {
      api.undo();
    });
    expect(api.getScore().bpm).toBe(120);
    expect(tempoInput()).toHaveValue('120');
  });

  test('a melody from the library (LOAD_SCORE via the toolbar) and reset re-sync the toolbar', () => {
    render(<RiffScore id="bpm-library" />);
    const api = getAPI('bpm-library');

    fireEvent.click(screen.getByRole('button', { name: /library/i }));
    // src/data/melodies/greensleeves.json carries bpm 80.
    fireEvent.click(screen.getByText('Greensleeves'));
    expect(api.getScore().bpm).toBe(80);
    expect(tempoInput()).toHaveValue('80');

    act(() => {
      api.reset();
    });
    expect(api.getScore().bpm).toBe(120);
    expect(tempoInput()).toHaveValue('120');
  });
});
