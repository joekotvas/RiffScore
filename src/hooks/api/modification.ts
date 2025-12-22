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
  UpdateEventCommand,
  UpdateNoteCommand,
  SetBpmCommand,
} from '@/commands';

/**
 * Modification method names provided by this factory
 */
type ModificationMethodNames = 'setPitch' | 'setDuration' | 'setAccidental' | 'toggleAccidental' | 'transpose' | 'transposeDiatonic' | 'updateEvent' | 'addMeasure' | 'deleteMeasure' | 'deleteSelected' | 'setKeySignature' | 'setTimeSignature' | 'setMeasurePickup' | 'setClef' | 'setScoreTitle' | 'setBpm' | 'setTheme' | 'setScale' | 'setStaffLayout';

/**
 * Factory for creating Modification API methods.
 * Handles update, structure, and config operations.
 *
 * Uses ThisType<MusicEditorAPI> so `this` is correctly typed without explicit casts.
 *
 * @param ctx - Shared API context
 * @returns Partial API implementation for modification
 */
export const createModificationMethods = (ctx: APIContext): Pick<MusicEditorAPI, ModificationMethodNames> & ThisType<MusicEditorAPI> => {
  const { dispatch, selectionRef, scoreRef } = ctx;

  return {
    setPitch(pitch) {
      const sel = selectionRef.current;
      if (sel.eventId && sel.noteId && sel.measureIndex !== null) {
        dispatch(new ChangePitchCommand(
          sel.measureIndex,
          sel.eventId,
          sel.noteId,
          pitch,
          sel.staffIndex
        ));
      }
      return this;
    },

    setDuration(_duration, _dotted) {
      // TODO: Dispatch ChangeRhythmCommand
      return this;
    },

    setAccidental(_type) {
      // TODO: Implement
      return this;
    },

    toggleAccidental() {
      // TODO: Implement
      return this;
    },

    transpose(_semitones) {
      // TODO: Implement chromatic transposition
      return this;
    },

    transposeDiatonic(steps) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      const sel = selectionRef.current;
      dispatch(new TransposeSelectionCommand(sel, steps));
      return this;
    },

    updateEvent(props) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      const sel = selectionRef.current;
      if (sel.eventId && sel.measureIndex !== null) {
        dispatch(new UpdateEventCommand(
          sel.measureIndex,
          sel.eventId,
          props,
          sel.staffIndex
        ));
      }
      return this;
    },

    // ========== STRUCTURE ==========
    addMeasure(_atIndex) {
      dispatch(new AddMeasureCommand());
      return this;
    },

    deleteMeasure(measureIndex) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      const idx = measureIndex ?? selectionRef.current.measureIndex ?? -1;
      if (idx >= 0) {
        dispatch(new DeleteMeasureCommand(idx));
      }
      return this;
    },

    deleteSelected() {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      const sel = selectionRef.current;
      if (sel.eventId && sel.noteId && sel.measureIndex !== null) {
        dispatch(new DeleteNoteCommand(
          sel.measureIndex,
          sel.eventId,
          sel.noteId,
          sel.staffIndex
        ));
      } else if (sel.eventId && sel.measureIndex !== null) {
        dispatch(new DeleteEventCommand(
          sel.measureIndex,
          sel.eventId,
          sel.staffIndex
        ));
      }
      return this;
    },

    setKeySignature(key) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      dispatch(new SetKeySignatureCommand(key));
      return this;
    },

    setTimeSignature(sig) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      dispatch(new SetTimeSignatureCommand(sig));
      return this;
    },

    setMeasurePickup(isPickup) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      const firstMeasure = scoreRef.current.staves[0]?.measures[0];
      const currentlyPickup = !!firstMeasure?.isPickup;
      
      if (currentlyPickup !== isPickup) {
        dispatch(new TogglePickupCommand());
      }
      return this;
    },

    // ========== CONFIGURATION ==========
    setClef(clef) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      if (clef === 'grand') {
        dispatch(new SetGrandStaffCommand());
      } else {
        dispatch(new SetClefCommand(clef, selectionRef.current.staffIndex));
      }
      return this;
    },

    setScoreTitle(title) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      dispatch(new UpdateTitleCommand(title));
      return this;
    },

    setAccidental(type) {
      const sel = selectionRef.current;
      const { selectedNotes } = sel;
      
      // Batch update for multiple selection
      if (selectedNotes.length > 0) {
        ctx.history.begin();
        selectedNotes.forEach(note => {
          if (note.noteId) { // Skip if invalid
             dispatch(new UpdateNoteCommand(
               note.measureIndex,
               note.eventId,
               note.noteId,
               { accidental: type },
               note.staffIndex
             ));
          }
        });
        ctx.history.commit('Set Accidental');
      } else if (sel.eventId && sel.noteId && sel.measureIndex !== null) {
        // Single selection
        dispatch(new UpdateNoteCommand(
          sel.measureIndex,
          sel.eventId,
          sel.noteId,
          { accidental: type },
          sel.staffIndex
        ));
      }
      return this;
    },

    toggleAccidental() {
      const sel = selectionRef.current;
      // For toggling, we need the current state.
      // Easiest is to target the primary selection or iterate.
      // Logic: sharp -> flat -> natural -> null
      // Implementation Note: Requires resolving current note. 
      // For Phase 7B, implementing for single selection primarily.
      
      if (sel.eventId && sel.noteId && sel.measureIndex !== null) {
        const score = ctx.getScore();
        const staff = score.staves[sel.staffIndex];
        const measure = staff?.measures[sel.measureIndex];
        const event = measure?.events.find(e => e.id === sel.eventId);
        const note = event?.notes.find(n => n.id === sel.noteId);
        
        if (note) {
          const current = note.accidental;
          let next: 'sharp' | 'flat' | 'natural' | null = 'sharp';
          if (current === 'sharp') next = 'flat';
          else if (current === 'flat') next = 'natural';
          else if (current === 'natural') next = null;
          
          dispatch(new UpdateNoteCommand(
            sel.measureIndex,
            sel.eventId,
            sel.noteId,
            { accidental: next },
            sel.staffIndex
          ));
        }
      }
      return this;
    },

    setBpm(bpm) {
      dispatch(new SetBpmCommand(bpm));
      return this;
    },

    setTheme(themeName) {
      if (ctx.setTheme) {
        ctx.setTheme(themeName);
      }
      return this;
    },

    setScale(scale) {
      if (ctx.setZoom) {
        ctx.setZoom(scale);
      }
      return this;
    },

    setStaffLayout(type) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      if (type === 'grand') {
        dispatch(new SetGrandStaffCommand());
      } else {
        dispatch(new SetSingleStaffCommand('treble'));
      }
      return this;
    },
  };
};
