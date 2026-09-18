/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Contract tests inspect SVG geometry and instance boundaries. */
import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import { RiffScoreSession } from '../context/RiffScoreSession';
import { MusicGlyphProvider, type MusicGlyphAdapter } from '../context/MusicGlyphContext';
import { MusicGlyph } from '../components/Assets/MusicGlyph';
import { NOTEHEADS } from '../constants/SMuFL';
import type { DeepPartial, RiffScoreConfig } from '../types';

jest.mock('../hooks/audio/useMIDI', () => ({ useMIDI: () => ({ midiStatus: {} }) }));
jest.mock('../engines/toneEngine', () => ({
  ...jest.requireActual('../engines/toneEngine'),
  playNote: jest.fn(),
}));
const seed: DeepPartial<RiffScoreConfig> = {
  score: { abc: 'X:1\nT:Windows\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c | d c B A |]' },
  ui: { showToolbar: false, showFooter: false, scale: 1 },
};

test('session windows retain source identities and share edits/history without sharing view configuration', () => {
  const { container } = render(
    <RiffScoreSession config={seed}>
      <RiffScore
        id="first"
        config={{ ui: { ...seed.ui, view: { measures: { start: 0, end: 1 } } } }}
      />
      <RiffScore
        id="second"
        config={{
          ui: { ...seed.ui, view: { measures: { start: 1, end: 2 }, clefs: { 0: 'bass' } } },
        }}
      />
      <RiffScore id="readonly" config={{ ...seed, interaction: { isEnabled: false } }} />
    </RiffScoreSession>
  );
  const first = window.riffScore.get('first')!;
  const second = window.riffScore.get('second')!;
  const before = first.getScore();
  expect(second.getScore()).toBe(before);
  const windowElement = container.querySelector('[data-riffscore-id="second"]')!;
  expect(windowElement.querySelectorAll('.NoteHead')).toHaveLength(4);
  expect(windowElement.querySelector('[data-testid="clef-bass"]')).not.toBeNull();
  expect(before.staves[0].clef).toBe('treble');
  act(() => second.select(1));
  expect(first.getSelection().measureIndex).toBe(1); // a read-only sibling must not clear it
  const canvas = windowElement.querySelector(
    '[data-testid="score-canvas-container"]'
  ) as HTMLElement;
  act(() => canvas.focus());
  fireEvent.keyDown(canvas, { key: 'ArrowUp' });
  expect(first.getScore().staves[0].measures[1].events[0].notes[0].pitch).toBe('A4');
  act(() => first.undo());
  expect(second.getScore().staves[0].measures[1].events[0].notes[0].pitch).toBe('G4');
  expect(second.getScore().staves[0].measures[1].id).toBe(before.staves[0].measures[1].id);
});

test('explicit bounds and stable overlay anchors survive edits; removed anchors resolve to null', () => {
  const anchorResults: Array<{ x: number; y: number } | null> = [];
  let noteId = '';
  const overlay = ({
    resolveAnchor,
  }: Parameters<NonNullable<React.ComponentProps<typeof RiffScore>['renderOverlay']>>[0]) => {
    const point = resolveAnchor({ noteId });
    anchorResults.push(point);
    return point ? <circle data-testid="anchored-content" cx={point.x} cy={point.y} r={5} /> : null;
  };
  const { container, rerender } = render(<RiffScore id="bounds" config={seed} />);
  const api = window.riffScore.get('bounds')!;
  noteId = api.getScore().staves[0].measures[0].events[0].notes[0].id;
  rerender(
    <RiffScore
      id="bounds"
      config={{
        ...seed,
        ui: { ...seed.ui, viewport: { bounds: { x: -30, y: -20, width: 500, height: 220 } } },
      }}
      renderOverlay={overlay}
    />
  );
  expect(container.querySelector('.riff-ScoreCanvas__svg')).toHaveAttribute(
    'viewBox',
    '-30 -20 500 220'
  );
  expect(screen.getByTestId('anchored-content')).toHaveAttribute('cy');
  const first = anchorResults.at(-1)!;
  act(() => {
    api.select(0).setPitch('D4');
  });
  expect(anchorResults.at(-1)!.y).not.toBe(first.y);
  act(() => {
    api.reset();
  });
  expect(anchorResults.at(-1)).toBeNull();
});

test('a replaced glyph adapter cannot win a stale load; unsupported glyph runs use Bravura', async () => {
  let finish!: (value: boolean) => void;
  const a: MusicGlyphAdapter = {
    id: 'slow',
    load: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    renderGlyph: () => <text>Slow glyph</text>,
  };
  const b: MusicGlyphAdapter = { id: 'ready', renderGlyph: () => <text>Ready glyph</text> };
  const content = (
    <svg>
      <MusicGlyph>{NOTEHEADS.black}</MusicGlyph>
      <MusicGlyph>unsupported</MusicGlyph>
    </svg>
  );
  const { rerender } = render(<MusicGlyphProvider adapter={a}>{content}</MusicGlyphProvider>);
  await waitFor(() => expect(finish).toBeDefined());
  rerender(<MusicGlyphProvider adapter={b}>{content}</MusicGlyphProvider>);
  expect(await screen.findByText('Ready glyph')).toBeInTheDocument();
  await act(async () => finish(true));
  expect(screen.queryByText('Slow glyph')).not.toBeInTheDocument();
  expect(screen.getByText('unsupported')).toHaveAttribute(
    'font-family',
    expect.stringContaining('Bravura')
  );
});

test('retained API handles read current nested config without resetting score or history', () => {
  const { rerender } = render(<RiffScore id="reactive-config" config={seed} />);
  const api = window.riffScore.get('reactive-config')!;
  act(() => api.select(0).setPitch('F4'));
  const edited = api.getScore();
  rerender(
    <RiffScore
      id="reactive-config"
      config={{
        ...seed,
        chord: { display: { visible: false, font: { size: 22 } }, playback: { enabled: false } },
        ui: { ...seed.ui, scale: Number.NaN },
      }}
    />
  );
  expect(api.getChordDisplay()).toMatchObject({ visible: false, font: { size: 22 } });
  expect(api.getChordPlayback().enabled).toBe(false);
  expect(Number.isFinite(api.getConfig().ui.scale)).toBe(true);
  expect(api.getScore()).toBe(edited);
  act(() => api.undo());
  expect(api.getScore().staves[0].measures[0].events[0].notes[0].pitch).toBe('C4');
});

test('failed glyph loading falls back without exposing unsupported glyphs to the adapter', async () => {
  const renderGlyph = jest.fn(() => <text>Alternate</text>);
  const load = jest.fn(async () => {
    throw new Error('font unavailable');
  });
  render(
    <React.StrictMode>
      <MusicGlyphProvider adapter={{ id: 'failed', load, renderGlyph }}>
        <svg>
          <MusicGlyph>{NOTEHEADS.black}</MusicGlyph>
        </svg>
      </MusicGlyphProvider>
    </React.StrictMode>
  );
  await waitFor(() => expect(load).toHaveBeenCalled());
  expect(screen.getByText(NOTEHEADS.black)).toHaveAttribute(
    'font-family',
    expect.stringContaining('Bravura')
  );
  expect(renderGlyph).not.toHaveBeenCalled();
});

test('page overlays resolve a note on exactly one page in page coordinates', () => {
  let noteId = '';
  const results: Array<{
    page: number | null;
    point: { x: number; y: number } | null;
    width: number;
  }> = [];
  const { rerender } = render(<RiffScore id="page-anchor" config={seed} />);
  const api = window.riffScore.get('page-anchor')!;
  noteId = api.getScore().staves[0].measures[1].events[0].notes[0].id;
  act(() => api.setViewMode('page'));
  rerender(
    <RiffScore
      id="page-anchor"
      config={seed}
      renderOverlay={({ pageIndex, bounds, resolveAnchor }) => {
        results.push({ page: pageIndex, point: resolveAnchor({ noteId }), width: bounds.width });
        return null;
      }}
    />
  );
  const resolved = results.filter((value) => value.point);
  expect(resolved).toHaveLength(1);
  expect(resolved[0].page).toBe(0);
  expect(resolved[0].point!.x).toBeGreaterThan(0);
  expect(resolved[0].point!.x).toBeLessThan(resolved[0].width);
});

test('viewport policy receives frozen geometry, controls SVG scale, and explicit bounds take precedence', () => {
  const ref = React.createRef<import('../api.types').MusicEditorAPI>();
  const policy = jest.fn(
    (geometry: import('../components/Canvas/ScoreGeometry').ScoreViewGeometry) => {
      expect(Object.isFrozen(geometry.staves[0])).toBe(true);
      expect(geometry.staves[0].right).toBeGreaterThan(geometry.staves[0].left);
      return { bounds: { x: -20, y: 10, width: 400, height: 160 }, scale: 0.5 };
    }
  );
  const { container, rerender, unmount } = render(
    <React.StrictMode>
      <RiffScore apiRef={ref} config={seed} resolveViewport={policy} />
    </React.StrictMode>
  );
  const api = ref.current!;
  expect(api).toBeDefined();
  expect(container.querySelector('.riff-ScoreCanvas__svg')).toHaveAttribute(
    'viewBox',
    '-10 5 200 80'
  );
  expect(container.querySelector('.riff-ScoreCanvas__svg')).toHaveAttribute('width', '200');
  act(() => api.select(0).setPitch('D4'));
  const edited = api.getScore();
  rerender(
    <React.StrictMode>
      <RiffScore
        apiRef={ref}
        config={{ ...seed, ui: { ...seed.ui, viewport: { bounds: { width: 300, height: 100 } } } }}
        resolveViewport={policy}
      />
    </React.StrictMode>
  );
  expect(ref.current).toBe(api);
  expect(api.getScore()).toBe(edited);
  expect(container.querySelector('.riff-ScoreCanvas__svg')).toHaveAttribute(
    'viewBox',
    '0 0 150 50'
  );
  expect(edited.staves[0].measures[0].events[0].notes[0].pitch).toBe('D4');
  unmount();
  expect(ref.current).toBeNull();
});

test('invalid viewport results fall back and page view never invokes the scroll policy', () => {
  const ref = React.createRef<import('../api.types').MusicEditorAPI>();
  const policy = jest.fn(() => ({ bounds: { x: 0, y: 0, width: NaN, height: -1 }, scale: 0 }));
  const { container } = render(<RiffScore apiRef={ref} config={seed} resolveViewport={policy} />);
  expect(container.querySelector('.riff-ScoreCanvas__svg')?.outerHTML).not.toMatch(/NaN|Infinity/);
  expect(policy).toHaveBeenCalled();
  policy.mockClear();
  act(() => ref.current!.setViewMode('page'));
  expect(policy).not.toHaveBeenCalled();
});

test('hiding notation retains the same API, score, history and reactive controls', () => {
  const ref = React.createRef<import('../api.types').MusicEditorAPI>();
  let controls!: import('../components/Layout/ScoreControls').ScoreControls;
  const capture = (value: typeof controls) => {
    controls = value;
    return null;
  };
  const { container, rerender } = render(
    <RiffScore apiRef={ref} config={seed} renderControls={capture} />
  );
  const api = ref.current!;
  act(() => api.select(0).setPitch('D4'));
  rerender(
    <RiffScore
      apiRef={ref}
      config={{ ...seed, ui: { ...seed.ui, showScore: false } }}
      renderControls={capture}
    />
  );
  expect(ref.current).toBe(api);
  expect(container.querySelector('.riff-ScoreCanvas__svg')).toBeNull();
  expect(controls.canUndo).toBe(true);
  act(() => controls.undo());
  expect(api.getScore().staves[0].measures[0].events[0].notes[0].pitch).toBe('C4');
});
