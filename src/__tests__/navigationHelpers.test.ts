/**
 * Navigation Helper Tests
 *
 * Tests for keyboard navigation helper functions.
 * Covers: pitch defaults, quant position, note selection, duration adjustment.
 *
 * @see getDefaultPitchForClef
 * @see calculateVerticalNavigation
 */

import {
  getDefaultPitchForClef,
  findEventAtQuantPosition,
  selectNoteInEventByDirection,
  getAdjustedDuration,
  calculateVerticalNavigation,
  calculateCrossStaffSelection,
} from '@/utils/interaction';

describe('Navigation Helper Functions', () => {
  describe('getDefaultPitchForClef', () => {
    test('returns C4 for treble clef', () => {
      expect(getDefaultPitchForClef('treble')).toBe('C4');
    });

    test('returns C3 for bass clef', () => {
      expect(getDefaultPitchForClef('bass')).toBe('C3');
    });

    test('returns C4 for unknown clef (defaults to treble)', () => {
      expect(getDefaultPitchForClef('alto')).toBe('C4');
    });
  });

  describe('findEventAtQuantPosition', () => {
    // Quant values: quarter=16, half=32
    // First event (e1): quants 0-15 (quarter note)
    // Second event (e2): quants 16-31 (quarter note)
    // Third event (e3): quants 32-63 (half note)
    const measure = {
      id: 'measure1',
      events: [
        { id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
        { id: 'e2', duration: 'quarter', dotted: false, notes: [{ id: 'n2', pitch: 'D4' }] },
        { id: 'e3', duration: 'half', dotted: false, notes: [{ id: 'n3', pitch: 'E4' }] },
      ],
    };

    test('returns null for empty measure', () => {
      expect(findEventAtQuantPosition({ id: 'empty', events: [] }, 0)).toBeNull();
    });

    test('returns null for null measure', () => {
      expect(findEventAtQuantPosition(null, 0)).toBeNull();
    });

    test('finds event at position 0 (first event)', () => {
      const result = findEventAtQuantPosition(measure, 0);
      expect(result?.id).toBe('e1');
    });

    test('finds event at position 8 (middle of first quarter note)', () => {
      const result = findEventAtQuantPosition(measure, 8);
      expect(result?.id).toBe('e1');
    });

    test('finds event at position 16 (second event starts)', () => {
      const result = findEventAtQuantPosition(measure, 16);
      expect(result?.id).toBe('e2');
    });

    test('finds event at position 32 (third event starts)', () => {
      const result = findEventAtQuantPosition(measure, 32);
      expect(result?.id).toBe('e3');
    });

    test('finds event at position 48 (middle of half note)', () => {
      const result = findEventAtQuantPosition(measure, 48);
      expect(result?.id).toBe('e3');
    });

    test('returns null for position beyond measure events', () => {
      // Total: 16 + 16 + 32 = 64 quants
      const result = findEventAtQuantPosition(measure, 70);
      expect(result).toBeNull();
    });
  });

  describe('selectNoteInEventByDirection', () => {
    const chordEvent = {
      id: 'e1',
      duration: 'quarter',
      dotted: false,
      isRest: false,
      notes: [
        { id: 'n1', pitch: 'E4' },
        { id: 'n2', pitch: 'C4' },
        { id: 'n3', pitch: 'G4' },
      ],
    };

    test('returns null for event with no notes', () => {
      expect(
        selectNoteInEventByDirection(
          { id: 'e1', duration: 'quarter', dotted: false, notes: [] },
          'up'
        )
      ).toBeNull();
    });

    test('returns null for null event', () => {
      expect(selectNoteInEventByDirection(null, 'up')).toBeNull();
    });

    test('returns null for rest event', () => {
      const restEvent = {
        id: 'e1',
        duration: 'quarter',
        dotted: false,
        isRest: true,
        notes: [{ id: 'n1', pitch: 'B4' }],
      };
      expect(selectNoteInEventByDirection(restEvent, 'up')).toBeNull();
    });

    test('returns lowest note ID when direction is up', () => {
      // C4 is lowest, sorted: C4, E4, G4
      const result = selectNoteInEventByDirection(chordEvent, 'up');
      expect(result).toBe('n2'); // C4
    });

    test('returns highest note ID when direction is down', () => {
      // G4 is highest
      const result = selectNoteInEventByDirection(chordEvent, 'down');
      expect(result).toBe('n3'); // G4
    });

    test('handles single note event', () => {
      const singleNoteEvent = {
        id: 'e1',
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'n1', pitch: 'C4' }],
      };
      expect(selectNoteInEventByDirection(singleNoteEvent, 'up')).toBe('n1');
      expect(selectNoteInEventByDirection(singleNoteEvent, 'down')).toBe('n1');
    });
  });

  describe('getAdjustedDuration', () => {
    // Quant values: quarter=16, half=32, whole=64
    // Dotted: quarter=24, half=48, whole=96

    test('returns requested duration if it fits', () => {
      // 32 quants available, quarter (16) fits
      const result = getAdjustedDuration(32, 'quarter', false);
      expect(result).toEqual({ duration: 'quarter', dotted: false });
    });

    test('returns requested dotted duration if it fits', () => {
      // 24 quants available, dotted quarter (24) fits exactly
      const result = getAdjustedDuration(24, 'quarter', true);
      expect(result).toEqual({ duration: 'quarter', dotted: true });
    });

    test('returns null if no duration fits', () => {
      // Nothing fits in 0 quants
      const result = getAdjustedDuration(0, 'quarter', false);
      expect(result).toBeNull();
    });

    test('finds largest duration that fits when requested is too big', () => {
      // Only 8 quants available - eighth (8) fits
      const result = getAdjustedDuration(8, 'quarter', false);
      expect(result).toEqual({ duration: 'eighth', dotted: false });
    });

    test('prefers dotted version when both fit', () => {
      // 48 quants: dotted half (48) fits exactly
      const result = getAdjustedDuration(48, 'whole', false);
      expect(result).toEqual({ duration: 'half', dotted: true });
    });

    test('returns exact fit for full measure', () => {
      // 64 quants = whole note
      const result = getAdjustedDuration(64, 'whole', false);
      expect(result).toEqual({ duration: 'whole', dotted: false });
    });

    test('adjusts dotted request when it does not fit', () => {
      // Request dotted half (48) but only 32 quants available
      // Half (32) fits
      const result = getAdjustedDuration(32, 'half', true);
      expect(result).toEqual({ duration: 'half', dotted: false });
    });
  });
});

describe('calculateVerticalNavigation', () => {
  const createScore = (staves: any[]) => ({
    title: 'Test Score',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves,
  });

  const trebleStaff = {
    id: 'treble-staff',
    clef: 'treble' as const,
    keySignature: 'C',
    measures: [
      {
        id: 'm1-treble',
        events: [
          { id: 't1', duration: 'quarter', dotted: false, notes: [{ id: 'tn1', pitch: 'C5' }] },
          { id: 't2', duration: 'quarter', dotted: false, notes: [{ id: 'tn2', pitch: 'D5' }] },
        ],
      },
    ],
  };

  const bassStaff = {
    id: 'bass-staff',
    clef: 'bass' as const,
    keySignature: 'C',
    measures: [
      {
        id: 'm1-bass',
        events: [
          { id: 'b1', duration: 'half', dotted: false, notes: [{ id: 'bn1', pitch: 'C3' }] },
        ],
      },
    ],
  };

  const emptyBassStaff = {
    id: 'empty-bass-staff',
    clef: 'bass' as const,
    keySignature: 'C',
    measures: [{ id: 'm1-empty', events: [] }],
  };

  describe('cross-staff navigation from selected note', () => {
    test('navigates down from treble to bass staff', () => {
      const score = createScore([trebleStaff, bassStaff]);
      const selection = { staffIndex: 0, measureIndex: 0, eventId: 't1', noteId: 'tn1' };

      const result = calculateVerticalNavigation(score, selection, 'down', 'quarter', false, null);

      expect(result?.selection?.staffIndex).toBe(1);
      expect(result?.selection?.eventId).toBe('b1');
    });

    test('navigates up from bass to treble staff', () => {
      const score = createScore([trebleStaff, bassStaff]);
      const selection = { staffIndex: 1, measureIndex: 0, eventId: 'b1', noteId: 'bn1' };

      const result = calculateVerticalNavigation(score, selection, 'up', 'quarter', false, null);

      expect(result?.selection?.staffIndex).toBe(0);
      expect(result?.selection?.eventId).toBe('t1');
    });

    test('creates ghost cursor when target staff has no event at quant', () => {
      const score = createScore([trebleStaff, emptyBassStaff]);
      const selection = { staffIndex: 0, measureIndex: 0, eventId: 't1', noteId: 'tn1' };

      const result = calculateVerticalNavigation(score, selection, 'down', 'quarter', false, null);

      expect(result?.selection?.staffIndex).toBe(1);
      expect(result?.selection?.eventId).toBeNull();
      expect(result?.previewNote).toBeDefined();
      expect(result?.previewNote?.staffIndex).toBe(1);
    });
  });

  // #264 — cross-staff nav into an incomplete tuplet's free (reserved) space must surface a
  // tuplet-fill ghost (parity with horizontal #6), not land on a blank reserved slot or jump to
  // events[0]. Bass has a quarter-triplet [C3, E3, reserved]: members occupy quants 0–10.67,
  // 10.67–21.33, and the reserved free space is [21.33, 32). The treble source's 3rd event starts at
  // quant 24, which aligns into that free space.
  describe('#264 cross-staff tuplet-fill ghost', () => {
    const trip = (id: string, pitch: string | null, position: number, reserved = false) => ({
      id,
      duration: 'quarter',
      dotted: false,
      isRest: reserved,
      reserved,
      notes: reserved ? [{ id: `${id}n`, pitch: null, isRest: true }] : [{ id: `${id}n`, pitch }],
      tuplet: { ratio: [3, 2] as [number, number], groupSize: 3, position, baseDuration: 'quarter', id: 'BT' },
    });
    const bassTupletStaff = {
      id: 'bass-tuplet',
      clef: 'bass' as const,
      keySignature: 'C',
      measures: [
        { id: 'mb', events: [trip('bt0', 'C3', 0), trip('bt1', 'E3', 1), trip('btr', null, 2, true)] },
      ],
    };
    // 3rd event ('st2') starts at quant 24 (16 + 8), inside the bass tuplet's reserved free space.
    const sourceTrebleStaff = {
      id: 'treble-src',
      clef: 'treble' as const,
      keySignature: 'C',
      measures: [
        {
          id: 'mt',
          events: [
            { id: 'st0', duration: 'quarter', dotted: false, notes: [{ id: 'st0n', pitch: 'C5' }] },
            { id: 'st1', duration: 'eighth', dotted: false, notes: [{ id: 'st1n', pitch: 'D5' }] },
            { id: 'st2', duration: 'quarter', dotted: false, notes: [{ id: 'st2n', pitch: 'E5' }] },
          ],
        },
      ],
    };

    test('calculateCrossStaffSelection returns a fill ghost when the aligned quant is in tuplet free space', () => {
      const score = createScore([sourceTrebleStaff, bassTupletStaff]);
      const selection = { staffIndex: 0, measureIndex: 0, eventId: 'st2', noteId: 'st2n' };

      const result = calculateCrossStaffSelection(score, selection, 'down', 'quarter', false);

      expect(result?.selection?.staffIndex).toBe(1);
      expect(result?.selection?.eventId).toBeNull(); // a ghost, not a landed event
      expect(result?.selection?.measureIndex).toBeNull();
      expect(result?.previewNote?.mode).toBe('CHORD');
      expect(result?.previewNote?.eventId).toBe('btr'); // anchored to the reserved slot
    });

    test('calculateVerticalNavigation (selected note) returns a fill ghost, not events[0]', () => {
      const score = createScore([sourceTrebleStaff, bassTupletStaff]);
      const selection = { staffIndex: 0, measureIndex: 0, eventId: 'st2', noteId: 'st2n' };

      const result = calculateVerticalNavigation(score, selection, 'down', 'quarter', false, null);

      expect(result?.selection?.eventId).toBeNull();
      expect(result?.previewNote?.mode).toBe('CHORD');
      expect(result?.previewNote?.eventId).toBe('btr');
    });

    test('staff-cycle wrap (Cmd+Down from the last staff) into tuplet free space returns a fill ghost, not a blank slot', () => {
      // The tuplet is on the TOP staff; the source note is on the BOTTOM staff. Cmd+Down from the
      // bottom staff has no lower staff, so it WRAPS (cycles) to the top staff. That cycle path uses
      // findEventAtQuantPosition (not reserved-aware), so without the fix it would LAND on the blank
      // reserved slot — the exact thing #264 prevents. It must return a fill ghost instead.
      const topTuplet = { ...bassTupletStaff, id: 'top-tuplet', clef: 'treble' as const };
      const bottomSource = { ...sourceTrebleStaff, id: 'bottom-src', clef: 'bass' as const };
      const score = createScore([topTuplet, bottomSource]);
      const selection = { staffIndex: 1, measureIndex: 0, eventId: 'st2', noteId: 'st2n' };

      const result = calculateVerticalNavigation(score, selection, 'down', 'quarter', false, null);

      expect(result?.selection?.staffIndex).toBe(0);
      expect(result?.selection?.eventId).toBeNull(); // a ghost, never the blank reserved slot
      expect(result?.previewNote?.mode).toBe('CHORD');
      expect(result?.previewNote?.eventId).toBe('btr');
    });

    test('calculateVerticalNavigation (ghost cursor) returns a fill ghost, not events[0]', () => {
      const score = createScore([sourceTrebleStaff, bassTupletStaff]);
      const selection = { staffIndex: 0, measureIndex: null, eventId: null, noteId: null };
      const previewNote = {
        measureIndex: 0,
        staffIndex: 0,
        quant: 24, // aligns into the bass tuplet's reserved free space
        visualQuant: 24,
        pitch: 'E5',
        duration: 'quarter',
        dotted: false,
        mode: 'APPEND' as const,
        index: 2,
        isRest: false,
      };

      const result = calculateVerticalNavigation(score, selection, 'down', 'quarter', false, previewNote);

      // Before the fix this selected bt0 (events[0]); now it's a fill ghost anchored to the slot.
      expect(result?.selection?.eventId).toBeNull();
      expect(result?.previewNote?.mode).toBe('CHORD');
      expect(result?.previewNote?.eventId).toBe('btr');
    });
  });

  describe('cycling navigation at staff boundaries', () => {
    test('cycles from top staff to bottom staff when going up', () => {
      const score = createScore([trebleStaff, bassStaff]);
      const selection = { staffIndex: 0, measureIndex: 0, eventId: 't1', noteId: 'tn1' };

      // At top staff (0), going up should cycle to bottom staff (1)
      const result = calculateVerticalNavigation(score, selection, 'up', 'quarter', false, null);

      expect(result?.selection?.staffIndex).toBe(1);
    });

    test('cycles from bottom staff to top staff when going down', () => {
      const score = createScore([trebleStaff, bassStaff]);
      const selection = { staffIndex: 1, measureIndex: 0, eventId: 'b1', noteId: 'bn1' };

      // At bottom staff (1), going down should cycle to top staff (0)
      const result = calculateVerticalNavigation(score, selection, 'down', 'quarter', false, null);

      expect(result?.selection?.staffIndex).toBe(0);
    });

    test('returns null for single-staff score (cannot cycle)', () => {
      const score = createScore([trebleStaff]);
      const selection = { staffIndex: 0, measureIndex: 0, eventId: 't1', noteId: 'tn1' };

      const result = calculateVerticalNavigation(score, selection, 'up', 'quarter', false, null);

      expect(result).toBeNull();
    });
  });

  describe('ghost cursor vertical navigation', () => {
    test('moves ghost cursor from treble to bass staff', () => {
      const score = createScore([trebleStaff, bassStaff]);
      const selection = { staffIndex: 0, measureIndex: null, eventId: null, noteId: null };
      const previewNote = {
        measureIndex: 0,
        staffIndex: 0,
        quant: 0,
        visualQuant: 0,
        pitch: 'C5',
        duration: 'quarter',
        dotted: false,
        mode: 'APPEND' as const,
        index: 0,
        isRest: false,
      };

      const result = calculateVerticalNavigation(
        score,
        selection,
        'down',
        'quarter',
        false,
        previewNote
      );

      expect(result?.selection?.staffIndex).toBe(1);
      // Should find event at quant 0 in bass staff
      expect(result?.selection?.eventId).toBe('b1');
    });

    test('creates adjusted ghost cursor when moving to empty staff', () => {
      const score = createScore([trebleStaff, emptyBassStaff]);
      const selection = { staffIndex: 0, measureIndex: null, eventId: null, noteId: null };
      const previewNote = {
        measureIndex: 0,
        staffIndex: 0,
        quant: 0,
        visualQuant: 0,
        pitch: 'C5',
        duration: 'quarter',
        dotted: false,
        mode: 'APPEND' as const,
        index: 0,
        isRest: false,
      };

      const result = calculateVerticalNavigation(
        score,
        selection,
        'down',
        'quarter',
        false,
        previewNote
      );

      expect(result?.selection?.staffIndex).toBe(1);
      expect(result?.selection?.measureIndex).toBeNull(); // Ghost cursor state
      expect(result?.previewNote?.staffIndex).toBe(1);
      expect(result?.previewNote?.duration).toBeDefined();
    });
  });

  describe('chord navigation', () => {
    const chordStaff = {
      id: 'chord-staff',
      clef: 'treble' as const,
      keySignature: 'C',
      measures: [
        {
          id: 'm1-chord',
          events: [
            {
              id: 'c1',
              duration: 'quarter',
              dotted: false,
              notes: [
                { id: 'cn1', pitch: 'C4' },
                { id: 'cn2', pitch: 'E4' },
                { id: 'cn3', pitch: 'G4' },
              ],
            },
          ],
        },
      ],
    };

    test('navigates up within chord from lowest note', () => {
      const score = createScore([chordStaff]);
      const selection = { staffIndex: 0, measureIndex: 0, eventId: 'c1', noteId: 'cn1' }; // C4

      const result = calculateVerticalNavigation(score, selection, 'up', 'quarter', false, null);

      // Should move to next higher note (E4)
      expect(result?.selection?.noteId).toBe('cn2');
    });

    test('navigates down within chord from highest note', () => {
      const score = createScore([chordStaff]);
      const selection = { staffIndex: 0, measureIndex: 0, eventId: 'c1', noteId: 'cn3' }; // G4

      const result = calculateVerticalNavigation(score, selection, 'down', 'quarter', false, null);

      // Should move to next lower note (E4)
      expect(result?.selection?.noteId).toBe('cn2');
    });
  });

  // #QA — descending from the chord track must use the chord's MEASURE-LOCAL coords (not quant-as-
  // global), and must be able to land on a rest (symmetric with the rest-admitting UP path).
  describe('chord-track DOWN navigation', () => {
    const twoBarStaff = {
      id: 'staff-0',
      clef: 'treble' as const,
      keySignature: 'C',
      measures: [
        { id: 'm0', events: [{ id: 'e0', duration: 'quarter', dotted: false, notes: [{ id: 'e0n', pitch: 'C4' }] }] },
        { id: 'm1', events: [{ id: 'e1', duration: 'quarter', dotted: false, isRest: true, notes: [] }] },
      ],
    };
    const scoreWithChord = {
      ...createScore([twoBarStaff]),
      chordTrack: [{ id: 'ch1', measure: 1, quant: 0, symbol: 'G' }],
    };

    test('descends to the chord’s own (non-zero) measure and lands on a rest', () => {
      const selection = { staffIndex: 0, measureIndex: null, eventId: null, noteId: null };
      // args: ..., previewNote=null, qpm=64, chordTrackFocused=true, selectedChordId='ch1'
      const result = calculateVerticalNavigation(scoreWithChord, selection, 'down', 'quarter', false, null, 64, true, 'ch1');

      expect(result?.leavingChordTrack).toBe(true);
      expect(result?.selection?.measureIndex).toBe(1); // chord.measure — NOT floor(quant/qpm)=0
      expect(result?.selection?.eventId).toBe('e1'); // the rest in measure 1 (rest is a valid landing)
    });
  });
});
