/**
 * ScoreAPI.entry.test.tsx
 *
 * Tests for API entry methods: makeTuplet, unmakeTuplet, toggleTie, setTie, setInputMode
 * Validates error handling, validation logic, and success cases.
 */

import { render, act } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';
import { sumQuants } from '../utils/tuplet';

// Helper to get typed API
const getAPI = (id: string): MusicEditorAPI => {
  return window.riffScore.get(id) as MusicEditorAPI;
};

describe('ScoreAPI Entry Methods', () => {
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

  describe('makeTuplet', () => {
    test('reports error when no selection exists', () => {
      render(<RiffScore id="tuplet-no-sel" />);
      const api = getAPI('tuplet-no-sel');

      // No selection yet - makeTuplet should error
      act(() => {
        api.makeTuplet(3, 2);
      });

      expect(api.result).toMatchObject({
        ok: false,
        status: 'error',
        code: 'NO_SELECTION',
      });
    });

    test('creates tuplet on consecutive events', () => {
      render(<RiffScore id="tuplet-create" />);
      const api = getAPI('tuplet-create');

      // Add 3 notes
      act(() => {
        api.select(0).addNote('C4', 'eighth').addNote('D4', 'eighth').addNote('E4', 'eighth');
      });

      // Verify notes were added
      let score = api.getScore();
      expect(score.staves[0].measures[0].events.length).toBe(3);

      // Select first event and create triplet
      act(() => {
        api.select(0, 0, 0, 0);
      });

      // Verify selection is set
      const sel = api.getSelection();
      expect(sel.measureIndex).toBe(0);
      expect(sel.eventId).not.toBeNull();

      act(() => {
        api.makeTuplet(3, 2);
      });

      // Verify tuplet was created
      score = api.getScore();
      const events = score.staves[0].measures[0].events;
      expect(events[0].tuplet).toBeDefined();
      expect(events[0].tuplet?.ratio).toEqual([3, 2]);
      expect(events[0].tuplet?.groupSize).toBe(3);
    });

    test('reports warning when target events already contain a tuplet', () => {
      render(<RiffScore id="tuplet-nested" />);
      const api = getAPI('tuplet-nested');

      // Add notes
      act(() => {
        api.select(0).addNote('C4', 'eighth').addNote('D4', 'eighth').addNote('E4', 'eighth');
      });

      // Select first event and create tuplet
      act(() => {
        api.select(0, 0, 0, 0);
      });

      act(() => {
        api.makeTuplet(3, 2);
      });

      // Verify first tuplet was created
      const score = api.getScore();
      expect(score.staves[0].measures[0].events[0].tuplet).toBeDefined();

      // Try to create another tuplet starting from event 0 (which is already in a tuplet)
      act(() => {
        api.select(0, 0, 0, 0); // Select first event (already in tuplet)
      });

      act(() => {
        api.makeTuplet(3, 2);
      });

      expect(api.result).toMatchObject({
        ok: false,
        status: 'error',
        code: 'NESTED_TUPLET_NOT_SUPPORTED',
      });
    });

    test('rejects a non-tiling ratio with a structured error (#237/#242 guard)', () => {
      render(<RiffScore id="tuplet-bad-ratio" />);
      const api = getAPI('tuplet-bad-ratio');

      act(() => {
        api.select(0).addNote('C4', 'eighth').addNote('D4', 'eighth').addNote('E4', 'eighth');
      });
      act(() => {
        api.select(0, 0, 0, 0);
      });

      // inSpaceOf 0 would mint zero-length tuplet members — must be rejected, not applied.
      act(() => {
        api.makeTuplet(3, 0);
      });

      expect(api.result).toMatchObject({
        ok: false,
        status: 'error',
        code: 'INVALID_TUPLET_RATIO',
      });
      // The score is untouched: the events did not gain tuplet metadata.
      const events = api.getScore().staves[0].measures[0].events;
      expect(events.every((e) => e.tuplet === undefined)).toBe(true);
    });

    test('preserves tuplet properties during insert-mode overflow', () => {
      render(<RiffScore id="tuplet-overflow" />);
      const api = getAPI('tuplet-overflow');

      // Fill measure 1 with 3 eighth notes (= 24 quants)
      act(() => {
        api.select(0).addNote('C4', 'eighth').addNote('D4', 'eighth').addNote('E4', 'eighth');
      });

      // Create triplet on all 3 events
      act(() => {
        api.select(0, 0, 0, 0);
      });
      act(() => {
        api.makeTuplet(3, 2);
      });

      // Verify tuplet created
      let score = api.getScore();
      const tupletId = score.staves[0].measures[0].events[0].tuplet?.id;
      expect(tupletId).toBeDefined();

      // Now insert a whole note at the start (64 quants) with insert mode
      // This should push the tuplet events to the next measure
      act(() => {
        api.select(0, 0, 0, 0).addNote('G3', 'whole', false, { mode: 'insert' });
      });

      // Verify the tuplet events were moved AND their tuplet info is preserved
      score = api.getScore();
      const measure2Events = score.staves[0].measures[1]?.events || [];

      // At least one of the moved events should have tuplet info
      const hasPreservedTuplet = measure2Events.some((e) => e.tuplet !== undefined);
      expect(hasPreservedTuplet).toBe(true);

      // Verify the tuplet ID is the same (group integrity preserved)
      const movedTupletEvent = measure2Events.find((e) => e.tuplet !== undefined);
      expect(movedTupletEvent?.tuplet?.id).toBe(tupletId);
    });
  });

  describe('unmakeTuplet', () => {
    test('reports error when selected event is not part of a tuplet', () => {
      render(<RiffScore id="unmake-no-tuplet" />);
      const api = getAPI('unmake-no-tuplet');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
        api.move('left').unmakeTuplet();
      });

      expect(api.result).toMatchObject({
        ok: true,
        status: 'warning',
        code: 'NOT_A_TUPLET',
      });
    });

    test('removes tuplet from events', () => {
      render(<RiffScore id="unmake-success" />);
      const api = getAPI('unmake-success');

      // Create tuplet
      act(() => {
        api.select(0).addNote('C4', 'eighth').addNote('D4', 'eighth').addNote('E4', 'eighth');
      });

      act(() => {
        api.select(0, 0, 0, 0);
      });

      act(() => {
        api.makeTuplet(3, 2);
      });

      // Verify tuplet exists
      let score = api.getScore();
      expect(score.staves[0].measures[0].events[0].tuplet).toBeDefined();

      // Select an event in the tuplet for removal
      act(() => {
        api.select(0, 0, 0, 0); // Select first event in the tuplet
      });

      // Verify selection
      const sel = api.getSelection();
      expect(sel.eventId).not.toBeNull();

      // Remove tuplet
      act(() => {
        api.unmakeTuplet();
      });

      // Verify tuplet removed from all events
      score = api.getScore();
      expect(score.staves[0].measures[0].events[0].tuplet).toBeUndefined();
      expect(score.staves[0].measures[0].events[1].tuplet).toBeUndefined();
      expect(score.staves[0].measures[0].events[2].tuplet).toBeUndefined();
    });
  });

  describe('toggleTie', () => {
    test('reports error when no note selected', () => {
      render(<RiffScore id="tie-no-sel" />);
      const api = getAPI('tie-no-sel');

      act(() => {
        api.toggleTie();
      });

      expect(api.result).toMatchObject({
        ok: false,
        status: 'error',
        code: 'NO_NOTE_SELECTED',
      });
    });

    test('toggles tie on a note that has a same-pitch successor', () => {
      render(<RiffScore id="tie-toggle" />);
      const api = getAPI('tie-toggle');

      // Two same-pitch notes so the first has a valid tie target (Lane E gate).
      act(() => {
        api.select(0).addNote('C4', 'quarter').addNote('C4', 'quarter');
      });

      // Move back to the FIRST note (cursor advanced past both) and tie it.
      act(() => {
        api.move('left').move('left').toggleTie();
      });

      let score = api.getScore();
      expect(score.staves[0].measures[0].events[0].notes[0].tied).toBe(true);

      // Toggle off — selection stays on the same note after a tie toggle.
      act(() => {
        api.toggleTie();
      });

      score = api.getScore();
      expect(score.staves[0].measures[0].events[0].notes[0].tied).toBe(false);
    });

    test('rejects a tie with no same-pitch successor (NO_TIE_TARGET)', () => {
      render(<RiffScore id="tie-toggle-no-target" />);
      const api = getAPI('tie-toggle-no-target');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
      });

      // The lone note has no successor → the tie must be refused and the model left untouched.
      act(() => {
        api.move('left').toggleTie();
      });

      expect(api.result).toMatchObject({ ok: false, status: 'error', code: 'NO_TIE_TARGET' });
      expect(api.getScore().staves[0].measures[0].events[0].notes[0].tied).toBeFalsy();
    });
  });

  describe('setTie', () => {
    test('reports error when no note selected', () => {
      render(<RiffScore id="tie-set-no-sel" />);
      const api = getAPI('tie-set-no-sel');

      act(() => {
        api.setTie(true);
      });

      expect(api.result).toMatchObject({
        ok: false,
        status: 'error',
        code: 'NO_NOTE_SELECTED',
      });
    });

    test('sets tie explicitly on a note with a same-pitch successor', () => {
      render(<RiffScore id="tie-set" />);
      const api = getAPI('tie-set');

      act(() => {
        api.select(0).addNote('C4', 'quarter').addNote('C4', 'quarter');
      });

      act(() => {
        api.move('left').move('left').setTie(true);
      });

      let score = api.getScore();
      expect(score.staves[0].measures[0].events[0].notes[0].tied).toBe(true);

      act(() => {
        api.setTie(false);
      });

      score = api.getScore();
      expect(score.staves[0].measures[0].events[0].notes[0].tied).toBe(false);
    });

    test('setTie(true) rejects when the successor is a different pitch (NO_TIE_TARGET)', () => {
      render(<RiffScore id="tie-set-no-target" />);
      const api = getAPI('tie-set-no-target');

      act(() => {
        api.select(0).addNote('D4', 'quarter').addNote('E4', 'quarter');
      });

      // First note is D4, its successor is E4 (different pitch) → reject.
      act(() => {
        api.move('left').move('left').setTie(true);
      });

      expect(api.result).toMatchObject({ ok: false, status: 'error', code: 'NO_TIE_TARGET' });
      expect(api.getScore().staves[0].measures[0].events[0].notes[0].tied).toBeFalsy();
    });
  });

  describe('setInputMode', () => {
    test('changes input mode and returns this for chaining', () => {
      render(<RiffScore id="mode-set" />);
      const api = getAPI('mode-set');

      // The method should succeed without throwing
      let result: MusicEditorAPI | undefined;
      act(() => {
        result = api.setInputMode('rest');
      });

      // Method should return this for chaining
      expect(result).toBe(api);
    });
  });

  describe('capacity (#242): API insertion respects the real time signature', () => {
    test('inserting a whole note into an empty 3/4 bar splits and ties across the barline', () => {
      render(<RiffScore id="cap-3-4" />);
      const api = getAPI('cap-3-4');

      act(() => {
        api.setTimeSignature('3/4');
      });
      act(() => {
        api.select(0).addNote('C4', 'whole');
      });

      const measures = api.getScore().staves[0].measures;

      // The 3/4 bar holds 48 quants — the whole note (64) must NOT create a 64-quant bar.
      // (Before the fix, the API used a hardcoded 64 capacity and overfilled the bar.)
      expect(sumQuants(measures[0].events).quants).toBe(48);
      // The 16-quant remainder lands in the next measure...
      expect(measures[1]).toBeDefined();
      expect(sumQuants(measures[1].events).quants).toBe(16);
      // ...tied from the head note in the first bar.
      const head = measures[0].events[measures[0].events.length - 1];
      expect(head.notes[0].tied).toBe(true);
    });
  });

  describe('tuplet input (#242): fill reserved space', () => {
    test('typing a pitch onto a reserved slot fills it at the slot rhythm', () => {
      render(<RiffScore id="tup-fill" />);
      const api = getAPI('tup-fill');

      // Build an eighth-note triplet (3 eighths → makeTuplet).
      act(() => {
        api.select(0).addNote('C4', 'eighth').addNote('D4', 'eighth').addNote('E4', 'eighth');
      });
      act(() => {
        api.select(0, 0, 0, 0).makeTuplet(3, 2);
      });
      // Delete the middle member → one reserved slot at the end.
      act(() => {
        api.select(0, 0, 1, 0).deleteSelected();
      });
      const reservedIdx = api
        .getScore()
        .staves[0].measures[0].events.findIndex((e) => e.reserved);
      expect(reservedIdx).toBeGreaterThanOrEqual(0);

      // Select the reserved slot and type a pitch → it fills (duration forced to the slot's).
      act(() => {
        api.select(0, 0, reservedIdx, 0).addNote('A4', 'whole'); // requested duration is ignored
      });
      const events = api.getScore().staves[0].measures[0].events;
      expect(events.filter((e) => e.reserved)).toHaveLength(0); // slot filled
      const filled = events.find((e) => e.notes.some((n) => n.pitch === 'A4'));
      expect(filled).toBeDefined();
      expect(filled!.duration).toBe('eighth'); // tuplet rhythm fixed, not the requested whole
      expect(filled!.tuplet).toMatchObject({ groupSize: 3 }); // still part of the tuplet group
    });

    test('filling a NON-FIRST reserved slot packs to the front — no gap (#242 QA #8)', () => {
      render(<RiffScore id="api-gap" />);
      const api = getAPI('api-gap');
      // A triplet with one real member + TWO reserved slots (two members deleted).
      const reservedMember = (id: string, position: number) => ({
        id,
        duration: 'eighth',
        dotted: false,
        reserved: true,
        isRest: true,
        notes: [{ id: `${id}-rest`, pitch: null, isRest: true, reserved: true }],
        tuplet: { ratio: [3, 2] as [number, number], groupSize: 3, position, baseDuration: 'eighth', id: 'G' },
      });
      act(() => {
        api.loadScore({
          title: 'T',
          timeSignature: '4/4',
          keySignature: 'C',
          bpm: 120,
          staves: [
            {
              id: 's0',
              clef: 'treble',
              keySignature: 'C',
              measures: [
                {
                  id: 'm0',
                  events: [
                    {
                      id: 'c',
                      duration: 'eighth',
                      dotted: false,
                      notes: [{ id: 'cn', pitch: 'C4' }],
                      tuplet: { ratio: [3, 2], groupSize: 3, position: 0, baseDuration: 'eighth', id: 'G' },
                    },
                    reservedMember('r1', 1),
                    reservedMember('r2', 2),
                  ],
                },
              ],
            },
          ],
        });
      });
      act(() => {
        api.select(0, 0, 2); // select the SECOND reserved slot (r2)
        api.addNote('G4');
      });
      const events = api.getScore().staves[0].measures[0].events;
      // The note must pack to the FIRST free position (no hole): [C4, G4, reserved], not [C4, RES, G4].
      expect(events.map((e) => (e.reserved ? 'RES' : e.notes[0].pitch))).toEqual(['C4', 'G4', 'RES']);
      expect(events.map((e) => e.tuplet?.position)).toEqual([0, 1, 2]);
    });
  });
});
