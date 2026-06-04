import { MusicEditorAPI } from '@/api.types';
import { APIContext } from './types';
import {
  ChangePitchCommand,
  AddMeasureCommand,
  DeleteMeasureCommand,
  DeleteEventCommand,
  DeleteNoteCommand,
  SetClefCommand,
  SetKeySignatureCommand,
  SetTimeSignatureCommand,
  TogglePickupCommand,
  SetGrandStaffCommand,
  SetSingleStaffCommand,
  UpdateTitleCommand,
  TransposeSelectionCommand,
  ChromaticTransposeCommand,
  UpdateEventCommand,
  UpdateNoteCommand,
  SetBpmCommand,
} from '@/commands';
import { parseDuration, clampBpm } from '@/utils/validation';
import { foldAccidentalIntoPitch, deriveAccidental } from '@/services/MusicService';
import { Note, Score } from '@/types';

/**
 * Modification method names provided by this factory
 */
type ModificationMethodNames =
  | 'setPitch'
  | 'setDuration'
  | 'setAccidental'
  | 'toggleAccidental'
  | 'transpose'
  | 'transposeDiatonic'
  | 'updateEvent'
  | 'addMeasure'
  | 'deleteMeasure'
  | 'deleteSelected'
  | 'setKeySignature'
  | 'setTimeSignature'
  | 'setMeasurePickup'
  | 'setClef'
  | 'setScoreTitle'
  | 'setBpm'
  | 'setTheme'
  | 'setScale'
  | 'setStaffLayout';

/**
 * Locate a note and the effective key signature for its staff.
 */
const findNoteContext = (
  score: Score,
  staffIndex: number,
  measureIndex: number,
  eventId: string,
  noteId: string
): { note: Note; keySignature: string } | null => {
  const staff = score.staves[staffIndex];
  const measure = staff?.measures[measureIndex];
  const event = measure?.events.find((e) => e.id === eventId);
  const note = event?.notes.find((n) => n.id === noteId);
  if (!note) return null;
  const keySignature = staff?.keySignature || score.keySignature || 'C';
  return { note, keySignature };
};

/**
 * Build the UpdateNoteCommand payload for an accidental change, folding the
 * accidental into the SOUNDING pitch (contract C1) and keeping `accidental`
 * populated as a strictly-derived mirror.
 */
const buildAccidentalUpdate = (
  note: Note,
  type: 'sharp' | 'flat' | 'natural' | null,
  keySignature: string
): Partial<Note> | null => {
  // Rests (null pitch) have no accidental.
  if (note.pitch === null) return null;
  const newPitch = foldAccidentalIntoPitch(note.pitch, type, keySignature);
  return { pitch: newPitch, accidental: deriveAccidental(newPitch) };
};

/**
 * Factory for creating Modification API methods.
 * Handles update, structure, and config operations.
 *
 * Uses ThisType<MusicEditorAPI> so `this` is correctly typed without explicit casts.
 *
 * @param ctx - Shared API context
 * @returns Partial API implementation for modification
 */
export const createModificationMethods = (
  ctx: APIContext
): Pick<MusicEditorAPI, ModificationMethodNames> & ThisType<MusicEditorAPI> => {
  const { dispatch, selectionRef, scoreRef, setResult } = ctx;

  return {
    setPitch(pitch) {
      const sel = selectionRef.current;
      if (sel.eventId && sel.noteId && sel.measureIndex !== null) {
        dispatch(
          new ChangePitchCommand(sel.measureIndex, sel.eventId, sel.noteId, pitch, sel.staffIndex)
        );
        setResult({
          ok: true,
          status: 'info',
          method: 'setPitch',
          message: `Pitch set to ${pitch}`,
          details: { pitch, noteId: sel.noteId },
        });
      } else {
        setResult({
          ok: false,
          status: 'error',
          method: 'setPitch',
          message: 'No note selected',
          code: 'NO_NOTE_SELECTED',
        });
      }
      return this;
    },

    setDuration(duration, dotted = false) {
      const validDuration = parseDuration(duration);
      if (!validDuration) {
        setResult({
          ok: false,
          status: 'error',
          method: 'setDuration',
          message: `Invalid duration: "${duration}"`,
          code: 'INVALID_DURATION',
          details: { duration },
        });
        return this;
      }

      const sel = selectionRef.current;

      // Multi-selection: update each unique event
      if (sel.selectedNotes && sel.selectedNotes.length > 0) {
        ctx.history.begin();

        const processedEvents = new Set<string>();
        sel.selectedNotes.forEach((note) => {
          const eventKey = `${note.staffIndex}-${note.measureIndex}-${note.eventId}`;
          if (processedEvents.has(eventKey)) return;
          processedEvents.add(eventKey);

          dispatch(
            new UpdateEventCommand(
              note.measureIndex,
              note.eventId,
              { duration: validDuration, dotted },
              note.staffIndex
            )
          );
        });

        ctx.history.commit();
        setResult({
          ok: true,
          status: 'info',
          method: 'setDuration',
          message: `Duration set to ${duration} (dotted: ${dotted}) for ${processedEvents.size} events`,
          details: { duration, dotted, count: processedEvents.size },
        });
        return this;
      }

      // Single selection
      if (sel.measureIndex === null || sel.eventId === null) {
        setResult({
          ok: false,
          status: 'error',
          method: 'setDuration',
          message: 'No event selected',
          code: 'NO_SELECTION',
        });
        return this;
      }

      dispatch(
        new UpdateEventCommand(
          sel.measureIndex,
          sel.eventId,
          { duration: validDuration, dotted },
          sel.staffIndex
        )
      );
      setResult({
        ok: true,
        status: 'info',
        method: 'setDuration',
        message: `Duration set to ${duration} (dotted: ${dotted})`,
        details: { duration, dotted, eventId: sel.eventId },
      });
      return this;
    },

    transpose(semitones) {
      const sel = selectionRef.current;
      if (sel.measureIndex === null) {
        setResult({
          ok: false,
          status: 'error',
          method: 'transpose',
          message: 'No selection',
          code: 'NO_SELECTION',
        });
        return this;
      }
      dispatch(new ChromaticTransposeCommand(sel, semitones));
      setResult({
        ok: true,
        status: 'info',
        method: 'transpose',
        message: `Transposed ${semitones} semitones`,
        details: { semitones },
      });
      return this;
    },

    transposeDiatonic(steps) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      const sel = selectionRef.current;
      dispatch(new TransposeSelectionCommand(sel, steps));
      setResult({
        ok: true,
        status: 'info',
        method: 'transposeDiatonic',
        message: `Transposed ${steps} diatonic steps`,
        details: { steps },
      });
      return this;
    },

    updateEvent(props) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      const sel = selectionRef.current;
      if (sel.eventId && sel.measureIndex !== null) {
        dispatch(new UpdateEventCommand(sel.measureIndex, sel.eventId, props, sel.staffIndex));
        setResult({
          ok: true,
          status: 'info',
          method: 'updateEvent',
          message: 'Event updated',
          details: { props },
        });
      } else {
        setResult({
          ok: false,
          status: 'error',
          method: 'updateEvent',
          message: 'No event selected',
          code: 'NO_SELECTION',
        });
      }
      return this;
    },

    // ========== STRUCTURE ==========
    addMeasure(atIndex) {
      dispatch(new AddMeasureCommand(atIndex));
      setResult({
        ok: true,
        status: 'info',
        method: 'addMeasure',
        message: `Measure added${atIndex !== undefined ? ` at index ${atIndex}` : ''}`,
        details: { atIndex },
      });
      return this;
    },

    deleteMeasure(measureIndex) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      const idx = measureIndex ?? selectionRef.current.measureIndex ?? -1;
      if (idx >= 0) {
        dispatch(new DeleteMeasureCommand(idx));
        setResult({
          ok: true,
          status: 'info',
          method: 'deleteMeasure',
          message: `Measure ${idx + 1} deleted`,
          details: { index: idx },
        });
      } else {
        setResult({
          ok: false,
          status: 'error',
          method: 'deleteMeasure',
          message: 'No measure selected or invalid index',
          code: 'INVALID_MEASURE_INDEX',
        });
      }
      return this;
    },

    deleteSelected() {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      const sel = selectionRef.current;
      if (sel.eventId && sel.noteId && sel.measureIndex !== null) {
        dispatch(new DeleteNoteCommand(sel.measureIndex, sel.eventId, sel.noteId, sel.staffIndex));
        setResult({
          ok: true,
          status: 'info',
          method: 'deleteSelected',
          message: 'Note deleted',
          details: { noteId: sel.noteId },
        });
      } else if (sel.eventId && sel.measureIndex !== null) {
        dispatch(new DeleteEventCommand(sel.measureIndex, sel.eventId, sel.staffIndex));
        setResult({
          ok: true,
          status: 'info',
          method: 'deleteSelected',
          message: 'Event deleted',
          details: { eventId: sel.eventId },
        });
      } else {
        setResult({
          ok: true,
          status: 'warning',
          method: 'deleteSelected',
          message: 'Nothing selected to delete',
          code: 'NO_SELECTION',
        });
      }
      return this;
    },

    setKeySignature(key) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      dispatch(new SetKeySignatureCommand(key));
      setResult({
        ok: true,
        status: 'info',
        method: 'setKeySignature',
        message: `Key signature set to ${key}`,
        details: { key },
      });
      return this;
    },

    setTimeSignature(sig) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      dispatch(new SetTimeSignatureCommand(sig));
      setResult({
        ok: true,
        status: 'info',
        method: 'setTimeSignature',
        message: `Time signature set to ${sig}`,
        details: { signature: sig },
      });
      return this;
    },

    setMeasurePickup(isPickup) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      const firstMeasure = scoreRef.current.staves[0]?.measures[0];
      const currentlyPickup = !!firstMeasure?.isPickup;

      if (currentlyPickup !== isPickup) {
        dispatch(new TogglePickupCommand());
        setResult({
          ok: true,
          status: 'info',
          method: 'setMeasurePickup',
          message: `Pickup measure ${isPickup ? 'enabled' : 'disabled'}`,
          details: { isPickup },
        });
      } else {
        setResult({
          ok: true,
          status: 'info',
          method: 'setMeasurePickup',
          message: `Pickup measure already ${isPickup ? 'enabled' : 'disabled'} (no change)`,
          details: { isPickup },
        });
      }
      return this;
    },

    // ========== CONFIGURATION ==========
    setClef(clef) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      if (clef === 'grand') {
        dispatch(new SetGrandStaffCommand());
        setResult({
          ok: true,
          status: 'info',
          method: 'setClef',
          message: 'Set to Grand Staff',
        });
      } else {
        dispatch(new SetClefCommand(clef, selectionRef.current.staffIndex));
        setResult({
          ok: true,
          status: 'info',
          method: 'setClef',
          message: `Clef set to ${clef}`,
          details: { clef },
        });
      }
      return this;
    },

    setScoreTitle(title) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      dispatch(new UpdateTitleCommand(title));
      setResult({
        ok: true,
        status: 'info',
        method: 'setScoreTitle',
        message: `Score title updated`,
        details: { title },
      });
      return this;
    },

    setAccidental(type) {
      const sel = selectionRef.current;
      const { selectedNotes } = sel;
      const score = ctx.getScore();

      // Batch update for multiple selection
      if (selectedNotes.length > 0) {
        ctx.history.begin();
        selectedNotes.forEach((noteRef) => {
          // Validate all required properties before dispatch
          if (
            noteRef.noteId &&
            noteRef.eventId &&
            noteRef.measureIndex != null &&
            noteRef.staffIndex != null
          ) {
            const found = findNoteContext(
              score,
              noteRef.staffIndex,
              noteRef.measureIndex,
              noteRef.eventId,
              noteRef.noteId
            );
            const updates = found && buildAccidentalUpdate(found.note, type, found.keySignature);
            if (updates) {
              dispatch(
                new UpdateNoteCommand(
                  noteRef.measureIndex,
                  noteRef.eventId,
                  noteRef.noteId,
                  updates,
                  noteRef.staffIndex
                )
              );
            }
          }
        });
        ctx.history.commit();
        setResult({
          ok: true,
          status: 'info',
          method: 'setAccidental',
          message: `Accidental set to ${type ?? 'natural'} for ${selectedNotes.length} notes`,
          details: { type, count: selectedNotes.length },
        });
      } else if (sel.eventId && sel.noteId && sel.measureIndex !== null) {
        // Single selection
        const found = findNoteContext(
          score,
          sel.staffIndex,
          sel.measureIndex,
          sel.eventId,
          sel.noteId
        );
        const updates = found && buildAccidentalUpdate(found.note, type, found.keySignature);
        if (updates) {
          dispatch(
            new UpdateNoteCommand(sel.measureIndex, sel.eventId, sel.noteId, updates, sel.staffIndex)
          );
          setResult({
            ok: true,
            status: 'info',
            method: 'setAccidental',
            message: `Accidental set to ${type ?? 'natural'}`,
            details: { type, pitch: updates.pitch },
          });
        } else {
          setResult({
            ok: false,
            status: 'error',
            method: 'setAccidental',
            message: 'Selected element is not a pitched note',
            code: 'NO_NOTE_SELECTED',
          });
        }
      } else {
        setResult({
          ok: false,
          status: 'error',
          method: 'setAccidental',
          message: 'No note selected',
          code: 'NO_NOTE_SELECTED',
        });
      }
      return this;
    },

    toggleAccidental() {
      const sel = selectionRef.current;
      const { selectedNotes } = sel;
      const score = ctx.getScore();

      // The "current" accidental is DERIVED from the pitch (contract C1), never
      // from the stored mirror, so the cycle reflects the true SOUNDING pitch.
      //
      // Because pitch is the source of truth, the cycle is a 3-state cycle over
      // sounding alteration: natural -> sharp -> flat -> natural. (A 4th
      // "no explicit accidental" display state is indistinguishable from natural
      // at the level of sounding pitch and would require a separate display
      // field, which contract C1 forbids in this phase.)
      const getNextAccidental = (
        current: 'sharp' | 'flat' | 'natural' | null
      ): 'sharp' | 'flat' | 'natural' => {
        if (current === 'sharp') return 'flat';
        if (current === 'flat') return 'natural';
        // natural (or anything unaltered) advances to sharp
        return 'sharp';
      };

      if (selectedNotes.length > 0) {
        ctx.history.begin();
        selectedNotes.forEach((noteRef) => {
          if (
            noteRef.noteId &&
            noteRef.eventId &&
            noteRef.measureIndex != null &&
            noteRef.staffIndex != null
          ) {
            const found = findNoteContext(
              score,
              noteRef.staffIndex,
              noteRef.measureIndex,
              noteRef.eventId,
              noteRef.noteId
            );
            if (found && found.note.pitch !== null) {
              // Current alteration is read from the pitch; 'natural' alt=0 maps
              // to the explicit natural step of the cycle only when the note
              // diverges from the key — but for a deterministic, pitch-driven
              // cycle we key off the pitch's own alteration.
              const next = getNextAccidental(deriveAccidental(found.note.pitch));
              const updates = buildAccidentalUpdate(found.note, next, found.keySignature);
              if (updates) {
                dispatch(
                  new UpdateNoteCommand(
                    noteRef.measureIndex,
                    noteRef.eventId,
                    noteRef.noteId,
                    updates,
                    noteRef.staffIndex
                  )
                );
              }
            }
          }
        });
        ctx.history.commit();
        setResult({
          ok: true,
          status: 'info',
          method: 'toggleAccidental',
          message: `Toggled accidentals for ${selectedNotes.length} notes`,
          details: { count: selectedNotes.length },
        });
      } else if (sel.eventId && sel.noteId && sel.measureIndex !== null) {
        const found = findNoteContext(
          score,
          sel.staffIndex,
          sel.measureIndex,
          sel.eventId,
          sel.noteId
        );

        if (found && found.note.pitch !== null) {
          const next = getNextAccidental(deriveAccidental(found.note.pitch));
          const updates = buildAccidentalUpdate(found.note, next, found.keySignature);
          if (updates) {
            dispatch(
              new UpdateNoteCommand(
                sel.measureIndex,
                sel.eventId,
                sel.noteId,
                updates,
                sel.staffIndex
              )
            );
            setResult({
              ok: true,
              status: 'info',
              method: 'toggleAccidental',
              message: 'Toggled accidental',
              details: { noteId: sel.noteId, pitch: updates.pitch },
            });
          }
        } else {
          setResult({
            ok: false,
            status: 'error',
            method: 'toggleAccidental',
            message: 'No pitched note selected',
            code: 'NO_NOTE_SELECTED',
          });
        }
      } else {
        setResult({
          ok: false,
          status: 'error',
          method: 'toggleAccidental',
          message: 'No note selected',
          code: 'NO_NOTE_SELECTED',
        });
      }
      return this;
    },

    setBpm(bpm) {
      const clamped = clampBpm(bpm);
      dispatch(new SetBpmCommand(clamped));
      setResult({
        ok: true,
        status: 'info',
        method: 'setBpm',
        message: `BPM set to ${clamped}`,
        details: { bpm: clamped, requested: bpm },
      });
      return this;
    },

    setTheme(themeName) {
      ctx.setTheme(themeName);
      // useScoreAPI handles result
      return this;
    },

    setScale(scale) {
      ctx.setZoom(scale);
      // useScoreAPI handles result
      return this;
    },

    setStaffLayout(type) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      if (type === 'grand') {
        dispatch(new SetGrandStaffCommand());
      } else {
        dispatch(new SetSingleStaffCommand('treble'));
      }
      setResult({
        ok: true,
        status: 'info',
        method: 'setStaffLayout',
        message: `Layout set to ${type}`,
        details: { type },
      });
      return this;
    },
  };
};
