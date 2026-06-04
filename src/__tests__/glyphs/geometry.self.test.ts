/**
 * Self-test for the SVG geometry-extraction helper (../helpers/geometry.ts).
 *
 * Proves extraction is correct against a SMALL, HAND-WRITTEN SVG fixture whose facts
 * are known a priori (not produced by RiffScore). If the extractor misreads an x/y,
 * a codepoint, a stem orientation, or a ledger span, these assertions fail. The fixture
 * deliberately includes:
 *   - a notehead <text class="NoteHead"> with a known SMuFL codepoint and x/y,
 *   - a non-notehead glyph (accidental) to confirm class filtering,
 *   - a vertical line (a stem) and two horizontal lines (ledger lines) so the
 *     orientation-based classifiers are exercised against BOTH categories,
 *   - a beam <polygon> with known vertices.
 */

import {
  glyphs,
  noteheads,
  stems,
  ledgerLines,
  beams,
  codepoints,
  firstCodepointHex,
} from '../helpers/geometry';

// A hand-authored SVG. Coordinates and codepoints are chosen by hand, independent of
// any RiffScore rendering code.  = noteheadBlack,  = accidentalSharp.
const FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <text class="NoteHead" x="100" y="60" font-family="Bravura"></text>
  <text x="88" y="60" font-family="Bravura"></text>
  <line x1="108" y1="60" x2="108" y2="25" stroke="#000" stroke-width="1.5"/>
  <line x1="92" y1="60" x2="116" y2="60" stroke="#000" stroke-width="1.5"/>
  <line x1="92" y1="48" x2="116" y2="48" stroke="#000" stroke-width="1.5"/>
  <polygon points="108,25 140,18 140,22 108,29" fill="#000"/>
</svg>`;

describe('geometry helper self-test (hand-written SVG fixture)', () => {
  it('firstCodepointHex returns lowercase hex of the first codepoint', () => {
    expect(firstCodepointHex('')).toBe('e0a4');
    expect(firstCodepointHex('')).toBe('e262');
    expect(firstCodepointHex('')).toBe('');
  });

  it('extracts all glyphs with correct x/y, text and codepoint', () => {
    const g = glyphs(FIXTURE);
    expect(g).toHaveLength(2);

    const head = g.find((it) => it.className === 'NoteHead')!;
    expect(head).toBeDefined();
    expect(head.x).toBe(100);
    expect(head.y).toBe(60);
    expect(head.codepoint).toBe('e0a4');

    const acc = g.find((it) => it.className !== 'NoteHead')!;
    expect(acc.x).toBe(88);
    expect(acc.codepoint).toBe('e262');
  });

  it('noteheads() filters to the NoteHead class only', () => {
    const nh = noteheads(FIXTURE);
    expect(nh).toHaveLength(1);
    expect(nh[0].codepoint).toBe('e0a4');
    expect(nh[0].x).toBe(100);
  });

  it('stems() returns vertical lines with their endpoints', () => {
    const s = stems(FIXTURE);
    expect(s).toHaveLength(1);
    // The stem is vertical: equal x, differing y.
    expect(s[0].x1).toBe(s[0].x2);
    expect(s[0].x1).toBe(108);
    // It rises from the notehead (y=60) upward to y=25 (stem-up).
    const top = Math.min(s[0].y1, s[0].y2);
    const bottom = Math.max(s[0].y1, s[0].y2);
    expect(bottom).toBe(60);
    expect(top).toBe(25);
    // Length is the vertical extent.
    expect(Math.abs(s[0].y1 - s[0].y2)).toBe(35);
  });

  it('ledgerLines() returns horizontal lines and excludes the stem', () => {
    const ll = ledgerLines(FIXTURE);
    expect(ll).toHaveLength(2);
    for (const l of ll) {
      expect(l.y1).toBe(l.y2); // horizontal
      expect(Math.abs(l.x2 - l.x1)).toBe(24); // span 92..116
    }
    // Confirm the stem (vertical) did NOT leak into the ledger set.
    expect(ll.every((l) => l.x1 !== l.x2)).toBe(true);
  });

  it('beams() parses comma-separated polygon vertices in order', () => {
    const b = beams(FIXTURE);
    expect(b).toHaveLength(1);
    expect(b[0].points).toEqual([
      { x: 108, y: 25 },
      { x: 140, y: 18 },
      { x: 140, y: 22 },
      { x: 108, y: 29 },
    ]);
  });

  it('beams() also parses space-separated points (valid SVG, e.g. icon polylines)', () => {
    // Per the SVG spec, "x1 y1 x2 y2" (no commas) is a valid points list.
    const spaceSep = `<svg xmlns="http://www.w3.org/2000/svg">
      <polyline points="14 2 14 8 20 8"/>
      <polygon points="0,0 10,0 10,10"/>
    </svg>`;
    const b = beams(spaceSep);
    expect(b).toHaveLength(2);
    expect(b[0].points).toEqual([
      { x: 14, y: 2 },
      { x: 14, y: 8 },
      { x: 20, y: 8 },
    ]);
    expect(b[1].points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it('codepoints() lists every text glyph codepoint present', () => {
    expect(codepoints(FIXTURE).sort()).toEqual(['e0a4', 'e262']);
  });

  it('accepts a live DOM node as well as a string', () => {
    // Build a real DOM node (as a browser would have) and pass it directly. The HTML
    // parser preserves SVG <text> content in jsdom, mirroring a live document.
    const host = new DOMParser().parseFromString(`<div>${FIXTURE}</div>`, 'text/html');
    const node = host.body.firstElementChild!;
    const nh = noteheads(node);
    expect(nh).toHaveLength(1);
    expect(nh[0].codepoint).toBe('e0a4');
  });
});
