/**
 * Tuplet bracket side follows the BEAM side.
 *
 * Regression (visual fixture `tuplet-mixed-stems`, a G4–B4–D5 eighth triplet in 4/4): the group
 * straddles the middle line, so the beam takes the stems DOWN (`beamGroupDirection`: equidistant
 * extremes, mean on the line ⇒ down) and the renderer draws every beamed stem on the beam's side.
 * The bracket, however, voted its side from each event's own `chordLayout.direction` — the
 * direction the measure layout attaches without knowing about the beam — and drew the bracket and
 * its "3" ABOVE the notes while the beam ran BELOW them.
 *
 * Engraving convention: a beamed tuplet's bracket sits on the beam side. Fix: an event covered by a
 * beam group votes with that group's direction (exactly what the renderer does for its stem);
 * unbeamed events keep voting with their own direction, so unbeamed tuplets are unchanged.
 * Render-free: verified against the layout functions.
 */

import { calculateBeamingGroups } from '@/engines/layout/beaming';
import { calculateMeasureLayout } from '@/engines/layout/measure';
import { calculateTupletBrackets } from '@/engines/layout/tuplets';
import { fixtureByName } from '@/__tests__/fixtures/visual';
import type { ScoreEvent } from '@/types';

/**
 * Triplet events whose attached chordLayout.direction is set deliberately, standing in for the
 * layout pipeline (which attaches it without consulting the beam).
 */
const triplet = (
  pitches: string[],
  duration: ScoreEvent['duration'],
  chordDirection: 'up' | 'down'
): ScoreEvent[] =>
  pitches.map((pitch, i) => ({
    id: `e${i}`,
    duration,
    dotted: false,
    notes: [{ id: `n${i}`, pitch }],
    tuplet: { ratio: [3, 2], groupSize: 3, position: i },
    chordLayout: { direction: chordDirection } as any,
  }));

const positions = { e0: 50, e1: 95, e2: 140 };

describe('tuplet bracket sits on the beam side', () => {
  it('G4–B4–D5 beamed triplet: the beam goes down, so the bracket goes down too', () => {
    // Every member says "up" on its own; the beam, which owns the stems, says "down".
    const events = triplet(['G4', 'B4', 'D5'], 'eighth', 'up');
    const beams = calculateBeamingGroups(events, positions, 'treble');
    const brackets = calculateTupletBrackets(events, positions, 'treble', beams);

    expect(beams).toHaveLength(1);
    expect(beams[0].direction).toBe('down');
    expect(brackets).toHaveLength(1);
    expect(brackets[0].direction).toBe(beams[0].direction);
    // …and it clears the beam on that side (below ⇒ larger y).
    expect(brackets[0].startY).toBeGreaterThan(beams[0].startY);
    expect(brackets[0].endY).toBeGreaterThan(beams[0].endY);
  });

  it('the mirror case: a beam that goes up pulls a "down"-voting group\'s bracket up', () => {
    const events = triplet(['E4', 'C4', 'A3'], 'eighth', 'down'); // low ⇒ beam up
    const beams = calculateBeamingGroups(events, positions, 'treble');
    const brackets = calculateTupletBrackets(events, positions, 'treble', beams);

    expect(beams[0].direction).toBe('up');
    expect(brackets[0].direction).toBe('up');
    expect(brackets[0].startY).toBeLessThan(beams[0].startY); // above ⇒ smaller y
  });

  it('the real fixture through the measure layout: tuplet-mixed-stems bracket = beam side', () => {
    const staff = fixtureByName('tuplet-mixed-stems').score.staves[0];
    const measure = staff.measures[0];
    // Same wiring as scoreLayout: beams from the raw events, brackets from the processed ones.
    const layout = calculateMeasureLayout(measure.events, undefined, staff.clef);
    const beams = calculateBeamingGroups(measure.events, layout.eventPositions, staff.clef, '4/4');
    const brackets = calculateTupletBrackets(
      layout.processedEvents,
      layout.eventPositions,
      staff.clef,
      beams
    );

    const beam = beams.find((b) => b.ids.includes(measure.events[0].id));
    expect(beam).toBeDefined();
    expect(beam!.direction).toBe('down');
    expect(brackets).toHaveLength(1);
    expect(brackets[0].direction).toBe(beam!.direction);
  });

  it('a tuplet inside a longer beam follows that beam (tuplet-triplets-6-8, third bracket)', () => {
    const staff = fixtureByName('tuplet-triplets-6-8').score.staves[0];
    const measure = staff.measures[0];
    const layout = calculateMeasureLayout(measure.events, undefined, staff.clef);
    const beams = calculateBeamingGroups(measure.events, layout.eventPositions, staff.clef, '6/8');
    const brackets = calculateTupletBrackets(
      layout.processedEvents,
      layout.eventPositions,
      staff.clef,
      beams
    );

    const starts = measure.events.filter((e) => e.tuplet?.position === 0);
    expect(brackets).toHaveLength(starts.length);
    starts.forEach((start, i) => {
      const beam = beams.find((b) => b.ids.includes(start.id));
      expect(beam).toBeDefined();
      expect(brackets[i].direction).toBe(beam!.direction);
    });
    // Today the nine eighths share one up-stemmed beam (C4 is the farthest note from the middle
    // line), so the third triplet (B4–C5–D5), which votes "down" on its own, brackets above.
    expect(brackets[2].direction).toBe('up');
  });

  it('an unbeamed tuplet keeps the per-event rule (majority of its own stem directions)', () => {
    const up = triplet(['C4', 'E4', 'G4'], 'quarter', 'up');
    const down = triplet(['A5', 'F5', 'D5'], 'quarter', 'down');
    expect(calculateBeamingGroups(up, positions, 'treble')).toHaveLength(0); // quarters never beam
    expect(calculateTupletBrackets(up, positions, 'treble', [])[0].direction).toBe('up');
    expect(calculateTupletBrackets(down, positions, 'treble', [])[0].direction).toBe('down');
  });
});
