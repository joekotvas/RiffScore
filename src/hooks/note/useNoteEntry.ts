/**
 * useNoteEntry Hook
 *
 * Handles note and chord entry operations including adding notes/rests,
 * auto-advancing to next positions, and playing sounds on entry.
 *
 * @tested src/__tests__/hooks/note/useNoteEntry.test.tsx
 */
import { useCallback, RefObject } from 'react';
import { getAppendPreviewNote } from '@/utils/interaction';
import { canAddEventToMeasure } from '@/utils/validation';
import { playNote } from '@/engines/toneEngine';
import { Score, ScoreEvent, getActiveStaff, Selection } from '@/types';
import { Command } from '@/commands/types';
import { AddEventCommand } from '@/commands/AddEventCommand';
import { AddNoteToEventCommand } from '@/commands/AddNoteToEventCommand';
import { AddMeasureCommand } from '@/commands/MeasureCommands';
import { FillReservedSlotCommand } from '@/commands/FillReservedSlotCommand';
import { InsertTupletMemberCommand } from '@/commands/InsertTupletMemberCommand';
import { getTupletRun } from '@/utils/tupletEdit';
import { createNotePayload, createPreviewNote, PreviewNote } from '@/utils/entry';
import { eventId as createEventId, noteId } from '@/utils/id';
import { deriveAccidental } from '@/services/MusicService';
import { InputMode } from '../editor';

/**
 * Placement override for note insertion.
 */
export interface PlacementOverride {
  mode: 'APPEND' | 'INSERT' | 'CHORD';
  index: number;
  eventId?: string;
}

/**
 * Options passed to select function.
 */
export interface SelectOptions {
  /** Only update selection history, not visual selection */
  onlyHistory?: boolean;
}

/**
 * Input for note/chord entry (from preview or direct entry).
 */
export interface NoteInput {
  pitch: string;
  mode?: 'APPEND' | 'INSERT' | 'CHORD';
  index?: number;
  staffIndex?: number;
  eventId?: string;
}

/**
 * Input for chord note.
 */
export interface ChordNoteInput {
  pitch: string;
  accidental?: 'sharp' | 'flat' | 'natural' | null;
}

/**
 * Props for the useNoteEntry hook.
 */
export interface UseNoteEntryProps {
  /** Ref to the current score */
  scoreRef: RefObject<Score>;
  /** Current selection state */
  selection: Selection;
  /** Selection update function */
  select: (
    measureIndex: number | null,
    eventId: string | null,
    noteId: string | null,
    staffIndex?: number,
    options?: SelectOptions
  ) => void;
  /** Preview note setter */
  setPreviewNote: (note: PreviewNote | null) => void;
  /** Current active duration */
  activeDuration: string;
  /** Whether dotted is active */
  isDotted: boolean;
  /** Current accidental selection */
  activeAccidental: 'flat' | 'natural' | 'sharp' | null;
  /** Whether tie is active */
  activeTie: boolean;
  /** Quants per measure */
  currentQuantsPerMeasure: number;
  /** Command dispatcher */
  dispatch: (command: Command) => void;
  /** Current input mode */
  inputMode: InputMode;
}

/**
 * Return type for useNoteEntry hook.
 */
export interface UseNoteEntryReturn {
  /** Add a note or rest to a measure */
  addNoteToMeasure: (
    measureIndex: number,
    newNote: NoteInput,
    shouldAutoAdvance?: boolean,
    placementOverride?: PlacementOverride | null
  ) => void;
  /** Add a chord (multiple notes) to a measure */
  addChordToMeasure: (
    measureIndex: number,
    notes: ChordNoteInput[],
    duration: string,
    dotted: boolean
  ) => void;
}

/**
 * Hook for note and chord entry operations.
 *
 * Handles:
 * - Adding single notes to measures
 * - Adding rests to measures
 * - Adding notes to existing events (chords)
 * - Auto-advancing to next position/measure
 * - Playing note sounds on entry
 *
 * @param props - Hook props
 * @returns Object with addNoteToMeasure and addChordToMeasure callbacks
 *
 * @example
 * ```typescript
 * const { addNoteToMeasure } = useNoteEntry({
 *   scoreRef,
 *   selection,
 *   select,
 *   setPreviewNote,
 *   activeDuration: 'quarter',
 *   isDotted: false,
 *   activeAccidental: null,
 *   activeTie: false,
 *   currentQuantsPerMeasure: 16,
 *   dispatch,
 *   inputMode: 'NOTE',
 * });
 *
 * addNoteToMeasure(0, { pitch: 'C4', mode: 'APPEND', index: 0 }, true);
 * ```
 *
 * @tested src/__tests__/hooks/note/useNoteEntry.test.tsx
 */
export function useNoteEntry({
  scoreRef,
  selection,
  select,
  setPreviewNote,
  activeDuration,
  isDotted,
  activeTie,
  currentQuantsPerMeasure,
  dispatch,
  inputMode,
}: UseNoteEntryProps): UseNoteEntryReturn {
  /*
   * Named function expression used here to support self-recursion.
   * We cannot reference 'addNoteToMeasure' directly as it's not yet initialized in the useCallback closure.
   */
  const addNoteToMeasure = useCallback(
    function addNoteToMeasureCallback(
      measureIndex: number,
      newNote: NoteInput,
      shouldAutoAdvance = false,
      placementOverride: PlacementOverride | null = null
    ) {
      const currentScore = scoreRef.current;
      // Use staff from newNote (preview) if available, otherwise selection
      const currentStaffIndex =
        newNote.staffIndex !== undefined ? newNote.staffIndex : selection.staffIndex;
      const currentStaffData = getActiveStaff(currentScore, currentStaffIndex);

      // (#263) Phantom target past the last existing bar. A hover/keyboard APPEND ghost past the end
      // of a FULL last bar targets `measureIndex + 1` — a bar that doesn't exist yet. Committing a
      // plain AddEventCommand there silently no-ops against the missing measure (the note is lost),
      // because the phantom's empty event list passes the capacity check below and never reaches the
      // capacity-fail auto-advance path. Create the bar first, then place into it.
      //
      // Reached by the keyboard Enter commit, whose preview targets the phantom `measureIndex + 1`
      // bar (useHoverPreview). The mouse-click path also passes shouldAutoAdvance=true but commits
      // against the in-bounds last-bar index (useMeasureInteraction), so it instead takes the
      // capacity-fail auto-advance branch below. Gated on `shouldAutoAdvance` so it does NOT fire for
      // the auto-advance RECURSION, which intentionally re-enters with `shouldAutoAdvance = false` and
      // an out-of-range index that resolves against the freshly dispatched engine measure (scoreRef
      // is still stale on that synchronous re-entry) — that path must fall through to the normal
      // dispatch. Running before the tuplet/slot branches also means a stale selection on a tuplet
      // member can't be overwritten.
      if (measureIndex >= currentStaffData.measures.length && shouldAutoAdvance) {
        dispatch(new AddMeasureCommand());
        addNoteToMeasureCallback(
          measureIndex,
          { ...newNote, staffIndex: currentStaffIndex },
          false,
          { mode: 'APPEND', index: 0 }
        );
        return;
      }

      const newMeasures = [...currentStaffData.measures];
      const targetMeasure = { ...newMeasures[measureIndex] };
      if (!targetMeasure.events) targetMeasure.events = [];

      // Effective placement: an explicit override wins, else the preview's own mode/index.
      const effMode: 'APPEND' | 'INSERT' | 'CHORD' =
        placementOverride?.mode ?? newNote.mode ?? 'APPEND';
      const effIndex = placementOverride?.index ?? newNote.index ?? targetMeasure.events.length;

      // --- Tuplet container edits (#242): a tuplet is a fixed-span container; entry never changes
      // its rhythm, only fills/inserts/sets members. Resolve the placement target from the explicit
      // placement / preview FIRST, falling back to the selection only when it's in this measure (the
      // hover-to-place flow clears the selection so the ghost can render — gating on selection there
      // let a CHORD commit fall through and chord-stack onto a blank reserved slot → "disappeared").
      const intendedEventId =
        placementOverride?.eventId ??
        newNote.eventId ??
        (selection.measureIndex === measureIndex ? selection.eventId : null);
      const slot = intendedEventId
        ? targetMeasure.events.find((e) => e.id === intendedEventId)
        : undefined;

      // A fixed-rhythm member payload (duration/dotted/tuplet are stamped by insertTupletMember).
      const buildMember = () => {
        const evId = createEventId();
        const isRestMember = inputMode === 'REST';
        const restId = `${evId}-rest`;
        const payload = isRestMember
          ? null
          : createNotePayload({
              pitch: newNote.pitch,
              accidental: deriveAccidental(newNote.pitch),
              tied: activeTie,
            });
        const member: ScoreEvent = {
          id: evId,
          duration: activeDuration,
          dotted: isDotted,
          isRest: isRestMember,
          notes: isRestMember ? [{ id: restId, pitch: null, isRest: true }] : [payload!],
        };
        return { member, selNoteId: isRestMember ? restId : payload!.id, evId };
      };

      // (A) RESERVED free slot → INSERT a member (end-fill), consuming the slot. This container-aware
      // insert subsumes the old in-place reserved fill, so the hover CHORD preview over freed space
      // AND the keyboard ghost cursor at a tuplet's free space both commit through one path.
      if (slot?.tuplet && slot.reserved) {
        const slotIdx = targetMeasure.events.findIndex((e) => e.id === slot.id);
        const run = getTupletRun(targetMeasure.events, slotIdx);
        if (run) {
          const realCount = targetMeasure.events
            .slice(run.start, run.end + 1)
            .filter((e) => !e.reserved).length;
          const { member, selNoteId, evId } = buildMember();
          dispatch(
            new InsertTupletMemberCommand(measureIndex, slot.id, realCount, member, currentStaffIndex)
          );
          select(measureIndex, evId, selNoteId, currentStaffIndex);
          setPreviewNote(null);
          return;
        }
      }

      // (B) REAL member, overwrite/append → SET its pitch in place (keep the group; don't drop the
      // tuplet). CHORD legitimately stacks a chord; INSERT is the between-members case in (C).
      if (slot?.tuplet && !slot.reserved && effMode !== 'CHORD' && effMode !== 'INSERT') {
        const noteToAdd =
          inputMode === 'REST'
            ? { id: noteId(), pitch: null, isRest: true }
            : createNotePayload({
                pitch: newNote.pitch,
                accidental: deriveAccidental(newNote.pitch),
                tied: activeTie,
              });
        dispatch(new FillReservedSlotCommand(measureIndex, slot.id, noteToAdd, currentStaffIndex));
        select(measureIndex, slot.id, noteToAdd.id, currentStaffIndex);
        setPreviewNote(null);
        return;
      }

      // (C) INSERT strictly BETWEEN two members of the same tuplet group → insert into the fixed
      // span (consume a reserved slot). A FULL group has no free space → reject (a triplet's span is
      // fixed; you can't add a 4th member). The rejection is surfaced as a subtle footer status on
      // hover (previewNote.blocked → useSelectionStatus), so commit just rejects silently here.
      if (effMode === 'INSERT') {
        const prev = targetMeasure.events[effIndex - 1];
        const here = targetMeasure.events[effIndex];
        // Resolve the group via the id-safe getTupletRun and require the insert point to lie strictly
        // INSIDE one run — not at the seam between two adjacent id-less (legacy) groups, where the
        // inline `prev.tuplet.id === here.tuplet.id` would be `undefined === undefined` → true.
        const run = prev?.tuplet ? getTupletRun(targetMeasure.events, effIndex - 1) : null;
        if (run && here?.tuplet && effIndex > run.start && effIndex <= run.end) {
          const members = targetMeasure.events.slice(run.start, run.end + 1);
          if (!members.some((e) => e.reserved)) {
            setPreviewNote(null);
            return;
          }
          const { member, selNoteId, evId } = buildMember();
          dispatch(
            new InsertTupletMemberCommand(
              measureIndex,
              prev.id,
              effIndex - run.start,
              member,
              currentStaffIndex
            )
          );
          select(measureIndex, evId, selNoteId, currentStaffIndex);
          setPreviewNote(null);
          return;
        }
      }

      // Determine placement
      const insertIndex = effIndex;
      const mode: string = effMode;

      // Check capacity
      if (
        mode !== 'CHORD' &&
        !canAddEventToMeasure(
          targetMeasure.events,
          activeDuration,
          isDotted,
          currentQuantsPerMeasure
        )
      ) {
        if (shouldAutoAdvance && measureIndex === currentStaffData.measures.length - 1) {
          // Auto-create new measure via Command
          dispatch(new AddMeasureCommand());
          // Recursive call will now target the new measure
          addNoteToMeasureCallback(
            measureIndex + 1,
            { ...newNote, staffIndex: currentStaffIndex },
            false,
            {
              mode: 'APPEND',
              index: 0,
            }
          );
          return;
        } else {
          // Cannot add
          return;
        }
      }

      // Resolve Event ID for CHORD mode
      const targetEventId =
        placementOverride?.eventId ||
        newNote.eventId ||
        (mode === 'CHORD' && targetMeasure.events[insertIndex]?.id);

      if (mode === 'CHORD' && targetEventId) {
        // Add note to existing event (only for notes, not rests)
        if (inputMode === 'REST') {
          // Cannot add rest as chord - rests are standalone events
          return;
        }
        // The preview pitch (newNote.pitch) already encodes the active
        // accidental and key snap via resolvePitch. Per contract C1, the
        // `accidental` mirror is DERIVED from that pitch, never the raw tool.
        const noteToAdd = createNotePayload({
          pitch: newNote.pitch,
          accidental: deriveAccidental(newNote.pitch),
          tied: activeTie,
        });
        dispatch(
          new AddNoteToEventCommand(measureIndex, targetEventId, noteToAdd, currentStaffIndex)
        );

        // Update selection to the new note
        select(measureIndex, targetEventId, noteToAdd.id, currentStaffIndex);
        setPreviewNote(null);
      } else {
        // NEW EVENT (note or rest) - unified path
        const eventId = createEventId();
        const isRest = inputMode === 'REST';

        // Build note payload using utility (null for rests).
        // Mirror derived from the resolved pitch (contract C1).
        const notePayload = isRest
          ? null
          : createNotePayload({
              pitch: newNote.pitch,
              accidental: deriveAccidental(newNote.pitch),
              tied: activeTie,
            });

        // Determine the noteId for selection tracking
        const noteId = isRest ? `${eventId}-rest` : notePayload!.id;

        dispatch(
          new AddEventCommand(
            measureIndex,
            isRest,
            notePayload,
            activeDuration,
            isDotted,
            mode === 'INSERT' ? insertIndex : undefined,
            eventId,
            currentStaffIndex
          )
        );

        // Update selection history only
        select(measureIndex, eventId, noteId, currentStaffIndex, { onlyHistory: true });
        setPreviewNote(null);
      }

      // Only play sound for notes, not rests
      if (inputMode === 'NOTE') {
        playNote(newNote.pitch);
      }

      if (shouldAutoAdvance && mode === 'APPEND') {
        const simulatedEvents = [...targetMeasure.events];
        simulatedEvents.push({
          id: 'sim-event',
          duration: activeDuration,
          dotted: isDotted,
          notes: [{ id: 'sim-note', pitch: newNote.pitch, tied: false }],
        });

        const simulatedMeasure = { ...targetMeasure, events: simulatedEvents };

        const nextPreview = getAppendPreviewNote(
          simulatedMeasure,
          measureIndex,
          currentStaffIndex,
          activeDuration,
          isDotted,
          newNote.pitch,
          inputMode === 'REST'
        );

        if (nextPreview.quant >= currentQuantsPerMeasure) {
          const nextMeasureIndex = measureIndex + 1;
          // Create new measure if it doesn't exist
          if (nextMeasureIndex >= currentStaffData.measures.length) {
            dispatch(new AddMeasureCommand());
          }
          setPreviewNote(
            createPreviewNote({
              measureIndex: nextMeasureIndex,
              staffIndex: currentStaffIndex,
              pitch: newNote.pitch,
              duration: activeDuration,
              dotted: isDotted,
              mode: 'APPEND',
              index: 0,
              source: 'keyboard',
            })
          );
        } else {
          setPreviewNote({ ...nextPreview, source: 'keyboard' as const });
        }
        return;
      }

      setPreviewNote(null);
    },
    [
      activeDuration,
      isDotted,
      currentQuantsPerMeasure,
      scoreRef,
      setPreviewNote,
      activeTie,
      dispatch,
      selection,
      select,
      inputMode,
    ]
  );

  const addChordToMeasure = useCallback(
    (measureIndex: number, notes: ChordNoteInput[], duration: string, dotted: boolean) => {
      if (!notes || notes.length === 0) return;

      const eventId = createEventId();
      const firstNote = notes[0];

      // Chord-note pitches already carry their spelling (MIDI/Tonal); the
      // `accidental` mirror is DERIVED from the pitch per contract C1.
      const noteToAdd = createNotePayload({
        pitch: firstNote.pitch,
        accidental: deriveAccidental(firstNote.pitch),
        tied: false,
      });

      dispatch(
        new AddEventCommand(
          measureIndex,
          false, // isRest = false for chord notes
          noteToAdd,
          duration,
          dotted,
          undefined,
          eventId,
          selection.staffIndex
        )
      );

      for (let i = 1; i < notes.length; i++) {
        const note = notes[i];
        const chordNote = createNotePayload({
          pitch: note.pitch,
          accidental: deriveAccidental(note.pitch),
          tied: false,
        });
        dispatch(new AddNoteToEventCommand(measureIndex, eventId, chordNote, selection.staffIndex));
      }

      // Select the first note of the chord
      select(measureIndex, eventId, noteToAdd.id, selection.staffIndex);
      setPreviewNote(null);
    },
    [dispatch, select, setPreviewNote, selection.staffIndex]
  );

  return { addNoteToMeasure, addChordToMeasure };
}
