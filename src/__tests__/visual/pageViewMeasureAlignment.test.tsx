/**
 * Page-view measure alignment: what PageLayoutService positions must be what Staff draws.
 *
 * PageLayoutService used to size measures from a per-staff natural layout (treble clef, key
 * C) while Staff renders the cross-staff synchronized, key-aware widths, so in any sharp/flat
 * key or with differing rhythms the rendered measure starts drifted from
 * `system.measurePositions` (the anchor for hit boxes, cursor and chord X) and justified
 * systems missed the right margin. Both now come from calculateSynchronizedMeasureWidths.
 */

import { renderScore } from '../helpers/visual';
import { composedPosition } from '../helpers/svgGeometry';
import { createDefaultScore, Score, ScoreEvent } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';
import { calculatePageLayout } from '@/services/PageLayoutService';

const ev = (id: string, pitch: string, duration: ScoreEvent['duration']): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: [{ id: `${id}-n`, pitch }],
});

const MEASURES = 24;

/** D major grand staff, treble quarters over bass eighths, 70% staff size. */
const buildScore = (): Score => {
  const score = createDefaultScore();
  score.timeSignature = '4/4';
  score.keySignature = 'D';
  score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page', staffSize: 70 };
  score.staves = [
    {
      id: 's0',
      clef: 'treble',
      keySignature: 'D',
      measures: Array.from({ length: MEASURES }, (_, m) => ({
        id: `s0-m${m}`,
        events: ['F#4', 'A4', 'C#5', 'D5'].map((p, e) => ev(`s0-m${m}-e${e}`, p, 'quarter')),
      })),
    },
    {
      id: 's1',
      clef: 'bass',
      keySignature: 'D',
      measures: Array.from({ length: MEASURES }, (_, m) => ({
        id: `s1-m${m}`,
        events: ['D3', 'E3', 'F#3', 'G3', 'A3', 'B3', 'C#4', 'D4'].map((p, e) =>
          ev(`s1-m${m}-e${e}`, p, 'eighth')
        ),
      })),
    },
  ];
  return score;
};

describe('page-view measure alignment', () => {
  it('rendered measure origins and widths equal measurePositions on every system, both staves', () => {
    const score = buildScore();
    const pageLayout = calculatePageLayout(score, score.layout);
    const { canvas, unmount } = renderScore(score);
    try {
      let checked = 0;
      pageLayout.pages.forEach((page) => {
        const pageEl = canvas.querySelector(`[data-testid="page-${page.index}"]`)!;
        page.systems.forEach((system) => {
          system.measurePositions.forEach((pos) => {
            for (const staffIndex of [0, 1]) {
              const hitRect = pageEl.querySelector(
                `[data-testid="measure-hit-area-${staffIndex}-${pos.measureIndex}"]`
              )!;
              // The hit rect spans the measure (x = 0 .. width) inside <g class="Measure">
              const origin = composedPosition(hitRect.parentElement!);
              const drawnWidth = Number(hitRect.getAttribute('width')) * pageLayout.staffScale;
              expect(origin.x).toBeCloseTo(pos.x, 1);
              expect(drawnWidth).toBeCloseTo(pos.width, 1);
              checked++;
            }
          });
        });
      });
      expect(checked).toBe(MEASURES * 2);
    } finally {
      unmount();
    }
  });

  it('justified systems end exactly at the right margin', () => {
    const score = buildScore();
    const pageLayout = calculatePageLayout(score, score.layout);
    const justified = pageLayout.pages
      .flatMap((page) => page.systems)
      .filter((system) => system.justification === 1.0);
    expect(justified.length).toBeGreaterThan(1);
    for (const system of justified) {
      const last = system.measurePositions[system.measurePositions.length - 1];
      expect(last.x + last.width).toBeCloseTo(system.xOffset + system.contentWidth, 3);
      expect(system.xOffset + system.contentWidth).toBeCloseTo(
        pageLayout.contentArea.x + pageLayout.contentArea.width,
        3
      );
    }
  });
});
