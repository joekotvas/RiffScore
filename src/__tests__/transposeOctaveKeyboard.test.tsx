/**
 * Keyboard octave transpose (Shift+Arrow) — #239 regression guard.
 *
 * The diatonic command moves by STEPS (an octave = 7 steps). Removing the old
 * |steps|==12 -> 7 coercion is only safe because useNavigation.transposeSelection
 * now sends +/-7 for Shift+Arrow (it used to send +/-12 and rely on the coercion).
 * This test drives the REAL transposeSelection through the context and asserts a
 * Shift+Arrow moves exactly one octave — if useNavigation regressed to +/-12,
 * the note would jump an octave + a 6th (C4 -> A5) and this would fail.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ScoreEditor from '@components/Layout/ScoreEditor';
import { ThemeProvider } from '@/context/ThemeContext';
import { createDefaultScore } from '@/types';

jest.mock('../components/Toolbar/Toolbar', () => (_props: unknown) => (
  <div data-testid="score-toolbar" />
));
jest.mock('../hooks/audio/usePlayback', () => ({
  usePlayback: () => ({
    isPlaying: false,
    playbackPosition: { measureIndex: null, eventIndex: null, duration: 0 },
    playScore: jest.fn(),
    stopPlayback: jest.fn(),
    handlePlayToggle: jest.fn(),
    lastPlayStart: 0,
    isActive: false,
    exitPlaybackMode: jest.fn(),
  }),
}));
jest.mock('../hooks/audio/useMIDI', () => ({
  useMIDI: () => ({ midiStatus: 'disconnected' }),
}));
jest.mock('../engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

const MockTrigger = () => {
  const ctx = require('../context/ScoreContext').useScoreContext();
  const { score } = ctx.state;
  const { select: handleNoteSelection, transpose: transposeSelection } = ctx.navigation;
  const pitch = score.staves[0].measures[0].events[0]?.notes[0]?.pitch ?? '';

  return (
    <div>
      <div data-testid="pitch">{pitch}</div>
      <button data-testid="select" onClick={() => handleNoteSelection(0, 'e1', 'n1', 0)} />
      <button data-testid="octave-up" onClick={() => transposeSelection('up', true)} />
      <button data-testid="octave-down" onClick={() => transposeSelection('down', true)} />
      <button data-testid="step-up" onClick={() => transposeSelection('up', false)} />
    </div>
  );
};

jest.mock('../components/Canvas/ScoreCanvas', () => {
  return () => <MockTrigger />;
});

const scoreWithC4 = () => {
  const s = createDefaultScore();
  s.staves[0].measures[0].events = [
    { id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
  ];
  return s;
};

describe('Keyboard octave transpose (#239)', () => {
  it('Shift+ArrowUp moves exactly one octave (C4 -> C5), not an octave + a 6th', () => {
    render(
      <ThemeProvider>
        <ScoreEditor initialData={scoreWithC4()} />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByTestId('select'));
    fireEvent.click(screen.getByTestId('octave-up'));
    expect(screen.getByTestId('pitch')).toHaveTextContent('C5');
  });

  it('Shift+ArrowDown moves exactly one octave (C4 -> C3)', () => {
    render(
      <ThemeProvider>
        <ScoreEditor initialData={scoreWithC4()} />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByTestId('select'));
    fireEvent.click(screen.getByTestId('octave-down'));
    expect(screen.getByTestId('pitch')).toHaveTextContent('C3');
  });

  it('ArrowUp (no shift) still moves a single diatonic step (C4 -> D4)', () => {
    render(
      <ThemeProvider>
        <ScoreEditor initialData={scoreWithC4()} />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByTestId('select'));
    fireEvent.click(screen.getByTestId('step-up'));
    expect(screen.getByTestId('pitch')).toHaveTextContent('D4');
  });
});
