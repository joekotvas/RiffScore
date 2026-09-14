/**
 * Content-aware staff spacing on a five-staff system: piano (treble + bass) over violin, viola
 * and cello. Only the pairs whose ink meets in the gap open up — piano RH/LH in bar 1 (beams
 * from both sides), viola/cello in bar 2 (low viola ledger notes over high cello ledger
 * notes) — and the pairs around the quiet violin keep the default distance. In page view each
 * system decides for itself.
 */

import { renderScore } from '../helpers/visual';
import { composedPoint, composedRect } from '../helpers/svgGeometry';
import { createDefaultScore, Score, ScoreEvent, Staff } from '@/types';
import { CONFIG, DEFAULT_LAYOUT_CONFIG } from '@/config';
import { STAFF_DISTANCE } from '@/constants';
import { calculatePageLayout } from '@/services/PageLayoutService';
import { calculateScoreLayout } from '@/engines/layout/scoreLayout';

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
const q = (p: string): [string, string] => ['quarter', p];
const h = (p: string): [string, string] => ['half', p];

const BARS = 8;
const quiet = (id: string, pitches: [string, string, string]) =>
  bar(id, [q(pitches[0]), q(pitches[1]), h(pitches[2])]);

const fiveStaves = (): Score => {
  const score = createDefaultScore();
  score.timeSignature = '4/4';
  score.keySignature = 'C';
  const staff = (id: string, clef: Staff['clef'], measures: Staff['measures']): Staff => ({
    id,
    clef,
    keySignature: 'C',
    measures,
  });
  const rh = Array.from({ length: BARS }, (_, m) =>
    m === 0
      ? bar('rh0', [e('D5'), e('C6'), e('F5'), e('C4'), e('E5'), e('B5'), e('D4'), e('C4')])
      : quiet(`rh${m}`, ['G4', 'B4', 'D5'])
  );
  const lh = Array.from({ length: BARS }, (_, m) =>
    m === 0
      ? bar('lh0', [e('G3'), e('C2'), e('C2'), e('G3'), e('A3'), e('D2'), e('E2'), e('B3')])
      : quiet(`lh${m}`, ['D3', 'F3', 'A3'])
  );
  const violin = Array.from({ length: BARS }, (_, m) => quiet(`vn${m}`, ['G4', 'B4', 'D5']));
  // Viola (alto clef, bottom line F3): bar 2 dives to C3/B2, two ledger lines below the staff.
  const viola = Array.from({ length: BARS }, (_, m) =>
    m === 1 ? bar('va1', [q('C3'), q('B2'), q('C3'), q('B2')]) : quiet(`va${m}`, ['C4', 'E4', 'G4'])
  );
  // Cello (bass clef, top line A3): bar 2 climbs to G4/A4, three and four ledger lines above.
  const cello = Array.from({ length: BARS }, (_, m) =>
    m === 1 ? bar('vc1', [q('G4'), q('A4'), q('G4'), q('A4')]) : quiet(`vc${m}`, ['D3', 'F3', 'A3'])
  );
  score.staves = [
    staff('piano-rh', 'treble', rh),
    staff('piano-lh', 'bass', lh),
    staff('violin', 'treble', violin),
    staff('viola', 'alto', viola),
    staff('cello', 'bass', cello),
  ];
  return score;
};

/** Ink extent (root SVG units) of one staff's measure: note hit rects, stems and beams. */
const inkExtent = (canvas: Element, staffIndex: number, measureIndex: number) => {
  const hit = canvas.querySelector(
    `[data-testid="measure-hit-area-${staffIndex}-${measureIndex}"]`
  )!;
  const measure = hit.closest('.Measure')!;
  let top = Infinity;
  let bottom = -Infinity;
  measure.querySelectorAll('[data-note-hit-area]').forEach((rect) => {
    const r = composedRect(rect);
    top = Math.min(top, r.y);
    bottom = Math.max(bottom, r.y + r.height);
  });
  measure.querySelectorAll('.chord-group line').forEach((line) => {
    if (line.getAttribute('x1') !== line.getAttribute('x2')) return;
    [1, 2].forEach((i) => {
      const y = composedPoint(line, {
        x: Number(line.getAttribute(`x${i}`)),
        y: Number(line.getAttribute(`y${i}`)),
      }).y;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    });
  });
  measure.querySelectorAll('.beam-group polygon').forEach((polygon) => {
    (polygon.getAttribute('points') ?? '')
      .trim()
      .split(/\s+/)
      .forEach((pair) => {
        const [x, y] = pair.split(',').map(Number);
        const py = composedPoint(polygon, { x, y }).y;
        top = Math.min(top, py);
        bottom = Math.max(bottom, py);
      });
  });
  return { top, bottom };
};

const PAIRS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
] as const;

describe('five-staff system: piano + violin, viola, cello', () => {
  test('scroll view: only the piano pair and the viola/cello pair open; the rest stay default', () => {
    const score = fiveStaves();
    const layout = calculateScoreLayout(score);
    const gaps = PAIRS.map(([a, b]) => layout.staves[b].y - layout.staves[a].y);
    expect(gaps[0]).toBeGreaterThan(CONFIG.staffSpacing); // piano RH / LH: beams meet
    expect(gaps[1]).toBe(CONFIG.staffSpacing); // piano LH / violin: quiet
    expect(gaps[2]).toBe(CONFIG.staffSpacing); // violin / viola: quiet
    expect(gaps[3]).toBeGreaterThan(CONFIG.staffSpacing); // viola / cello: ledger notes meet
    expect(layout.vertical.offsets).toHaveLength(5);

    const { canvas, unmount } = renderScore(score);
    try {
      // Bar 1 piano pair and bar 2 viola/cello pair clear by at least the minimum; the pair
      // that decides each gap sits exactly at it.
      const piano = inkExtent(canvas, 1, 0).top - inkExtent(canvas, 0, 0).bottom;
      const strings = inkExtent(canvas, 4, 1).top - inkExtent(canvas, 3, 1).bottom;
      expect(piano).toBeCloseTo(STAFF_DISTANCE.MIN_CLEARANCE, 1);
      expect(strings).toBeCloseTo(STAFF_DISTANCE.MIN_CLEARANCE, 1);
      // Every adjacent pair, every bar: never closer than the minimum.
      for (let m = 0; m < BARS; m++) {
        PAIRS.forEach(([a, b]) => {
          const gap = inkExtent(canvas, b, m).top - inkExtent(canvas, a, m).bottom;
          expect(gap).toBeGreaterThanOrEqual(STAFF_DISTANCE.MIN_CLEARANCE - 1e-6);
        });
      }
    } finally {
      unmount();
    }
  });

  test('page view: every system spaces its five staves by its own content', () => {
    const score = fiveStaves();
    score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page', staffSize: 100 };
    const pageLayout = calculatePageLayout(score, score.layout);
    const systems = pageLayout.pages.flatMap((p) => p.systems);
    expect(systems.length).toBeGreaterThan(1);
    const scale = pageLayout.staffScale;
    const base = CONFIG.staffSpacing * scale;

    systems.forEach((system) => {
      expect(system.staffOffsets).toHaveLength(5);
      const gaps = PAIRS.map(([a, b]) => system.staffOffsets[b] - system.staffOffsets[a]);
      const hasBar1 = system.measures.includes(0);
      const hasBar2 = system.measures.includes(1);
      if (hasBar1) expect(gaps[0]).toBeGreaterThan(base);
      else expect(gaps[0]).toBeCloseTo(base, 6);
      expect(gaps[1]).toBeCloseTo(base, 6);
      expect(gaps[2]).toBeCloseTo(base, 6);
      if (hasBar2) expect(gaps[3]).toBeGreaterThan(base);
      else expect(gaps[3]).toBeCloseTo(base, 6);
      // The system's height is the sum of its own gaps plus one staff.
      expect(system.height).toBeCloseTo(system.staffOffsets[4] + 48 * scale, 6);
    });
    // At least one system is quiet everywhere (default distance on all four pairs).
    const quietSystems = systems.filter((s) => !s.measures.includes(0) && !s.measures.includes(1));
    expect(quietSystems.length).toBeGreaterThan(0);

    const { canvas, unmount } = renderScore(score);
    try {
      for (let m = 0; m < BARS; m++) {
        PAIRS.forEach(([a, b]) => {
          const gap = inkExtent(canvas, b, m).top - inkExtent(canvas, a, m).bottom;
          expect(gap).toBeGreaterThanOrEqual(STAFF_DISTANCE.MIN_CLEARANCE * scale - 0.05);
        });
      }
    } finally {
      unmount();
    }
  });
});
