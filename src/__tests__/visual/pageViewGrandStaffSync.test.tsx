/**
 * Grand-staff synchronisation in page view.
 *
 * Every non-last page-view system is justified, which re-lays out each measure with a stretch
 * factor. That re-layout must receive the SSOT's QUANT-keyed synchronized positions
 * (MeasureLayoutV2.syncedEventPositions); the id-keyed legacyLayout.eventPositions is silently
 * ignored by the engine, which used to leave treble and bass columns drawn ~85px apart whenever
 * their rhythms differed. Regression test for the M4 acceptance case.
 */

import { renderScore } from '../helpers/visual';
import { composedPosition } from '../helpers/svgGeometry';
import { createDefaultScore, Score, ScoreEvent } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';
import { calculateAllMeasureWidths, calculatePageLayout } from '@/services/PageLayoutService';

const ev = (id: string, pitch: string, duration: ScoreEvent['duration']): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: [{ id: `${id}-n`, pitch }],
});

const MEASURES = 12;
const TREBLE = ['G4', 'A4', 'B4', 'C5'];
const BASS = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'];

/** Treble quarters over bass eighths: the plainest texture with differing rhythms. */
const buildScore = (viewMode: 'page' | 'scroll'): Score => {
  const score = createDefaultScore();
  score.timeSignature = '4/4';
  score.keySignature = 'C';
  score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode, staffSize: 90 };
  score.staves = [
    {
      id: 's0',
      clef: 'treble',
      keySignature: 'C',
      measures: Array.from({ length: MEASURES }, (_, m) => ({
        id: `s0-m${m}`,
        events: TREBLE.map((p, e) => ev(`s0-m${m}-e${e}`, p, 'quarter')),
      })),
    },
    {
      id: 's1',
      clef: 'bass',
      keySignature: 'C',
      measures: Array.from({ length: MEASURES }, (_, m) => ({
        id: `s1-m${m}`,
        events: BASS.map((p, e) => ev(`s1-m${m}-e${e}`, p, 'eighth')),
      })),
    },
  ];
  return score;
};

/** Drawn X of every note hit area keyed by "staff-measure-event". */
const drawnNoteXs = (canvas: Element): Map<string, number> => {
  const xs = new Map<string, number>();
  canvas.querySelectorAll('[data-note-hit-area]').forEach((el) => {
    const match = (el.getAttribute('data-testid') ?? '').match(/^note-s(\d+)-m(\d+)-e(\d+)-n$/);
    if (match) xs.set(`${match[1]}-${match[2]}-${match[3]}`, composedPosition(el).x);
  });
  return xs;
};

describe('grand-staff synchronisation', () => {
  it('the page-view fixture really has justified (stretched) systems', () => {
    const score = buildScore('page');
    const layout = calculatePageLayout(score, score.layout);
    const naturalWidths = calculateAllMeasureWidths(score, layout.staffScale);
    const stretched = layout.pages
      .flatMap((page) => page.systems)
      .filter(
        (system) =>
          system.justification === 1.0 &&
          system.measurePositions[0].width > naturalWidths[system.measures[0]] + 1
      );
    expect(stretched.length).toBeGreaterThan(0);
  });

  it.each([['page'], ['scroll']] as const)(
    'draws treble and bass notes that sound on the same beat at the same X (%s view)',
    (viewMode) => {
      const { canvas, unmount } = renderScore(buildScore(viewMode));
      try {
        const xs = drawnNoteXs(canvas);
        let compared = 0;
        let maxDrift = 0;
        for (let m = 0; m < MEASURES; m++) {
          for (let beat = 0; beat < 4; beat++) {
            const treble = xs.get(`0-${m}-${beat}`);
            const bass = xs.get(`1-${m}-${beat * 2}`); // eighth 2k sounds with quarter k
            expect(treble).toBeDefined();
            expect(bass).toBeDefined();
            maxDrift = Math.max(maxDrift, Math.abs(treble! - bass!));
            compared++;
          }
        }
        expect(compared).toBe(MEASURES * 4);
        expect(maxDrift).toBeLessThan(0.01);
      } finally {
        unmount();
      }
    }
  );
});
