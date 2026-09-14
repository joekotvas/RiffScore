/**
 * Page-view beam alignment: in a justified (stretched) system, beams and stems must come
 * from the same layout.
 *
 * `Measure` took `beamGroups` from the unstretched SSOT layout while stems were drawn at the
 * stretched fallback positions, so on a justified system every beam started and ended a few
 * pixels away from its outer stems — most visible on half-bar groups of four.
 */

import { renderScore } from '../helpers/visual';
import { composedPoint } from '../helpers/svgGeometry';
import { createDefaultScore, Score, ScoreEvent } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';
import { BEAMING } from '@/constants';
import { calculatePageLayout } from '@/services/PageLayoutService';

const ev = (id: string, pitch: string, duration: ScoreEvent['duration']): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: [{ id: `${id}-n`, pitch }],
});

/** D major grand staff, treble quarters over bass eighths (two beamed fours per bar), 70%. */
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
      measures: Array.from({ length: 24 }, (_, m) => ({
        id: `s0-m${m}`,
        events: ['F#4', 'A4', 'C#5', 'D5'].map((p, e) => ev(`s0-m${m}-e${e}`, p, 'quarter')),
      })),
    },
    {
      id: 's1',
      clef: 'bass',
      keySignature: 'D',
      measures: Array.from({ length: 24 }, (_, m) => ({
        id: `s1-m${m}`,
        events: ['D3', 'E3', 'F#3', 'G3', 'A3', 'B3', 'C#4', 'D4'].map((p, e) =>
          ev(`s1-m${m}-e${e}`, p, 'eighth')
        ),
      })),
    },
  ];
  return score;
};

const parsePoints = (polygon: Element): Array<{ x: number; y: number }> =>
  (polygon.getAttribute('points') ?? '')
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
    .map(([x, y]) => ({ x, y }));

describe('page-view beam alignment', () => {
  it('every beam starts and ends on its outer stems in justified systems', () => {
    const score = buildScore();
    const { staffScale, pages } = calculatePageLayout(score, score.layout);
    expect(pages.length).toBeGreaterThan(1);
    const { canvas, unmount } = renderScore(score);
    try {
      // The beam overhangs each outer stem by BEAMING.EXTENSION_PX (staff units).
      const tolerance = BEAMING.EXTENSION_PX * staffScale + 0.05;
      let beamsChecked = 0;

      canvas.querySelectorAll('.Measure').forEach((measure) => {
        const stemXs = Array.from(measure.querySelectorAll('.chord-group line')).map(
          (line) =>
            composedPoint(line, {
              x: Number(line.getAttribute('x1')),
              y: Number(line.getAttribute('y1')),
            }).x
        );
        measure.querySelectorAll('.beam-group').forEach((group) => {
          // The first polygon of a group is the primary beam spanning the whole group.
          const primary = group.querySelector('polygon')!;
          const [topLeft, topRight] = parsePoints(primary);
          const left = composedPoint(primary, topLeft).x;
          const right = composedPoint(primary, topRight).x;
          const nearestToLeft = Math.min(...stemXs.map((x) => Math.abs(x - left)));
          const nearestToRight = Math.min(...stemXs.map((x) => Math.abs(x - right)));
          expect(nearestToLeft).toBeLessThanOrEqual(tolerance);
          expect(nearestToRight).toBeLessThanOrEqual(tolerance);
          beamsChecked++;
        });
      });
      // 24 bars × two half-bar groups, all pages rendered.
      expect(beamsChecked).toBe(48);
    } finally {
      unmount();
    }
  });
});
