/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Verify rendered SVG ink through pointer and selection transitions. */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { DeepPartial, RiffScoreConfig } from '../types';
import { THEMES } from '../themes';

jest.mock('../engines/toneEngine', () => ({
  ...jest.requireActual('../engines/toneEngine'),
  playNote: jest.fn(),
}));
jest.mock('../hooks/audio/useMIDI', () => ({
  useMIDI: () => ({ midiStatus: { connected: false, error: null } }),
}));

const config: DeepPartial<RiffScoreConfig> = {
  score: { abc: 'X:1\nM:4/4\nL:1/8\nK:C\nC D E2 F2 G2 |]' },
  ui: { showToolbar: false, showFooter: false, engraving: { showPreamble: false } },
};

beforeEach(() => {
  Element.prototype.scrollTo = jest.fn();
});
afterEach(() => jest.restoreAllMocks());

it.each([
  ['Sage', '#657956', '#294b27'],
  ['Terracotta', '#9b6047', '#6b2b15'],
  ['Slate blue', '#536f83', '#193e63'],
  ['Mulberry', '#80627d', '#542553'],
])(
  '%s notes visibly hover and retain their highlight after clicking and leaving',
  (_, note, highlight) => {
    const { container } = render(
      <RiffScore
        id="highlight"
        config={{
          ...config,
          ui: { ...config.ui, themeOverrides: { accent: note, score: { note, highlight } } },
        }}
      />
    );
    const group = container.querySelector('.note-group-container')!;
    const head = group.querySelector('.NoteHead')!;
    const hit = group.querySelector('[data-testid^="note-"]')!;
    expect(head).toHaveAttribute('fill', note);
    fireEvent.mouseEnter(group);
    expect(head).toHaveAttribute('fill', highlight);
    fireEvent.mouseLeave(group);
    expect(head).toHaveAttribute('fill', note);
    fireEvent.mouseEnter(group);
    fireEvent.mouseDown(hit, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseUp(document);
    fireEvent.mouseLeave(group);
    expect(head).toHaveAttribute('fill', highlight);
    expect(container.querySelectorAll('.NoteHead')[1]).toHaveAttribute('fill', note);
    act(() => {
      window.riffScore.get('highlight')!.deselectAll();
    });
    expect(head).toHaveAttribute('fill', note);
  }
);

it('scopes highlight overrides, updates selected ink live, and falls back to the accent', () => {
  const custom = (highlight?: string): DeepPartial<RiffScoreConfig> => ({
    ...config,
    ui: { ...config.ui, themeOverrides: { accent: '#123456', score: { highlight } } },
  });
  const { container, rerender } = render(
    <>
      <RiffScore id="custom" config={custom('#294b27')} />
      <RiffScore id="default" config={config} />
    </>
  );
  act(() => {
    window.riffScore.get('custom')!.selectAll();
    window.riffScore.get('default')!.selectAll();
  });
  const customScore = container.querySelector('[data-riffscore-id="custom"]')!;
  const normalScore = container.querySelector('[data-riffscore-id="default"]')!;
  expect(customScore.querySelector('.NoteHead')).toHaveAttribute('fill', '#294b27');
  expect(normalScore.querySelector('.NoteHead')).toHaveAttribute('fill', THEMES.LIGHT.accent);
  expect(customScore).toHaveStyle('--riff-color-score-highlight: #294b27');
  rerender(
    <>
      <RiffScore id="custom" config={custom()} />
      <RiffScore id="default" config={config} />
    </>
  );
  expect(customScore.querySelector('.NoteHead')).toHaveAttribute('fill', '#123456');
  expect(customScore).toHaveStyle('--riff-color-score-highlight: #123456');
  expect(normalScore.querySelector('.NoteHead')).toHaveAttribute('fill', THEMES.LIGHT.accent);
});
