/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Compare actual SVG number and beam geometry. */
import React from 'react';
import { act, render } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import { TUPLET } from '../constants';
import type { DeepPartial, RiffScoreConfig } from '../types';

jest.mock('../hooks/audio/useMIDI', () => ({
  useMIDI: () => ({ midiStatus: { connected: false, error: null } }),
}));

const config = (notes: string, hideBracketWhenBeamed?: boolean): DeepPartial<RiffScoreConfig> => ({
  ui: {
    showToolbar: false,
    showFooter: false,
    engraving: { tuplets: { hideBracketWhenBeamed } },
  },
  score: { abc: `X:1\nM:4/4\nL:1/8\nK:C\n${notes}|]` },
});

beforeEach(() => {
  Element.prototype.scrollTo = jest.fn();
});

describe('tuplet display configuration', () => {
  it.each([
    ['up', '(3CEG', 'scroll'],
    ['down', "(3a f d'", 'scroll'],
    ['up', '(3CEG', 'page'],
    ['down', "(3a f d'", 'page'],
  ])('centers the number on the %s-stem beam for %s in %s', (direction, notes, mode) => {
    const { container } = render(<RiffScore id="tuplet-display" config={config(notes, true)} />);
    if (mode === 'page') {
      act(() => window.riffScore.get('tuplet-display')!.setViewMode('page'));
    }
    const group = container.querySelector('.tuplet-bracket')!;
    expect(group).not.toBeNull();
    expect(group.querySelector('path')).toBeNull();
    const label = group.querySelector('text')!;
    expect(label).toHaveTextContent('3');
    const points = container
      .querySelector('.beam-group polygon')!
      .getAttribute('points')!
      .trim()
      .split(/\s+/)
      .map((point) => point.split(',').map(Number));
    const beamX = (points[0][0] + points[1][0]) / 2;
    const beamY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    expect(Number(label.getAttribute('x'))).toBeCloseTo(beamX, 6);
    if (direction === 'up') expect(Number(label.getAttribute('y'))).toBeLessThan(beamY);
    else expect(Number(label.getAttribute('y'))).toBeGreaterThan(beamY);
    const expectedOffset =
      direction === 'up'
        ? -TUPLET.NUMBER_BEAM_PADDING + TUPLET.NUMBER_OFFSET_UP
        : TUPLET.NUMBER_BEAM_PADDING + TUPLET.NUMBER_OFFSET_DOWN;
    expect(Number(label.getAttribute('y')) - beamY).toBeCloseTo(expectedOffset, 6);
    const heads = Array.from(container.querySelectorAll('.NoteHead'));
    const headCenter =
      (Number(heads[0].getAttribute('x')) + Number(heads[2].getAttribute('x'))) / 2;
    expect(Math.abs(beamX - headCenter)).toBeGreaterThan(1);
  });

  it.each(['scroll', 'engraving', 'page'])(
    'clears internal accidentals in %s rendering',
    (mode) => {
      const settings = config('(3B/8 ^B/8 =B/8', true);
      if (mode === 'engraving')
        settings.ui = {
          ...settings.ui,
          engraving: { ...settings.ui?.engraving, showPreamble: false },
        };
      const { container } = render(<RiffScore id="accidental-tuplet" config={settings} />);
      if (mode === 'page')
        act(() => window.riffScore.get('accidental-tuplet')!.setViewMode('page'));
      const heads = Array.from(container.querySelectorAll('.NoteHead')).map((head) =>
        Number(head.getAttribute('x'))
      );
      expect(heads).toHaveLength(3);
      expect(heads[1] - heads[0]).toBeGreaterThanOrEqual(36);
      expect(heads[2] - heads[1]).toBeGreaterThanOrEqual(36);
      expect(container.querySelector('.tuplet-bracket path')).toBeNull();
    }
  );

  it('preserves the default and updates the flag without changing score data', () => {
    const { container, rerender } = render(
      <RiffScore id="tuplet-toggle" config={config('(3BAG')} />
    );
    const before = window.riffScore.get('tuplet-toggle')!.export('json');
    expect(container.querySelector('.tuplet-bracket path')).not.toBeNull();
    rerender(<RiffScore id="tuplet-toggle" config={config('(3BAG', true)} />);
    expect(container.querySelector('.tuplet-bracket path')).toBeNull();
    expect(window.riffScore.get('tuplet-toggle')!.export('json')).toBe(before);
    rerender(<RiffScore id="tuplet-toggle" config={config('(3BAG', false)} />);
    expect(container.querySelector('.tuplet-bracket path')).not.toBeNull();
  });

  it.each(['(3C2E2G2', '(3CzG'])(
    'retains the bracket for unbeamed or rest-containing %s',
    (notes) => {
      const { container } = render(<RiffScore config={config(notes, true)} />);
      expect(container.querySelector('.tuplet-bracket path')).not.toBeNull();
    }
  );

  it('keeps the setting isolated between score instances', () => {
    const { container } = render(
      <>
        <RiffScore id="number-only" config={config('(3BAG', true)} />
        <RiffScore id="bracketed" config={config('(3BAG')} />
      </>
    );
    expect(
      container.querySelector('[data-riffscore-id="number-only"] .tuplet-bracket path')
    ).toBeNull();
    expect(
      container.querySelector('[data-riffscore-id="bracketed"] .tuplet-bracket path')
    ).not.toBeNull();
  });
});
