/**
 * Page view as the print surface.
 *
 * - The page is white paper: notation, chords and metadata use the light palette in page
 *   view regardless of the UI theme (dark/cool/warm themes used to draw near-white notation
 *   on the white page, on screen and in the PDF).
 * - PageContainer exposes the physical page size for print.css, ScoreCanvas tags the pages
 *   container with the page format for the @page rule PrintService injects.
 * - 'beforeprint' enters print mode and clears selection/hover state synchronously so the
 *   sheet does not carry accent-coloured notes or a ghost note; 'afterprint' restores.
 */

/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   assertions are about rendered SVG attributes and inline CSS variables. */

// The editor plays a note on selection; keep Tone.js out of jsdom.
jest.mock('@/engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@/context/ThemeContext';
import ScoreEditor from '@components/Layout/ScoreEditor';
import { THEMES, DEFAULT_LAYOUT_CONFIG } from '@/config';
import { createDefaultScore, Score, ScoreEvent } from '@/types';
import { isPrinting } from '@/services/PrintService';

const q = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});

const buildScore = (viewMode: 'page' | 'scroll'): Score => {
  const score = createDefaultScore();
  score.timeSignature = '4/4';
  score.keySignature = 'C';
  score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode };
  score.staves = [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'C',
      measures: Array.from({ length: 4 }, (_, m) => ({
        id: `m${m}`,
        events: ['C4', 'D4', 'E4', 'F4'].map((pitch, e) => q(`m${m}-e${e}`, pitch)),
      })),
    },
  ];
  score.chordTrack = [{ id: 'c0', measure: 0, quant: 0, symbol: 'C' }];
  return score;
};

const renderWithTheme = (score: Score, theme: keyof typeof THEMES) =>
  render(
    <ThemeProvider initialTheme={theme}>
      <ScoreEditor initialData={score} scale={1} />
    </ThemeProvider>
  );

const noteheadFills = (root: HTMLElement): string[] =>
  Array.from(root.querySelectorAll('.NoteHead')).map((el) => el.getAttribute('fill') ?? '');

describe('page view paper palette', () => {
  it('draws notation with the light palette in page view even under the DARK theme', () => {
    const { container, unmount } = renderWithTheme(buildScore('page'), 'DARK');
    try {
      const fills = noteheadFills(container.querySelector('.riff-page-svg') as HTMLElement);
      expect(fills.length).toBeGreaterThan(0);
      expect(new Set(fills)).toEqual(new Set([THEMES.LIGHT.score.note]));

      const pages = container.querySelector('.riff-pages') as HTMLElement;
      expect(pages.style.getPropertyValue('--riff-color-text')).toBe(THEMES.LIGHT.text);
      expect(pages.getAttribute('data-page-size')).toBe('letter');

      const wrapper = container.querySelector('.riff-page-wrapper') as HTMLElement;
      expect(parseFloat(wrapper.style.getPropertyValue('--riff-page-width'))).toBeCloseTo(816, 0);
      expect(parseFloat(wrapper.style.getPropertyValue('--riff-page-height'))).toBeCloseTo(1056, 0);
    } finally {
      unmount();
    }
  });

  it('keeps the UI theme palette in scroll view', () => {
    const { container, unmount } = renderWithTheme(buildScore('scroll'), 'DARK');
    try {
      const fills = noteheadFills(container);
      expect(fills.length).toBeGreaterThan(0);
      expect(new Set(fills)).toEqual(new Set([THEMES.DARK.score.note]));
    } finally {
      unmount();
    }
  });
});

describe('printing', () => {
  // jsdom has no Element.scrollTo; selecting a note triggers useAutoScroll.
  const originalScrollTo = Element.prototype.scrollTo;
  beforeAll(() => {
    Element.prototype.scrollTo = jest.fn();
  });
  afterAll(() => {
    Element.prototype.scrollTo = originalScrollTo;
  });

  afterEach(() => {
    document.body.className = '';
    document.getElementById('riff-print-page-size')?.remove();
  });

  it('beforeprint enters print mode and clears the selection; afterprint restores', () => {
    const { container, unmount } = renderWithTheme(buildScore('page'), 'LIGHT');
    try {
      const hit = container.querySelector('[data-note-hit-area]')!;
      fireEvent.mouseDown(hit);
      fireEvent.click(hit);
      expect(noteheadFills(container)).toContain(THEMES.LIGHT.accent);

      act(() => {
        window.dispatchEvent(new Event('beforeprint'));
      });
      expect(isPrinting()).toBe(true);
      expect(document.getElementById('riff-print-page-size')?.textContent).toContain(
        'size: letter'
      );
      expect(noteheadFills(container)).not.toContain(THEMES.LIGHT.accent);

      act(() => {
        window.dispatchEvent(new Event('afterprint'));
      });
      expect(isPrinting()).toBe(false);
      expect(document.getElementById('riff-print-page-size')).toBeNull();
    } finally {
      unmount();
    }
  });
});
