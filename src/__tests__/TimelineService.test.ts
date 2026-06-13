/**
 * TimelineService Tests
 *
 * Tests for audio playback timeline generation.
 * Covers: timing, ties, pickup measures, grand staff sync, quant.
 *
 * @see TimelineService
 */

import { createTimeline } from '@/services/TimelineService';
import type { Score, ScoreEvent } from '@/types';

describe('TimelineService', () => {
  const mockScore: Score = {
    title: 'Test Score',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      {
        id: 'staff-1',
        clef: 'treble' as const,
        keySignature: 'C',
        measures: [
          {
            id: '1',
            events: [
              {
                id: 'e1',
                duration: 'quarter',
                dotted: false,
                notes: [{ id: 'n1', pitch: 'C4', tied: false }],
              },
              {
                id: 'e2',
                duration: 'quarter',
                dotted: false,
                notes: [{ id: 'n2', pitch: 'D4', tied: false }],
              },
              {
                id: 'e3',
                duration: 'quarter',
                dotted: false,
                notes: [{ id: 'n3', pitch: 'E4', tied: false }],
              },
              {
                id: 'e4',
                duration: 'quarter',
                dotted: false,
                notes: [{ id: 'n4', pitch: 'F4', tied: false }],
              },
            ],
          },
        ],
      },
    ],
  };

  test('calculates correct timings for quarter notes', () => {
    const bpm = 60; // 1 beat per second
    const timeline = createTimeline(mockScore, bpm);

    expect(timeline).toHaveLength(4);
    expect(timeline[0].time).toBeCloseTo(0);
    expect(timeline[0].duration).toBeCloseTo(1.0);

    expect(timeline[1].time).toBeCloseTo(1.0);
    expect(timeline[2].time).toBeCloseTo(2.0);
    expect(timeline[3].time).toBeCloseTo(3.0);
  });

  test('handles tied notes across events', () => {
    const tiedScore: Score = {
      ...mockScore,
      staves: [
        {
          id: 'staff-1',
          clef: 'treble' as const,
          keySignature: 'C',
          measures: [
            {
              id: '1',
              events: [
                {
                  id: 'e1',
                  duration: 'quarter',
                  dotted: false,
                  notes: [{ id: 'n1', pitch: 'C4', tied: true }],
                },
                {
                  id: 'e2',
                  duration: 'quarter',
                  dotted: false,
                  notes: [{ id: 'n2', pitch: 'C4', tied: false }],
                },
              ],
            },
          ],
        },
      ],
    };

    const bpm = 60;
    const timeline = createTimeline(tiedScore, bpm);

    // Should merge into 1 event of 2 seconds
    expect(timeline).toHaveLength(1);
    expect(timeline[0].duration).toBeCloseTo(2.0);
    expect(timeline[0].time).toBeCloseTo(0);
  });

  test('handles pickup measures', () => {
    const pickupScore: Score = {
      ...mockScore,
      staves: [
        {
          id: 'staff-1',
          clef: 'treble' as const,
          keySignature: 'C',
          measures: [
            {
              id: '1',
              isPickup: true,
              events: [
                {
                  id: 'e1',
                  duration: 'quarter',
                  dotted: false,
                  notes: [{ id: 'n1', pitch: 'C4' }],
                },
              ],
            },
            {
              id: '2',
              events: [
                {
                  id: 'e2',
                  duration: 'quarter',
                  dotted: false,
                  notes: [{ id: 'n2', pitch: 'D4' }],
                },
              ],
            },
          ],
        },
      ],
    };

    const bpm = 60;
    const timeline = createTimeline(pickupScore, bpm);

    expect(timeline).toHaveLength(2);
    // Signup measure: event at 0, dur 1.0 (assuming currentGlobalTime starts at 0 for playback)
    // Measure 2 starts at 1.0

    expect(timeline[0].time).toBeCloseTo(0);
    expect(timeline[1].time).toBeCloseTo(1.0);
  });

  test('handles Grand Staff synchronization', () => {
    const grandScore: Score = {
      ...mockScore,
      staves: [
        {
          id: 'staff-1',
          clef: 'treble' as const,
          keySignature: 'C',
          measures: [
            {
              id: 'm1',
              events: [
                { id: 'e1', duration: 'half', dotted: false, notes: [{ id: 's1n1', pitch: 'C4' }] },
              ],
            },
          ],
        },
        {
          id: 'staff-2',
          clef: 'bass' as const,
          keySignature: 'C',
          measures: [
            {
              id: 'm1_bass',
              events: [
                {
                  id: 'e2',
                  duration: 'quarter',
                  dotted: false,
                  notes: [{ id: 's2n1', pitch: 'C3' }],
                },
                {
                  id: 'e3',
                  duration: 'quarter',
                  dotted: false,
                  notes: [{ id: 's2n2', pitch: 'G3' }],
                },
              ],
            },
          ],
        },
      ],
    };

    const bpm = 60;
    const timeline = createTimeline(grandScore, bpm);

    expect(timeline).toHaveLength(3);

    // Sorted by time:
    // 0.0: C4 (half, 2s) from staff 1
    // 0.0: C3 (quarter, 1s) from staff 2
    // 1.0: G3 (quarter, 1s) from staff 2

    const t0 = timeline.filter((t) => t.time === 0);
    expect(t0).toHaveLength(2);

    const t1 = timeline.filter((t) => t.time === 1.0);
    expect(t1).toHaveLength(1);
    expect(t1[0].frequency).toBeGreaterThan(0); // G3
  });

  test('handles cross-measure ties properly (adjacent)', () => {
    const adjacentScore: Score = {
      ...mockScore,
      timeSignature: '2/4', // Measures are 2 beats long (32 quants)
      staves: [
        {
          id: 'staff-1',
          clef: 'treble' as const,
          keySignature: 'C',
          measures: [
            {
              id: '1',
              events: [
                // Event 1: Quarter Note (0-1s)
                {
                  id: 'e1',
                  duration: 'quarter',
                  dotted: false,
                  notes: [{ id: 'n_pad', pitch: 'G4', tied: false }],
                },
                // Event 2: Quarter Note (1-2s). Ends at 2.0s. Tied.
                {
                  id: 'e2',
                  duration: 'quarter',
                  dotted: false,
                  notes: [{ id: 'n1', pitch: 'C4', tied: true }],
                },
              ],
            },
            {
              id: '2',
              events: [
                // Event 3: Quarter Note (starts at 2.0s). Tied target.
                {
                  id: 'e3',
                  duration: 'quarter',
                  dotted: false,
                  notes: [{ id: 'n2', pitch: 'C4', tied: false }],
                },
              ],
            },
          ],
        },
      ],
    };

    const bpm = 60;
    const timeline = createTimeline(adjacentScore, bpm);

    // Expected Timeline:
    // 1. G4 (0-1s)
    // 2. C4 (1-3s) [Merged Event 2 + Event 3]

    expect(timeline).toHaveLength(2);

    const g4 = timeline.find((e) => e.frequency > 300 && e.frequency < 400); // G4 ~392
    expect(g4).toBeDefined();

    const c4 = timeline.find((e) => e.frequency > 260 && e.frequency < 262); // C4 ~261.6
    expect(c4).toBeDefined();
    if (c4) {
      expect(c4.time).toBeCloseTo(1.0);
      expect(c4.duration).toBeCloseTo(2.0); // 1s (Meas 1) + 1s (Meas 2)
      expect(c4.quant).toBe(16); // Starts at 2nd beat of Measure 1
    }
  });

  test('populates quant correctly', () => {
    const bpm = 60;
    const timeline = createTimeline(mockScore, bpm);

    // mockScore is 4 quarters.
    // Q0: 0
    // Q1: 16 (1 beat = 16 quants)
    // Q2: 32
    // Q3: 48

    expect(timeline[0].quant).toBe(0);
    expect(timeline[1].quant).toBe(16);
    expect(timeline[2].quant).toBe(32);
    expect(timeline[3].quant).toBe(48);
  });

  // #261 — probe the playback lane against the tuplet / tie / reflow features the editor now supports.
  // Tie connectivity routes through the SSOT (`findTieTarget`), so these lock the contract that
  // playback can never disagree with render/export about what a tie connects to.
  describe('#261 tuplets / ties / reflow', () => {
    test('breaks a tie when the immediate next event is a rest (a rest is never a tie target)', () => {
      const score: Score = {
        ...mockScore,
        staves: [
          {
            id: 'staff-1',
            clef: 'treble' as const,
            keySignature: 'C',
            measures: [
              {
                id: '1',
                events: [
                  // C4 quarter, authored as tied...
                  {
                    id: 'e1',
                    duration: 'quarter',
                    dotted: false,
                    notes: [{ id: 'n1', pitch: 'C4', tied: true }],
                  },
                  // ...but the immediate next event is a rest — the tie must NOT connect across it.
                  {
                    id: 'e2',
                    duration: 'quarter',
                    dotted: false,
                    isRest: true,
                    notes: [{ id: 'n2', pitch: null, isRest: true }],
                  },
                  // A later same-pitch C4 is a separate sound, never merged into the first.
                  {
                    id: 'e3',
                    duration: 'quarter',
                    dotted: false,
                    notes: [{ id: 'n3', pitch: 'C4', tied: false }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const timeline = createTimeline(score, 60); // 1 beat = 1s
      const c4 = timeline.filter((e) => e.pitch === 'C4');
      expect(c4).toHaveLength(2);
      expect(c4[0].time).toBeCloseTo(0);
      expect(c4[0].duration).toBeCloseTo(1.0); // NOT merged into a 2s note
      expect(c4[1].time).toBeCloseTo(2.0);
      expect(c4[1].duration).toBeCloseTo(1.0);
    });

    test('merges a tie between two members of the same tuplet group', () => {
      const trip = (id: string, pitch: string, tied: boolean): ScoreEvent => ({
        id,
        duration: 'quarter',
        dotted: false,
        tuplet: { ratio: [3, 2], groupSize: 3, position: 0, baseDuration: 'quarter', id: 'T' },
        notes: [{ id: `${id}n`, pitch, tied }],
      });
      const score: Score = {
        ...mockScore,
        staves: [
          {
            id: 'staff-1',
            clef: 'treble' as const,
            keySignature: 'C',
            measures: [{ id: '1', events: [trip('e1', 'C4', true), trip('e2', 'C4', false), trip('e3', 'E4', false)] }],
          },
        ],
      };

      const timeline = createTimeline(score, 120);
      // quarter-triplet member = 16 * 2/3 quants; secondsPerQuant @120bpm = (60/120)/16 = 0.03125.
      const memberSeconds = ((16 * 2) / 3) * 0.03125;
      const c4 = timeline.filter((e) => e.pitch === 'C4');
      expect(c4).toHaveLength(1);
      expect(c4[0].duration).toBeCloseTo(memberSeconds * 2, 5); // two members merged
      const e4 = timeline.filter((e) => e.pitch === 'E4');
      expect(e4).toHaveLength(1);
      expect(e4[0].duration).toBeCloseTo(memberSeconds, 5);
    });

    test('cross-barline tie out of an under-full bar merges to the tied-to note grid end (SSOT, not adjacency)', () => {
      // The discriminator between the SSOT routing and the old float time-adjacency merge: a tied C4
      // as the LAST event of an under-full 4/4 bar (it does not fill the bar) ties across the barline
      // to a same-pitch C4 at the start of the next bar. The old adjacency code saw a 3s gap (bar 2
      // starts at 4s, the tied note ends at 1s) and refused to merge; findTieTarget crosses the
      // barline by event adjacency and merges. The merged span runs to the tied-to note's grid end.
      const score: Score = {
        ...mockScore,
        timeSignature: '4/4',
        staves: [
          {
            id: 'staff-1',
            clef: 'treble' as const,
            keySignature: 'C',
            measures: [
              { id: 'm1', events: [{ id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch: 'C4', tied: true }] }] },
              { id: 'm2', events: [{ id: 'e2', duration: 'quarter', dotted: false, notes: [{ id: 'n2', pitch: 'C4', tied: false }] }] },
            ],
          },
        ],
      };

      const timeline = createTimeline(score, 60); // 1 beat = 1s; 4/4 bar = 4s
      const c4 = timeline.filter((e) => e.pitch === 'C4');
      expect(c4).toHaveLength(1); // merged across the barline via the SSOT
      expect(c4[0].time).toBeCloseTo(0);
      // Span runs to bar 2's note end (5s), NOT a naive 1+1=2s — the under-full gap doesn't collapse.
      expect(c4[0].duration).toBeCloseTo(5.0);
    });

    test('places bars on a meter-aware grid, not a hardcoded 4/4 one (reflow dimension)', () => {
      // Two full 3/4 bars: the second bar must start at 3 beats, proving the timeline tracks the
      // re-barred meter (#254) rather than assuming a 4/4 bar length.
      const bar = (id: string, p1: string, p2: string, p3: string) => ({
        id,
        events: [p1, p2, p3].map((pitch, i) => ({
          id: `${id}e${i}`,
          duration: 'quarter',
          dotted: false,
          notes: [{ id: `${id}n${i}`, pitch }],
        })),
      });
      const score: Score = {
        ...mockScore,
        timeSignature: '3/4',
        staves: [
          {
            id: 'staff-1',
            clef: 'treble' as const,
            keySignature: 'C',
            measures: [bar('m1', 'C4', 'D4', 'E4'), bar('m2', 'F4', 'G4', 'A4')],
          },
        ],
      };

      const timeline = createTimeline(score, 60); // 1 beat = 1s
      const f4 = timeline.find((e) => e.pitch === 'F4'); // first note of bar 2
      expect(f4).toBeDefined();
      expect(f4!.time).toBeCloseTo(3.0); // 3/4 bar => bar 2 at 3s, not 4s
    });
  });
});
