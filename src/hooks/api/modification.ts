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
import { parseDuration, clampBpm, canModifyEventDuration } from '@/utils/validation';
import { tupletsFitTimeSignature } from '@/utils/core';
import { refuse } from '@/refusals';
import { foldAccidentalIntoPitch, deriveAccidental } from '@/services/MusicService';
import { Note, Score, getValidStaff } from '@/types';
import { getMeasureCapacity } from '@/constants';

/**
 * Modification method names provided by this factory
 */
type ModificationMethodNames =
  | 'setPitch'
  | 'setDuration'
  | 'setAccidental'
  | 'toggleAccidental'
  | 'setAccidentalDisplay'
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

      // #242 Lane D: never silently produce an over-full bar. The API path previously dispatched
      // unconditionally (fail-open), yielding a measure that validateMeasure now flags as invalid.
      const maxQuants = getMeasureCapacity(scoreRef.current.timeSignature ?? '4/4');
      const fitsInMeasure = (staffIndex: number, measureIndex: number, eventId: string): boolean => {
        const measure = getValidStaff(scoreRef.current, staffIndex)?.measures[measureIndex];
        return !measure || canModifyEventDuration(measure.events, eventId, validDuration, maxQuants, dotted);
      };

      // Multi-selection: update each unique event (atomic — reject all if ANY would overflow).
      if (sel.selectedNotes && sel.selectedNotes.length > 0) {
        const uniqueEvents = Array.from(
          new Map(
            sel.selectedNotes.map((n) => [`${n.staffIndex}-${n.measureIndex}-${n.eventId}`, n])
          ).values()
        );
        const overflowing = uniqueEvents.filter(
          (n) => !fitsInMeasure(n.staffIndex, n.measureIndex, n.eventId)
        );
        if (overflowing.length > 0) {
          setResult({
            method: 'setDuration',
            ...refuse('DURATION_OVERFLOW', {
              messageCtx: { duration, dotted },
              details: { duration, dotted, overflow: overflowing.length },
            }),
          });
          return this;
        }

        ctx.history.begin();
        uniqueEvents.forEach((note) => {
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
          message: `Duration set to ${duration} (dotted: ${dotted}) for ${uniqueEvents.length} events`,
          details: { duration, dotted, count: uniqueEvents.length },
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

      if (!fitsInMeasure(sel.staffIndex, sel.measureIndex, sel.eventId)) {
        setResult({
          method: 'setDuration',
          ...refuse('DURATION_OVERFLOW', {
            messageCtx: { duration, dotted },
            details: { duration, dotted, eventId: sel.eventId },
          }),
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
      // Report a no-op as failure, matching transpose() and TransposeSelectionCommand.execute, which
      // bails on measureIndex === null regardless of selectedNotes. (The old `&& selectedNotes empty`
      // let a null-measure selection through to a silent no-op falsely reported as success.)
      if (sel.measureIndex === null) {
        setResult({
          ok: false,
          status: 'error',
          method: 'transposeDiatonic',
          message: 'No selection',
          code: 'NO_SELECTION',
        });
        return this;
      }
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
        // Escape hatch for arbitrary event props, but still uphold the never-silently-overfull
        // invariant (#242 Lane D): a duration/dotted change that wouldn't fit the bar is rejected.
        if ('duration' in props || 'dotted' in props) {
          const measure = getValidStaff(scoreRef.current, sel.staffIndex)?.measures[sel.measureIndex];
          const event = measure?.events.find((e) => e.id === sel.eventId);
          if (measure && event) {
            const targetDuration = props.duration ?? event.duration;
            const targetDotted = 'dotted' in props ? !!props.dotted : event.dotted;
            const maxQuants = getMeasureCapacity(scoreRef.current.timeSignature ?? '4/4');
            if (!canModifyEventDuration(measure.events, sel.eventId, targetDuration, maxQuants, targetDotted)) {
              setResult({
                method: 'updateEvent',
                ...refuse('DURATION_OVERFLOW', { details: { props } }),
              });
              return this;
            }
          }
        }
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
        // Consistent with the registry (NO_SELECTION = error) and every other NO_SELECTION site —
        // nothing was deleted, so report it as a failure rather than a misleading ok:true warning.
        setResult({
          method: 'deleteSelected',
          ...refuse('NO_SELECTION', { message: 'Nothing selected to delete' }),
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
      // No-op when unchanged — don't dispatch a command that would pollute the undo stack (mirrors
      // the UI path and setMeasurePickup).
      if (sig === ctx.getScore().timeSignature) {
        setResult({
          ok: true,
          status: 'info',
          method: 'setTimeSignature',
          message: `Time signature already ${sig}`,
          details: { signature: sig },
        });
        return this;
      }
      // A tuplet group is atomic; if one can't fit a whole bar of the new meter, reflow has no valid
      // placement — refuse rather than corrupt the score into an overfull bar. (#256)
      if (!tupletsFitTimeSignature(ctx.getScore().staves, sig)) {
        setResult({
          method: 'setTimeSignature',
          ...refuse('TUPLET_EXCEEDS_BAR', {
            messageCtx: { signature: sig },
            details: { signature: sig },
          }),
        });
        return this;
      }
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

    setAccidentalDisplay(policy) {
      const sel = selectionRef.current;
      const { selectedNotes } = sel;
      const score = ctx.getScore();

      // Set the display policy WITHOUT touching the pitch — accidentalDisplay is
      // orthogonal to the sounding pitch (#236). UpdateNoteCommand assigns the
      // field directly (no accidental-fold / pitch re-derive happens unless a
      // pitch/accidental key is present).
      const apply = (
        staffIndex: number,
        measureIndex: number,
        eventId: string,
        noteId: string
      ): boolean => {
        const found = findNoteContext(score, staffIndex, measureIndex, eventId, noteId);
        if (!found || found.note.pitch == null) return false;
        dispatch(
          new UpdateNoteCommand(
            measureIndex,
            eventId,
            noteId,
            { accidentalDisplay: policy },
            staffIndex
          )
        );
        return true;
      };

      if (selectedNotes.length > 0) {
        ctx.history.begin();
        let count = 0;
        selectedNotes.forEach((noteRef) => {
          if (
            noteRef.noteId &&
            noteRef.eventId &&
            noteRef.measureIndex != null &&
            noteRef.staffIndex != null &&
            apply(noteRef.staffIndex, noteRef.measureIndex, noteRef.eventId, noteRef.noteId)
          ) {
            count++;
          }
        });
        ctx.history.commit();
        setResult({
          ok: true,
          status: 'info',
          method: 'setAccidentalDisplay',
          message: `Accidental display set to ${policy} for ${count} notes`,
          details: { policy, count },
        });
      } else if (sel.eventId && sel.noteId && sel.measureIndex !== null) {
        if (apply(sel.staffIndex, sel.measureIndex, sel.eventId, sel.noteId)) {
          setResult({
            ok: true,
            status: 'info',
            method: 'setAccidentalDisplay',
            message: `Accidental display set to ${policy}`,
            details: { policy },
          });
        } else {
          setResult({
            ok: false,
            status: 'error',
            method: 'setAccidentalDisplay',
            message: 'Selected element is not a pitched note',
            code: 'NO_NOTE_SELECTED',
          });
        }
      } else {
        setResult({
          ok: false,
          status: 'error',
          method: 'setAccidentalDisplay',
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
