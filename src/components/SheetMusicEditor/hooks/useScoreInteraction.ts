import { useState, useRef, useEffect, useCallback } from 'react';
import { movePitchVisual } from '../services/MusicService';
import { CONFIG } from '../config';
import { isNoteSelected } from '../utils/selection';

interface DragState {
  active: boolean;
  measureIndex: number | null;
  eventId: string | null;
  noteId: string | number | null;
  startY: number;
  startPitch: string;
  currentPitch: string;
  staffIndex: number;
  initialPitches: Map<string, string>; // Map noteId -> pitch
}

interface UseScoreInteractionProps {
  scoreRef: React.MutableRefObject<any>;
  selection: any; // Using any or import Selection type
  onUpdatePitch: (measureIndex: number, eventId: string | number, noteId: string | number, newPitch: string) => void;
  onSelectNote: (measureIndex: number | null, eventId: string | number | null, noteId: string | number | null, staffIndex?: number, isMulti?: boolean) => void;
}

export const useScoreInteraction = ({ scoreRef, selection, onUpdatePitch, onSelectNote }: UseScoreInteractionProps) => {
    const [dragState, setDragState] = useState<DragState>({
        active: false,
        measureIndex: null,
        eventId: null,
        noteId: null,
        startY: 0,
        startPitch: '',
        currentPitch: '',
        staffIndex: 0,
        initialPitches: new Map()
    });
    
    const mouseDownTime = useRef<number>(0);
    const CLICK_THRESHOLD = 200; // ms to distinguish click from drag

    const handleDragStart = useCallback((params: {
      measureIndex: number;
      eventId: string | number;
      noteId: string | number;
      startPitch: string;
      startY: number;
      isMulti?: boolean;
      staffIndex?: number;
    }) => {
        const { measureIndex, eventId, noteId, startPitch, startY, isMulti = false, staffIndex = 0 } = params;
        
        mouseDownTime.current = Date.now();
        
        // Capture initial pitches
        const initialPitches = new Map<string, string>();
        
        // Helper to find pitch
        const getPitch = (sIndex: number, mIndex: number, eId: string, nId: string | number | null) => {
             const m = scoreRef.current.staves[sIndex]?.measures[mIndex];
             const e = m?.events.find((ev: any) => String(ev.id) === String(eId));
             if (nId) {
                 return e?.notes.find((n: any) => String(n.id) === String(nId))?.pitch;
             }
             return e?.notes[0]?.pitch; 
        };

        const isNoteInSelection = isNoteSelected(selection, { staffIndex, measureIndex, eventId, noteId });

        if (isNoteInSelection) {
            // Multi-move
            selection.selectedNotes.forEach((n: any) => {
                const p = getPitch(n.staffIndex, n.measureIndex, n.eventId, n.noteId);
                if (p) initialPitches.set(String(n.noteId), p);
            });
        } else {
            // Single move
            initialPitches.set(String(noteId), startPitch);
        }

        setDragState({
            active: true,
            measureIndex,
            eventId: typeof eventId === 'number' ? String(eventId) : eventId,
            noteId,
            startY,
            startPitch,
            currentPitch: startPitch,
            staffIndex,
            initialPitches
        });
        
        // Optimistic selection update on mouse down
        onSelectNote(measureIndex, eventId, noteId, staffIndex, isMulti);
    }, [onSelectNote]);

    useEffect(() => {
        if (!dragState.active) return;
    
    const handleMouseMove = (e: MouseEvent) => {
            if (!dragState.active) return;
    
            const deltaY = dragState.startY - e.clientY;
            const stepHeight = CONFIG.lineHeight / 2; // e.g. 5px
            const steps = Math.round(deltaY / stepHeight);
            
            if (steps === 0) return;
    
            // Get proper context from score
            const currentScore = scoreRef.current;
            const currentStaff = currentScore?.staves?.[dragState.staffIndex];
            const keySignature = currentStaff?.keySignature || 'C';
    
            // Perform bulk update
            dragState.initialPitches.forEach((pStart: string, pUserId: string) => {
                const newP = movePitchVisual(pStart, steps, keySignature);
                
                // Find note context from selection (inefficient look up but okay for small selections)
                // We stored pUserId = noteId.
                // But onUpdatePitch needs measureIndex, eventId...
                // We iterate selection.selectedNotes to match noteId?
                // Or if single move, we use dragging params.
                
                // Better approach: We iterate selection.selectedNotes
                // But wait, if single move, note wasn't in selection?
                // If single move, dragged note is in initialPitches.
                
                // Let's use selection if available, or fallback to dragged note params.
                if (selection.selectedNotes && selection.selectedNotes.length > 0 && dragState.initialPitches.size > 1) {
                     const noteInfo = selection.selectedNotes.find((n: any) => String(n.noteId) === pUserId);
                     if (noteInfo) {
                         onUpdatePitch(noteInfo.measureIndex, noteInfo.eventId, noteInfo.noteId, newP);
                     }
                } else {
                     if (dragState.measureIndex !== null && dragState.eventId && dragState.noteId) {
                        onUpdatePitch(dragState.measureIndex, dragState.eventId, dragState.noteId, newP);
                     }
                }
            });

            if (dragState.initialPitches.size > 0) {
                 // Update local state just for the primary dragged note for smoothness (if tracked)
                 const primaryStart = dragState.initialPitches.get(String(dragState.noteId)) || dragState.startPitch;
                 const newPrimary = movePitchVisual(primaryStart, steps, keySignature);
                 if (newPrimary !== dragState.currentPitch) {
                    setDragState(prev => ({ ...prev, currentPitch: newPrimary }));
                 }
            }
        };
    
        const handleMouseUp = () => {
            const dragDuration = Date.now() - mouseDownTime.current;
            
            if (dragDuration < CLICK_THRESHOLD) {
                // Click handled elsewhere
            }
            
            setDragState(prev => ({ ...prev, active: false }));
            document.body.style.cursor = 'default';
        };
    
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'ns-resize';
    
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
    }, [dragState, scoreRef, onUpdatePitch]);

    return {
        dragState,
        handleDragStart
    };
};
