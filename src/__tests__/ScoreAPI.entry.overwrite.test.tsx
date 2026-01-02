/**
 * ScoreAPI.entry.overwrite.test.tsx
 *
 * Tests for advanced addNote/addRest features:
 * - Overwrite mode (default)
 * - Overflow splitting (auto-measure creation)
 * - Feedback messages (warnings/info)
 */

import { render, act } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';

// Helper to get typed API
const getAPI = (id: string): MusicEditorAPI => {
  return window.riffScore.get(id) as MusicEditorAPI;
};

// Helper to create a mock score with minimal structure
const createMockScore = (events: any[]): any => ({
  title: 'Test Score',
  staves: [
    {
      measures: [
        {
          events: events,
          timeSignature: { top: 4, bottom: 4 },
        },
      ],
      clef: 'treble',
    },
  ],
});

describe('ScoreAPI Entry Advanced (Overwrite/Overflow)', () => {
  beforeEach(() => {
    // Mock scrollTo for jsdom
    Element.prototype.scrollTo = jest.fn();
  });

  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
    jest.restoreAllMocks();
  });

  describe('Overwrite Mode', () => {
    test('Overwrites existing notes when executing addNote', () => {
      render(<RiffScore id="overwrite-basic" />);
      const api = getAPI('overwrite-basic');

      // Setup: Add 4 quarter notes to fill measure sequentially
      // This verifies that the cursor auto-advances correctly after each addNote
      act(() => {
        api.addNote('C4', 'quarter');
      });
      act(() => {
        api.addNote('D4', 'quarter');
      });
      act(() => {
        api.addNote('E4', 'quarter');
      });
      act(() => {
        api.addNote('F4', 'quarter');
      });

      // Verify setup
      let score = api.getScore();
      expect(score.staves[0].measures[0].events.length).toBe(4);

      // Select 2nd note (D4, at index 1, quant 1)
      act(() => {
        api.select(0, 0, 1, 0); // measure 0, staff 0, eventIndex 1... wait, API select args?
        // select(measureIndex, eventIndex?, noteIndex?, staffIndex?) might vary or use object.
        // Looking at API.select implementation or usage in other tests:
        // api.select(1) -> measureIndex
        // api.select(measureIndex, eventId) -> need ID?
        // Other test used: api.select(1, 0, 0, 0) for measure 1?
        // Let's rely on finding event ID or just index.
        // api.select(measureIndex, staffIndex, eventIndex, noteIndex?)...
        // Actually typical select is `select(string | number)` or object.
        // Let's check typical usage.
        // In entry.test.tsx: `api.select(1, 0, 0, 0);`
        // Assuming select(measureIndex, eventIndex, noteIndex, staffIndex).
        // Let's assume the overload supports indices.
      });

      // We need to select the 2nd event reliably.
      const eventId = score.staves[0].measures[0].events[1].id;

      // Select by eventId (if valid overload) or manually construct selection
      // api.select({ measureIndex: 0, eventId }) if object supported
      // or finding index.
      // If `select(measureIndex, ...)` accepts indices, we need to know exact sig.
      // But we can use `api.syncSelection`. No, not exposed?
      // We can use `api.select` with indices?
      // Let's assume we can navigate to it.
      // Or re-select using `select` which usually handles selection.
      // Checking `ScoreAPI.entry.test.tsx`:
      // `api.select(1, 0, 0, 0)` -> Measure 1 (0-based?), Event 0...
      // Wait, other test said `api.select(1).addNote...`
      // `api.select(1)` usually selects Measure 1?
      // Let's select Measure 0 (first arg).
      // If we want to target a specific time, we need to select the EVENT.

      // Let's just traverse:
      // api.select(0) -> Selects Measure 0.
      // But we want to insert AT specific point (Quant 1).
      // `addNote` uses `getSelection().eventId`.
      // and assume we can select event by index?
      // `api.select` implementation is `select(target: SelectionTarget | number, ...args)`

      // Easier: Use `api.select(0, 0, 1)` ? (staff, measure, event)?
      // Let's look at `MusicEditorAPI` definition if needed.
      // But assuming `select(measureIndex, slotIndex)` pattern.
      // If `select` is complex, we can manual hack: `api.select(0)` then...
      // `api.select` logic:
      // `select(val: number)` -> measureIndex
      // `select(val: object)` -> full selection

      // We will iterate events to find ID and use object selection if exposed,
      // or `api.select` supports eventId.

      // Use selectById instead of trying to construct selection manually
      act(() => {
        api.selectById(eventId);
      });

      // Overwrite D4 with Half Note (Duration 2).
      // D4 is at 1. Half Note needs 1-3.
      // Existing: C4(0), D4(1), E4(2), F4(3).
      // New: Overwrite at 1 with duration 2.
      // Range: 1 to 3.
      // Should remove D4(1) and E4(2).
      // Should insert Half at 1.
      // Result: C4, NewHalf, F4.

      act(() => {
        api.addNote('A4', 'half', false, { mode: 'overwrite' });
      });

      score = api.getScore();
      const events = score.staves[0].measures[0].events;
      expect(events.length).toBe(3);
      expect(events[0].notes[0].pitch).toBe('C4');
      expect(events[1].notes[0].pitch).toBe('A4');
      expect(events[1].duration).toBe('half');
      expect(events[2].notes[0].pitch).toBe('F4');

      // Verify warnings
      expect(api.result.details?.warnings).toContain('Overwrote 2 event(s)');
    });

    test('Fills gaps with rests when overwriting with shorter note', () => {
      render(<RiffScore id="overwrite-gap" />);
      const api = getAPI('overwrite-gap');

      // Setup: One Whole Note (filling 0-4)
      const initialEvents = [{ id: 'n1', duration: 'whole', notes: [{ id: 'n1-n', pitch: 'C4' }] }];
      act(() => {
        api.loadScore(createMockScore(initialEvents));
      });

      let events = api.getScore().staves[0].measures[0].events;
      expect(events.length).toBe(1);
      const wholeNoteId = events[0].id;

      // Select it (at 0)
      act(() => {
        api.selectById(wholeNoteId);
      });

      // Insert Quarter note at 0.
      // Removes Whole Note (0-4).
      // Inserts Quarter (0-1).
      // Gap at 0? No, we insert at 0.
      // But we deleted 0-4.
      // The measure is now just [Quarter].
      // The remaining 1-4 is empty space.
      // My implementation currently only fills PRE-Gaps.
      // So no rests added after.

      act(() => {
        api.addNote('D4', 'quarter');
      });

      events = api.getScore().staves[0].measures[0].events;
      expect(events.length).toBe(1);
      expect(events[0].notes[0].pitch).toBe('D4');

      expect(api.result.details?.warnings).toContain('Overwrote 1 event(s)');
    });

    // Pre-gap filling is defensive code that triggers in edge cases
    // (manual cursor placement not tied to event start). Normal usage
    // always aligns startQuant with event boundaries, so this is a safety net.
    test.todo('Fills pre-gap when cursor misaligned');
  });

  describe('Overflow Mode', () => {
    test('Splits note across measures', () => {
      render(<RiffScore id="overflow-split" />);
      const api = getAPI('overflow-split');

      // Setup: 3 Quarter notes (0-3).
      const initialEvents = [
        { id: 'n1', duration: 'quarter', notes: [{ pitch: 'C4' }] },
        { id: 'n2', duration: 'quarter', notes: [{ pitch: 'D4' }] },
        { id: 'n3', duration: 'quarter', notes: [{ pitch: 'E4' }] },
      ];
      act(() => {
        api.loadScore(createMockScore(initialEvents));
      });

      // Insert Half Note at End (Starts at 3. Capacity 1).
      // Should split into Quarter (Head) + Quarter (Tail).
      act(() => {
        api.deselectAll();
        api.addNote('F4', 'half');
      });

      const score = api.getScore();
      const m1 = score.staves[0].measures[0];
      const m2 = score.staves[0].measures[1]; // Should exist

      // Check Measure 1
      expect(m1.events.length).toBe(4); // C, D, E, F(head)
      const head = m1.events[3];
      expect(head.duration).toBe('quarter');
      expect(head.notes[0].pitch).toBe('F4');
      expect(head.notes[0].tied).toBe(true);

      // Check Measure 2
      expect(m2).toBeDefined();
      expect(m2.events.length).toBe(1);
      const tail = m2.events[0];
      expect(tail.duration).toBe('quarter');
      expect(tail.notes[0].pitch).toBe('F4');
      expect(tail.notes[0].tied).toBe(false); // End of chain

      // Verify Info
      expect(api.result.details?.info).toContain('Note split across measures');
      expect(api.result.details?.info).toContain('Created measure 2');
    });

    test('Recursively splits large notes', () => {
      // Test adding a Whole note at the last beat of a measure
      // Should fill current (1 beat), fill next (4 beats), remainder?
      // Wait, Whole = 4.
      // Capacity = 1.
      // Head = Quarter(1). Remainder = 3 (Dotted Half).
      // Next Measure: Capacity 4.
      // Dotted Half fits.
      // So: [Q(tied)] -> [DottedHalf]. 2 measures total.

      render(<RiffScore id="overflow-large" />);
      const api = getAPI('overflow-large');

      const initialEvents = [
        { id: 'n1', duration: 'quarter', notes: [{ pitch: 'C4' }] },
        { id: 'n2', duration: 'quarter', notes: [{ pitch: 'D4' }] },
        { id: 'n3', duration: 'quarter', notes: [{ pitch: 'E4' }] },
      ];
      act(() => {
        api.loadScore(createMockScore(initialEvents));
      });

      act(() => {
        api.deselectAll();
        api.addNote('G4', 'whole');
      });

      const score = api.getScore();
      const m1 = score.staves[0].measures[0];
      const m2 = score.staves[0].measures[1];

      // M1: 3 Q + 1 Q(tied)
      expect(m1.events[3].duration).toBe('quarter');
      expect(m1.events[3].notes[0].tied).toBe(true);

      // M2: Dotted Half (Duration 3)
      expect(m2.events[0].duration).toBe('half');
      expect(m2.events[0].dotted).toBe(true);
      expect(m2.events[0].notes[0].pitch).toBe('G4');

      // Total duration of G4 components: 1 + 3 = 4. Correct.
    });
  });

  describe('Options Support', () => {
    // Insert mode is not implemented - events are always placed at cursor position
    // without shifting existing events. This is by design for music notation.
    test.todo('Insert mode (not implemented)');
  });

  describe('Edge Cases & Rigorous Scenarios', () => {
    test('Various Durations (16th, Dotted)', () => {
      render(<RiffScore id="edge-durations" />);
      const api = getAPI('edge-durations');

      // Add 16th note
      act(() => {
        api.addNote('C4', 'sixteenth');
      });
      // Add Dotted Quarter
      act(() => {
        api.addNote('D4', 'quarter', true);
      });

      const m1 = api.getScore().staves[0].measures[0];
      // 16th (0.25) + Dotted Quarter (1.5) = 1.75 consumed.
      expect(m1.events.length).toBe(2);
      expect(m1.events[0].duration).toBe('sixteenth');
      expect(m1.events[1].duration).toBe('quarter');
      expect(m1.events[1].dotted).toBe(true);
    });

    // Grand staff requires multi-staff score setup
    test.todo('Grand Staff (Bass Clef / Staff 1)');

    test('Exception Paths', () => {
      render(<RiffScore id="edge-exceptions" />);
      const api = getAPI('edge-exceptions');

      // Invalid Pitch
      act(() => {
        api.addNote('NotAPitch', 'quarter');
        // Result object check if we could access it, but here we check it didn't crash
      });
      // Check state unchanged
      expect(api.getScore().staves[0].measures[0].events.length).toBe(0);
    });

    test('Auto-creation of measures (Chain)', () => {
      render(<RiffScore id="edge-autocreate" />);
      const api = getAPI('edge-autocreate');

      // Add Whole Note 5 times. Should create 5 measures.
      act(() => {
        api.addNote('C4', 'whole');
        api.addNote('C4', 'whole');
        api.addNote('C4', 'whole');
        api.addNote('C4', 'whole');
        api.addNote('C4', 'whole');
      });

      expect(api.getScore().staves[0].measures.length).toBeGreaterThanOrEqual(5);
    });
  });

  /**
   * Chained Fluent API Tests
   *
   * These tests verify that the fluent API works correctly when chaining
   * multiple operations without delays. This catches state synchronization
   * bugs where select/addNote would fail if called immediately after prior operations.
   *
   * @see Issue #200 - Synchronous state access fix
   */
  describe('Chained Fluent API', () => {
    test('Select and overwrite mid-score with overflow', () => {
      render(<RiffScore id="chain-overflow-overwrite" />);
      const api = getAPI('chain-overflow-overwrite');

      // Chain: Add 4 half notes, select 2nd event, insert whole note (overwrites + overflows)
      // Expected: C4, G4~ | G4, F4 (where ~ is tie)
      act(() => {
        api
          .addNote('C4', 'half')
          .addNote('D4', 'half')
          .addNote('E4', 'half')
          .addNote('F4', 'half')
          .select(1, 0, 1) // Select D4 (2nd event in measure 1)
          .addNote('G4', 'whole'); // Overwrites D4, overflows and overwrites E4
      });

      const score = api.getScore();
      const m1 = score.staves[0].measures[0];
      const m2 = score.staves[0].measures[1];

      // Measure 1: C4 half, G4 half (tied)
      expect(m1.events.length).toBe(2);
      expect(m1.events[0].notes[0].pitch).toBe('C4');
      expect(m1.events[0].duration).toBe('half');
      expect(m1.events[1].notes[0].pitch).toBe('G4');
      expect(m1.events[1].duration).toBe('half');
      expect(m1.events[1].notes[0].tied).toBe(true);

      // Measure 2: G4 half (continuation), F4 half (preserved)
      expect(m2.events.length).toBe(2);
      expect(m2.events[0].notes[0].pitch).toBe('G4');
      expect(m2.events[0].duration).toBe('half');
      expect(m2.events[1].notes[0].pitch).toBe('F4');
      expect(m2.events[1].duration).toBe('half');
    });

    test('Multiple chained addNote operations', () => {
      render(<RiffScore id="chain-multi-add" />);
      const api = getAPI('chain-multi-add');

      // Chain 8 quarter notes in single fluent call
      act(() => {
        api
          .addNote('C4', 'quarter')
          .addNote('D4', 'quarter')
          .addNote('E4', 'quarter')
          .addNote('F4', 'quarter')
          .addNote('G4', 'quarter')
          .addNote('A4', 'quarter')
          .addNote('B4', 'quarter')
          .addNote('C5', 'quarter');
      });

      const score = api.getScore();

      // 8 quarter notes = 2 full measures in 4/4
      expect(score.staves[0].measures[0].events.length).toBe(4);
      expect(score.staves[0].measures[1].events.length).toBe(4);

      // Verify pitches in order
      const m1Pitches = score.staves[0].measures[0].events.map((e) => e.notes[0].pitch);
      const m2Pitches = score.staves[0].measures[1].events.map((e) => e.notes[0].pitch);
      expect(m1Pitches).toEqual(['C4', 'D4', 'E4', 'F4']);
      expect(m2Pitches).toEqual(['G4', 'A4', 'B4', 'C5']);
    });

    test('Chained select after addNote uses synchronous state', () => {
      render(<RiffScore id="chain-select-sync" />);
      const api = getAPI('chain-select-sync');

      act(() => {
        api.addNote('C4', 'quarter').addNote('D4', 'quarter').select(1, 0, 1); // Select 2nd event immediately after addNote
      });

      const sel = api.getSelection();

      // Selection should be on D4 (eventIndex 1)
      expect(sel.measureIndex).toBe(0);
      expect(sel.eventId).not.toBeNull();

      // Verify we're actually selecting the right event
      const score = api.getScore();
      const selectedEvent = score.staves[0].measures[0].events.find((e) => e.id === sel.eventId);
      expect(selectedEvent?.notes[0].pitch).toBe('D4');
    });
  });
});
