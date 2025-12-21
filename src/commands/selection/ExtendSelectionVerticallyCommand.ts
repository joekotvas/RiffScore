/**
 * ExtendSelectionVerticallyCommand
 *
 * Extends selection vertically using a slice-based approach (Phase 2f).
 * - Code iterates over each "Vertical Slice" (time point) present in the selection.
 * - For each slice, it identifies a slice-specific "Anchor" (static edge) and "Cursor" (moving edge).
 * - Global orientation (Up/Down) is inferred from the relationship between the Global Anchor and Focus.
 * - This allows independent chords to be extended simultaneously.
 *
 * @see Issue #101
 * @see Phase 2f
 */

import type { Selection, Score, SelectedNote, ScoreEvent } from '../../types';
import type { SelectionCommand } from './types';
import { getNoteDuration } from '../../utils/core';
import { getMidi } from '../../services/MusicService';

export type ExpandDirection = 'up' | 'down' | 'all';

export interface ExtendSelectionVerticallyOptions {
  direction: ExpandDirection;
}

interface VerticalPoint {
  measureIndex: number;
  staffIndex: number;
  eventId: string | number;
  noteId: string | number | null;
  midi: number;
  time: number; // Global quant time (measureIndex * 100000 + quant)
}

export class ExtendSelectionVerticallyCommand implements SelectionCommand {
  readonly type = 'EXTEND_SELECTION_VERTICALLY';
  private direction: ExpandDirection;

  constructor(options: ExtendSelectionVerticallyOptions) {
    this.direction = options.direction;
  }

  execute(state: Selection, score: Score): Selection {
    // 1. Basic Validation
    if (!state.anchor || state.selectedNotes.length === 0) return state;

    // 2. Setup
    const anchorPt = this.toVerticalPoint(state.anchor, score);
    // If anchor is invalid (e.g. deleted note), just return state or try to recover?
    // Return state for safety.
    if (!anchorPt) return state;

    // 3. Determine Global Orientation
    // Orientation determines which 'edge' of the selection moves in each slice.
    // UP: The TOP edge moves. (Bottom is anchor).
    // DOWN: The BOTTOM edge moves. (Top is anchor).
    let orientation: 'up' | 'down' = 'down'; // Default
    
    // Heuristic: Check relationship between Anchor and Focus (state.noteId)
    // If we have a focus note different from anchor...
    if (state.noteId && state.noteId !== state.anchor.noteId) {
      const focusNote = state.selectedNotes.find(n => n.noteId === state.noteId);
      if (focusNote) {
        const focusPt = this.toVerticalPoint(focusNote, score);
        if (focusPt) {
           const metricA = this.calculateVerticalMetric(anchorPt.staffIndex, anchorPt.midi);
           const metricF = this.calculateVerticalMetric(focusPt.staffIndex, focusPt.midi);
           if (metricF > metricA) orientation = 'up'; // Visual UP (Higher Pitch)
           else if (metricF < metricA) orientation = 'down'; // Visual DOWN (Lower Pitch)
        }
      }
    } else {
       // Neutral state (Anchor == Focus): Use input direction to establish orientation
       orientation = this.direction === 'up' ? 'up' : 'down'; 
       if (this.direction === 'all') orientation = 'down'; 
    }

    // 4. Group by Time Slice
    const slices = new Map<number, VerticalPoint[]>();
    for (const note of state.selectedNotes) {
       const pt = this.toVerticalPoint(note, score);
       if (pt) {
          if (!slices.has(pt.time)) slices.set(pt.time, []);
          slices.get(pt.time)!.push(pt);
       }
    }

    const newSelectedNotes: SelectedNote[] = [];
    let newFocusPoint: VerticalPoint | null = null;
    let hasChanged = false;
    
    // 5. Process Slices
    for (const [time, points] of slices.entries()) {
       if (points.length === 0) continue;

       // Find Metric Extremes in this slice
       let minPt = points[0];
       let maxPt = points[0];
       let minM = this.calculateVerticalMetric(minPt.staffIndex, minPt.midi);
       let maxM = minM;

       for (let i = 1; i < points.length; i++) {
           const p = points[i];
           const m = this.calculateVerticalMetric(p.staffIndex, p.midi);
           if (m < minM) { minM = m; minPt = p; }
           if (m > maxM) { maxM = m; maxPt = p; }
       }
       
       let sliceAnchorPt: VerticalPoint; // The static edge
       let sliceCursorPt: VerticalPoint; // The moving edge

       if (orientation === 'up') {
          sliceAnchorPt = minPt; // Bottom is fixed
          sliceCursorPt = maxPt; // Top moves
       } else {
          sliceAnchorPt = maxPt; // Top is fixed
          sliceCursorPt = minPt; // Bottom moves
       }
       
       // Collect Stack (All notes at this time, sorted Top to Bottom)
       const stack = this.collectVerticalStack(score, time);
       
       // Move Cursor
       const newCursorPt = this.moveCursorInStack(stack, sliceCursorPt, this.direction);
       
       if (newCursorPt.noteId !== sliceCursorPt.noteId || newCursorPt.eventId !== sliceCursorPt.eventId) {
           hasChanged = true;
       }
       
       // Check if this slice contained the global focus to update it
       const wasFocusSlice = points.some(p => p.noteId === state.noteId && p.eventId === state.eventId);
       if (wasFocusSlice) {
          newFocusPoint = newCursorPt;
       }
       
       // Collect Range (Anchor..NewCursor)
       const m1 = this.calculateVerticalMetric(sliceAnchorPt.staffIndex, sliceAnchorPt.midi);
       const m2 = this.calculateVerticalMetric(newCursorPt.staffIndex, newCursorPt.midi);
       const low = Math.min(m1, m2);
       const high = Math.max(m1, m2);

       for (const p of stack) {
          const m = this.calculateVerticalMetric(p.staffIndex, p.midi);
          if (m >= low && m <= high) {
             newSelectedNotes.push({
               staffIndex: p.staffIndex,
               measureIndex: p.measureIndex,
               eventId: p.eventId,
               noteId: p.noteId
             });
          }
       }
    }

    if (!hasChanged) return state;

    // 6. Return Result
    return {
       ...state,
       selectedNotes: newSelectedNotes,
       noteId: newFocusPoint?.noteId ?? state.noteId,
       eventId: newFocusPoint?.eventId ?? state.eventId,
       staffIndex: newFocusPoint?.staffIndex ?? state.staffIndex,
       measureIndex: newFocusPoint?.measureIndex ?? state.measureIndex
    };
  }

  // =========================================================================================
  // HELPERS
  // =========================================================================================

  /**
   * Calculate a linear value for vertical position.
   * Higher Pitch = Higher Value.
   * Top Staff > Bottom Staff.
   */
  private calculateVerticalMetric(staffIndex: number, midi: number): number {
    return ((10 - staffIndex) * 1000) + midi;
  }

  private toVerticalPoint(note: SelectedNote, score: Score): VerticalPoint | null {
    const staff = score.staves[note.staffIndex];
    if (!staff) return null;
    const measure = staff.measures[note.measureIndex];
    if (!measure) return null;
    
    // Find event and time
    let time = 0;
    let foundEvent: ScoreEvent | undefined;
    let currentQuant = 0;

    for (const e of measure.events) {
      const duration = getNoteDuration(e.duration, e.dotted, e.tuplet);
      if (e.id === note.eventId) {
        foundEvent = e;
        time = (note.measureIndex * 100000) + currentQuant;
        break;
      }
      currentQuant += duration;
    }

    if (!foundEvent) return null;

    // Resolve pitch
    let midi = 60; // Default
    let realNoteId = note.noteId;
    
    if (foundEvent.isRest) {
      midi = staff.clef === 'bass' ? 48 : 71; 
    } else if (note.noteId) {
      const n = foundEvent.notes.find((n) => n.id === note.noteId);
      if (n) midi = getMidi(n.pitch || 'C4');
    } else if (foundEvent.notes.length > 0) {
       midi = getMidi(foundEvent.notes[0].pitch || 'C4');
       realNoteId = foundEvent.notes[0].id;
    }

    return {
      measureIndex: note.measureIndex,
      staffIndex: note.staffIndex,
      eventId: note.eventId,
      noteId: realNoteId,
      midi,
      time
    };
  }

  private collectVerticalStack(score: Score, globalTime: number): VerticalPoint[] {
    const stack: VerticalPoint[] = [];
    
    const mIndex = Math.floor(globalTime / 100000);
    const timeQuant = globalTime % 100000;

    for (let sIdx = 0; sIdx < score.staves.length; sIdx++) {
      const staff = score.staves[sIdx];
      const measure = staff.measures[mIndex];
      if (!measure) continue;

      let q = 0;
      for (const event of measure.events) {
        const dur = getNoteDuration(event.duration, event.dotted, event.tuplet);
        if (q === timeQuant) { 
          if (event.notes) {
            for (const note of event.notes) {
               stack.push({
                 staffIndex: sIdx,
                 measureIndex: mIndex,
                 eventId: event.id,
                 noteId: note.id,
                 midi: getMidi(note.pitch || 'C4'),
                 time: globalTime
               });
            }
          }
        }
        q += dur;
      }
    }

    // Sort High to Low (Visual Top to Bottom)
    return stack.sort((a, b) => {
      const mA = this.calculateVerticalMetric(a.staffIndex, a.midi);
      const mB = this.calculateVerticalMetric(b.staffIndex, b.midi);
      return mB - mA; // Descending
    });
  }

  private moveCursorInStack(
    stack: VerticalPoint[], 
    current: VerticalPoint, 
    direction: ExpandDirection
  ): VerticalPoint {
    if (stack.length === 0) return current;

    // Find index
    const idx = stack.findIndex(p => 
      p.staffIndex === current.staffIndex &&
      p.eventId === current.eventId &&
      p.noteId === current.noteId
    );

    if (idx === -1) {
      return current;
    }

    let newIdx = idx;
    if (direction === 'up') {
      newIdx = Math.max(0, idx - 1);
    } else if (direction === 'down') {
      newIdx = Math.min(stack.length - 1, idx + 1);
    } else if (direction === 'all') {
      newIdx = stack.length - 1; 
    }

    return stack[newIdx];
  }
}
