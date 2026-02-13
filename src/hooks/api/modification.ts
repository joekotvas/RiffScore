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

      // Batch update for multiple selection
      if (selectedNotes.length > 0) {
        ctx.history.begin();
        selectedNotes.forEach((note) => {
          // Validate all required properties before dispatch
          if (note.noteId && note.eventId && note.measureIndex != null && note.staffIndex != null) {
            dispatch(
              new UpdateNoteCommand(
                note.measureIndex,
                note.eventId,
                note.noteId,
                { accidental: type },
                note.staffIndex
              )
            );
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
        dispatch(
          new UpdateNoteCommand(
            sel.measureIndex,
            sel.eventId,
            sel.noteId,
            { accidental: type },
            sel.staffIndex
          )
        );
        setResult({
          ok: true,
          status: 'info',
          method: 'setAccidental',
          message: `Accidental set to ${type ?? 'natural'}`,
          details: { type },
        });
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

      const getNextAccidental = (
        current: 'sharp' | 'flat' | 'natural' | null | undefined
      ): 'sharp' | 'flat' | 'natural' | null => {
        if (current === 'sharp') return 'flat';
        if (current === 'flat') return 'natural';
        if (current === 'natural') return null;
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
            const staff = score.staves[noteRef.staffIndex];
            const measure = staff?.measures[noteRef.measureIndex];
            const event = measure?.events.find((e) => e.id === noteRef.eventId);
            const note = event?.notes.find((n) => n.id === noteRef.noteId);

            if (note) {
              dispatch(
                new UpdateNoteCommand(
                  noteRef.measureIndex,
                  noteRef.eventId,
                  noteRef.noteId,
                  { accidental: getNextAccidental(note.accidental) },
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
          method: 'toggleAccidental',
          message: `Toggled accidentals for ${selectedNotes.length} notes`,
          details: { count: selectedNotes.length },
        });
      } else if (sel.eventId && sel.noteId && sel.measureIndex !== null) {
        const staff = score.staves[sel.staffIndex];
        const measure = staff?.measures[sel.measureIndex];
        const event = measure?.events.find((e) => e.id === sel.eventId);
        const note = event?.notes.find((n) => n.id === sel.noteId);

        if (note) {
          dispatch(
            new UpdateNoteCommand(
              sel.measureIndex,
              sel.eventId,
              sel.noteId,
              { accidental: getNextAccidental(note.accidental) },
              sel.staffIndex
            )
          );
          setResult({
            ok: true,
            status: 'info',
            method: 'toggleAccidental',
            message: 'Toggled accidental',
            details: { noteId: sel.noteId },
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
