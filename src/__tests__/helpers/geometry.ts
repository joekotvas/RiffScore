/**
 * SVG geometry-extraction helper (Verify-infra scaffolding, Phase 1).
 *
 * Purpose
 * -------
 * jsdom has no layout engine and no font metrics (no getBBox / getComputedTextLength).
 * The correctness strategy therefore asserts engraving facts from the SVG *attributes*
 * the renderer emits, not from rendered pixels. This module parses a rendered SVG
 * (string or live DOM node) and returns STRUCTURED engraving facts so tests can make
 * assertion-based engraving checks (notehead x/y + glyph codepoint, stem endpoints,
 * ledger-line spans, beam polygons).
 *
 * The SAME extraction queries are intended to run at two fidelities:
 *   - jsdom / renderToStaticMarkup: read x/y/codepoint attributes (this module).
 *   - real browser (Playwright, a later phase): the same selectors, augmented with getBBox.
 *
 * This is deliberately framework-agnostic: it depends only on `DOMParser` (present in
 * jsdom and every browser) and the standard DOM. It does NOT import React or any
 * RiffScore source, so it stands alone and can be reused by every later lane/phase.
 *
 * Conventions used by RiffScore's renderer (verified against src/components/Canvas):
 *   - Noteheads:    <text class="NoteHead" x y> with a single SMuFL glyph as text.
 *   - Accidentals / dots / rests / clefs: <text x y> with a SMuFL glyph as text.
 *   - Stems:        <line x1 y1 x2 y2> that is vertical (x1 === x2).
 *   - Ledger lines: <line x1 y1 x2 y2> that is horizontal (y1 === y2).
 *   - Beams:        <polygon points="..."> (Beam.tsx) or <path d="..."> fallbacks.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A glyph rendered as an SVG <text> element. */
export interface GlyphFact {
  /** The class attribute, if any (e.g. "NoteHead"). */
  className: string | null;
  /** Horizontal position from the `x` attribute (NaN if absent). */
  x: number;
  /** Vertical position from the `y` attribute (NaN if absent). */
  y: number;
  /** The raw text content (a single SMuFL glyph for music symbols). */
  text: string;
  /**
   * The first codepoint of the text as a lowercase hex string WITHOUT prefix,
   * e.g. 'e0a4' for noteheadBlack. Empty string for empty text.
   */
  codepoint: string;
}

/** A line segment (stem or ledger line). */
export interface LineFact {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A beam, captured as its raw polygon/path vertices. */
export interface BeamFact {
  /** Ordered list of {x,y} vertices parsed from the polygon `points` (or path). */
  points: Array<{ x: number; y: number }>;
}

/** A union accepted by every extractor: an SVG string or a DOM node. */
export type SvgInput = string | Element | Document;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Resolve an {@link SvgInput} to a queryable root element.
 *
 * - A string is parsed with DOMParser using the HTML parser, wrapped in a <div>.
 *   The HTML parser is used (rather than 'image/svg+xml') because it reliably preserves
 *   the text content of SVG <text> nodes in jsdom — the XML/SVG parse path in jsdom can
 *   drop Private-Use-Area glyph text. The HTML parser handles inline SVG elements
 *   (text/line/polygon) correctly via foreign-content rules, in both jsdom and browsers.
 * - An Element/Document is returned (Documents resolve to documentElement).
 */
export function toRoot(input: SvgInput): Element {
  if (typeof input === 'string') {
    if (typeof DOMParser === 'undefined') {
      throw new Error('geometry helper requires a DOMParser (jsdom or browser environment)');
    }
    const html = new DOMParser().parseFromString(`<div>${input}</div>`, 'text/html');
    const wrapper = html.body.firstElementChild;
    if (!wrapper) {
      throw new Error('Failed to parse SVG input: no element produced.');
    }
    return wrapper;
  }
  if (input instanceof Document) return input.documentElement;
  return input;
}

function num(el: Element, attr: string): number {
  const raw = el.getAttribute(attr);
  return raw === null ? NaN : Number(raw);
}

/**
 * First Unicode codepoint of a string as lowercase hex (no 'U+' prefix).
 * Uses codePointAt so astral SMuFL glyphs (rare) are handled correctly.
 */
export function firstCodepointHex(text: string): string {
  if (text.length === 0) return '';
  const cp = text.codePointAt(0);
  return cp === undefined ? '' : cp.toString(16).toLowerCase();
}

// ---------------------------------------------------------------------------
// Extractors
// ---------------------------------------------------------------------------

/** Every <text> glyph in the SVG, in document order. */
export function glyphs(input: SvgInput): GlyphFact[] {
  const root = toRoot(input);
  return Array.from(root.querySelectorAll('text')).map((el) => {
    const text = el.textContent ?? '';
    return {
      className: el.getAttribute('class'),
      x: num(el, 'x'),
      y: num(el, 'y'),
      text,
      codepoint: firstCodepointHex(text),
    };
  });
}

/** Noteheads only: <text> elements carrying the "NoteHead" class. */
export function noteheads(input: SvgInput): GlyphFact[] {
  return glyphs(input).filter((g) => g.className === 'NoteHead');
}

/** All <line> segments in the SVG. */
function lines(input: SvgInput): LineFact[] {
  const root = toRoot(input);
  return Array.from(root.querySelectorAll('line')).map((el) => ({
    x1: num(el, 'x1'),
    y1: num(el, 'y1'),
    x2: num(el, 'x2'),
    y2: num(el, 'y2'),
  }));
}

/**
 * Stems: vertical line segments (x1 === x2 within tolerance, and some vertical extent).
 * RiffScore draws the shared chord stem as a vertical <line> (Stem.tsx).
 */
export function stems(input: SvgInput, tol = 0.5): LineFact[] {
  return lines(input).filter(
    (l) => Math.abs(l.x1 - l.x2) <= tol && Math.abs(l.y1 - l.y2) > tol
  );
}

/**
 * Ledger lines: horizontal line segments (y1 === y2 within tolerance, with horizontal extent).
 * RiffScore draws ledger lines as horizontal <line> elements (Note.tsx LedgerLines).
 */
export function ledgerLines(input: SvgInput, tol = 0.5): LineFact[] {
  return lines(input).filter(
    (l) => Math.abs(l.y1 - l.y2) <= tol && Math.abs(l.x1 - l.x2) > tol
  );
}

/**
 * Parse a polygon/polyline `points` attribute into ordered {x,y} vertices.
 *
 * Per the SVG spec, `points` is a flat list of numbers separated by whitespace AND/OR
 * commas, consumed in (x, y) pairs. Both "x1,y1 x2,y2" (RiffScore beams) and
 * "x1 y1 x2 y2" (e.g. lucide icon polylines) are valid and handled here.
 */
function parsePoints(points: string): Array<{ x: number; y: number }> {
  const nums = points
    .trim()
    .split(/[\s,]+/)
    .filter((tok) => tok.length > 0)
    .map(Number);
  const verts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      verts.push({ x, y });
    }
  }
  return verts;
}

/**
 * Beams: <polygon> (and <polyline>) elements, returned as their vertices.
 * RiffScore renders beams as filled polygons (Beam.tsx).
 */
export function beams(input: SvgInput): BeamFact[] {
  const root = toRoot(input);
  return Array.from(root.querySelectorAll('polygon, polyline')).map((el) => ({
    points: parsePoints(el.getAttribute('points') ?? ''),
  }));
}

/**
 * Convenience: every distinct codepoint (lowercase hex) used by a <text> glyph,
 * useful for asserting "this glyph appears / does not appear".
 */
export function codepoints(input: SvgInput): string[] {
  return glyphs(input)
    .map((g) => g.codepoint)
    .filter((cp) => cp.length > 0);
}
