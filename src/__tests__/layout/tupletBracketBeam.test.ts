/**
 * Tuplet bracket vs beam geometry (issue #252 eyeball pass).
 *
 * Regression: a beamed tuplet's bracket recomputed its own slope from noteheads + a fixed
 * default stem length and clamped it with TUPLET.MAX_SLOPE (0.5) — different from the beam,
 * which uses per-note stem lengths and BEAMING.MAX_SLOPE (1.0). So the bracket and the beam
 * it sits over visibly diverged in angle.
 *
 * Fix: the bracket derives each event's stem tip from its actual beam line (when beamed),
 * builds the bracket from the real first/last tips, and the clamps now match — so a bracket
 * over a single beam runs PARALLEL to it. This is verified render-free against the layout
 * functions (no font metrics needed).
 */

import { calculateBeamingGroups } from '@/engines/layout/beaming';
import { calculateTupletBrackets } from '@/engines/layout/tuplets';
import type { ScoreEvent } from '@/types';

const slope = (g: { startX: number; endX: number; startY: number; endY: number }) =>
  (g.endY - g.startY) / (g.endX - g.startX);

// Three eighth-note triplet events (one beam spans them). chordLayout.direction is set so
// the bracket side matches the beam side, as the real layout pipeline guarantees.
const tripletEvents = (pitches: string[], direction: 'up' | 'down' = 'up'): ScoreEvent[] =>
  pitches.map((pitch, i) => ({
    id: `e${i}`,
    duration: 'eighth',
    dotted: false,
    notes: [{ id: `n${i}`, pitch }],
    tuplet: { ratio: [3, 2], groupSize: 3, position: i },
    // chordLayout is attached by the layout pipeline, not part of the base ScoreEvent type;
    // the bracket reads its direction, so set it to mirror the beamed group's stem side.
    chordLayout: { direction } as any,
  }));

const positions = { e0: 50, e1: 95, e2: 140 };

describe('tuplet bracket runs parallel to the beam (#252)', () => {
  it('an ascending beamed triplet: bracket slope ≈ beam slope', () => {
    const events = tripletEvents(['C4', 'E4', 'G4']); // ascending ⇒ sloped beam
    const beams = calculateBeamingGroups(events, positions, 'treble');
    const brackets = calculateTupletBrackets(events, positions, 'treble', beams);

    expect(beams).toHaveLength(1); // the triplet beams as one group
    expect(brackets).toHaveLength(1);

    const beamSlope = slope(beams[0]);
    const bracketSlope = slope(brackets[0]);

    expect(beamSlope).not.toBe(0); // the test is meaningful only if the beam actually slopes
    // Parallel: the bracket tracks the beam's angle (small tolerance for end-extension).
    expect(Math.abs(bracketSlope - beamSlope)).toBeLessThan(0.08);
  });

  it('a descending beamed triplet: bracket follows the beam the other way', () => {
    const events = tripletEvents(['G4', 'E4', 'C4']); // descending ⇒ opposite slope
    const beams = calculateBeamingGroups(events, positions, 'treble');
    const brackets = calculateTupletBrackets(events, positions, 'treble', beams);

    const beamSlope = slope(beams[0]);
    const bracketSlope = slope(brackets[0]);

    expect(Math.sign(bracketSlope)).toBe(Math.sign(beamSlope)); // same direction
    expect(Math.abs(bracketSlope - beamSlope)).toBeLessThan(0.08);
  });

  it('a high triplet (stems down, beam below): bracket parallels the beam on the down side', () => {
    const events = tripletEvents(['A5', 'F5', 'D5'], 'down'); // high ⇒ stems down, beam below
    const beams = calculateBeamingGroups(events, positions, 'treble');
    const brackets = calculateTupletBrackets(events, positions, 'treble', beams);

    expect(beams[0].direction).toBe('down');
    expect(brackets[0].direction).toBe('down');
    const beamSlope = slope(beams[0]);
    const bracketSlope = slope(brackets[0]);
    expect(Math.abs(bracketSlope - beamSlope)).toBeLessThan(0.08);
    // The bracket sits BELOW the beam (larger y) on the down side.
    expect(brackets[0].startY).toBeGreaterThan(beams[0].startY);
  });

  it('without beam info the bracket still renders (unbeamed fallback is intact)', () => {
    const events = tripletEvents(['C4', 'E4', 'G4']);
    const brackets = calculateTupletBrackets(events, positions, 'treble'); // no beams passed
    expect(brackets).toHaveLength(1);
    expect(Number.isFinite(slope(brackets[0]))).toBe(true);
  });
});
