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
  it('ascending scale: noteheads march left-to-right and high-to-low (ascending pitch ⇒ descending Y)', () => {
    const { canvas, unmount } = renderScore(fixtureByName('treble-ascending-scale').score);
    try {
      const heads = noteheads(canvas);
      expect(heads).toHaveLength(8); // two bars of four quarters
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

  it('grand staff renders two braced staves (two staff-line groups)', () => {
    const { container, canvas, unmount } = renderScore(fixtureByName('grand-staff').score);
    try {
      const staffLineGroups = container.querySelectorAll('.staff-lines');
      expect(staffLineGroups.length).toBeGreaterThanOrEqual(2);
      expect(noteheads(canvas).length).toBeGreaterThan(0);
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

  it('complete triplet draws a bracket labeled "3"', () => {
    const { container, unmount } = renderScore(fixtureByName('triplet-complete').score);
    try {
      const bracket = container.querySelector('.tuplet-bracket');
      expect(bracket).not.toBeNull();
      const label = bracket!.querySelector('text');
      expect(label?.textContent).toBe('3');
    } finally {
      unmount();
    }
  });

  it('chord stacks ≥3 noteheads at a single x (shared stem)', () => {
    const { canvas, unmount } = renderScore(fixtureByName('chord-triad').score);
    try {
      const heads = noteheads(canvas);
      // The first event is a C-E-G triad: at least one x-column holds ≥3 noteheads.
      const byX = new Map<number, number>();
      for (const h of heads) byX.set(h.x, (byX.get(h.x) ?? 0) + 1);
      const tallestColumn = Math.max(...byX.values());
      expect(tallestColumn).toBeGreaterThanOrEqual(3);
    } finally {
      unmount();
    }
  });

  it('alto clef in A major: C-clef glyph present with a 3-sharp key signature', () => {
    const { canvas, unmount } = renderScore(fixtureByName('alto-clef-sharp-key').score);
    try {
      const cps = codepoints(canvas);
      expect(cps).toContain(codepointFor('cClef'));
      const sharps = cps.filter((cp) => cp === codepointFor('accidentalSharp')).length;
      // A major = 3 sharps; the in-key melody adds none (F#/C# are covered by the signature).
      expect(sharps).toBe(3);
    } finally {
      unmount();
    }
  });

  it("accidentalDisplay 'hide' suppresses the flat glyph", () => {
    const { canvas, unmount } = renderScore(fixtureByName('accidentals-display-policy').score);
    try {
      const cps = codepoints(canvas);
      // The Bb is marked hide → no flat glyph anywhere in the bar...
      expect(cps).not.toContain(codepointFor('accidentalFlat'));
      // ...while the out-of-key F# still draws its sharp.
      expect(cps).toContain(codepointFor('accidentalSharp'));
    } finally {
      unmount();
    }
  });
});
