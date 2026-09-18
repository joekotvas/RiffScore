import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { RiffScore } from '@/RiffScore';
import type { DeepPartial, RiffScoreConfig } from '@/types';

const config: DeepPartial<RiffScoreConfig> = {
  score: { abc: 'X:1\nM:4/4\nL:1/4\nK:C\n[CEG]4 |]' },
  ui: { showToolbar: false, showFooter: false },
  chord: { recognition: { enabled: true } },
};

beforeEach(() => {
  Element.prototype.scrollTo = jest.fn();
});

it('keeps rendered symbols, notation, API and exports in sync with note edits and undo', () => {
  const { rerender } = render(<RiffScore id="recognition" config={config} />);
  const api = window.riffScore.get('recognition')!;
  expect(screen.getByText('C')).toBeInTheDocument();
  act(() => {
    api.select(0, 0, 0, 0).addTone('B4');
  });
  expect(screen.getByText('Cmaj7')).toBeInTheDocument();
  expect(api.getScore().chordTrack?.[0].symbol).toBe('Cmaj7');
  expect(api.export('abc')).toContain('"Cmaj7"');
  expect(JSON.parse(api.export('json')).chordTrack[0].symbol).toBe('Cmaj7');
  act(() => {
    api.undo();
  });
  expect(screen.getByText('C')).toBeInTheDocument();
  act(() => {
    api.redo();
  });
  expect(screen.getByText('Cmaj7')).toBeInTheDocument();
  rerender(
    <RiffScore
      id="recognition"
      config={{
        ...config,
        chord: { ...config.chord, display: { notation: 'roman', useSymbols: false } },
      }}
    />
  );
  expect(screen.getByText('Imaj7')).toBeInTheDocument();
  expect(api.getScore().staves[0].measures[0].events[0].notes).toHaveLength(4);
  act(() => {
    api.select(0, 0, 0, 3).deleteSelected();
  });
  expect(screen.getByText('I')).toBeInTheDocument();
  act(() => {
    api.select(0, 0, 0, 2).deleteSelected();
  });
  expect(api.getScore().chordTrack).toEqual([]);
  act(() => {
    api.undo();
  });
  expect(screen.getByText('I')).toBeInTheDocument();
});

it('leaves authored symbols alone unless recognition is explicitly enabled', () => {
  render(
    <RiffScore
      id="manual-chords"
      config={{ score: { abc: 'X:1\nM:4/4\nL:1/4\nK:C\n"Cmaj7"[EGB]4 |]' } }}
    />
  );
  const api = window.riffScore.get('manual-chords')!;
  act(() => {
    api.select(0, 0, 0, 0).addTone('A4');
  });
  expect(api.getScore().chordTrack?.[0].symbol).toBe('Cmaj7');
});

it('transposes edited harmony through C, F and G as atomic, reversible API transactions', () => {
  render(<RiffScore id="transpose-harmony" config={config} />);
  const api = window.riffScore.get('transpose-harmony')!;
  act(() => {
    api.select(0, 0, 0, 0).addTone('B4');
  });
  const original = api.getScore();
  const transpose = (key: string, semitones: number) => {
    act(() => {
      api
        .beginTransaction()
        .setKeySignature(key)
        .selectAll()
        .transpose(semitones)
        .deselectAll()
        .commitTransaction(`Transpose to ${key}`);
    });
  };
  transpose('F', 5);
  expect(api.getScore().keySignature).toBe('F');
  expect(api.getScore().chordTrack?.[0].symbol).toBe('Fmaj7');
  expect(api.getScore().staves[0].measures[0].events[0].notes.map((n) => n.pitch)).toEqual([
    'F4',
    'A4',
    'C5',
    'E5',
  ]);
  act(() => {
    api.undo();
  });
  expect(api.getScore()).toEqual(original);
  act(() => {
    api.redo();
  });
  expect(api.getScore().chordTrack?.[0].symbol).toBe('Fmaj7');
  transpose('G', 2);
  expect(api.getScore().chordTrack?.[0].symbol).toBe('Gmaj7');
  expect(api.getScore().staves[0].measures[0].events[0].notes.map((n) => n.pitch)).toEqual([
    'G4',
    'B4',
    'D5',
    'F#5',
  ]);
  transpose('C', -7);
  expect(api.getScore()).toEqual(original);
});
