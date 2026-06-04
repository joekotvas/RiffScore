/**
 * ScoreAPI.accidental.test.tsx
 *
 * Tests for accidental modification methods.
 * Covers: setAccidental, toggleAccidental.
 */

import { render, act } from '@testing-library/react';
import { Note as TonalNote } from 'tonal';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';
import type { Note } from '../types';

const getAPI = (id: string): MusicEditorAPI => {
  return window.riffScore.get(id) as MusicEditorAPI;
};

// Helper to get first note of first measure
const getNote = (api: MusicEditorAPI, measureIdx = 0, eventIdx = 0, noteIdx = 0): Note => {
  return api.getScore().staves[0].measures[measureIdx].events[eventIdx].notes[noteIdx];
};

describe('ScoreAPI Accidental Methods', () => {
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

  describe('setAccidental', () => {
    test('reports error when no note selected', () => {
      render(<RiffScore id="acc-set-no-sel" />);
      const api = getAPI('acc-set-no-sel');

      act(() => {
        api.setAccidental('sharp');
      });

      expect(api.result).toMatchObject({
        ok: false,
        status: 'error',
        code: 'NO_NOTE_SELECTED',
      });
    });

    test('setAccidental is NOT a no-op: it recomputes the SOUNDING pitch', () => {
      render(<RiffScore id="acc-set" />);
      const api = getAPI('acc-set');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
      });

      // Baseline sounding pitch.
      expect(getNote(api).pitch).toBe('C4');
      expect(TonalNote.midi(getNote(api).pitch!)).toBe(60);

      // Select note
      act(() => {
        api.select(0, 0, 0, 0);
      });

      // Set Sharp -> pitch must MOVE up a semitone (oracle: Tonal midi/alt).
      act(() => {
        api.setAccidental('sharp');
      });
      expect(getNote(api).pitch).toBe('C#4');
      expect(TonalNote.get(getNote(api).pitch!).alt).toBe(1);
      expect(TonalNote.midi(getNote(api).pitch!)).toBe(61);
      // The legacy field is a derived MIRROR of the pitch.
      expect(getNote(api).accidental).toBe('sharp');

      // Set Flat -> applies to the LETTER C, so C#4 becomes Cb4 (sounds B3).
      act(() => {
        api.setAccidental('flat');
      });
      expect(getNote(api).pitch).toBe('Cb4');
      expect(TonalNote.get(getNote(api).pitch!).alt).toBe(-1);
      expect(TonalNote.midi(getNote(api).pitch!)).toBe(59);
      expect(getNote(api).accidental).toBe('flat');

      // Natural -> back to C4.
      act(() => {
        api.setAccidental('natural');
      });
      expect(getNote(api).pitch).toBe('C4');
      expect(getNote(api).accidental).toBe('natural');
    });

    test('sets accidental for multiple selected notes', () => {
      render(<RiffScore id="acc-multi" />);
      const api = getAPI('acc-multi');

      act(() => {
        // Measure 1: C4, D4
        api.select(0).addNote('C4', 'quarter').addNote('D4', 'quarter');
      });

      // Select both notes (simulate multi-select via array if possible, or selecting range)
      // Since API.select() is single point, we need to construct a multi-selection state manually?
      // Or use selectAll('measure')?
      act(() => {
        api.selectAll('measure');
      });

      act(() => {
        api.setAccidental('sharp');
      });

      // Both notes' PITCHES move (the real correctness, not just the mirror).
      expect(getNote(api, 0, 0, 0).pitch).toBe('C#4');
      expect(getNote(api, 0, 1, 0).pitch).toBe('D#4');
      expect(getNote(api, 0, 0, 0).accidental).toBe('sharp');
      expect(getNote(api, 0, 1, 0).accidental).toBe('sharp');

      // Undo should revert both pitches (transaction)
      act(() => {
        api.undo();
      });
      expect(getNote(api, 0, 0, 0).pitch).toBe('C4');
      expect(getNote(api, 0, 1, 0).pitch).toBe('D4');
      expect(getNote(api, 0, 0, 0).accidental).toBeFalsy();
      expect(getNote(api, 0, 1, 0).accidental).toBeFalsy();
    });
  });

  describe('toggleAccidental', () => {
    test('reports error when no note selected', () => {
      render(<RiffScore id="acc-toggle-no-sel" />);
      const api = getAPI('acc-toggle-no-sel');

      act(() => {
        api.toggleAccidental();
      });

      expect(api.result).toMatchObject({
        ok: false,
        status: 'error',
        code: 'NO_NOTE_SELECTED',
      });
    });

    test('cycles the SOUNDING pitch: natural -> sharp -> flat -> natural', () => {
      render(<RiffScore id="acc-toggle" />);
      const api = getAPI('acc-toggle');

      act(() => {
        api.select(0).addNote('C4', 'quarter');
      });

      // Advance cursor model means cursor is now AFTER the note.
      // Must move left to select it for modification.
      act(() => {
        api.move('left');
      });

      // The "current" accidental is derived from the pitch (contract C1), so the
      // cycle is a 3-state cycle over SOUNDING alteration. C4 (natural) -> sharp.
      const midi = () => TonalNote.midi(getNote(api).pitch!);

      // Toggle 1: natural -> sharp (C4 -> C#4, +1 semitone)
      act(() => {
        api.toggleAccidental();
      });
      expect(getNote(api).pitch).toBe('C#4');
      expect(midi()).toBe(61);
      expect(getNote(api).accidental).toBe('sharp');

      // Toggle 2: sharp -> flat (C#4 -> Cb4, sounds B3)
      act(() => {
        api.toggleAccidental();
      });
      expect(getNote(api).pitch).toBe('Cb4');
      expect(midi()).toBe(59);
      expect(getNote(api).accidental).toBe('flat');

      // Toggle 3: flat -> natural (back to C4)
      act(() => {
        api.toggleAccidental();
      });
      expect(getNote(api).pitch).toBe('C4');
      expect(midi()).toBe(60);
      expect(getNote(api).accidental).toBe('natural');

      // Toggle 4: natural -> sharp again (cycle wraps)
      act(() => {
        api.toggleAccidental();
      });
      expect(getNote(api).pitch).toBe('C#4');
      expect(midi()).toBe(61);
    });
  });
});
