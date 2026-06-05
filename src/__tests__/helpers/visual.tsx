/**
 * Visual-harness render + fact-extraction helper (issue #252, Lane A).
 *
 * Renders a native `Score` through the REAL `ScoreEditor` pipeline (the same harness
 * RenderingDetailed.test.tsx uses) and reduces the emitted SVG to NORMALIZED structured
 * engraving facts via the framework-agnostic `geometry.ts` extractor.
 *
 * Why facts, not raw SVG: the repo deliberately favours assertion-based engraving oracles
 * over snapshots (the rubber-stamp failure mode of `jest -u`). Structured facts are the
 * middle path — a broad "catch any geometry change" snapshot that stays semantically
 * reviewable, with id-free content (noteheads/stems/ledgers/beams carry coordinates and
 * glyph codepoints, never the random `data-testid` ids).
 *
 * jsdom has no layout engine or font metrics, BUT RiffScore computes engraving geometry
 * purely in JS (no getBBox/measureText in the render path), so these coordinates equal a
 * real browser's for the snapshotted attributes. Lane B adds only the font-rasterization
 * layer on top.
 *
 * NOTE: the caller's TEST FILE must `jest.mock('@/engines/toneEngine', ...)` (hoisted),
 * exactly as the other render tests do — importing this helper does not mock audio.
 */

/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@/context/ThemeContext';
import ScoreEditor from '@components/Layout/ScoreEditor';
import type { Score } from '@/types';
import { noteheads, stems, ledgerLines, beams, codepoints } from './geometry';

/** Coordinate rounding precision — strips sub-pixel float noise so baselines are stable. */
const PRECISION = 2;
const r = (n: number): number =>
  Number.isFinite(n) ? Math.round(n * 10 ** PRECISION) / 10 ** PRECISION : n;

export interface NormalizedFacts {
  /** Notehead glyphs: position + SMuFL codepoint, in document order. */
  noteheads: Array<{ x: number; y: number; cp: string }>;
  /** Vertical stem segments. */
  stems: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** Horizontal ledger-line segments. */
  ledgerLines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** Beam polygons, as ordered vertices. */
  beams: Array<{ points: Array<{ x: number; y: number }> }>;
  /** Every <text> glyph codepoint in document order (clefs, accidentals, rests, numbers…). */
  glyphCodepoints: string[];
}

/**
 * Render a score and return the canvas element (scoped so toolbar icon glyphs are
 * excluded) plus an `unmount` to release the tree. Caller owns cleanup.
 */
export function renderScore(score: Score): {
  container: HTMLElement;
  canvas: Element;
  svg: string;
  unmount: () => void;
} {
  const { container, unmount } = render(
    <ThemeProvider>
      <ScoreEditor initialData={score} />
    </ThemeProvider>
  );
  const canvas = container.querySelector('[data-testid="score-canvas-container"]');
  if (!canvas) {
    unmount();
    throw new Error('renderScore: score-canvas-container not found in rendered output');
  }
  const svgEl = canvas.tagName.toLowerCase() === 'svg' ? canvas : canvas.querySelector('svg');
  const svg = (svgEl ?? canvas).outerHTML;
  return { container, canvas, svg, unmount };
}

/** Pure extraction: reduce an already-rendered canvas element to normalized facts. */
export function extractFactsFromCanvas(canvas: Element): NormalizedFacts {
  return {
    noteheads: noteheads(canvas).map((g) => ({ x: r(g.x), y: r(g.y), cp: g.codepoint })),
    stems: stems(canvas).map((l) => ({ x1: r(l.x1), y1: r(l.y1), x2: r(l.x2), y2: r(l.y2) })),
    ledgerLines: ledgerLines(canvas).map((l) => ({
      x1: r(l.x1),
      y1: r(l.y1),
      x2: r(l.x2),
      y2: r(l.y2),
    })),
    beams: beams(canvas).map((b) => ({ points: b.points.map((p) => ({ x: r(p.x), y: r(p.y) })) })),
    glyphCodepoints: codepoints(canvas),
  };
}

/** Render a score and return its normalized engraving facts (renders, extracts, unmounts). */
export function extractFacts(score: Score): NormalizedFacts {
  const { canvas, unmount } = renderScore(score);
  try {
    return extractFactsFromCanvas(canvas);
  } finally {
    unmount();
  }
}
