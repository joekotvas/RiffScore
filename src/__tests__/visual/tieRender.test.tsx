/**
 * Tie rendering (#242 Lane E): a tie renders ONLY when it resolves to a same-pitch successor.
 * The old "hanging stub" (a short curve drawn when no target was found) is gone — a tied flag
 * whose target was deleted or turned into a rest draws nothing.
 *
 * @see src/components/Canvas/Staff.tsx renderTies, src/utils/ties.ts
 */

/* eslint-disable testing-library/no-container */

// Mock the audio engine to avoid WebAudio errors under jsdom (as the other render tests do).
jest.mock('@/engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

import { renderScore } from '../helpers/visual';
import { composedPoint, composedPosition } from '../helpers/svgGeometry';
import { createDefaultScore, Measure, PageLayout, Score, ScoreEvent, SystemLayout } from '@/types';
import { TIE } from '@/constants';
import { calculateMeasureLayout } from '@/engines/layout';
import { CONFIG, DEFAULT_LAYOUT_CONFIG } from '@/config';
import { calculatePageLayout } from '@/services/PageLayoutService';

const q = (id: string, pitch: string | null, tied = false): ScoreEvent =>
  pitch === null
    ? {
        id,
        duration: 'quarter',
        dotted: false,
        isRest: true,
        notes: [{ id: `${id}n`, pitch: null, isRest: true }],
      }
    : { id, duration: 'quarter', dotted: false, notes: [{ id: `${id}n`, pitch, tied }] };

const scoreOf = (events: ScoreEvent[], keySignature = 'C'): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.keySignature = keySignature;
  s.staves = [{ ...s.staves[0], keySignature, measures: [{ id: 'm0', events }] }];
  return s;
};

const tieCount = (score: Score): number => {
  const { container, unmount } = renderScore(score);
  const n = container.querySelectorAll('.riff-Tie').length;
  unmount();
  return n;
};

const firstMoveX = (path: Element): number => {
  const d = path.getAttribute('d') ?? '';
  const match = d.match(/M\s+(-?\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unable to parse tie path: ${d}`);
  return Number(match[1]);
};

const translateX = (group: Element): number => {
  const transform = group.getAttribute('transform') ?? '';
  const match = transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unable to parse transform: ${transform}`);
  return Number(match[1]);
};

describe('tie rendering', () => {
  it('draws a tie curve when it resolves to a same-pitch successor', () => {
    expect(tieCount(scoreOf([q('a', 'C4', true), q('b', 'C4'), q('c', 'E4'), q('d', 'F4')]))).toBe(
      1
    );
  });

  it('draws NO tie (no hanging stub) when the target is a rest', () => {
    expect(tieCount(scoreOf([q('a', 'C4', true), q('r', null), q('c', 'E4'), q('d', 'F4')]))).toBe(
      0
    );
  });

  it('draws NO tie when the tied note is the last in the score', () => {
    expect(tieCount(scoreOf([q('a', 'C4'), q('b', 'C4'), q('c', 'C4'), q('d', 'C4', true)]))).toBe(
      0
    );
  });

  it('anchors tie X to the rendered notehead under a non-C key signature (#249)', () => {
    const score = scoreOf([q('a', 'F#4', true), q('b', 'F#4'), q('c', 'G4'), q('d', 'A4')], 'G');
    const { canvas, unmount } = renderScore(score);
    try {
      const tie = canvas.querySelector('.riff-Tie');
      const chord = canvas.querySelector('[data-testid="chord-a"]');
      const notehead = chord?.querySelector('.NoteHead');
      const measure = chord?.closest('.Measure');

      expect(tie).not.toBeNull();
      expect(chord).not.toBeNull();
      expect(notehead).not.toBeNull();
      expect(measure).not.toBeNull();

      const expectedStartX =
        translateX(measure!) + Number(notehead!.getAttribute('x')) + 10 + TIE.START_GAP;
      expect(firstMoveX(tie!)).toBeCloseTo(expectedStartX, 2);
    } finally {
      unmount();
    }
  });
});

/**
 * Split ties in page view (Staff.tsx renderTies): a tie whose target sits on the next system is
 * drawn as an out-arc that tapers to the source system's right edge (`systemEndX`) and an in-arc
 * that enters from the target system's left edge (`systemStartX`), both in staff units inside the
 * staff group's translate/scale. The facts below are read back in PAGE coordinates (the page
 * <svg> is the frame `composedPoint` stops at) and compared with the layout service's
 * `measurePositions`, so a drift between the renderer's system edges and the page layout fails
 * here rather than as a tie hanging in the margin.
 */
describe('split ties in page view', () => {
  type Pt = { x: number; y: number };

  const chord = (id: string, pitches: string[], tied = false): ScoreEvent => ({
    id,
    duration: 'quarter',
    dotted: false,
    notes: pitches.map((pitch, i) => ({ id: `${id}n${i}`, pitch, tied })),
  });

  /** A single-staff page-view score of `measureCount` identical quarter-note bars (F4 C4 D4 F4). */
  const pageViewScore = (measureCount: number, staffSize: number): Score => {
    const score = createDefaultScore();
    score.timeSignature = '4/4';
    score.keySignature = 'C';
    score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page', staffSize };
    score.staves = [
      {
        id: 'staff-1',
        clef: 'treble',
        keySignature: 'C',
        measures: Array.from({ length: measureCount }, (_, measureIndex) => ({
          id: `m${measureIndex}`,
          events: [
            q(`m${measureIndex}-e0`, 'F4'),
            q(`m${measureIndex}-e1`, 'C4'),
            q(`m${measureIndex}-e2`, 'D4'),
            q(`m${measureIndex}-e3`, 'F4'),
          ],
        })),
      },
    ];
    return score;
  };

  /** Every coordinate pair in a Tie path's `d` (M/L/Q operands, control points included), in order. */
  const tiePathPoints = (path: Element): Pt[] => {
    const d = path.getAttribute('d') ?? '';
    const nums = (d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (nums.length < 2 || nums.length % 2 !== 0) throw new Error(`Unable to parse tie path: ${d}`);
    const points: Pt[] = [];
    for (let i = 0; i < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
    return points;
  };

  /** The point drawn furthest right: an out-arc's taper tip, or the note end of an in-arc. */
  const rightmost = (points: Pt[]): Pt => points.reduce((a, b) => (b.x > a.x ? b : a));

  /** 0-based index of the page (PageContainer wrapper) the element is drawn on. */
  const pageIndexOf = (el: Element): number => {
    const page = el.closest('[data-page-index]');
    if (!page) throw new Error('element is not drawn inside a page-view page');
    return Number(page.getAttribute('data-page-index'));
  };

  /** The system whose staff group draws the path: that group's origin sits baseY·staffScale above system.y. */
  const systemOf = (path: Element, systems: SystemLayout[], staffScale: number): SystemLayout => {
    const origin = composedPoint(path, { x: 0, y: 0 });
    const system = systems.find((s) => Math.abs(s.y - CONFIG.baseY * staffScale - origin.y) < 0.01);
    if (!system) throw new Error(`no candidate system owns the staff group at page y=${origin.y}`);
    return system;
  };

  const firstSystemBreak = (pageLayout: PageLayout): [SystemLayout, SystemLayout] => {
    const systems = pageLayout.pages.flatMap((page) => page.systems);
    expect(systems.length).toBeGreaterThan(1);
    return [systems[0], systems[1]];
  };

  const firstPageBreak = (pageLayout: PageLayout): [SystemLayout, SystemLayout] => {
    expect(pageLayout.pageCount).toBeGreaterThan(1);
    const [page0, page1] = pageLayout.pages;
    return [page0.systems[page0.systems.length - 1], page1.systems[0]];
  };

  /**
   * Edit the last bar before a break and the first bar after it, confirm the edit did not move
   * the break, and render. Returns the break's systems from the layout of the edited score.
   */
  const renderTieAcrossBreak = (
    score: Score,
    pickBreak: (pageLayout: PageLayout) => [SystemLayout, SystemLayout],
    edit: (sourceMeasure: Measure, targetMeasure: Measure) => void
  ) => {
    const measures = score.staves[0].measures;
    const [initialSource, initialTarget] = pickBreak(calculatePageLayout(score, score.layout));
    const sourceMeasureIndex = initialSource.measures[initialSource.measures.length - 1];
    const targetMeasureIndex = initialTarget.measures[0];
    expect(targetMeasureIndex).toBe(sourceMeasureIndex + 1);
    edit(measures[sourceMeasureIndex], measures[targetMeasureIndex]);

    const pageLayout = calculatePageLayout(score, score.layout);
    const [source, target] = pickBreak(pageLayout);
    expect(source.measures[source.measures.length - 1]).toBe(sourceMeasureIndex);
    expect(target.measures[0]).toBe(targetMeasureIndex);

    return { ...renderScore(score), pageLayout, source, target };
  };

  /** All tie paths, split into the source system's out-arcs and the target system's in-arcs (each top-down). */
  const splitArcs = (
    canvas: Element,
    source: SystemLayout,
    target: SystemLayout,
    staffScale: number
  ) => {
    const arcs = Array.from(canvas.querySelectorAll('.riff-Tie'));
    const topDown = (a: Element, b: Element) => tiePathPoints(a)[0].y - tiePathPoints(b)[0].y;
    const owner = (arc: Element) => systemOf(arc, [source, target], staffScale);
    return {
      arcs,
      outArcs: arcs.filter((arc) => owner(arc) === source).sort(topDown),
      inArcs: arcs.filter((arc) => owner(arc) === target).sort(topDown),
    };
  };

  /**
   * One split tie: the out-arc leaves the tied note's bar and tapers to the source system's
   * right edge; the in-arc enters from the target system's left edge and lands in the target
   * note's bar. Edges are compared in page coordinates (±1px) with the layout's measure
   * positions; both halves sit at the same staff-local height (same pitch).
   */
  const expectSplitTieGeometry = (
    outArc: Element,
    inArc: Element,
    source: SystemLayout,
    target: SystemLayout
  ) => {
    const sourceLast = source.measurePositions[source.measurePositions.length - 1];
    const targetFirst = target.measurePositions[0];
    const outPoints = tiePathPoints(outArc);
    const inPoints = tiePathPoints(inArc);
    const outTip = rightmost(outPoints);
    const inStart = inPoints[0]; // `M sX sY`: the taper tip on the left edge

    const outStartOnPage = composedPoint(outArc, outPoints[0]);
    const outTipOnPage = composedPoint(outArc, outTip);
    const inStartOnPage = composedPoint(inArc, inStart);
    const inEndOnPage = composedPoint(inArc, rightmost(inPoints));

    expect(Math.abs(outTipOnPage.x - (sourceLast.x + sourceLast.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(inStartOnPage.x - targetFirst.x)).toBeLessThanOrEqual(1);

    expect(outStartOnPage.x).toBeGreaterThan(sourceLast.x);
    expect(outStartOnPage.x).toBeLessThan(sourceLast.x + sourceLast.width);
    expect(inEndOnPage.x).toBeGreaterThan(targetFirst.x);
    expect(inEndOnPage.x).toBeLessThan(targetFirst.x + targetFirst.width);

    expect(inStart.y).toBeCloseTo(outTip.y, 6);
  };

  const tieLastNote = (sourceMeasure: Measure) => {
    sourceMeasure.events[3].notes[0].tied = true; // F4 → the next bar's opening F4
  };

  it('splits a resolvable tie across page-view system breaks', () => {
    const { canvas, unmount, pageLayout, source, target } = renderTieAcrossBreak(
      pageViewScore(16, DEFAULT_LAYOUT_CONFIG.staffSize),
      firstSystemBreak,
      tieLastNote
    );
    try {
      const { arcs, outArcs, inArcs } = splitArcs(canvas, source, target, pageLayout.staffScale);
      expect(arcs).toHaveLength(2);
      expect(outArcs).toHaveLength(1);
      expect(inArcs).toHaveLength(1);
      expect(pageIndexOf(outArcs[0])).toBe(0);
      expect(pageIndexOf(inArcs[0])).toBe(0);
      expectSplitTieGeometry(outArcs[0], inArcs[0], source, target);
    } finally {
      unmount();
    }
  });

  it('splits every note of a tied chord: one out-arc and one in-arc per note', () => {
    const { canvas, unmount, pageLayout, source, target } = renderTieAcrossBreak(
      pageViewScore(16, DEFAULT_LAYOUT_CONFIG.staffSize),
      firstSystemBreak,
      (sourceMeasure, targetMeasure) => {
        sourceMeasure.events[3] = chord('src-chord', ['C4', 'E4'], true);
        targetMeasure.events[0] = chord('tgt-chord', ['C4', 'E4']);
      }
    );
    try {
      const { arcs, outArcs, inArcs } = splitArcs(canvas, source, target, pageLayout.staffScale);
      expect(arcs).toHaveLength(4);
      expect(outArcs).toHaveLength(2);
      expect(inArcs).toHaveLength(2);
      expectSplitTieGeometry(outArcs[0], inArcs[0], source, target);
      expectSplitTieGeometry(outArcs[1], inArcs[1], source, target);
      // One pair per chord note, at distinct heights.
      expect(tiePathPoints(outArcs[0])[0].y).not.toBeCloseTo(tiePathPoints(outArcs[1])[0].y, 6);
    } finally {
      unmount();
    }
  });

  it('draws no arc when the tie target across the break is a rest', () => {
    const { canvas, unmount } = renderTieAcrossBreak(
      pageViewScore(16, DEFAULT_LAYOUT_CONFIG.staffSize),
      firstSystemBreak,
      (sourceMeasure, targetMeasure) => {
        tieLastNote(sourceMeasure);
        targetMeasure.events[0] = q('tgt-rest', null);
      }
    );
    try {
      expect(canvas.querySelectorAll('.riff-Tie')).toHaveLength(0);
    } finally {
      unmount();
    }
  });

  it('splits a tie across a page break: one arc on each page', () => {
    // staffSize 100 keeps the old density: 16 bars overflow one Letter page.
    const { canvas, unmount, pageLayout, source, target } = renderTieAcrossBreak(
      pageViewScore(16, 100),
      firstPageBreak,
      tieLastNote
    );
    try {
      const { arcs, outArcs, inArcs } = splitArcs(canvas, source, target, pageLayout.staffScale);
      expect(arcs).toHaveLength(2);
      expect(outArcs).toHaveLength(1);
      expect(inArcs).toHaveLength(1);
      expect(pageIndexOf(outArcs[0])).toBe(0);
      expect(pageIndexOf(inArcs[0])).toBe(1);
      expectSplitTieGeometry(outArcs[0], inArcs[0], source, target);
    } finally {
      unmount();
    }
  });
});

describe('page-view chord track rendering', () => {
  it('keeps high-note chord labels inside the page top edge', () => {
    const score = createDefaultScore();
    score.timeSignature = '4/4';
    score.keySignature = 'Eb';
    score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page', staffSize: 90 };
    score.chordTrack = [{ id: 'top-chord', measure: 12, quant: 0, symbol: 'Fm9' }];
    score.staves = [
      {
        id: 'staff-1',
        clef: 'treble',
        keySignature: 'Eb',
        measures: Array.from({ length: 20 }, (_, measureIndex) => ({
          id: `m${measureIndex}`,
          events: [
            q(`m${measureIndex}-e0`, 'C8'),
            q(`m${measureIndex}-e1`, 'C8'),
            q(`m${measureIndex}-e2`, 'C8'),
            q(`m${measureIndex}-e3`, 'C8'),
          ],
        })),
      },
    ];

    const { canvas, unmount } = renderScore(score);
    try {
      const chordTracks = Array.from(canvas.querySelectorAll('.riff-ChordTrack'));
      const chordSymbols = Array.from(canvas.querySelectorAll('.riff-ChordSymbol'));

      expect(chordSymbols.some((symbol) => symbol.textContent === 'Fm9')).toBe(true);
      expect(Math.min(...chordTracks.map((t) => composedPosition(t).y))).toBeGreaterThanOrEqual(12);
    } finally {
      unmount();
    }
  });
});

describe('tie layout stays on the notehead when a system is justified (#249, stretch ≠ 1.0)', () => {
  // The renderer draws ties (Staff.tsx renderTies) and noteheads (Measure → useMeasureLayout)
  // from the SAME measure layout: both share measureStartXs, so tie-X == notehead-X reduces
  // to the two paths agreeing on `eventPositions`. In the unstretched path both read the
  // centralized legacyLayout. In the justified (stretch ≠ 1.0) path the Measure recomputes via
  // useMeasureLayout(events, …, forcedEventPositions = legacyLayout.eventPositions, stretch, key)
  // and renderTies recomputes via calculateMeasureLayout(events, …, undefined, stretch, key).
  // calculateMeasureLayout's forcedEventPositions is QUANT-keyed while legacyLayout.eventPositions
  // is ID-keyed, so today the forced map is a no-op in BOTH paths and they coincide. This pins
  // that contract: if a future change makes forced positions effective for the Measure without
  // also threading them into renderTies, this test fails — a tie would drift off its notehead.
  const events: ScoreEvent[] = [
    {
      id: 'a',
      duration: 'quarter',
      dotted: false,
      notes: [{ id: 'an', pitch: 'F#4', tied: true }],
    },
    { id: 'b', duration: 'quarter', dotted: false, notes: [{ id: 'bn', pitch: 'F#4' }] },
    { id: 'c', duration: 'quarter', dotted: false, notes: [{ id: 'cn', pitch: 'G4' }] },
    { id: 'd', duration: 'quarter', dotted: false, notes: [{ id: 'dn', pitch: 'A4' }] },
  ];
  const clef = 'treble';
  const key = 'G'; // non-C: accidental width is in play for the F#4s
  const stretch = 1.5;

  it('the Measure layout and the tie layout produce identical event positions when stretched', () => {
    // What Staff.tsx forwards to the Measure as forcedEventPositions (id-keyed).
    const legacyPositions = calculateMeasureLayout(
      events,
      undefined,
      clef,
      false,
      undefined,
      1.0,
      key
    ).eventPositions;

    const measurePath = calculateMeasureLayout(
      events,
      undefined,
      clef,
      false,
      legacyPositions,
      stretch,
      key
    ).eventPositions;
    const tiePath = calculateMeasureLayout(
      events,
      undefined,
      clef,
      false,
      undefined,
      stretch,
      key
    ).eventPositions;

    expect(tiePath).toEqual(measurePath);

    // Sanity: the stretch is non-trivial, so the equality above is not vacuous.
    const unstretched = calculateMeasureLayout(
      events,
      undefined,
      clef,
      false,
      undefined,
      1.0,
      key
    ).eventPositions;
    expect(tiePath).not.toEqual(unstretched);
  });
});
