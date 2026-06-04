import { createNotePayload } from '@/utils/entry/notePayload';
import { deriveAccidental } from '@/services/MusicService';

describe('createNotePayload', () => {
  // CONTRACT C1: `pitch` is the single source of truth for alteration. This
  // builder is a dumb constructor — it stores whatever it is given. Callers are
  // responsible for passing an already-folded pitch and a DERIVED accidental
  // mirror (see the "contract C1 usage" block below).
  describe('basic note creation', () => {
    it('creates a note with default values', () => {
      const note = createNotePayload({ pitch: 'C4' });

      expect(note.pitch).toBe('C4');
      expect(note.accidental).toBeNull();
      expect(note.tied).toBe(false);
      expect(note.id).toBeDefined();
    });

    it('creates a note with explicit accidental', () => {
      const note = createNotePayload({ pitch: 'F4', accidental: 'sharp' });

      expect(note.pitch).toBe('F4');
      expect(note.accidental).toBe('sharp');
    });

    it('creates a tied note', () => {
      const note = createNotePayload({ pitch: 'G4', tied: true });

      expect(note.pitch).toBe('G4');
      expect(note.tied).toBe(true);
    });

    it('creates a note with all options', () => {
      const note = createNotePayload({
        pitch: 'Bb3',
        accidental: 'flat',
        tied: true,
      });

      expect(note.pitch).toBe('Bb3');
      expect(note.accidental).toBe('flat');
      expect(note.tied).toBe(true);
    });
  });

  describe('ID handling', () => {
    it('generates unique IDs when not provided', () => {
      const note1 = createNotePayload({ pitch: 'C4' });
      const note2 = createNotePayload({ pitch: 'C4' });

      expect(note1.id).not.toBe(note2.id);
    });

    it('uses provided ID when specified', () => {
      const note = createNotePayload({ pitch: 'C4', id: 'custom-id-123' });

      expect(note.id).toBe('custom-id-123');
    });

    it('uses string ID when specified', () => {
      const note = createNotePayload({ pitch: 'C4', id: '12345' });

      expect(note.id).toBe('12345');
    });
  });

  describe('accidental values', () => {
    it('handles sharp accidental', () => {
      const note = createNotePayload({ pitch: 'F4', accidental: 'sharp' });
      expect(note.accidental).toBe('sharp');
    });

    it('handles flat accidental', () => {
      const note = createNotePayload({ pitch: 'B4', accidental: 'flat' });
      expect(note.accidental).toBe('flat');
    });

    it('handles natural accidental', () => {
      const note = createNotePayload({ pitch: 'F4', accidental: 'natural' });
      expect(note.accidental).toBe('natural');
    });

    it('handles null accidental', () => {
      const note = createNotePayload({ pitch: 'C4', accidental: null });
      expect(note.accidental).toBeNull();
    });
  });

  describe('contract C1 usage: pitch is the source of truth, accidental is a derived mirror', () => {
    // The entry hooks fold the active accidental / key into the PITCH and then
    // derive the mirror from that pitch. These tests assert that producing a
    // payload the C1-correct way yields a pitch and mirror that AGREE.
    it.each([
      ['F#4', 'sharp'],
      ['Bb3', 'flat'],
      ['C4', 'natural'],
      ['Fx5', 'sharp'],
    ])('a resolved pitch %s yields a mirror that matches the pitch', (pitch, expectedMirror) => {
      const note = createNotePayload({ pitch, accidental: deriveAccidental(pitch) });
      expect(note.pitch).toBe(pitch);
      expect(note.accidental).toBe(expectedMirror);
    });

    it('the mirror never contradicts the sounding pitch', () => {
      const note = createNotePayload({ pitch: 'Gb4', accidental: deriveAccidental('Gb4') });
      // Gb4 sounds as F#4 (chroma 6); the mirror says 'flat' to match the spelling.
      expect(note.accidental).toBe('flat');
    });
  });
});
