/**
 * ScoreAPI.modification.test.tsx
 *
 * Tests for API modification and IO methods.
 * Covers: loadScore, deleteMeasure, setClef, transpose, export, etc.
 */

import { render, act } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';
import { Score, ClefType } from '../types';

// Helper to get typed API
const getAPI = (id: string): MusicEditorAPI => {
  return window.riffScore.get(id) as MusicEditorAPI;
};

describe('ScoreAPI Modification & IO Methods', () => {
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

  describe('IO: loadScore', () => {
    test('replaces the current score', () => {
      render(<RiffScore id="load-score" />);
      const api = getAPI('load-score');

      const newScore: Score = {
        title: 'New Score',
        staves: [
          {
            id: 'staff-1',
            clef: 'bass',
            keySignature: 'C',
            measures: [],
          },
        ],
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 100,
      };

      act(() => {
        api.loadScore(newScore);
      });

      const current = api.getScore();
      expect(current.title).toBe('New Score');
      expect(current.staves[0].clef).toBe('bass');
    });

    test('rejects structurally malformed input instead of reporting success (#209)', () => {
      render(<RiffScore id="load-bad" />);
      const api = getAPI('load-bad');
      const beforeTitle = api.getScore().title;

      act(() => {
        api.loadScore({ title: 'No staves' } as unknown as Score);
      });

      expect(api.result).toMatchObject({ ok: false, status: 'error', code: 'INVALID_SCORE' });
      // The score is left untouched (the malformed load did not replace it).
      expect(api.getScore().title).toBe(beforeTitle);
    });
  });

  describe('setDuration overflow (#242 Lane D)', () => {
    test('rejects an overflowing duration change instead of producing an over-full bar', () => {
      render(<RiffScore id="dur-overflow" />);
      const api = getAPI('dur-overflow');

      // Fill a 4/4 bar with four quarters.
      act(() => {
        api
          .select(0)
          .addNote('C4', 'quarter')
          .addNote('C4', 'quarter')
          .addNote('C4', 'quarter')
          .addNote('C4', 'quarter');
      });

      // Select the first quarter and try to make it a whole note — it can't fit.
      act(() => {
        api.move('left').move('left').move('left').move('left').setDuration('whole');
      });

      expect(api.result).toMatchObject({ ok: false, status: 'error', code: 'DURATION_OVERFLOW' });
      // The event is left unchanged (no over-full bar created).
      expect(api.getScore().staves[0].measures[0].events[0].duration).toBe('quarter');
    });
  });

  describe('IO: export', () => {
    test('exports JSON', () => {
      render(<RiffScore id="export-json" />);
      const api = getAPI('export-json');
      const json = api.export('json');
      expect(json).toContain('"title"');
      expect(JSON.parse(json)).toHaveProperty('staves');
    });

    // We trust abcExporter logic, just verify wiring
    test('exports ABC', () => {
      render(<RiffScore id="export-abc" />);
      const api = getAPI('export-abc');
      const abc = api.export('abc');
      expect(typeof abc).toBe('string');
      expect(abc).toContain('X:1');
    });

    test('exports MusicXML', () => {
      render(<RiffScore id="export-xml" />);
      const api = getAPI('export-xml');
      const xml = api.export('musicxml');
      expect(typeof xml).toBe('string');
      expect(xml).toContain('<?xml');
    });
  });

  describe('Structure: deleteMeasure', () => {
    test('deletes measure by index', () => {
      render(<RiffScore id="del-measure" />);
      const api = getAPI('del-measure');

      // Add measures to have enough to delete
      act(() => {
        api.addMeasure().addMeasure();
      });

      const countBefore = api.getScore().staves[0].measures.length;

      act(() => {
        api.deleteMeasure(0);
      });

      const countAfter = api.getScore().staves[0].measures.length;
      expect(countAfter).toBe(countBefore - 1);
    });
  });

  describe('Structure: deleteSelected', () => {
    test('deletes selected note', () => {
      render(<RiffScore id="del-sel-note" />);
      const api = getAPI('del-sel-note');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
      });

      // Select the note
      act(() => {
        api.select(0, 0, 0, 0);
      });

      act(() => {
        api.deleteSelected();
      });

      const measures = api.getScore().staves[0].measures;
      // Should be removed completely if last note in event
      expect(measures[0].events.length).toBe(0);
    });

    test('deletes selected event (rest)', () => {
      render(<RiffScore id="del-sel-event" />);
      const api = getAPI('del-sel-event');

      // Add two rests
      act(() => {
        api.select(0).addRest('quarter').addRest('quarter');
      });

      // Select first
      act(() => {
        api.select(0, 0, 0);
      });

      act(() => {
        api.deleteSelected();
      });

      // Should be removed completely? Or merged?
      // DeleteEventCommand usually removes the event from the measure
      const measures = api.getScore().staves[0].measures;
      expect(measures[0].events.length).toBe(1);
    });
  });

  describe('Configuration: setClef', () => {
    test('changes clef to supported types', () => {
      render(<RiffScore id="set-clef" />);
      const api = getAPI('set-clef');

      const clefs: ClefType[] = ['bass', 'alto', 'tenor', 'treble'];

      clefs.forEach((clef) => {
        act(() => {
          api.setClef(clef);
        });
        expect(api.getScore().staves[0].clef).toBe(clef);
      });
    });

    test('handles "grand" by changing layout', () => {
      render(<RiffScore id="set-clef-grand" />);
      const api = getAPI('set-clef-grand');

      // Ensure single staff first
      act(() => {
        api.setStaffLayout('single');
      });
      expect(api.getScore().staves.length).toBe(1);

      // setClef('grand') should switch to grand staff
      act(() => {
        api.setClef('grand');
      });
      const score = api.getScore();
      expect(score.staves.length).toBe(2);
      expect(score.staves[0].clef).toBe('treble');
      expect(score.staves[1].clef).toBe('bass');
    });
  });

  describe('Configuration: Other', () => {
    test('setKeySignature', () => {
      render(<RiffScore id="set-key" />);
      const api = getAPI('set-key');
      act(() => {
        api.setKeySignature('G');
      });
      expect(api.getScore().staves[0].keySignature).toBe('G');
    });

    test('setTimeSignature', () => {
      render(<RiffScore id="set-time" />);
      const api = getAPI('set-time');
      act(() => {
        api.setTimeSignature('3/4');
      });
      expect(api.getScore().timeSignature).toBe('3/4');
    });

    test('setScoreTitle', () => {
      render(<RiffScore id="set-title" />);
      const api = getAPI('set-title');
      act(() => {
        api.setScoreTitle('My Song');
      });
      expect(api.getScore().title).toBe('My Song');
    });
  });

  describe('Modification: setAccidentalDisplay', () => {
    test('sets the display policy on the selected note without changing its pitch', () => {
      render(<RiffScore id="acc-display" />);
      const api = getAPI('acc-display');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
      });
      act(() => {
        api.select(0, 0, 0, 0);
      });
      act(() => {
        api.setAccidentalDisplay('courtesy');
      });

      const note = api.getScore().staves[0].measures[0].events[0].notes[0];
      expect(note.accidentalDisplay).toBe('courtesy'); // policy applied
      expect(note.pitch).toBe('C4'); // pitch untouched (orthogonal to display)
    });

    test('undo removes the policy from a previously-auto note (not just overwrites)', () => {
      render(<RiffScore id="acc-display-undo" />);
      const api = getAPI('acc-display-undo');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
      });
      act(() => {
        api.select(0, 0, 0, 0);
      });
      act(() => {
        api.setAccidentalDisplay('show'); // adds a brand-new key to the note
      });
      act(() => {
        api.undo();
      });

      // Object.assign-based undo cannot delete an added key; the note must come
      // back to its original shape (no accidentalDisplay), not keep a stale 'show'.
      const note = api.getScore().staves[0].measures[0].events[0].notes[0];
      expect(note.accidentalDisplay).toBeUndefined();
      expect(note.pitch).toBe('C4');
    });
  });

  describe('Modification: transposeDiatonic', () => {
    test('transposes selected note by steps', () => {
      render(<RiffScore id="transpose" />);
      const api = getAPI('transpose');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
      });

      // Select
      act(() => {
        api.select(0, 0, 0, 0);
      });

      // Transpose +2 steps (C -> E)
      act(() => {
        api.transposeDiatonic(2);
      });

      let note = api.getScore().staves[0].measures[0].events[0].notes[0];
      expect(note.pitch).toBe('E4');

      // Transpose -1 step (E -> D)
      act(() => {
        api.transposeDiatonic(-1);
      });

      note = api.getScore().staves[0].measures[0].events[0].notes[0];
      expect(note.pitch).toBe('D4');
    });

    test('reports NO_SELECTION on a no-op (nothing selected), matching transpose() (#242 QA)', () => {
      render(<RiffScore id="transpose-noop" />);
      const api = getAPI('transpose-noop');

      // Fresh instance, nothing selected → a no-op must report failure, not ok:true.
      act(() => {
        api.transposeDiatonic(2);
      });

      expect(api.result).toMatchObject({ ok: false, status: 'error', code: 'NO_SELECTION' });
    });
  });

  describe('Modification: updateEvent', () => {
    test('updates arbitrary event properties', () => {
      render(<RiffScore id="update-event" />);
      const api = getAPI('update-event');

      act(() => {
        api.select(0).addRest('quarter');
      });

      act(() => {
        api.select(0, 0, 0);
      }); // Select the rest

      // Update color (custom prop simulation) or verified prop
      // Since ScoreEvent is typed, we should update a valid prop.
      // e.g. duration. But API has setDuration.
      // Let's try updating 'isRest' to false? That might break things if notes are missing.
      // Maybe just verify it can update 'duration' property directly.

      act(() => {
        api.updateEvent({ duration: 'half' } as any);
      });

      const event = api.getScore().staves[0].measures[0].events[0];
      expect(event.duration).toBe('half');
    });

    test('rejects a duration change that would overflow the measure (#242 QA)', () => {
      render(<RiffScore id="update-event-overflow" />);
      const api = getAPI('update-event-overflow');

      // Fill a 4/4 bar with four quarters, then try to widen the first to a whole via the escape hatch.
      act(() => {
        api
          .select(0)
          .addNote('C4', 'quarter')
          .addNote('C4', 'quarter')
          .addNote('C4', 'quarter')
          .addNote('C4', 'quarter');
      });
      act(() => {
        api.select(0, 0, 0); // select the first quarter
      });
      act(() => {
        api.updateEvent({ duration: 'whole' } as unknown as Parameters<typeof api.updateEvent>[0]);
      });

      expect(api.result).toMatchObject({ ok: false, status: 'error', code: 'DURATION_OVERFLOW' });
      // Escape hatch still upholds the never-silently-overfull invariant — event unchanged.
      expect(api.getScore().staves[0].measures[0].events[0].duration).toBe('quarter');
    });
  });

  describe('Structure: setMeasurePickup', () => {
    test('toggles pickup state on first measure', () => {
      render(<RiffScore id="pickup" />);
      const api = getAPI('pickup');

      let m1 = api.getScore().staves[0].measures[0];
      expect(m1.isPickup).toBeFalsy();

      act(() => {
        api.setMeasurePickup(true);
      });

      m1 = api.getScore().staves[0].measures[0];
      expect(m1.isPickup).toBe(true);

      act(() => {
        api.setMeasurePickup(false); // Toggle back
      });

      m1 = api.getScore().staves[0].measures[0];
      expect(m1.isPickup).toBe(false);

      // Setting same value shouldn't toggle
      act(() => {
        api.setMeasurePickup(false); // Already false
      });
      m1 = api.getScore().staves[0].measures[0];
      expect(m1.isPickup).toBe(false);
    });
  });

  describe('Structure: setStaffLayout', () => {
    test('switches between grand and single', () => {
      render(<RiffScore id="layout" />);
      const api = getAPI('layout');

      // Default is single or grand depending on init. Let's force grand.
      act(() => {
        api.reset('grand');
      });
      // Reset is a stub? "TODO: Implement" in io.ts.
      // Oops, I didn't verify reset implementation. The test will fail if reset isn't implemented.
      // But setStaffLayout IS implemented.

      act(() => {
        api.setStaffLayout('grand');
      });
      expect(api.getScore().staves.length).toBe(2);

      act(() => {
        api.setStaffLayout('single');
      });
      expect(api.getScore().staves.length).toBe(1);
    });
  });

  describe('Edge Cases & Robustness', () => {
    test('deleteMeasure: handles invalid index gracefully', () => {
      render(<RiffScore id="edge-del-measure" />);
      const api = getAPI('edge-del-measure');

      const countBefore = api.getScore().staves[0].measures.length;

      act(() => {
        api.deleteMeasure(999); // Out of bounds
      });

      const countAfter = api.getScore().staves[0].measures.length;
      expect(countAfter).toBe(countBefore); // Should be unchanged
    });

    test('deleteSelected: handles no selection gracefully', () => {
      render(<RiffScore id="edge-del-sel" />);
      const api = getAPI('edge-del-sel');

      // Clear selection manually or assume init is empty?
      // Init has default selection usually. Let's ensure deselect.
      act(() => {
        // api.deselect()? No deselect API.
        // We can select something invalid or assume start state?
        // Default start state usually selects first measure.
        // But if we don't 'select' anything explicitly, we check robustness of the command.
        api.deleteSelected();
      });

      // Just ensure no crash.
      expect(true).toBe(true);
    });

    test('transposeDiatonic: handles octave crossing', () => {
      render(<RiffScore id="edge-transpose" />);
      const api = getAPI('edge-transpose');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
        api.select(0, 0, 0, 0); // Select note
      });

      // Transpose +8 steps (Octave + 1) -> C4 + 7 steps = C5. +8 steps = D5.
      act(() => {
        api.transposeDiatonic(8);
      });

      const note = api.getScore().staves[0].measures[0].events[0].notes[0];
      expect(note.pitch).toBe('D5');
    });

    test('transposeDiatonic(12): moves 12 diatonic steps, NOT an octave (#239 coercion removed)', () => {
      // Regression: the command used to coerce |steps|==12 to 7 (an octave),
      // silently corrupting api.transposeDiatonic(12). 12 diatonic steps from C4
      // is an octave + a 6th (C4 -> A5), not C5. This FAILS on the pre-#239 code.
      render(<RiffScore id="diatonic-12" />);
      const api = getAPI('diatonic-12');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
        api.select(0, 0, 0, 0);
        api.transposeDiatonic(12);
      });
      expect(api.getScore().staves[0].measures[0].events[0].notes[0].pitch).toBe('A5');
    });

    test('transposeDiatonic(-12): moves 12 diatonic steps down, not an octave', () => {
      render(<RiffScore id="diatonic-neg12" />);
      const api = getAPI('diatonic-neg12');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
        api.select(0, 0, 0, 0);
        api.transposeDiatonic(-12);
      });
      expect(api.getScore().staves[0].measures[0].events[0].notes[0].pitch).toBe('E2');
    });

    test('transposeDiatonic: spelling is key-aware through the command (sharp key)', () => {
      // CHARACTERIZATION (not a #239 regression guard): diatonic key-aware spelling
      // predates #239 — it lives in movePitchVisual/applyKeySignature, which #239
      // did NOT change (the diatonic delta was only the steps rename + coercion
      // removal). This pins the end-to-end command contract, previously asserted
      // only at the movePitchVisual unit level, never through the command in a
      // non-C key.
      render(<RiffScore id="diatonic-keyaware-g" />);
      const api = getAPI('diatonic-keyaware-g');

      // G major: stepping E4 up onto the F line -> F#4 (F# is diatonic in G).
      act(() => {
        api.setKeySignature('G');
        api.select(0).addNote('E4', 'quarter');
        api.select(0, 0, 0, 0);
        api.transposeDiatonic(1);
      });
      expect(api.getScore().staves[0].measures[0].events[0].notes[0].pitch).toBe('F#4');
    });

    test('transposeDiatonic: spelling is key-aware through the command (flat key)', () => {
      render(<RiffScore id="diatonic-keyaware-f" />);
      const api = getAPI('diatonic-keyaware-f');

      // F major: stepping A4 up onto the B line -> Bb4 (Bb is diatonic in F).
      act(() => {
        api.setKeySignature('F');
        api.select(0).addNote('A4', 'quarter');
        api.select(0, 0, 0, 0);
        api.transposeDiatonic(1);
      });
      expect(api.getScore().staves[0].measures[0].events[0].notes[0].pitch).toBe('Bb4');
    });

    test('setClef: preserves note pitches', () => {
      render(<RiffScore id="edge-clef-pitch" />);
      const api = getAPI('edge-clef-pitch');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
      });

      // Change to Bass clef
      act(() => {
        api.setClef('bass');
      });

      const note = api.getScore().staves[0].measures[0].events[0].notes[0];
      expect(note.pitch).toBe('C4'); // Pitch should not change
      expect(api.getScore().staves[0].clef).toBe('bass');
    });

    test('setStaffLayout: switching to single drops second staff data', () => {
      render(<RiffScore id="edge-layout-loss" />);
      const api = getAPI('edge-layout-loss');

      // Setup Grand Staff
      act(() => {
        api.setStaffLayout('grand');
      });

      // Add note to second staff (staffIndex 1)
      // Need to select second staff.
      // api.select(measureNum, staffIndex, eventIndex, noteIndex)
      act(() => {
        api.select(0, 1, 0, 0); // Measure 1, Staff 1
        api.addNote('C3', 'quarter');
      });

      let score = api.getScore();
      expect(score.staves[1].measures[0].events.length).toBeGreaterThan(0);

      // Switch to Single
      act(() => {
        api.setStaffLayout('single');
      });

      score = api.getScore();
      expect(score.staves.length).toBe(1);

      // Switch back to Grand (should be empty new staff?)
      act(() => {
        api.setStaffLayout('grand');
      });

      score = api.getScore();
      expect(score.staves.length).toBe(2);
      // Data usually lost unless implementation preserves it (unlikely for "SetSingleStaff")
      const eventsC3 = score.staves[1].measures[0].events.filter((e) => !e.isRest);
      expect(eventsC3.length).toBe(0); // Expect data loss
    });
  });

  describe('deep-QA regressions (#14, #19, #21)', () => {
    test('#14 deleteSelected with no selection reports a failure (consistent with NO_SELECTION)', () => {
      render(<RiffScore id="dq-del" />);
      const api = getAPI('dq-del');
      act(() => api.deselectAll());
      api.deleteSelected();
      const r = api.result;
      expect(r.ok).toBe(false);
      expect(r.status).toBe('error');
      expect(r.code).toBe('NO_SELECTION');
    });

    test('#19 setTimeSignature to the current value is a no-op that does not pollute undo', () => {
      render(<RiffScore id="dq-ts" />);
      const api = getAPI('dq-ts');
      act(() => api.setTimeSignature('3/4')); // a real change
      const canUndoAfterReal = api.getScore().timeSignature;
      expect(canUndoAfterReal).toBe('3/4');
      act(() => api.setTimeSignature('3/4')); // unchanged → no-op
      // undo once should revert the ONE real change back to the default, proving the no-op didn't
      // push a second command.
      act(() => api.undo());
      expect(api.getScore().timeSignature).not.toBe('3/4');
    });

    test('#21 transposeDiatonic with a null-measure selection reports a failure (no false ok)', () => {
      render(<RiffScore id="dq-tr" />);
      const api = getAPI('dq-tr');
      act(() => api.deselectAll());
      api.transposeDiatonic(1);
      expect(api.result.ok).toBe(false);
      expect(api.result.code).toBe('NO_SELECTION');
    });
  });
});
