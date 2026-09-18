/* eslint-disable testing-library/no-container, testing-library/no-node-access -- These integration checks inspect SVG viewBoxes, scoped CSS variables, and canvas chrome across two simultaneous editors. */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { DeepPartial, RiffScoreConfig } from '../types';
import { THEMES } from '../themes';
import { calculateScoreLayout } from '../engines/layout/scoreLayout';

jest.mock('../engines/toneEngine', () => ({
  ...jest.requireActual('../engines/toneEngine'),
  playNote: jest.fn(),
}));

jest.mock('../hooks/audio/useMIDI', () => ({
  useMIDI: () => ({ midiStatus: { connected: false, error: null } }),
}));

const config: DeepPartial<RiffScoreConfig> = {
  ui: {
    showToolbar: false,
    showFooter: false,
    showScoreTitle: false,
    showBackground: false,
    engraving: { showPreamble: false, showBarlines: false, stemDirection: 'up' },
    themeOverrides: { text: '#657956', score: { note: '#657956', line: '#dde2d7' } },
  },
  score: { abc: 'X:1\nT:Snippet title\nM:4/4\nL:1/4\nK:C\n"Cmaj7"C E G B |]' },
};

beforeEach(() => {
  Element.prototype.scrollTo = jest.fn();
});

afterEach(() => jest.restoreAllMocks());

describe('RiffScore presentation configuration', () => {
  it('renders real, editable notation without chrome or a preamble, and keeps themes isolated', () => {
    const originalGlobal =
      document.documentElement.style.getPropertyValue('--riff-color-score-note');
    const { container } = render(
      <>
        <RiffScore id="snippet" config={config} />
        <RiffScore id="normal" />
      </>
    );
    const snippet = container.querySelector('[data-riffscore-id="snippet"]')!;
    const normal = container.querySelector('[data-riffscore-id="normal"]')!;
    expect(snippet.querySelector('.riff-Toolbar')).toBeNull();
    expect(snippet.querySelector('.riff-EditorFooter')).toBeNull();
    expect(snippet.querySelector('.riff-metadata__title')).toBeNull();
    expect(snippet.querySelector('.ScoreHeader')).toBeNull();
    expect(normal.querySelector('.riff-ScoreCanvas__svg')).not.toHaveAttribute('viewBox');
    expect(normal.querySelector('.riff-EditorFooter')).not.toBeNull();
    expect(snippet).toHaveStyle('--riff-color-score-note: #657956');
    expect(normal).toHaveStyle(`--riff-color-score-note: ${THEMES.LIGHT.score.note}`);
    expect(document.documentElement.style.getPropertyValue('--riff-color-score-note')).toBe(
      originalGlobal
    );
    expect(THEMES.LIGHT.score.note).toBe('#000000');
    expect(snippet.querySelector('.riff-ScoreEditor__viewport')).toHaveStyle(
      'background-color: rgba(0, 0, 0, 0)'
    );
    expect(snippet.querySelector('.riff-ScoreCanvas')).toHaveStyle(
      'background-color: rgba(0, 0, 0, 0)'
    );

    const api = window.riffScore.get('snippet')!;
    act(() => {
      api.select(0);
    });
    const canvas = snippet.querySelector('[data-testid="score-canvas-container"]') as HTMLElement;
    act(() => canvas.focus());
    fireEvent.keyDown(canvas, { key: 'ArrowUp' });
    expect(api.getScore().staves[0].measures[0].events[0].notes[0].pitch).toBe('D4');
    act(() => {
      api.undo();
    });
    expect(api.getScore().staves[0].measures[0].events[0].notes[0].pitch).toBe('C4');
    expect(window.riffScore.get('normal')!.getScore().staves[0].measures[0].events).toHaveLength(0);
  });

  it('changes chord notation and colors in place without resetting edited music', () => {
    const { rerender, container } = render(<RiffScore id="snippet" config={config} />);
    const api = window.riffScore.get('snippet')!;
    act(() => {
      api.select(0).setPitch('D4');
    });
    rerender(
      <RiffScore
        id="snippet"
        config={{
          ...config,
          ui: { ...config.ui, themeOverrides: { score: { note: '#cda47c' } } },
          chord: { display: { notation: 'roman', useSymbols: false } },
        }}
      />
    );
    expect(container.querySelector('.riff-ChordSymbol')).toHaveTextContent('Imaj7');
    expect(container.querySelector('.RiffScore')).toHaveStyle('--riff-color-score-note: #cda47c');
    expect(api.getScore().staves[0].measures[0].events[0].notes[0].pitch).toBe('D4');
  });

  it('keeps custom undo/redo controls synchronized with edits from the public API', () => {
    render(
      <RiffScore
        id="controls"
        config={config}
        renderControls={(controls) => (
          <>
            <button disabled={!controls.canUndo} onClick={controls.undo}>
              Custom undo
            </button>
            <button disabled={!controls.canRedo} onClick={controls.redo}>
              Custom redo
            </button>
          </>
        )}
      />
    );
    const api = window.riffScore.get('controls')!;
    expect(screen.getByRole('button', { name: 'Custom undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Custom redo' })).toBeDisabled();
    act(() => {
      api.selectAll().transposeDiatonic(1).deselectAll();
    });
    expect(screen.getByRole('button', { name: 'Custom undo' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Custom undo' }));
    expect(api.getScore().staves[0].measures[0].events[0].notes[0].pitch).toBe('C4');
    expect(screen.getByRole('button', { name: 'Custom undo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Custom redo' }));
    expect(api.getScore().staves[0].measures[0].events[0].notes[0].pitch).toBe('D4');
    expect(screen.getByRole('button', { name: 'Custom redo' })).toBeDisabled();
  });

  it('can hide live entry ghosts without disabling click-to-compose or undo', () => {
    const seed: DeepPartial<RiffScoreConfig> = {
      score: { staff: 'treble', measureCount: 1 },
      ui: { ...config.ui, scale: 1 },
    };
    const { rerender } = render(<RiffScore id="ghosts" config={seed} />);
    const hitArea = screen.getByTestId('measure-hit-area-0-0');
    fireEvent.mouseMove(hitArea, { clientX: 50, clientY: 100 });
    expect(screen.getByTestId('ghost-preview')).toBeInTheDocument();
    rerender(
      <RiffScore id="ghosts" config={{ ...seed, ui: { ...seed.ui, showGhostNotes: false } }} />
    );
    expect(screen.queryByTestId('ghost-preview')).toBeNull();
    expect(screen.queryByTestId('ghost-blocked')).toBeNull();
    fireEvent.click(hitArea);
    const api = window.riffScore.get('ghosts')!;
    expect(api.getScore().staves[0].measures[0].events).toHaveLength(1);
    act(() => {
      api.undo();
    });
    expect(api.getScore().staves[0].measures[0].events).toHaveLength(0);
    rerender(<RiffScore id="ghosts" config={seed} />);
    fireEvent.mouseMove(hitArea, { clientX: 50, clientY: 100 });
    expect(screen.getByTestId('ghost-preview')).toBeInTheDocument();
  });

  it('appends past eight beats without splitting an unmetered snippet, with undo and redo', () => {
    render(
      <RiffScore
        id="unmetered"
        config={{ ...config, score: { abc: 'X:1\nM:none\nL:1/4\nK:C\nC |]' } }}
      />
    );
    const api = window.riffScore.get('unmetered')!;
    act(() => {
      api.deselectAll();
      for (let i = 0; i < 12; i++) api.addNote('D4', 'quarter');
    });
    expect(api.getScore().staves[0].measures).toHaveLength(1);
    expect(api.getScore().staves[0].measures[0].events).toHaveLength(13);
    act(() => {
      api.undo();
    });
    expect(api.getScore().staves[0].measures[0].events).toHaveLength(12);
    act(() => {
      api.redo();
    });
    expect(api.getScore().staves[0].measures[0].events).toHaveLength(13);
  });

  it('hides only blocked ghosts while preserving valid chord-entry previews and rejection', () => {
    const seed: DeepPartial<RiffScoreConfig> = {
      score: { abc: 'X:1\nM:4/4\nL:1/4\nK:C\nC D E F |]' },
      ui: { scale: 1, showToolbar: false, showScoreTitle: false },
    };
    const { rerender } = render(<RiffScore id="blocked" config={seed} />);
    const api = window.riffScore.get('blocked')!;
    const layout = calculateScoreLayout(api.getScore()).staves[0].measures[0];
    const gap = layout.legacyLayout!.hitZones.find(
      (zone) => zone.type === 'INSERT' && zone.index === 1
    )!;
    const hitArea = screen.getByTestId('measure-hit-area-0-0');
    fireEvent.mouseMove(hitArea, { clientX: (gap.startX + gap.endX) / 2, clientY: 100 });
    expect(screen.getByTestId('ghost-blocked')).toBeInTheDocument();
    rerender(
      <RiffScore
        id="blocked"
        config={{ ...seed, ui: { ...seed.ui, showBlockedGhostNotes: false } }}
      />
    );
    expect(screen.queryByTestId('ghost-blocked')).toBeNull();
    fireEvent.click(hitArea);
    expect(api.getScore().staves[0].measures[0].events).toHaveLength(4);
    const event = layout.legacyLayout!.hitZones.find((zone) => zone.type === 'EVENT')!;
    fireEvent.mouseMove(hitArea, { clientX: (event.startX + event.endX) / 2, clientY: 100 });
    expect(screen.getByTestId('ghost-preview')).toBeInTheDocument();
    fireEvent.click(hitArea);
    expect(api.getScore().staves[0].measures[0].events[0].notes).toHaveLength(2);
  });

  it('configures the viewport and title without internal stylesheet overrides', () => {
    const { container } = render(
      <RiffScore
        config={{
          ...config,
          ui: {
            ...config.ui,
            showScoreTitle: true,
            scoreTitleOffset: { x: 4, y: -22 },
            viewport: {
              height: 155,
              minHeight: 100,
              maxHeight: 200,
              verticalAlign: 'center',
              overflow: 'visible',
            },
          },
        }}
      />
    );
    expect(container.querySelector('.riff-ScoreEditor__viewport')).toHaveStyle({
      height: '155px',
      minHeight: '100px',
      maxHeight: '200px',
      overflow: 'visible',
    });
    expect(container.querySelector('.riff-ScoreEditor__content')).toHaveStyle({
      justifyContent: 'center',
    });
    expect(container.querySelector('.riff-ScoreCanvas')).toHaveStyle({ overflow: 'visible' });
    expect(container.querySelector('.riff-ScoreCanvas__svg')).toHaveStyle({ overflow: 'visible' });
    expect(container.querySelector('.riff-metadata__title')).toHaveAttribute('x', '4');
    const titleY = Number(container.querySelector('.riff-metadata__title')!.getAttribute('y'));
    const top = Number(
      container.querySelector('.riff-ScoreCanvas__svg')!.getAttribute('viewBox')!.split(' ')[1]
    );
    expect(titleY).toBeLessThan(18);
    expect(top).toBeLessThan(titleY * (config.ui?.scale ?? 1));
  });
});

it('pads scroll notation without changing its layout and retains low-note clearance', () => {
  const plain: DeepPartial<RiffScoreConfig> = {
    score: { abc: 'X:1\nT:Spacing\nM:4/4\nL:1/4\nK:C\nC E G B |]' },
    ui: { showToolbar: false, scale: 0.85 },
  };
  const { container, rerender } = render(<RiffScore id="scroll-spacing" config={plain} />);
  const svg = () => container.querySelector('.riff-ScoreCanvas__svg')!;
  const initialTitleY = Number(container.querySelector('.riff-metadata__title')!.getAttribute('y'));
  const staff = container.querySelector('g.staff')!.innerHTML;
  rerender(
    <RiffScore
      id="scroll-spacing"
      config={{
        ...plain,
        ui: {
          ...plain.ui,
          scrollPadding: { top: 24, bottom: 18 },
          scoreTitleOffset: { y: -34 },
        },
      }}
    />
  );
  const bounds = svg().getAttribute('viewBox')!.split(' ').map(Number);
  expect(bounds[1]).toBeLessThanOrEqual(-24 * 0.85);
  expect(bounds[3]).toBe(Number(svg().getAttribute('height')));
  expect(container.querySelector('g.staff')!.innerHTML).toBe(staff);
  expect(Number(container.querySelector('.riff-metadata__title')!.getAttribute('y'))).toBe(
    initialTitleY - 34
  );
  const api = window.riffScore.get('scroll-spacing')!;
  act(() => {
    api.select(0, 0, 0, 0).setPitch('C2');
  });
  expect(Number(svg().getAttribute('height'))).toBeGreaterThan(bounds[3]);
  rerender(
    <RiffScore
      id="scroll-spacing"
      config={{
        ...plain,
        ui: {
          ...plain.ui,
          scrollPadding: { top: -10, bottom: Number.NaN },
        },
      }}
    />
  );
  expect(svg()).not.toHaveAttribute('viewBox');
});

it('keeps the native scroll surface available in read-only mode without allowing note entry', () => {
  const { container } = render(
    <RiffScore id="readonly-scroll" config={{ ...config, interaction: { isEnabled: false } }} />
  );
  const api = window.riffScore.get('readonly-scroll')!;
  const original = api.getScore();
  const canvas = container.querySelector('.riff-ScoreCanvas')!;
  expect(canvas).toHaveClass('riff-ScoreCanvas--readonly');
  expect(canvas).toHaveAttribute('tabindex', '0');
  const svg = container.querySelector('svg.riff-ScoreCanvas__svg')!;
  fireEvent.mouseDown(svg, { clientX: 100, clientY: 100 });
  fireEvent.mouseMove(svg, { clientX: 120, clientY: 80 });
  fireEvent.click(svg, { clientX: 120, clientY: 80 });
  expect(api.getScore()).toBe(original);
});

it('hides the chord-symbol input region while preserving note stacking and chord data', () => {
  const seed: DeepPartial<RiffScoreConfig> = {
    score: { abc: 'X:1\nM:4/4\nL:1/4\nK:C\n"Cmaj7"C D E F |]' },
    ui: { scale: 1, showToolbar: false, showScoreTitle: false },
  };
  const { rerender, container } = render(<RiffScore id="symbols-hidden" config={seed} />);
  const api = window.riffScore.get('symbols-hidden')!;
  const originalChords = api.getScore().chordTrack;
  expect(screen.getByTestId('chord-track')).toBeInTheDocument();
  rerender(
    <RiffScore id="symbols-hidden" config={{ ...seed, chord: { display: { visible: false } } }} />
  );
  expect(screen.queryByTestId('chord-track')).toBeNull();
  expect(api.getScore().chordTrack).toEqual(originalChords);

  const layout = calculateScoreLayout(api.getScore()).staves[0].measures[0];
  const event = layout.legacyLayout!.hitZones.find((zone) => zone.type === 'EVENT')!;
  const hitArea = screen.getByTestId('measure-hit-area-0-0');
  fireEvent.mouseMove(hitArea, { clientX: (event.startX + event.endX) / 2, clientY: 100 });
  expect(screen.getByTestId('ghost-preview')).toBeInTheDocument();
  fireEvent.click(hitArea);
  expect(api.getScore().staves[0].measures[0].events[0].notes).toHaveLength(2);

  const canvas = container.querySelector('.riff-ScoreCanvas') as HTMLElement;
  act(() => canvas.focus());
  // Vertical navigation still works within the note stack, but cannot select hidden symbols.
  fireEvent.keyDown(canvas, { key: 'ArrowDown', ctrlKey: true });
  expect(api.getSelection().noteId).not.toBeNull();
  fireEvent.keyDown(canvas, { key: 'ArrowUp', ctrlKey: true });
  fireEvent.keyDown(canvas, { key: 'ArrowUp', ctrlKey: true });
  expect(api.getSelection().chordTrackFocused).toBeFalsy();
  expect(screen.queryByTestId('chord-track')).toBeNull();
});
