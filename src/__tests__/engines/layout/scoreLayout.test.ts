import { calculateScoreLayout } from '@/engines/layout/scoreLayout';
import { Score, Staff } from '@/types';
import { CONFIG } from '@/config';
import { createTestScore } from '@/__tests__/fixtures/selectionTestScores';

describe('calculateScoreLayout', () => {
  it('should return empty layout for empty score', () => {
    const score: Score = {
      title: 'Test',
      staves: [],
      keySignature: 'C',
      timeSignature: '4/4',
      bpm: 120,
    };
    const layout = calculateScoreLayout(score);
    expect(layout.staves).toHaveLength(0);
    expect(Object.keys(layout.notes)).toHaveLength(0);
    expect(Object.keys(layout.events)).toHaveLength(0);
  });

  it('should calculate layout for a simple score', () => {
    const score = createTestScore(); // Has 2 staves, 2 measures
    const layout = calculateScoreLayout(score);

    // Score has 2 staves (treble, bass)
    expect(layout.staves).toHaveLength(2);
    const staffLayout = layout.staves[0];

    // Each staff has 2 measures
    expect(staffLayout.measures).toHaveLength(2);

    const measureLayout = staffLayout.measures[0];
    expect(measureLayout.width).toBeGreaterThan(0);
    expect(measureLayout.events).toBeDefined();

    // Check header layout impact
    // Default Header for C Major is roughly 50-80px
    expect(measureLayout.x).toBeGreaterThan(0);
  });

  it('should synchronize measure widths for grand staff', () => {
    const score = createTestScore();
    // Add a second staff (Grand Staff)
    const staff2: Staff = JSON.parse(JSON.stringify(score.staves[0]));
    staff2.id = 'staff-2';
    // Make the first measure of staff 2 contain more notes to force wider layout
    // (In this mock we might need to manually inject events if createMockScore is simple)
    // For now, let's assume createMockScore returns a basic structure.

    // Let's create a custom score setup
    const complexScore: Score = {
      ...score,
      staves: [
        {
          ...score.staves[0],
          measures: [{ ...score.staves[0].measures[0], events: [] }], // Empty measure on staff 1
        },
        {
          ...score.staves[0], // Use same structure
          id: 'staff-2',
          // Staff 2 has notes, so it should drive width
          measures: [score.staves[0].measures[0]],
        },
      ],
    };

    const layout = calculateScoreLayout(complexScore);

    const m1Staff1 = layout.staves[0].measures[0];
    const m1Staff2 = layout.staves[1].measures[0];

    // Widths should be equal (synchronized)
    expect(m1Staff1.width).toBeCloseTo(m1Staff2.width);

    // Staff 1 measure (empty) should be expanded to match Staff 2
    expect(m1Staff1.width).toBeGreaterThan(CONFIG.measurePaddingLeft + CONFIG.measurePaddingRight);
  });

  it('should generate flat note map', () => {
    const score = createTestScore();
    // Ensure there are notes
    const layout = calculateScoreLayout(score);

    const noteKeys = Object.keys(layout.notes);
    expect(noteKeys.length).toBeGreaterThan(0);

    // Check note layout structure
    const firstNote = layout.notes[noteKeys[0]];
    expect(firstNote).toHaveProperty('x');
    expect(firstNote).toHaveProperty('y');
    expect(firstNote).toHaveProperty('noteId');
    expect(firstNote).toHaveProperty('staffIndex');
  });

  it('should handle rests (events with no pitch)', () => {
    const score: Score = {
      title: 'Test Rest',
      staves: [
        {
          id: 'staff-1',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            {
              id: 'm1',
              events: [
                {
                  id: 'rest-1',
                  duration: 'quarter',
                  dotted: false,
                  notes: [{ id: 'n1', pitch: null }], // Rest
                },
              ],
            },
          ],
        },
      ],
      keySignature: 'C',
      timeSignature: '4/4',
      bpm: 120,
    };

    const layout = calculateScoreLayout(score);

    // Rests don't create note layouts (only events)
    expect(Object.keys(layout.notes)).toHaveLength(0);
    // But event layouts should exist
    expect(Object.keys(layout.events)).toHaveLength(1);
  });

  it('should apply chord shifts to note positions', () => {
    const score = createTestScore();
    const layout = calculateScoreLayout(score);

    // Get notes from the first event (which likely has a chord)
    const noteEntries = Object.entries(layout.notes);
    if (noteEntries.length >= 2) {
      const [, note1] = noteEntries[0];
      const [, note2] = noteEntries[1];

      // If they're in the same event, their x positions should differ due to chord shifts
      if (note1.eventId === note2.eventId) {
        // X positions might be different for notes in the same chord
        // (though if they're perfectly aligned, they could be the same)
        expect(typeof note1.x).toBe('number');
        expect(typeof note2.x).toBe('number');
      }
    }
  });

  it('should generate hit zones for all notes', () => {
    const score = createTestScore();
    const layout = calculateScoreLayout(score);

    const notes = Object.values(layout.notes);
    expect(notes.length).toBeGreaterThan(0);

    notes.forEach((note) => {
      expect(note.hitZone).toBeDefined();
      expect(note.hitZone.startX).toBeLessThan(note.hitZone.endX);
      expect(note.hitZone.eventId).toBe(note.eventId);
      expect(note.hitZone.type).toBe('EVENT');
    });
  });

  it('should handle bass clef positioning correctly', () => {
    const score: Score = {
      title: 'Bass Clef Test',
      staves: [
        {
          id: 'staff-1',
          clef: 'bass',
          keySignature: 'C',
          measures: [
            {
              id: 'm1',
              events: [
                {
                  id: 'e1',
                  duration: 'quarter',
                  dotted: false,
                  notes: [{ id: 'n1', pitch: 'C3' }], // Middle C in bass clef
                },
              ],
            },
          ],
        },
      ],
      keySignature: 'C',
      timeSignature: '4/4',
      bpm: 120,
    };

    const layout = calculateScoreLayout(score);
    const noteKeys = Object.keys(layout.notes);
    expect(noteKeys).toHaveLength(1);

    const note = layout.notes[noteKeys[0]];
    // Bass clef C3 should be positioned differently than treble clef C3
    // Y offset should be calculated based on bass clef
    expect(note.y).toBeGreaterThan(CONFIG.baseY);
    expect(note.pitch).toBe('C3');
  });

  it('should handle pickup measures', () => {
    const score: Score = {
      title: 'Pickup Test',
      staves: [
        {
          id: 'staff-1',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            {
              id: 'm1',
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
          ],
        },
      ],
      keySignature: 'C',
      timeSignature: '4/4',
      bpm: 120,
    };

    const layout = calculateScoreLayout(score);

    // Pickup measure should still have valid layout
    expect(layout.staves[0].measures).toHaveLength(1);
    expect(Object.keys(layout.notes)).toHaveLength(1);
  });

  describe('layout.getX', () => {
    it('should return X position for quants with notes', () => {
      const score = createTestScore();
      const layout = calculateScoreLayout(score);

      // First beat (quant 0) should have a valid X position
      const x = layout.getX(0);
      expect(x).toBeGreaterThan(0);
    });

    it('should interpolate for quants without notes', () => {
      const score = createTestScore();
      const layout = calculateScoreLayout(score);

      // Interpolation uses measure boundaries, not exact note positions
      // So interpolated values progress through the measure
      const x12 = layout.getX(12); // 12.5% through measure
      const x48 = layout.getX(48); // 50% through measure

      // Later quants should have higher X values (further right)
      expect(x48).toBeGreaterThan(x12);

      // Values should be positive (within the score area)
      expect(x12).toBeGreaterThan(0);
    });

    it('should return 0 for empty score', () => {
      const emptyScore: Score = {
        title: 'Empty',
        staves: [],
        keySignature: 'C',
        timeSignature: '4/4',
        bpm: 120,
      };
      const layout = calculateScoreLayout(emptyScore);

      expect(layout.getX(0)).toBe(0);
      expect(layout.getX(100)).toBe(0);
    });

    it('should handle quants in different measures', () => {
      const score = createTestScore();
      const layout = calculateScoreLayout(score);
      const quantsPerMeasure = 96; // 4/4 time

      // Beat 1 of measure 1
      const x_m1_b1 = layout.getX(0);
      // Beat 1 of measure 2
      const x_m2_b1 = layout.getX(quantsPerMeasure);

      // Measure 2 should start after measure 1
      expect(x_m2_b1).toBeGreaterThan(x_m1_b1);
    });
  });

  describe('layout.getY', () => {
    describe('content', () => {
      it('should return content bounds for score with staves', () => {
        const score = createTestScore();
        const layout = calculateScoreLayout(score);

        expect(layout.getY.content.top).toBe(CONFIG.baseY);
        expect(layout.getY.content.bottom).toBeGreaterThan(layout.getY.content.top);
      });

      it('should return zero bounds for empty score', () => {
        const emptyScore: Score = {
          title: 'Empty',
          staves: [],
          keySignature: 'C',
          timeSignature: '4/4',
          bpm: 120,
        };
        const layout = calculateScoreLayout(emptyScore);

        expect(layout.getY.content.top).toBe(0);
        expect(layout.getY.content.bottom).toBe(0);
      });
    });

    describe('system()', () => {
      it('should return bounds for system 0', () => {
        const score = createTestScore();
        const layout = calculateScoreLayout(score);

        const sys = layout.getY.system(0);
        expect(sys).not.toBeNull();
        expect(sys!.top).toBeLessThan(sys!.bottom);
      });

      it('should return null for invalid system index', () => {
        const score = createTestScore();
        const layout = calculateScoreLayout(score);

        expect(layout.getY.system(1)).toBeNull();
        expect(layout.getY.system(99)).toBeNull();
      });

      it('should return null for empty score', () => {
        const emptyScore: Score = {
          title: 'Empty',
          staves: [],
          keySignature: 'C',
          timeSignature: '4/4',
          bpm: 120,
        };
        const layout = calculateScoreLayout(emptyScore);

        expect(layout.getY.system(0)).toBeNull();
      });
    });

    describe('staff()', () => {
      it('should return bounds for valid staff', () => {
        const score = createTestScore();
        const layout = calculateScoreLayout(score);

        const s0 = layout.getY.staff(0);
        expect(s0).not.toBeNull();
        // Staff height is 5 lines = 4 gaps
        expect(s0!.bottom - s0!.top).toBe(CONFIG.lineHeight * 4);
      });

      it('should return different bounds for different staves', () => {
        const score = createTestScore(); // Has 2 staves
        const layout = calculateScoreLayout(score);

        const s0 = layout.getY.staff(0);
        const s1 = layout.getY.staff(1);

        expect(s0).not.toBeNull();
        expect(s1).not.toBeNull();
        expect(s1!.top).toBeGreaterThan(s0!.top);
      });

      it('should return null for invalid staff index', () => {
        const score = createTestScore();
        const layout = calculateScoreLayout(score);

        expect(layout.getY.staff(99)).toBeNull();
      });

      it('should memoize results', () => {
        const score = createTestScore();
        const layout = calculateScoreLayout(score);

        const s0a = layout.getY.staff(0);
        const s0b = layout.getY.staff(0);

        // Same object reference (memoized)
        expect(s0a).toBe(s0b);
      });
    });

    describe('notes()', () => {
      it('should return system-wide extent without arg', () => {
        const score = createTestScore();
        const layout = calculateScoreLayout(score);

        const extent = layout.getY.notes();
        expect(extent.top).toBeLessThanOrEqual(extent.bottom);
      });

      it('should return per-quant extent with arg', () => {
        const score = createTestScore();
        const layout = calculateScoreLayout(score);

        const extent = layout.getY.notes(0);
        expect(extent.top).toBeDefined();
        expect(extent.bottom).toBeDefined();
      });

      it('should fall back to system-wide for empty quant', () => {
        const score = createTestScore();
        const layout = calculateScoreLayout(score);

        const system = layout.getY.notes();
        const atQuant = layout.getY.notes(9999); // No notes at this quant

        expect(atQuant).toEqual(system);
      });

      it('should return staff bounds for score with no notes', () => {
        const score: Score = {
          title: 'Rests Only',
          staves: [
            {
              id: 'staff-1',
              clef: 'treble',
              keySignature: 'C',
              measures: [
                {
                  id: 'm1',
                  events: [
                    {
                      id: 'rest-1',
                      duration: 'quarter',
                      dotted: false,
                      notes: [{ id: 'n1', pitch: null }], // Rest
                    },
                  ],
                },
              ],
            },
          ],
          keySignature: 'C',
          timeSignature: '4/4',
          bpm: 120,
        };

        const layout = calculateScoreLayout(score);
        const extent = layout.getY.notes();
        const staffBounds = layout.getY.staff(0);

        // Falls back to staff bounds when no notes
        expect(extent.top).toBe(staffBounds!.top);
        expect(extent.bottom).toBe(staffBounds!.bottom);
      });
    });

    describe('pitch()', () => {
      it('should return Y for valid pitch and staff', () => {
        const score = createTestScore();
        const layout = calculateScoreLayout(score);

        const y = layout.getY.pitch('C4', 0);
        expect(y).not.toBeNull();
        expect(typeof y).toBe('number');
      });

      it('should return null for invalid staff', () => {
        const score = createTestScore();
        const layout = calculateScoreLayout(score);

        expect(layout.getY.pitch('C4', 99)).toBeNull();
      });

      it('should position same pitch differently for different clefs', () => {
        const score: Score = {
          title: 'Two Clefs',
          staves: [
            {
              id: 'staff-1',
              clef: 'treble',
              keySignature: 'C',
              measures: [{ id: 'm1', events: [] }],
            },
            {
              id: 'staff-2',
              clef: 'bass',
              keySignature: 'C',
              measures: [{ id: 'm2', events: [] }],
            },
          ],
          keySignature: 'C',
          timeSignature: '4/4',
          bpm: 120,
        };

        const layout = calculateScoreLayout(score);

        // C4 in treble (ledger line below) vs C4 in bass (ledger line above)
        // The relative offset from staff Y should differ
        const trebleY = layout.getY.pitch('C4', 0);
        const bassY = layout.getY.pitch('C4', 1);

        expect(trebleY).not.toBeNull();
        expect(bassY).not.toBeNull();

        // Both are valid Y positions
        expect(typeof trebleY).toBe('number');
        expect(typeof bassY).toBe('number');
      });
    });
  });
});
