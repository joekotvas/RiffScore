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
 * - Lasso across staves: a rectangle around a beamed bass group (beam to lowest notehead) must
 *   select only that staff; the note boxes reach less than a staff space from the notehead.
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
import { composedPoint, composedPosition, composedRect } from '../helpers/svgGeometry';
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

/** Notehead centre in svg coordinates: the note's hit-area rect is centred on the glyph. */
const noteCentre = (canvas: Element, noteId: string): { x: number; y: number } => {
  const hit = canvas.querySelector(`[data-testid="note-${noteId}"]`);
  expect(hit).not.toBeNull();
  const { x, y, width, height } = composedRect(hit!);
  return { x: x + width / 2, y: y + height / 2 };
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

// ============================================================================
// LASSO ACROSS STAVES — a rectangle drawn around a beamed group on one staff must not select
// the other staff. Each note box is LASSO_NOTE_HIT_HEIGHT (20 px, under one staff space) tall
// around the notehead centre, so a rectangle whose top is at the bass beam, several spaces below
// the treble noteheads, cannot reach them.
//
// Measure the group from what is DRAWN: hit-area rects (centred on the glyph), stems and beam.
// In a real browser, boundingBox() of a chord group or of a `.NoteHead` <text> is the font's
// line box, not the ink: Bravura at 4 × staff space has a 4 em line box, so every notehead "box"
// spans ~16 staff spaces and the union of a bass group reaches up into the treble staff.
// ============================================================================

describe('lasso around a beamed bass group (grand staff)', () => {
  const event = (id: string, duration: string, pitch: string): ScoreEvent => ({
    id,
    duration,
    dotted: false,
    notes: [{ id: `${id}n`, pitch }],
  });

  /** Treble G4 q, B4 q, D5 h over eight bass eighths (two beamed groups), in G. */
  const grandStaffScore = (viewMode: 'page' | 'scroll'): Score => {
    const score = createDefaultScore();
    score.timeSignature = '4/4';
    score.keySignature = 'G';
    score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode };
    score.staves = [
      {
        id: 'staff-1',
        clef: 'treble',
        keySignature: 'G',
        measures: [
          {
            id: 'm0',
            events: [
              event('s0-m0-e0', 'quarter', 'G4'),
              event('s0-m0-e1', 'quarter', 'B4'),
              event('s0-m0-e2', 'half', 'D5'),
            ],
          },
        ],
      },
      {
        id: 'staff-2',
        clef: 'bass',
        keySignature: 'G',
        measures: [
          {
            id: 'm0-bass',
            events: ['G2', 'D3', 'G3', 'D3', 'G2', 'D3', 'G3', 'D3'].map((pitch, e) =>
              event(`s1-m0-e${e}`, 'eighth', pitch)
            ),
          },
        ],
      },
    ];
    return score;
  };

  interface Box {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }
  const union = (boxes: Box[]): Box => ({
    left: Math.min(...boxes.map((b) => b.left)),
    top: Math.min(...boxes.map((b) => b.top)),
    right: Math.max(...boxes.map((b) => b.right)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  });
  const pointBox = (p: { x: number; y: number }): Box => ({
    left: p.x,
    top: p.y,
    right: p.x,
    bottom: p.y,
  });

  /** Drawn extent of the first bass beam group: notehead hit areas, stems and beam. */
  const drawnBeamGroup = (canvas: Element): Box => {
    const boxes: Box[] = [];
    for (let e = 0; e < 4; e++) {
      const group = canvas.querySelector(`[data-testid="chord-s1-m0-e${e}"]`);
      expect(group).not.toBeNull();
      const hit = composedRect(group!.querySelector('[data-note-hit-area]')!);
      boxes.push({ left: hit.x, top: hit.y, right: hit.x + hit.width, bottom: hit.y + hit.height });
      for (const line of Array.from(group!.querySelectorAll('line'))) {
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(line.getAttribute(a)));
        if (x1 !== x2) continue; // ledger lines are horizontal; stems are vertical
        boxes.push(
          union([
            pointBox(composedPoint(line, { x: x1, y: y1 })),
            pointBox(composedPoint(line, { x: x2, y: y2 })),
          ])
        );
      }
    }
    const stemsAndHeads = union(boxes);
    // The beam is drawn by the measure, not the chord group: the polygon spanning these stems.
    const beams = Array.from(canvas.querySelectorAll('polygon'))
      .map((polygon) =>
        union(
          (polygon.getAttribute('points') ?? '')
            .trim()
            .split(/\s+/)
            .map((pair) => {
              const [x, y] = pair.split(',').map(Number);
              return pointBox(composedPoint(polygon, { x, y }));
            })
        )
      )
      .filter((b) => b.left >= stemsAndHeads.left - 2 && b.right <= stemsAndHeads.right + 2);
    expect(beams).toHaveLength(1);
    return union([stemsAndHeads, ...beams]);
  };

  const BASS_GROUP = ['note-s1-m0-e0n', 'note-s1-m0-e1n', 'note-s1-m0-e2n', 'note-s1-m0-e3n'];

  it.each([['scroll'], ['page']] as const)(
    'a rectangle from the beam to the lowest notehead selects only the bass notes (%s view)',
    (viewMode) => {
      const { canvas, unmount } = renderScore(grandStaffScore(viewMode));
      try {
        const box = drawnBeamGroup(canvas);
        const g4 = noteCentre(canvas, 's0-m0-e0n');
        const b4 = noteCentre(canvas, 's0-m0-e1n');
        // Fixture sanity: the treble G4 and B4 sit more than a staff space above the rectangle
        // and inside its x-range, so only the boxes' vertical reach decides their fate.
        expect(box.top - g4.y).toBeGreaterThan(g4.y - b4.y);
        expect(g4.x).toBeGreaterThan(box.left);
        expect(b4.x).toBeLessThan(box.right);

        const background = canvas.querySelector('[data-testid="measure-hit-area-1-0"]')!;
        lasso(background, [box.left, box.top], [box.right, box.bottom]);

        expect(selectedNoteIds(canvas)).toEqual(BASS_GROUP);
      } finally {
        unmount();
      }
    }
  );

  it.each([['scroll'], ['page']] as const)(
    'a note box reaches no further than one staff space below its notehead (%s view)',
    (viewMode) => {
      const { canvas, unmount } = renderScore(grandStaffScore(viewMode));
      try {
        const box = drawnBeamGroup(canvas);
        const g4 = noteCentre(canvas, 's0-m0-e0n');
        const staffSpace = g4.y - noteCentre(canvas, 's0-m0-e1n').y;
        const background = canvas.querySelector('[data-testid="measure-hit-area-1-0"]')!;
        // Top edge one staff space (plus a hair) below the lowest treble notehead in range.
        lasso(background, [box.left, g4.y + staffSpace + 1], [box.right, box.bottom]);

        expect(selectedNoteIds(canvas)).toEqual(BASS_GROUP);
      } finally {
        unmount();
      }
    }
  );
});
