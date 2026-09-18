import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RiffScore } from '@/RiffScore';
import { useScoreContext, type ScoreContextType } from '@/context/ScoreContext';
import { useMIDI } from '@/hooks/audio/useMIDI';
import * as playbackShortcuts from '@/hooks/handlers/handlePlayback';
import type { DeepPartial, RiffScoreConfig } from '@/types';

jest.mock('@/hooks/audio/useMIDI', () => ({
  useMIDI: jest.fn(() => ({ midiStatus: { connected: false, error: null } })),
}));
jest.mock('@/engines/toneEngine', () => ({
  ...jest.requireActual('@/engines/toneEngine'),
  playNote: jest.fn(),
}));

const contexts = new Map<string, ScoreContextType>();
function Probe({ id }: { id: string }) {
  contexts.set(id, useScoreContext());
  return null;
}
const config: DeepPartial<RiffScoreConfig> = {
  ui: { showToolbar: false, showFooter: false, engraving: { showPreamble: false } },
  interaction: {
    allowEventInsertion: false,
    allowDurationChanges: false,
    allowEventDeletion: false,
  },
  score: { abc: 'X:1\nM:4/4\nL:1/4\nK:C\n[CEG] D E F|]' },
};
const logic = () => contexts.get('locked')!;
const api = () => window.riffScore.get('locked')!;
const events = () => api().getScore().staves[0].measures[0].events;
const scoreJSON = () => api().export('json');
const mount = () =>
  render(<RiffScore id="locked" config={config} renderControls={() => <Probe id="locked" />} />);
const select = (event = 1, note = 0) =>
  act(() => {
    api().select(0, 0, event, note);
  });

beforeEach(() => {
  Element.prototype.scrollTo = jest.fn();
  contexts.clear();
  jest.clearAllMocks();
});

test('mouse/Enter entry rejects gaps and append positions while host API remains available', () => {
  mount();
  const before = scoreJSON();
  act(() => {
    logic().entry.addNote(0, { pitch: 'A4', mode: 'INSERT', index: 1 }, true);
    logic().entry.addNote(1, { pitch: 'A4', mode: 'APPEND', index: 0 }, true);
  });
  expect(scoreJSON()).toBe(before);
  expect(logic().state.previewNote).toBeNull();
  act(() => {
    api().select(0, 0, 1).addNote('A4', 'quarter');
  });
  expect(scoreJSON()).not.toBe(before);
});

test('selection, pitch edits and chord-tone addition remain editable', () => {
  mount();
  select();
  const target = events()[1];
  act(() => logic().navigation.transpose('up', false));
  expect(events()[1].notes[0].pitch).toBe('E4');
  act(() => logic().entry.addNote(0, { pitch: 'G4', mode: 'CHORD', index: 1, eventId: target.id }));
  expect(events()).toHaveLength(4);
  expect(events()[1].notes.map((note) => note.pitch)).toEqual(['E4', 'G4']);
  expect(events()[1].duration).toBe('quarter');
});

test('insertion ghosts disappear, but chord-tone ghosts remain', () => {
  mount();
  act(() =>
    logic().entry.handleMeasureHover(0, { type: 'INSERT', index: 1, startX: 40, endX: 70 }, 'A4', 0)
  );
  expect(logic().state.previewNote).toBeNull();
  expect(screen.queryByTestId('ghost-preview')).not.toBeInTheDocument();
  act(() =>
    logic().entry.handleMeasureHover(
      0,
      { type: 'EVENT', eventId: events()[1].id, index: 1, startX: 70, endX: 95 },
      'A4',
      0
    )
  );
  expect(logic().state.previewNote?.mode).toBe('CHORD');
  expect(screen.getByTestId('ghost-preview')).toBeInTheDocument();
  act(() =>
    logic().entry.handleMeasureHover(
      0,
      { type: 'APPEND', index: 4, startX: 200, endX: 2200 },
      'A4',
      0
    )
  );
  expect(screen.queryByTestId('ghost-preview')).not.toBeInTheDocument();
});

test('keyboard duration, dots, rest conversion and last-note deletion cannot change the phrase', () => {
  mount();
  select();
  const canvas = screen.getByTestId('score-canvas-container');
  act(() => canvas.focus());
  const before = scoreJSON();
  for (const key of ['4', '.', 'r', 'Backspace', 'Delete', 'Enter']) {
    fireEvent.keyDown(canvas, { key, ctrlKey: key === '4' });
    expect(scoreJSON()).toBe(before);
  }
  expect(logic().modifiers.checkDurationValidity('half')).toBe(false);
  expect(logic().tuplets.canApply(3)).toBe(false);
});

test('deletion removes an extra chord tone but atomically refuses a selection that empties any event', () => {
  mount();
  select(0, 2);
  act(() => logic().entry.delete());
  expect(events()[0].notes.map((note) => note.pitch)).toEqual(['C4', 'E4']);
  expect(events()).toHaveLength(4);
  select(0, 0);
  act(() => logic().navigation.select(0, events()[0].id, null, 0, false, true));
  const before = scoreJSON();
  act(() => logic().entry.delete());
  expect(scoreJSON()).toBe(before);
  const canvas = screen.getByTestId('score-canvas-container');
  act(() => canvas.focus());
  fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });
  fireEvent.keyDown(canvas, { key: 'Delete' });
  expect(scoreJSON()).toBe(before);
});

test('undo/redo preserve edits but cannot undo host entry into an empty phrase', () => {
  mount();
  select();
  act(() => logic().navigation.transpose('up', false));
  expect(events()[1].notes[0].pitch).toBe('E4');
  act(() => logic().historyAPI.undo());
  expect(events()[1].notes[0].pitch).toBe('D4');
  act(() => logic().historyAPI.redo());
  expect(events()[1].notes[0].pitch).toBe('E4');
  act(() => {
    api().select(0, 0, 3).move('right').addNote('A4');
  });
  const before = scoreJSON();
  const historyCount = logic().engines.engine.getHistory().length;
  act(() => logic().historyAPI.undo());
  expect(scoreJSON()).toBe(before);
  expect(logic().engines.engine.getHistory()).toHaveLength(historyCount);
});

test('horizontal navigation stays on real notes at phrase boundaries', () => {
  mount();
  select(3);
  const lastId = events()[3].id;
  act(() => logic().navigation.move('right', false, false));
  expect(logic().state.selection.eventId).toBe(lastId);
  expect(logic().state.previewNote).toBeNull();
  act(() => logic().navigation.move('left', false, false));
  expect(logic().state.selection.eventId).toBe(events()[2].id);
  expect(events()).toHaveLength(4);
});

test('MIDI entry respects the view policy', () => {
  mount();
  const midi = jest
    .mocked(useMIDI)
    .mock.calls.filter((call) => call[5])
    .at(-1)!;
  const before = scoreJSON();
  act(() => midi[0](0, [{ pitch: 'C5', accidental: 'natural' }], 'quarter', false));
  expect(scoreJSON()).toBe(before);
});

test('API permission updates are synchronous, merge independently, and update the mounted view', () => {
  mount();
  select();
  const retained = api();
  const before = scoreJSON();
  const history = logic().engines.engine.getHistory().length;
  act(() => {
    const chained = retained.setInteractionConfig({ allowDurationChanges: true });
    expect(chained).toBe(retained);
    expect(retained.getInteractionConfig()).toMatchObject({
      allowDurationChanges: true,
      allowEventInsertion: false,
      allowEventDeletion: false,
    });
    expect(retained.getConfig().interaction.allowDurationChanges).toBe(true);
  });
  expect(scoreJSON()).toBe(before);
  expect(logic().engines.engine.getHistory()).toHaveLength(history);
  act(() => logic().modifiers.duration('eighth', true));
  expect(events()[1].duration).toBe('eighth');
  act(() => retained.setInteractionConfig({ allowDurationChanges: false }));
  act(() => logic().modifiers.duration('half', true));
  expect(events()[1].duration).toBe('eighth');
  const copy = retained.getInteractionConfig();
  copy.allowDurationChanges = true;
  expect(retained.getInteractionConfig().allowDurationChanges).toBe(false);
});

test('API overrides persist over prop changes until reset restores the latest props', () => {
  const { rerender } = mount();
  const retained = api();
  act(() => retained.setInteractionConfig({ allowDurationChanges: true, enableKeyboard: false }));
  const next = { ...config, interaction: { ...config.interaction, allowEventInsertion: true } };
  rerender(<RiffScore id="locked" config={next} renderControls={() => <Probe id="locked" />} />);
  expect(retained.getInteractionConfig()).toMatchObject({
    allowDurationChanges: true,
    allowEventInsertion: true,
    enableKeyboard: false,
  });
  act(() => {
    retained.resetInteractionConfig();
    expect(retained.getInteractionConfig()).toMatchObject({
      allowDurationChanges: false,
      allowEventInsertion: true,
      enableKeyboard: true,
    });
  });
});

test('invalid API patches reject atomically with structured feedback', () => {
  mount();
  const retained = api();
  const before = retained.getInteractionConfig();
  const logging = jest.spyOn(console, 'error').mockImplementation(() => {});
  act(() =>
    retained.setInteractionConfig({
      allowEventInsertion: true,
      allowDurationChanges: 'no',
    } as unknown as Parameters<typeof retained.setInteractionConfig>[0])
  );
  expect(retained.getInteractionConfig()).toEqual(before);
  expect(retained.result).toMatchObject({ ok: false, code: 'INVALID_INTERACTION_CONFIG' });
  logging.mockRestore();
});

test('changing config props updates editing permissions without remounting or replacing score data', () => {
  const { rerender } = mount();
  select();
  const before = scoreJSON();
  rerender(
    <RiffScore
      id="locked"
      config={{ ...config, interaction: { ...config.interaction, allowEventDeletion: true } }}
      renderControls={() => <Probe id="locked" />}
    />
  );
  expect(scoreJSON()).toBe(before);
  act(() => logic().entry.delete());
  expect(events()).toHaveLength(3);
});

test('dynamic master and keyboard switches affect input and remain isolated from another view', () => {
  render(
    <>
      <RiffScore id="locked" config={config} renderControls={() => <Probe id="locked" />} />
      <RiffScore id="other" config={config} />
    </>
  );
  select();
  const retained = api();
  const canvas = screen.getAllByTestId('score-canvas-container')[0];
  act(() => canvas.focus());
  act(() => retained.setInteractionConfig({ enableKeyboard: false, enablePlayback: false }));
  fireEvent.keyDown(canvas, { key: 'ArrowUp' });
  expect(events()[1].notes[0].pitch).toBe('D4');
  expect(window.riffScore.get('other')!.getInteractionConfig().enableKeyboard).toBe(true);
  act(() => retained.setInteractionConfig({ enableKeyboard: true }));
  fireEvent.keyDown(canvas, { key: 'ArrowUp' });
  expect(events()[1].notes[0].pitch).toBe('E4');
  act(() => retained.setInteractionConfig({ isEnabled: false }));
  fireEvent.keyDown(canvas, { key: 'ArrowUp' });
  expect(events()[1].notes[0].pitch).toBe('E4');
  act(() => retained.resetInteractionConfig());
  expect(retained.getInteractionConfig()).toMatchObject({
    isEnabled: true,
    enableKeyboard: true,
    enablePlayback: true,
  });
});

test('the playback switch updates keyboard playback without disabling pitch editing', () => {
  mount();
  select();
  const playback = jest.spyOn(playbackShortcuts, 'handlePlayback').mockReturnValue(true);
  const canvas = screen.getByTestId('score-canvas-container');
  act(() => canvas.focus());
  act(() => api().setInteractionConfig({ enablePlayback: false }));
  fireEvent.keyDown(canvas, { key: ' ', code: 'Space' });
  fireEvent.keyDown(canvas, { key: 'p', code: 'KeyP' });
  expect(playback).not.toHaveBeenCalled();
  fireEvent.keyDown(canvas, { key: 'ArrowUp' });
  expect(events()[1].notes[0].pitch).toBe('E4');
  act(() => api().setInteractionConfig({ enablePlayback: true }));
  fireEvent.keyDown(canvas, { key: ' ', code: 'Space' });
  expect(playback).toHaveBeenCalledTimes(1);
  playback.mockRestore();
});
