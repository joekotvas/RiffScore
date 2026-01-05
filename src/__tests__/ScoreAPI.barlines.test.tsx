/**
 * ScoreAPI.barlines.test.tsx
 *
 * Tests for API behavior at barline boundaries.
 * Covers:
 * - Append mode traversing to next measure
 * - Insert mode splitting events across barlines
 * - Cursor navigation across barlines
 * - Proximity inserts (just before barline)
 */

import { render, act } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';

const getAPI = (id: string): MusicEditorAPI => {
  return window.riffScore.get(id) as MusicEditorAPI;
};

describe('ScoreAPI Barline Behaviors', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = jest.fn();
  });

  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
    jest.restoreAllMocks();
  });

  describe('Append Mode Crossing Barlines', () => {
    test('addNote at end of full measure automatically creates next measure', () => {
      render(<RiffScore id="barline-append-create" />);
      const api = getAPI('barline-append-create');

      // Default initialization has 4 empty measures.
      // We'll fill the first one.
      act(() => {
        api
          .addNote('C4', 'quarter')
          .addNote('D4', 'quarter')
          .addNote('E4', 'quarter')
          .addNote('F4', 'quarter');
      });

      let score = api.getScore();
      // Should still be 4 measures, m1 full
      expect(score.staves[0].measures.length).toBe(4);
      expect(score.staves[0].measures[0].events.length).toBe(4);

      // Add one more quarter note - should append to the existing empty measure 2
      act(() => {
        api.addNote('G4', 'quarter');
      });

      score = api.getScore();
      // Still 4 measures (didn't need to create a 5th)
      expect(score.staves[0].measures.length).toBe(4);
      expect(score.staves[0].measures[1].events.length).toBe(1);
      expect(score.staves[0].measures[1].events[0].notes[0].pitch).toBe('G4');
    });

    test('addNote at end of full measure appends to existing next measure', () => {
      render(<RiffScore id="barline-append-existing" />);
      const api = getAPI('barline-append-existing');

      // Default 4 measures.

      // Fill measure 1
      act(() => {
        api.addNote('C4', 'whole');
      });

      // Add note - should go to measure 2
      act(() => {
        api.addNote('D4', 'quarter');
      });

      const score = api.getScore();
      expect(score.staves[0].measures[0].events.length).toBe(1); // Whole note
      expect(score.staves[0].measures[1].events.length).toBe(1); // Quarter note
      expect(score.staves[0].measures[1].events[0].notes[0].pitch).toBe('D4');
    });
  });

  describe('Proximity & Overflow Splits', () => {
    test('Insert half note at beat 3.5 splits across barline (eighth + dotted quarter)', () => {
      render(<RiffScore id="barline-split" />);
      const api = getAPI('barline-split');

      // Fill 3 beats
      act(() => {
        api.addNote('C4', 'quarter').addNote('D4', 'quarter').addNote('E4', 'quarter');
      });

      // Add eighth note (now at 3.5)
      act(() => {
        api.addNote('F4', 'eighth');
      });

      // Add half note (should split: eighth in m1, dotted quarter in m2)
      act(() => {
        api.addNote('G4', 'half');
      });

      const score = api.getScore();
      const m1 = score.staves[0].measures[0];
      const m2 = score.staves[0].measures[1];

      // M1: Q, Q, Q, 8th, 8th(tied)
      expect(m1.events.length).toBe(5);
      expect(m1.events[4].duration).toBe('eighth');
      expect(m1.events[4].notes[0].tied).toBe(true);
      expect(m1.events[4].notes[0].pitch).toBe('G4');

      // M2: Dotted Quarter(tied from start)
      expect(m2.events.length).toBeGreaterThan(0);
      expect(m2.events[0].duration).toBe('quarter');
      expect(m2.events[0].dotted).toBe(true);
      expect(m2.events[0].notes[0].pitch).toBe('G4');
    });
  });

  describe('Cursor Navigation Across Barlines', () => {
    test('move("right") from last event of m1 selects first event of m2', () => {
      render(<RiffScore id="barline-nav" />);
      const api = getAPI('barline-nav');

      act(() => {
        api
          .addNote('C4', 'whole') // m1
          .addNote('D4', 'whole'); // m2 (auto-created)
      });

      // Select last event of m1 (Measure 1 is index 0)
      act(() => {
        api.select(1, 0, 0, 0);
      });

      // Move right - should jump to m2, first event (m2 was auto-created or pre-existing)
      act(() => {
        api.move('right');
      });

      const sel = api.getSelection();
      expect(sel.measureIndex).toBe(1);

      // Verify selected event is the first one in measure 2
      const m2 = api.getScore().staves[0].measures[1];
      expect(m2.events.length).toBeGreaterThan(0);
      expect(sel.eventId).toBe(m2.events[0].id);
    });

    test('addNote advances cursor to next measure when measure is full', () => {
      render(<RiffScore id="barline-cursor-advance" />);
      const api = getAPI('barline-cursor-advance');

      act(() => {
        // C4 (whole) fills m1. Cursor should advance to m2, position 0.
        api.addNote('C4', 'whole');
      });

      // Ideally, the cursor logic treats "end of measure 1" same as "start of measure 2" for append
      // But verify where the API considers usage "at".
      // Current implementation: syncSelection sets eventId to null in NEXT measure if full

      // Let's verify by adding another note - it should be in m2
      act(() => {
        api.addNote('D4', 'quarter');
      });

      // m1 (1 event) + m2 (1 event) + m3, m4 (empty) = 4 measures total (default)
      const score = api.getScore();
      expect(score.staves[0].measures.length).toBe(4);
      expect(score.staves[0].measures[1].events.length).toBe(1);
      expect(score.staves[0].measures[1].events[0].notes[0].pitch).toBe('D4');
    });

    test('move("left") from first event stays in place', () => {
      render(<RiffScore id="barline-left-edge" />);
      const api = getAPI('barline-left-edge');

      act(() => {
        api.addNote('C4', 'quarter');
      });

      // Select the first event in measure 1
      act(() => {
        api.select(1, 0, 0, 0);
      });

      const selBefore = api.getSelection();
      expect(selBefore.measureIndex).toBe(0);
      expect(selBefore.eventId).not.toBeNull();

      // Move left from first event - should stay in place
      act(() => {
        api.move('left');
      });

      const selAfter = api.getSelection();
      // Should remain at the same position (first event of first measure)
      expect(selAfter.measureIndex).toBe(0);
      expect(selAfter.eventId).toBe(selBefore.eventId);
    });

    test('move("right") from last event moves to append position', () => {
      render(<RiffScore id="barline-right-edge" />);
      const api = getAPI('barline-right-edge');

      // Add notes to fill most of the score
      act(() => {
        api
          .addNote('C4', 'whole') // m1
          .addNote('D4', 'whole') // m2
          .addNote('E4', 'whole') // m3
          .addNote('F4', 'whole'); // m4
      });

      // After adding, cursor is at append position (end of m4).
      // Move left to select the last event (F4 in m4)
      act(() => {
        api.move('left');
      });

      const selBefore = api.getSelection();
      expect(selBefore.measureIndex).toBe(3);
      expect(selBefore.eventId).not.toBeNull();

      // Move right from the last event - should move to append position
      act(() => {
        api.move('right');
      });

      const selAfter = api.getSelection();
      // Should be at append position (eventId is null)
      expect(selAfter.measureIndex).toBe(3);
      expect(selAfter.eventId).toBeNull();
    });
  });
});
