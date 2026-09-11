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
