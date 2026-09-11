/**
 * Page-view interaction contracts rendered through the real ScoreEditor pipeline.
 *
 * - mousedown on the staff must keep bubbling to document listeners (host click-outside
 *   handlers); the lasso is started by the page/scroll svg handlers, not by a Measure-level
 *   handler that stops propagation.
 * - a lasso started inside a measure hit area draws its rectangle inside that page's svg.
 * - clicking empty page background focuses the editor like the scroll view does.
 * - every wrapped system's chord track sits in the headroom PageLayoutService reserves for
 *   it: never over the previous system's staff, never over its own.
 */

/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   these assertions are about SVG geometry (classes, transforms, containment), which Testing
   Library's role/text queries cannot express. */

import { fireEvent } from '@testing-library/react';
import { renderScore } from '../helpers/visual';
import { createDefaultScore, Score, ScoreEvent } from '@/types';
import { CONFIG, DEFAULT_LAYOUT_CONFIG } from '@/config';
import { calculatePageLayout } from '@/services/PageLayoutService';

const q = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});

const buildScore = (
  measureCount: number,
  viewMode: 'page' | 'scroll',
  withChords = false
): Score => {
  const score = createDefaultScore();
  score.timeSignature = '4/4';
  score.keySignature = 'C';
  score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode };
  score.staves = [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'C',
      measures: Array.from({ length: measureCount }, (_, m) => ({
        id: `m${m}`,
        events: ['C4', 'D4', 'E4', 'F4'].map((pitch, e) => q(`m${m}-e${e}`, pitch)),
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

const translateY = (el: Element): number => {
  const transform = el.getAttribute('transform') ?? '';
  const match = transform.match(/translate\(\s*-?[\d.]+,\s*(-?[\d.]+)/);
  if (!match) throw new Error(`Unable to parse transform: ${transform}`);
  return Number(match[1]);
};

describe('page view interaction', () => {
  // jsdom has no Element.scrollTo; selecting notes triggers useAutoScroll.
  const originalScrollTo = Element.prototype.scrollTo;
  beforeAll(() => {
    Element.prototype.scrollTo = jest.fn();
  });
  afterAll(() => {
    Element.prototype.scrollTo = originalScrollTo;
  });

  it.each([['page'], ['scroll']] as const)(
    'mousedown on a measure hit area still bubbles to document listeners (%s view)',
    (viewMode) => {
      const spy = jest.fn();
      document.addEventListener('mousedown', spy);
      const { canvas, unmount } = renderScore(buildScore(8, viewMode));
      try {
        const rect = canvas.querySelector('[data-testid="measure-hit-area-0-1"]');
        expect(rect).not.toBeNull();
        fireEvent.mouseDown(rect!, { clientX: 10, clientY: 10 });
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        document.removeEventListener('mousedown', spy);
        unmount();
      }
    }
  );

  it('lasso started inside a measure hit area draws its rectangle inside that page only', () => {
    const { canvas, unmount } = renderScore(buildScore(48, 'page'));
    try {
      const pages = canvas.querySelectorAll('.riff-page-wrapper');
      expect(pages.length).toBeGreaterThanOrEqual(2);
      const page1 = canvas.querySelector('[data-testid="page-1"]')!;
      const rect = page1.querySelector('[data-testid^="measure-hit-area-0-"]')!;

      fireEvent.mouseDown(rect, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(document, { clientX: 220, clientY: 180 });

      const lasso = canvas.querySelectorAll('[data-testid="lasso-selection-rect"]');
      expect(lasso).toHaveLength(1);
      expect(page1.contains(lasso[0])).toBe(true);

      fireEvent.mouseUp(document);
      expect(canvas.querySelectorAll('[data-testid="lasso-selection-rect"]')).toHaveLength(0);
    } finally {
      unmount();
    }
  });

  it('clicking empty page background focuses the editor', () => {
    const { container, canvas, unmount } = renderScore(buildScore(8, 'page'));
    try {
      const pageSvg = canvas.querySelector('svg.riff-page-svg')!;
      fireEvent.click(pageSvg);
      expect(document.activeElement).not.toBe(document.body);
      expect(container.contains(document.activeElement)).toBe(true);
    } finally {
      unmount();
    }
  });

  it("keeps every wrapped system's chord track clear of the previous system's staff", () => {
    const score = buildScore(16, 'page', true);
    const pageLayout = calculatePageLayout(score, score.layout);
    const { canvas, unmount } = renderScore(score);
    try {
      const { hitBandHalfHeight } = CONFIG.chordTrack;
      expect(pageLayout.pages.flatMap((page) => page.systems).length).toBeGreaterThan(2);

      pageLayout.pages.forEach((page) => {
        const pageEl = canvas.querySelector(`[data-testid="page-${page.index}"]`)!;
        const tracks = Array.from(pageEl.querySelectorAll('.riff-ChordTrack'));
        expect(tracks).toHaveLength(page.systems.length);

        page.systems.forEach((system, i) => {
          const trackY = translateY(tracks[i]);
          // Band bottom stays above this system's staff...
          expect(trackY + hitBandHalfHeight).toBeLessThanOrEqual(system.y + 1e-6);
          // ...and band top stays below whatever sits above: the previous staff block, or the
          // metadata / content top for the first system on the page.
          const above =
            i > 0
              ? page.systems[i - 1].y + page.systems[i - 1].height
              : page.index === 0
                ? pageLayout.metadata.bottom
                : pageLayout.contentArea.y;
          expect(trackY - hitBandHalfHeight).toBeGreaterThanOrEqual(above - 1e-6);
        });
      });
    } finally {
      unmount();
    }
  });
});

// ============================================================================
// POINTER MAPPING — client offsets must be divided by ui scale × viewport zoom
// (× staffScale in page view), or hover/entry land on the wrong pitch and the lasso drifts.
// ============================================================================

import { CONFIG as EDITOR_CONFIG } from '@/config';
import { MEASURE_HIT_AREA_TOP_OFFSET } from '@/constants';
import { calculateMeasureLayout } from '@/engines/layout';
import { getOffsetForPitch } from '@/engines/layout/positioning';
import { composedPosition } from '../helpers/svgGeometry';

describe('pointer mapping', () => {
  const EVENTS = ['C4', 'D4'].map((pitch, e) => q(`m0-e${e}`, pitch));

  /** Two half-empty bars: one unjustified system, so hit zones are at their natural X. */
  const halfEmptyScore = (viewMode: 'page' | 'scroll', staffSize = 100): Score => {
    const score = buildScore(2, viewMode);
    score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode, staffSize };
    score.staves[0].measures = [0, 1].map((m) => ({
      id: `m${m}`,
      events: EVENTS.map((e) => ({
        ...e,
        id: `m${m}-${e.id.slice(3)}`,
        notes: [{ ...e.notes[0], id: `m${m}-${e.id.slice(3)}n` }],
      })),
    }));
    return score;
  };

  const appendZoneMidX = (): number => {
    const zone = calculateMeasureLayout(
      EVENTS,
      undefined,
      'treble',
      false,
      undefined,
      1.0,
      'C'
    ).hitZones.find((z) => z.type === 'APPEND')!;
    return (zone.startX + zone.endX) / 2;
  };

  const E4_STAFF_Y = EDITOR_CONFIG.baseY + getOffsetForPitch('E4', 'treble');

  /**
   * Hover measure 0 at the point that means "E4, append position" in staff coordinates,
   * expressed in client pixels through `divisor`. jsdom's bounding rects sit at (0, 0), so
   * client = staff × divisor. Returns the ghost notehead's staff-local Y, or null if no ghost.
   */
  const hoverAtE4 = (canvas: Element, divisor: number): number | null => {
    const rect = canvas.querySelector('[data-testid="measure-hit-area-0-0"]')!;
    const yInRect = MEASURE_HIT_AREA_TOP_OFFSET + getOffsetForPitch('E4', 'treble');
    fireEvent.mouseMove(rect, { clientX: appendZoneMidX() * divisor, clientY: yInRect * divisor });
    const head = canvas.querySelector('[data-testid="ghost-preview"] .NoteHead');
    if (!head) return null;
    return composedPosition(head, (a) => a.classList.contains('Measure')).y;
  };

  const setZoom = (container: HTMLElement, percent: number) => {
    const input = container.querySelector('.riff-EditorFooter__zoom-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: String(percent) } });
    fireEvent.blur(input);
  };

  it('page-view fixture system is not justified (hit zones at natural X)', () => {
    const score = halfEmptyScore('page', 80);
    const layout = calculatePageLayout(score, score.layout);
    expect(layout.pages[0].systems[0].justification).not.toBe(1.0);
  });

  it('divides by staffScale in page view (80% staff)', () => {
    const { canvas, unmount } = renderScore(halfEmptyScore('page', 80));
    try {
      expect(hoverAtE4(canvas, 0.8)).toBeCloseTo(E4_STAFF_Y, 5);
    } finally {
      unmount();
    }
  });

  it.each([
    ['scroll', 100, 1.5],
    ['page', 80, 1.5 * 0.8],
  ] as const)(
    'divides by the viewport zoom (%s view, staff %i%%, zoom 150%%)',
    (viewMode, staffSize, divisor) => {
      const { container, canvas, unmount } = renderScore(halfEmptyScore(viewMode, staffSize));
      try {
        setZoom(container, 150);
        expect(hoverAtE4(canvas, divisor)).toBeCloseTo(E4_STAFF_Y, 5);
        // Control: the pre-fix divisor (no zoom) no longer lands on E4.
        expect(hoverAtE4(canvas, divisor / 1.5)).not.toBeCloseTo(E4_STAFF_Y, 5);
      } finally {
        unmount();
      }
    }
  );

  it('lasso rectangle coordinates are divided by the viewport zoom', () => {
    const { container, canvas, unmount } = renderScore(halfEmptyScore('scroll'));
    try {
      setZoom(container, 150);
      const rect = canvas.querySelector('[data-testid="measure-hit-area-0-1"]')!;
      fireEvent.mouseDown(rect, { clientX: 150, clientY: 300 });
      fireEvent.mouseMove(document, { clientX: 300, clientY: 450 });
      const lasso = canvas.querySelector('[data-testid="lasso-selection-rect"]')!;
      expect(lasso).not.toBeNull();
      expect(Number(lasso.getAttribute('x'))).toBeCloseTo(100, 5);
      expect(Number(lasso.getAttribute('y'))).toBeCloseTo(200, 5);
      expect(Number(lasso.getAttribute('width'))).toBeCloseTo(100, 5);
      expect(Number(lasso.getAttribute('height'))).toBeCloseTo(100, 5);
      fireEvent.mouseUp(document);
    } finally {
      unmount();
    }
  });
});
