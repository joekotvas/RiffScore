/**
 * Content-aware staff spacing (benchmark e2e/bench/staff-spacing): a grand staff whose treble
 * stems-down and bass stems-up wide groups both push beams into the inter-staff gap. The lower
 * staff must move down just enough that the beams keep STAFF_DISTANCE.MIN_CLEARANCE between
 * them — in scroll view (one distance for the whole score) and in page view (per system, so a
 * system without such content keeps CONFIG.staffSpacing).
 */

import { renderScore } from '../helpers/visual';
import { composedPoint } from '../helpers/svgGeometry';
import { createDefaultScore, Score, ScoreEvent } from '@/types';
import { CONFIG, DEFAULT_LAYOUT_CONFIG } from '@/config';
import { STAFF_DISTANCE } from '@/constants';
import { calculatePageLayout } from '@/services/PageLayoutService';
import { calculateScoreLayout } from '@/engines/layout/scoreLayout';
import { lyricBandHeight } from '@/engines/layout/vertical';

const ev = (id: string, duration: string, pitch: string): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: [{ id: `${id}-n`, pitch }],
});
const bar = (id: string, spec: Array<[string, string]>) => ({
  id,
  events: spec.map(([d, p], i) => ev(`${id}-e${i}`, d, p)),
});
const e = (p: string): [string, string] => ['eighth', p];
const s = (p: string): [string, string] => ['sixteenth', p];
const q = (p: string): [string, string] => ['quarter', p];
const h = (p: string): [string, string] => ['half', p];

/** The benchmark score: beams meet in the gap on every bar. */
const beamsInGap = (): Score => {
  const score = createDefaultScore();
  score.timeSignature = '4/4';
  score.keySignature = 'C';
  score.staves = [
    {
      id: 's0',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        bar('t0', [e('D5'), e('C6'), e('F5'), e('C4'), e('E5'), e('B5'), e('D4'), e('C4')]),
        bar('t1', [s('G5'), s('A5'), s('D4'), s('E4'), e('C4'), e('G5'), q('F5'), q('A4')]),
        bar('t2', [e('C6'), e('C4'), e('C6'), e('C4'), h('E5')]),
      ],
    },
    {
      id: 's1',
      clef: 'bass',
      keySignature: 'C',
      measures: [
        bar('b0', [e('G3'), e('C2'), e('C2'), e('G3'), e('A3'), e('D2'), e('E2'), e('B3')]),
        bar('b1', [s('B3'), s('C2'), s('D2'), s('A3'), e('G3'), e('C2'), q('B3'), q('D3')]),
        bar('b2', [e('C2'), e('B3'), e('C2'), e('B3'), h('G2')]),
      ],
    },
  ];
  return score;
};

/** A quiet grand staff: nothing leaves the staves. */
const quietBars = (count: number) => ({
  treble: Array.from({ length: count }, (_, m) => bar(`qt${m}`, [q('G4'), q('B4'), h('D5')])),
  bass: Array.from({ length: count }, (_, m) => bar(`qb${m}`, [q('D3'), q('F3'), h('A3')])),
});

/** Lowest treble beam edge and highest bass beam edge per measure, in the root SVG's units. */
const beamEdges = (canvas: Element, measureIndex: number, stopAt?: (el: Element) => boolean) => {
  const edges = (staff: number) => {
    const hit = canvas.querySelector(`[data-testid="measure-hit-area-${staff}-${measureIndex}"]`)!;
    const measure = hit.closest('.Measure')!;
    const ys: number[] = [];
    measure.querySelectorAll('.beam-group polygon').forEach((polygon) => {
      (polygon.getAttribute('points') ?? '')
        .trim()
        .split(/\s+/)
        .forEach((pair) => {
          const [x, y] = pair.split(',').map(Number);
          ys.push(composedPoint(polygon, { x, y }, stopAt).y);
        });
    });
    return ys;
  };
  const treble = edges(0);
  const bass = edges(1);
  return { trebleBottom: Math.max(...treble), bassTop: Math.min(...bass) };
};

describe('content-aware staff spacing', () => {
  test('scroll view: the bass staff moves down until the beams clear by the minimum, and no more', () => {
    const score = beamsInGap();
    const layout = calculateScoreLayout(score);
    expect(layout.staves[1].y - layout.staves[0].y).toBeGreaterThan(CONFIG.staffSpacing);

    const { canvas, unmount } = renderScore(score);
    try {
      const clearances = [0, 1, 2].map((m) => {
        const { trebleBottom, bassTop } = beamEdges(canvas, m);
        return bassTop - trebleBottom;
      });
      clearances.forEach((c) =>
        expect(c).toBeGreaterThanOrEqual(STAFF_DISTANCE.MIN_CLEARANCE - 1e-6)
      );
      // The worst bar decides the distance and sits exactly at the minimum.
      expect(Math.min(...clearances)).toBeCloseTo(STAFF_DISTANCE.MIN_CLEARANCE, 6);
    } finally {
      unmount();
    }
  });

  test('a quiet grand staff keeps the default distance', () => {
    const score = createDefaultScore();
    const { treble, bass } = quietBars(2);
    score.staves = [
      { id: 's0', clef: 'treble', keySignature: 'C', measures: treble },
      { id: 's1', clef: 'bass', keySignature: 'C', measures: bass },
    ];
    const layout = calculateScoreLayout(score);
    expect(layout.staves[1].y - layout.staves[0].y).toBe(CONFIG.staffSpacing);
    expect(layout.vertical.offsets).toEqual([0, CONFIG.staffSpacing]);
  });

  test('page view: only the system with the wide groups opens up; the beams clear there too', () => {
    // Two quiet bars, then the three benchmark bars, then two quiet bars — narrow page so the
    // systems break around them.
    const score = beamsInGap();
    const { treble, bass } = quietBars(2);
    score.staves[0].measures = [
      ...treble,
      ...score.staves[0].measures,
      ...quietBars(2).treble.map((b, i) => ({ ...b, id: `qt2${i}` })),
    ];
    score.staves[1].measures = [
      ...bass,
      ...score.staves[1].measures,
      ...quietBars(2).bass.map((b, i) => ({ ...b, id: `qb2${i}` })),
    ];
    score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page', staffSize: 100 };
    const pageLayout = calculatePageLayout(score, score.layout);
    const systems = pageLayout.pages.flatMap((p) => p.systems);
    expect(systems.length).toBeGreaterThan(1);
    const scale = pageLayout.staffScale;
    const wide = systems.filter((sys) => sys.measures.some((m) => m >= 2 && m <= 4));
    const quiet = systems.filter((sys) => sys.measures.every((m) => m < 2 || m > 4));
    expect(wide.length).toBeGreaterThan(0);
    expect(quiet.length).toBeGreaterThan(0);
    quiet.forEach((sys) => expect(sys.staffOffsets[1]).toBeCloseTo(CONFIG.staffSpacing * scale, 6));
    wide.forEach((sys) => expect(sys.staffOffsets[1]).toBeGreaterThan(CONFIG.staffSpacing * scale));
    // System heights follow: a wide system is taller than a quiet one.
    expect(Math.max(...wide.map((s2) => s2.height))).toBeGreaterThan(
      Math.max(...quiet.map((s2) => s2.height))
    );

    const { canvas, unmount } = renderScore(score);
    try {
      for (const m of [2, 3, 4]) {
        const { trebleBottom, bassTop } = beamEdges(canvas, m);
        // Composed positions carry sub-pixel rounding from the fixture geometry.
        expect(bassTop - trebleBottom).toBeGreaterThanOrEqual(
          STAFF_DISTANCE.MIN_CLEARANCE * scale - 0.05
        );
      }
    } finally {
      unmount();
    }
  });

  test('a lyric band reserves space below its staff in both views', () => {
    // Whole notes inside the staves: nothing protrudes, so only the bands can move the staves.
    const score = createDefaultScore();
    const whole = (id: string, pitch: string) => bar(id, [['whole', pitch]]);
    score.staves = [
      {
        id: 's0',
        clef: 'treble',
        keySignature: 'C',
        measures: [whole('w0', 'B4'), whole('w1', 'B4')],
        lyricLines: 4,
      },
      {
        id: 's1',
        clef: 'bass',
        keySignature: 'C',
        measures: [whole('v0', 'D3'), whole('v1', 'D3')],
        // Three lines (56 px) exceed the 40 px ledger zone a system reserves below its last staff;
        // one line (26 px) would fit inside it and change nothing on the page.
        lyricLines: 3,
      },
    ];
    const layout = calculateScoreLayout(score);
    // Bare staves: 48 + band(4) + 12 clearance = 131 > the default 120.
    const expected = 48 + lyricBandHeight(4) + STAFF_DISTANCE.MIN_CLEARANCE;
    expect(expected).toBeGreaterThan(CONFIG.staffSpacing);
    expect(layout.staves[1].y - layout.staves[0].y).toBe(expected);
    expect(layout.vertical.lyricBands).toEqual([lyricBandHeight(4), lyricBandHeight(3)]);
    expect(layout.vertical.bottom).toBe(expected + 48 + lyricBandHeight(3));

    score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page' };
    const pageLayout = calculatePageLayout(score, score.layout);
    const system = pageLayout.pages[0].systems[0];
    const scale = pageLayout.staffScale;
    expect(system.staffOffsets[1]).toBeCloseTo(expected * scale, 6);
    // The last staff's band grows the system's bottom headroom past the ledger zone.
    const noLyrics = calculatePageLayout(
      { ...score, staves: score.staves.map((st) => ({ ...st, lyricLines: 0 })) },
      score.layout
    );
    expect(system.paddingBottom).toBeGreaterThan(noLyrics.pages[0].systems[0].paddingBottom);
    expect(system.paddingBottom).toBeCloseTo(lyricBandHeight(3) * scale, 6);
  });
});
