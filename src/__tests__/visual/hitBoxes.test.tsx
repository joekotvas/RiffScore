/**
 * Hit-box contracts rendered through the real ScoreEditor pipeline.
 *
 * - Lasso: the note boxes ScoreCanvas hands to useDragToSelect are top-left corners. In scroll
 *   view they used to be notehead centres, so every box sat half a box right of and below its
 *   note: a lasso over the left half of a notehead missed it (or caught its neighbour), and one
 *   in the empty space right of the last notehead selected it.
 * - Chord track: its hit band is painted after the staves, so wherever it covered a note's hit
 *   area the click opened a chord input instead of selecting the note. The band must end above
 *   the highest note's hit area in both views, and in page view the band is pinned inside the
 *   system's reserved headroom, so it has to be clipped rather than moved.
 * - Page top: the first system on a later page starts at the content-area top plus its
 *   reserved headroom, which already keeps the chord band (and so the chord glyphs) inside the
 *   page; no separate page-top inset is needed.
 */

/* eslint-disable testing-library/no-node-access --
   these assertions are about SVG geometry (attributes, transforms, containment), which Testing
   Library's role/text queries cannot express. */

// The editor plays a note on selection; keep Tone.js out of jsdom.
jest.mock('@/engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

import { fireEvent } from '@testing-library/react';
import { renderScore } from '../helpers/visual';
import { composedPosition, composedRect } from '../helpers/svgGeometry';
import { createDefaultScore, Score, ScoreEvent } from '@/types';
import { DEFAULT_LAYOUT_CONFIG, THEMES } from '@/config';
import { LAYOUT } from '@/constants';
import { calculateScoreLayout } from '@/engines/layout/scoreLayout';
import { calculatePageLayout } from '@/services/PageLayoutService';

const PLAIN_BAR = ['C4', 'D4', 'E4', 'F4'];

// Chord text is 1.25rem (20px) with dominantBaseline="central": the glyph box extends half of
// that above the track baseline, in track (staff) units.
const CHORD_TEXT_HALF_HEIGHT = 10;

const q = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});

/** Note ids are `m<measure>-e<event>n`, so the hit area of measure 0's first note is `note-m0-e0n`. */
const buildScore = ({
  measureCount,
  viewMode,
  pitches = () => PLAIN_BAR,
  withChords = false,
  staffSize = DEFAULT_LAYOUT_CONFIG.staffSize,
}: {
  measureCount: number;
  viewMode: 'page' | 'scroll';
  pitches?: (measureIndex: number) => string[];
  withChords?: boolean;
  staffSize?: number;
}): Score => {
  const score = createDefaultScore();
  score.timeSignature = '4/4';
  score.keySignature = 'C';
  score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode, staffSize };
  score.staves = [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'C',
      measures: Array.from({ length: measureCount }, (_, m) => ({
        id: `m${m}`,
        events: pitches(m).map((pitch, e) => q(`m${m}-e${e}`, pitch)),
      })),
    },
  ];
  if (withChords) {
    score.chordTrack = Array.from({ length: measureCount }, (_, m) => ({
      id: `c${m}`,
      measure: m,
      quant: 0,
      symbol: 'C',
    }));
  }
  return score;
};

/** Hit-area test ids of the notes drawn with the selection colour. */
const selectedNoteIds = (canvas: Element): string[] =>
  Array.from(canvas.querySelectorAll('.note-group-container'))
    .filter((g) => g.querySelector('.NoteHead')?.getAttribute('fill') === THEMES.LIGHT.accent)
    .map((g) => g.querySelector('[data-note-hit-area]')?.getAttribute('data-testid') ?? '');

const chordInput = (container: HTMLElement): Element | null =>
  container.querySelector('input.riff-ChordInput, input[aria-label*="chord" i]');

/** Notehead centre in svg coordinates, from the note's hit-area rect (offset from the centre). */
const noteCentre = (canvas: Element, noteId: string): { x: number; y: number } => {
  const hit = canvas.querySelector(`[data-testid="note-${noteId}"]`);
  expect(hit).not.toBeNull();
  const { x, y } = composedPosition(hit!);
  return { x: x - LAYOUT.HIT_AREA.OFFSET_X, y: y - LAYOUT.HIT_AREA.OFFSET_Y };
};

// jsdom reports zero bounding rects, so at scale 1 client coordinates are svg coordinates.
const lasso = (from: Element, start: [number, number], end: [number, number]) => {
  fireEvent.mouseDown(from, { clientX: start[0], clientY: start[1] });
  fireEvent.mouseMove(document, { clientX: end[0], clientY: end[1] });
  fireEvent.mouseUp(document);
};

// jsdom has no Element.scrollTo; selecting notes triggers useAutoScroll.
const originalScrollTo = Element.prototype.scrollTo;
beforeAll(() => {
  Element.prototype.scrollTo = jest.fn();
});
afterAll(() => {
  Element.prototype.scrollTo = originalScrollTo;
});

describe('lasso note hit boxes (scroll view)', () => {
  const score = buildScore({ measureCount: 2, viewMode: 'scroll' });
  const layout = calculateScoreLayout(score);

  /** Width of a note's lasso box: its layout hit zone, centred on the notehead. */
  const lassoBoxWidth = (measureIndex: number, eventIndex: number): number => {
    const key = `0-${measureIndex}-m${measureIndex}-e${eventIndex}-m${measureIndex}-e${eventIndex}n`;
    const note = layout.notes[key];
    expect(note).toBeDefined();
    return note.hitZone.endX - note.hitZone.startX;
  };

  it('a lasso over the left half of a notehead selects that note and nothing else', () => {
    const { canvas, unmount } = renderScore(score);
    try {
      expect(selectedNoteIds(canvas)).toEqual([]);
      const { x, y } = noteCentre(canvas, 'm0-e3n');
      const background = canvas.querySelector('[data-testid="measure-hit-area-0-0"]')!;

      lasso(background, [x - 6, y - 8], [x - 1, y + 8]);

      expect(selectedNoteIds(canvas)).toEqual(['note-m0-e3n']);
    } finally {
      unmount();
    }
  });

  it('a lasso in the empty space right of the last notehead selects nothing', () => {
    const { canvas, unmount } = renderScore(score);
    try {
      const { x, y } = noteCentre(canvas, 'm1-e3n');
      const halfWidth = lassoBoxWidth(1, 3) / 2;
      expect(halfWidth).toBeGreaterThan(LAYOUT.HIT_AREA.WIDTH / 2);
      const background = canvas.querySelector('[data-testid="measure-hit-area-0-1"]')!;

      lasso(background, [x + halfWidth + 2, y - 8], [x + halfWidth + 12, y + 8]);

      expect(selectedNoteIds(canvas)).toEqual([]);
    } finally {
      unmount();
    }
  });
});

describe('chord-track hit band clears the highest note', () => {
  // A D6 sits 30px above the top line: inside the band at its default position, and only
  // paddingAboveNotes below the track when the track rises to avoid it.
  const highBar = (m: number) => (m === 0 ? ['D6', 'C4', 'D4', 'E4'] : PLAIN_BAR);

  it.each([['scroll'], ['page']] as const)(
    "band ends above the note's hit area and clicking the note selects it (%s view)",
    (viewMode) => {
      const score = buildScore({ measureCount: 2, viewMode, pitches: highBar, withChords: true });
      const { container, canvas, unmount } = renderScore(score);
      try {
        const hit = canvas.querySelector('[data-testid="note-m0-e0n"]')!;
        const band = canvas.querySelector('[data-testid="chord-track-hit-area"]')!;
        const chordText = canvas.querySelector('.riff-ChordSymbol')!;
        const bandBox = composedRect(band);
        const bandBottom = bandBox.y + bandBox.height;

        expect(bandBottom).toBeLessThan(composedRect(hit).y);
        // The band still reaches the chord text, so chords remain clickable.
        expect(bandBox.height).toBeGreaterThan(0);
        expect(composedPosition(chordText).y).toBeGreaterThanOrEqual(bandBox.y);
        expect(composedPosition(chordText).y).toBeLessThanOrEqual(bandBottom);

        fireEvent.mouseDown(hit);
        fireEvent.click(hit);
        fireEvent.mouseUp(document);

        expect(selectedNoteIds(canvas)).toEqual(['note-m0-e0n']);
        expect(chordInput(container)).toBeNull();
      } finally {
        unmount();
      }
    }
  );
});

describe('page-top chord track', () => {
  it('keeps chord glyphs and noteheads of the first system on page 2 inside the content area', () => {
    const score = buildScore({
      measureCount: 48,
      viewMode: 'page',
      withChords: true,
      staffSize: 100,
    });
    const plainLayout = calculatePageLayout(score, score.layout);
    expect(plainLayout.pages.length).toBeGreaterThanOrEqual(2);

    // Ledger notes on the first system of page 2 only (same durations, so the same breaks).
    const topSystem = plainLayout.pages[1].systems[0];
    for (const m of topSystem.measures) {
      score.staves[0].measures[m].events = ['A6', 'C4', 'G6', 'D4'].map((pitch, e) =>
        q(`m${m}-e${e}`, pitch)
      );
    }
    const pageLayout = calculatePageLayout(score, score.layout);
    expect(pageLayout.pages[1].systems[0].measures).toEqual(topSystem.measures);
    const staffScale = pageLayout.staffScale;
    const contentTop = pageLayout.contentArea.y;

    const { canvas, unmount } = renderScore(score);
    try {
      const page = canvas.querySelector('[data-testid="page-1"]')!;
      const track = page.querySelector('.riff-ChordTrack')!;
      const glyphs = Array.from(track.querySelectorAll('.riff-ChordSymbol'));
      expect(glyphs.length).toBe(topSystem.measures.length);
      for (const glyph of glyphs) {
        expect(
          composedPosition(glyph).y - CHORD_TEXT_HALF_HEIGHT * staffScale
        ).toBeGreaterThanOrEqual(contentTop);
      }

      const noteheadYs = Array.from(page.querySelectorAll('.NoteHead')).map(
        (head) => composedPosition(head).y
      );
      expect(noteheadYs.length).toBeGreaterThan(0);
      expect(Math.min(...noteheadYs)).toBeGreaterThanOrEqual(contentTop);
    } finally {
      unmount();
    }
  });
});
