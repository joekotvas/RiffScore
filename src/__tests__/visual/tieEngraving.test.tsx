/**
 * Tie engraving in the renderer: the curve sits away from the stem the note is drawn with
 * (beam direction for beamed notes, outer chord notes outward), a tie continuation across a
 * barline draws no accidental, and tie ends land on the noteheads of a justified grand-staff
 * system (cross-staff synchronized positions).
 */
import { renderScore } from '../helpers/visual';
import { composedPoint, composedRect } from '../helpers/svgGeometry';
import { createDefaultScore, ScoreEvent } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

const ev = (id: string, duration: string, pitches: string[], tied = false): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: pitches.map((p, i) => ({ id: `${id}n${i}`, pitch: p, tied })),
});

/** Sign of a tie path's bulge: negative = curves upward (above the notes). */
const tieBulge = (path: Element): number => {
  const d = path.getAttribute('d') ?? '';
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  // M x0 y0 Q cx cy x1 y1 … — the first control point's y against the start y
  return nums[3] - nums[1];
};

describe('tie engraving', () => {
  test('a beamed note ties away from its BEAM, not its own position', () => {
    // G4 A4 Bb4 C5 beam stems up (G4 farthest below the middle line): the C5, which alone would
    // take a down-stem and a tie above, ties BELOW like the rest of the group.
    const score = createDefaultScore();
    score.staves = [
      {
        id: 's0',
        clef: 'treble',
        keySignature: 'C',
        measures: [
          {
            id: 'm0',
            events: [
              ev('a', 'eighth', ['G4']),
              ev('b', 'eighth', ['A4']),
              ev('c', 'eighth', ['Bb4']),
              ev('d', 'eighth', ['C5'], true),
              ev('e', 'half', ['C5']),
            ],
          },
        ],
      },
    ];
    const { canvas, unmount } = renderScore(score);
    try {
      const paths = Array.from(canvas.querySelectorAll('path')).filter((p) =>
        (p.getAttribute('d') ?? '').includes('Q')
      );
      expect(paths.length).toBeGreaterThanOrEqual(1);
      const tie = paths.find((p) => tieBulge(p) !== 0)!;
      expect(tieBulge(tie)).toBeGreaterThan(0); // bulges downward: below the up-stem group
    } finally {
      unmount();
    }
  });

  test('a chord ties its outer notes outward', () => {
    const score = createDefaultScore();
    score.staves = [
      {
        id: 's0',
        clef: 'treble',
        keySignature: 'C',
        measures: [
          {
            id: 'm0',
            events: [
              ev('a', 'half', ['E4', 'G4', 'C5'], true),
              ev('b', 'half', ['E4', 'G4', 'C5']),
            ],
          },
        ],
      },
    ];
    const { canvas, unmount } = renderScore(score);
    try {
      const ties = Array.from(canvas.querySelectorAll('path')).filter((p) =>
        (p.getAttribute('d') ?? '').includes('Q')
      );
      expect(ties).toHaveLength(3);
      const byStartY = ties
        .map((p) => ({
          y: Number((p.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)![1]),
          bulge: tieBulge(p),
        }))
        .sort((a, b) => a.y - b.y);
      expect(byStartY[0].bulge).toBeLessThan(0); // top note (C5): above
      expect(byStartY[2].bulge).toBeGreaterThan(0); // bottom note (E4): below
    } finally {
      unmount();
    }
  });

  test('a tie continuation across the barline draws no accidental', () => {
    const score = createDefaultScore();
    score.staves = [
      {
        id: 's0',
        clef: 'treble',
        keySignature: 'C',
        measures: [
          { id: 'm0', events: [ev('a', 'half', ['D4']), ev('b', 'half', ['F#4'], true)] },
          {
            id: 'm1',
            events: [
              ev('c', 'quarter', ['F#4']),
              ev('d', 'quarter', ['F4']),
              ev('e', 'half', ['G4']),
            ],
          },
        ],
      },
    ];
    const { canvas, unmount } = renderScore(score);
    try {
      const accidentalIn = (eventId: string) =>
        canvas.querySelector(
          `[data-testid="chord-${eventId}"] .riff-Accidental, [data-testid="chord-${eventId}"] [data-accidental]`
        );
      const glyphs = (eventId: string) =>
        Array.from(canvas.querySelectorAll(`[data-testid="chord-${eventId}"] text`)).map(
          (t) => t.textContent ?? ''
        );
      // b (the tied F#) shows a sharp; c (its continuation) shows none; d (F natural) shows a natural.
      expect(glyphs('b').join('')).toContain(''); // SMuFL sharp
      expect(glyphs('c').join('')).not.toContain('');
      expect(glyphs('d').join('')).toContain(''); // SMuFL natural
      void accidentalIn;
    } finally {
      unmount();
    }
  });

  test('ties on a justified grand-staff system end on the noteheads', () => {
    // Treble B4 halves tied across every barline over bass eighths: the cross-staff synchronized
    // positions differ from a treble-only layout, and full systems are justified (stretched).
    const score = createDefaultScore();
    score.keySignature = 'C';
    score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page', staffSize: 100 };
    const bars = 6;
    score.staves = [
      {
        id: 's0',
        clef: 'treble',
        keySignature: 'C',
        measures: Array.from({ length: bars }, (_, m) => ({
          id: `t${m}`,
          events: [ev(`t${m}a`, 'half', ['B4']), ev(`t${m}b`, 'half', ['B4'], m < bars - 1)],
        })),
      },
      {
        id: 's1',
        clef: 'bass',
        keySignature: 'C',
        measures: Array.from({ length: bars }, (_, m) => ({
          id: `b${m}`,
          events: ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'].map((p, i) =>
            ev(`b${m}e${i}`, 'eighth', [p])
          ),
        })),
      },
    ];
    const { canvas, unmount } = renderScore(score);
    try {
      const head = (eventId: string) =>
        composedRect(
          canvas.querySelector(`[data-testid="chord-${eventId}"] [data-note-hit-area]`)!
        );
      const sources = Array.from({ length: bars - 1 }, (_, m) => head(`t${m}b`));
      const targets = Array.from({ length: bars - 1 }, (_, m) => head(`t${m + 1}a`));
      const ties = Array.from(canvas.querySelectorAll('.riff-Tie'));
      expect(ties.length).toBeGreaterThanOrEqual(bars - 1);
      ties.forEach((tie) => {
        const nums = (tie.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
        const start = composedPoint(tie, { x: nums[0], y: nums[1] });
        const end = composedPoint(tie, { x: nums[4], y: nums[5] });
        // Every arc leaves a tied source head (normal tie or out-arc to the system edge) or
        // arrives at a continuation head (in-arc from the system edge).
        const leavesSource = sources.some(
          (r) =>
            start.x >= r.x &&
            start.x <= r.x + r.width + 14 &&
            Math.abs(start.y - (r.y + r.height / 2)) < 12
        );
        const arrivesTarget = targets.some(
          (r) =>
            end.x >= r.x - 14 &&
            end.x <= r.x + r.width &&
            Math.abs(end.y - (r.y + r.height / 2)) < 12
        );
        expect(leavesSource || arrivesTarget).toBe(true);
      });
    } finally {
      unmount();
    }
  });
});
