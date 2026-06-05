/**
 * Visual / engraving regression harness — Lane A (jsdom), HYBRID (issue #252).
 *
 * Two complementary nets over the native-`Score` fixture corpus:
 *
 *   1. STRUCTURED-FACT SNAPSHOTS — every fixture's normalized engraving facts
 *      (noteheads / stems / ledger lines / beams / glyph codepoints) are snapshotted.
 *      This is the broad "catch ANY geometry change" net. The facts are id-free and
 *      coordinate-rounded, so the snapshot is deterministic and semantically reviewable
 *      (unlike a raw-SVG dump, which invites rubber-stamped `jest -u`).
 *
 *   2. TARGETED ORACLE ASSERTIONS — load-bearing engraving invariants asserted in the
 *      RenderingDetailed.test.tsx house style, so the most important facts are pinned by
 *      an explicit human-meaningful expectation, not only by a snapshot.
 *
 * A real change shows up in BOTH: the snapshot diffs (review it; `jest -u` to accept) and,
 * if it breaks an invariant, an oracle fails loudly.
 *
 * Lane B (real-browser pixel verification) lives in the Playwright suite and is the actual
 * VISUAL net — jsdom has no fonts/layout, so this lane proves geometry, not pixels.
 */

/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */

// Mock the audio engine to avoid WebAudio errors under jsdom (as the other render tests do).
jest.mock('@/engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

import { visualFixtures, fixtureByName } from '../fixtures/visual';
import { extractFacts, renderScore } from '../helpers/visual';
import { noteheads, beams, codepoints } from '../helpers/geometry';
import { codepointFor } from '../helpers/glyphs/smuflRegistry';

describe('Visual regression — Lane A (structured-fact snapshots)', () => {
  it.each(visualFixtures.map((f) => [f.name, f] as const))(
    'fixture %s matches its structured-fact snapshot',
    (_name, fixture) => {
      // toMatchSnapshot keyed by fixture name keeps a stable 1-fixture-per-snapshot map.
      expect(extractFacts(fixture.score)).toMatchSnapshot(fixture.name);
    }
  );
});

describe('Visual regression — Lane A (engraving oracles)', () => {
  // Note ledgers are the short horizontal lines; staff lines span the measure. Isolate the
  // short ones from a fixture's facts.
  const noteLedgerWidths = (name: string) =>
    extractFacts(fixtureByName(name).score)
      .ledgerLines.map((l) => Math.round(l.x2 - l.x1))
      .filter((w) => w < 40);

  it('ascending scale: noteheads march left-to-right and high-to-low (ascending pitch ⇒ descending Y)', () => {
    const { canvas, unmount } = renderScore(fixtureByName('clef-treble').score);
    try {
      const heads = noteheads(canvas); // single bar of eight ascending eighths
      expect(heads).toHaveLength(8);
      const black = codepointFor('noteheadBlack');
      for (let i = 1; i < heads.length; i++) {
        expect(heads[i].x).toBeGreaterThan(heads[i - 1].x); // strictly rightward
        expect(heads[i].y).toBeLessThan(heads[i - 1].y); // ascending pitch ⇒ smaller y
      }
      for (const h of heads) expect(h.codepoint).toBe(black);
    } finally {
      unmount();
    }
  });

  it.each([
    ['clef-treble', 'gClef'],
    ['clef-bass', 'fClef'],
    ['clef-alto', 'cClef'],
    ['clef-tenor', 'cClef'],
  ] as const)('%s renders its clef glyph', (fixture, glyph) => {
    const { canvas, unmount } = renderScore(fixtureByName(fixture).score);
    try {
      expect(codepoints(canvas)).toContain(codepointFor(glyph));
    } finally {
      unmount();
    }
  });

  it('grand staff renders two braced staves (two staff-line groups)', () => {
    const { container, canvas, unmount } = renderScore(fixtureByName('grand-staff').score);
    try {
      expect(container.querySelectorAll('.staff-lines').length).toBeGreaterThanOrEqual(2);
      expect(noteheads(canvas).length).toBeGreaterThan(0);
    } finally {
      unmount();
    }
  });

  it('multi-staff fixture renders every staff (4 clefs ⇒ 4 staves)', () => {
    const { container, unmount } = renderScore(fixtureByName('key-placement-all-clefs').score);
    try {
      expect(container.querySelectorAll('.staff-lines').length).toBeGreaterThanOrEqual(4);
    } finally {
      unmount();
    }
  });

  it('compound meter splits beams into beat groups (6/8 has more groups than 3/8)', () => {
    const r68 = renderScore(fixtureByName('beaming-6-8').score);
    const r38 = renderScore(fixtureByName('beaming-3-8').score);
    try {
      const groups68 = beams(r68.canvas).length;
      const groups38 = beams(r38.canvas).length;
      expect(groups38).toBeGreaterThanOrEqual(1); // 3/8 beams the whole bar as one group
      expect(groups68).toBeGreaterThanOrEqual(2); // 6/8 = two dotted-quarter groups
      expect(groups68).toBeGreaterThan(groups38); // compound subdivision actually happened
    } finally {
      r68.unmount();
      r38.unmount();
    }
  });

  it('triplet draws a bracket labeled "3"', () => {
    const { container, unmount } = renderScore(fixtureByName('tuplet-eighth-triplet').score);
    try {
      const bracket = container.querySelector('.tuplet-bracket');
      expect(bracket).not.toBeNull();
      expect(bracket!.querySelector('text')?.textContent).toBe('3');
    } finally {
      unmount();
    }
  });

  it('chord stacks ≥3 noteheads at a single x (shared stem)', () => {
    const { canvas, unmount } = renderScore(fixtureByName('chords-triads').score);
    try {
      const byX = new Map<number, number>();
      for (const h of noteheads(canvas)) byX.set(h.x, (byX.get(h.x) ?? 0) + 1);
      expect(Math.max(...byX.values())).toBeGreaterThanOrEqual(3);
    } finally {
      unmount();
    }
  });

  it('double accidentals render their own glyphs (double-sharp + double-flat)', () => {
    const { canvas, unmount } = renderScore(fixtureByName('accidentals-double').score);
    try {
      const cps = codepoints(canvas);
      expect(cps).toContain(codepointFor('accidentalDoubleSharp'));
      expect(cps).toContain(codepointFor('accidentalDoubleFlat'));
    } finally {
      unmount();
    }
  });

  it("accidentalDisplay 'hide' suppresses the flat glyph (and 'show' still draws)", () => {
    const { canvas, unmount } = renderScore(fixtureByName('accidentals-display').score);
    try {
      const cps = codepoints(canvas);
      expect(cps).not.toContain(codepointFor('accidentalFlat')); // hidden Bb draws no flat
      expect(cps).toContain(codepointFor('accidentalSharp')); // the C# still draws
    } finally {
      unmount();
    }
  });

  it("accidentalDisplay 'courtesy' renders a parenthesized accidental", () => {
    const { canvas, unmount } = renderScore(fixtureByName('accidentals-display').score);
    try {
      // Courtesy glyph wraps in SMuFL accidental parens (U+E26A left) → a <text> begins with it.
      expect(codepoints(canvas)).toContain('e26a');
    } finally {
      unmount();
    }
  });

  it('multi-digit time signature: the 12 of 12/8 renders as two digit glyphs', () => {
    const { canvas, unmount } = renderScore(fixtureByName('beaming-12-8').score);
    try {
      // The numerator is one <text> holding two SMuFL time-sig digit glyphs ("1","2"). A
      // whole-string lookup of "12" used to miss, leaving the numerator blank.
      const numerator = Array.from(canvas.querySelectorAll('text')).find(
        (t) => [...(t.textContent ?? '')].length === 2 && t.textContent!.codePointAt(0) === 0xe081
      );
      expect(numerator).toBeTruthy();
      expect(numerator!.textContent!.codePointAt(1)).toBe(0xe082); // the "2"
    } finally {
      unmount();
    }
  });

  it('whole-note ledger is wider than a quarter-note ledger (peeks past the wide head)', () => {
    // Whole-note ledgers use the widened extension (2*(SPACE-2+EXTRA) = 28); quarter-note
    // ledgers use the default (2*(SPACE-2) = 20).
    expect(Math.max(...noteLedgerWidths('ledger-whole-note'))).toBe(28);
    expect(Math.max(...noteLedgerWidths('ledger-above'))).toBe(20);
  });
});
