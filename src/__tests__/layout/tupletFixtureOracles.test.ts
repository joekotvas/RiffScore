/**
 * Tuplet fixture oracles (#252 / #245 re-scope).
 *
 * The visual gallery review (2026-06) verified that the tuplet layout engine renders non-triplet
 * ratios and edge cases correctly — contradicting the old "non-triplet tuplets are buggy (#245)"
 * caveat. These render-free oracles lock that finding against the layout engine: every fixture's
 * bracket shows its real ratio number (never silently "3"), and a tuplet with an interior rest beams
 * around it. The pixel baselines (#252) lock the exact engraving; these are the fast programmatic
 * guard.
 */
import { visualFixtures } from '@/__tests__/fixtures/visual';
import { calculateBeamingGroups } from '@/engines/layout/beaming';
import { calculateTupletBrackets } from '@/engines/layout/tuplets';
import type { ScoreEvent, Staff } from '@/types';

const tupletFixtures = visualFixtures.filter((f) => f.feature === 'Tuplets');

// Evenly-spaced x positions keyed by event id. The actual x-values don't affect a bracket's NUMBER
// or the beam GROUPING (which key off beats/rests), only slope — irrelevant to these oracles.
const posOf = (events: ScoreEvent[]): Record<string, number> => {
  const p: Record<string, number> = {};
  events.forEach((e, i) => (p[e.id] = 50 + i * 40));
  return p;
};
const ratiosIn = (events: ScoreEvent[]) =>
  new Set(events.filter((e) => e.tuplet).map((e) => e.tuplet!.ratio[0]));

const bracketsFor = (events: ScoreEvent[], clef: Staff['clef']) => {
  const pos = posOf(events);
  const beams = calculateBeamingGroups(events, pos, clef);
  return { beams, brackets: calculateTupletBrackets(events, pos, clef, beams) };
};

describe('Tuplet fixture oracles (#252 / #245 re-scope)', () => {
  it('the corpus carries the expanded tuplet set', () => {
    expect(tupletFixtures.length).toBeGreaterThanOrEqual(25);
  });

  // ORACLE 1 — every rendered bracket's number equals a tuplet group's ratio[0] present in the bar.
  // For a non-triplet bar (e.g. quintuplet) the only ratio is 5, so a bracket wrongly showing "3"
  // would fail. Also asserts a bracket is actually produced for every tuplet bar.
  test.each(tupletFixtures.map((f) => [f.name, f] as const))(
    '%s: bracket numbers match the tuplet ratio (never silently 3)',
    (_n, f) => {
      f.score.staves.forEach((staff: Staff) => {
        staff.measures.forEach((m) => {
          if (!m.events.some((e) => e.tuplet)) return;
          const { brackets } = bracketsFor(m.events, staff.clef);
          const ratios = ratiosIn(m.events);
          expect(brackets.length).toBeGreaterThan(0);
          brackets.forEach((b) => expect(ratios.has(b.number)).toBe(true));
        });
      });
    }
  );

  // ORACLE 2 — the non-triplet ratios display their exact number (the #245 re-scope evidence).
  const exactNumber: Record<string, number> = {
    'tuplet-duplet-6-8': 2,
    'tuplet-quadruplet-6-8': 4,
    'tuplet-quintuplet': 5,
    'tuplet-quintuplet-sixteenth': 5,
    'tuplet-quintuplet-quarter': 5,
    'tuplet-quintuplet-with-rest': 5,
    'tuplet-quintuplet-chords': 5,
    'tuplet-quintuplet-stems-down': 5,
    'tuplet-sextuplet': 6,
    'tuplet-sextuplet-sixteenth': 6,
    'tuplet-septuplet': 7,
  };
  test.each(Object.entries(exactNumber))('%s: bracket shows the number %d', (name, n) => {
    const f = tupletFixtures.find((x) => x.name === name);
    expect(f).toBeDefined();
    const staff = f!.score.staves[0];
    const { brackets } = bracketsFor(staff.measures[0].events, staff.clef);
    expect(brackets.some((b) => b.number === n)).toBe(true);
  });

  // ORACLE 3 — a tuplet with an interior rest must beam AROUND the rest, not across it.
  it('tuplet-quintuplet-with-rest beams around the interior rest (split groups)', () => {
    const f = tupletFixtures.find((x) => x.name === 'tuplet-quintuplet-with-rest');
    expect(f).toBeDefined();
    const staff = f!.score.staves[0];
    const { beams } = bracketsFor(staff.measures[0].events, staff.clef);
    // members are [note, note, rest, note, note] — the rest breaks the beam into 2 groups.
    expect(beams.length).toBeGreaterThanOrEqual(2);
  });
});
