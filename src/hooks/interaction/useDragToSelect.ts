import { useState, useCallback, useEffect, useMemo, RefObject } from 'react';

interface DragSelectState {
  isDragging: boolean;
  startPoint: { x: number; y: number } | null;
  currentPoint: { x: number; y: number } | null;
  isAdditive: boolean; // CMD key held
  activeSvg: SVGSVGElement | null;
  pageIndex: number | null;
}

interface SelectedNote {
  staffIndex: number;
  measureIndex: number;
  eventId: string;
  noteId: string | null;
}

interface NotePosition {
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex?: number | null;
  staffIndex: number;
  measureIndex: number;
  eventId: string;
  noteId: string | null; // null for rests
}

interface UseDragToSelectProps {
  svgRef: RefObject<SVGSVGElement | null>;
  notePositions: NotePosition[];
  onSelectionComplete: (notes: SelectedNote[], isAdditive: boolean) => void;
  onEmptyClick?: () => void; // Called when clicking empty space without dragging
  scale: number;
  enabled?: boolean;
}

interface UseDragToSelectReturn {
  isDragging: boolean;
  justFinishedDrag: boolean; // True for a brief moment after drag ends, to prevent click from clearing selection
  selectionRect: { x: number; y: number; width: number; height: number } | null;
  previewNoteIds: Set<string>; // Composite keys for O(1) lookup: "staffIndex-measureIndex-eventId-noteId"
  handleMouseDown: (
    e: React.MouseEvent,
    options?: { svgElement?: SVGSVGElement | null; pageIndex?: number | null }
  ) => void;
}

export const useDragToSelect = ({
  svgRef,
  notePositions,
  onSelectionComplete,
  scale,
  enabled = true,
}: UseDragToSelectProps): UseDragToSelectReturn => {
  const [dragState, setDragState] = useState<DragSelectState>({
    isDragging: false,
    startPoint: null,
    currentPoint: null,
    isAdditive: false,
    activeSvg: null,
    pageIndex: null,
  });

  // Track if drag just finished to prevent click from clearing selection
  const [justFinishedDrag, setJustFinishedDrag] = useState(false);

  // Calculate selection rectangle from start and current points
  const selectionRect = useMemo(
    () =>
      dragState.isDragging && dragState.startPoint && dragState.currentPoint
        ? {
            x: Math.min(dragState.startPoint.x, dragState.currentPoint.x),
            y: Math.min(dragState.startPoint.y, dragState.currentPoint.y),
            width: Math.abs(dragState.currentPoint.x - dragState.startPoint.x),
            height: Math.abs(dragState.currentPoint.y - dragState.startPoint.y),
          }
        : null,
    [dragState.isDragging, dragState.startPoint, dragState.currentPoint]
  );

  // Check if a note intersects with the selection rectangle
  const noteIntersectsRect = useCallback(
    (note: NotePosition, rect: { x: number; y: number; width: number; height: number }) => {
      const noteRight = note.x + note.width;
      const noteBottom = note.y + note.height;
      const rectRight = rect.x + rect.width;
      const rectBottom = rect.y + rect.height;

      return !(
        note.x > rectRight ||
        noteRight < rect.x ||
        note.y > rectBottom ||
        noteBottom < rect.y
      );
    },
    []
  );

  // Get all notes that intersect the selection rectangle
  const getSelectedNotes = useCallback((): SelectedNote[] => {
    if (!selectionRect) return [];
    const activePageIndex = dragState.pageIndex;

    return notePositions
      .filter((note) => {
        const isActivePage =
          activePageIndex === null ||
          activePageIndex === undefined ||
          note.pageIndex === activePageIndex;
        return isActivePage && noteIntersectsRect(note, selectionRect);
      })
      .map((note) => ({
        staffIndex: note.staffIndex,
        measureIndex: note.measureIndex,
        eventId: note.eventId,
        noteId: note.noteId,
      }));
  }, [selectionRect, dragState.pageIndex, notePositions, noteIntersectsRect]);

  // Compute preview note IDs as a Set for O(1) lookup during render
  const previewNoteIds = useMemo((): Set<string> => {
    if (!selectionRect) return new Set();
    const activePageIndex = dragState.pageIndex;

    return new Set(
      notePositions
        .filter((note) => {
          const isActivePage =
            activePageIndex === null ||
            activePageIndex === undefined ||
            note.pageIndex === activePageIndex;
          return isActivePage && noteIntersectsRect(note, selectionRect);
        })
        .map((note) => `${note.staffIndex}-${note.measureIndex}-${note.eventId}-${note.noteId}`)
    );
  }, [selectionRect, dragState.pageIndex, notePositions, noteIntersectsRect]);

  // Start drag on mouseDown on empty space
  const handleMouseDown = useCallback(
    (
      e: React.MouseEvent,
      options?: { svgElement?: SVGSVGElement | null; pageIndex?: number | null }
    ) => {
      if (!enabled) return;

      // Only start if clicking on empty space (not on a note or other interactive element)
      const target = e.target as HTMLElement;
      if (
        target.closest(
          '[data-note-hit-area], [data-interactive], .Rest, .riff-ChordTrack, .riff-MetadataTrack, .riff-footer'
        )
      ) {
        return; // Clicked on a note, don't start drag selection
      }

      const svgElement = options?.svgElement ?? svgRef.current;
      if (!svgElement) return;

      const rect = svgElement.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;

      setDragState({
        isDragging: true,
        startPoint: { x, y },
        currentPoint: { x, y },
        isAdditive: e.metaKey || e.ctrlKey,
        activeSvg: svgElement,
        pageIndex: options?.pageIndex ?? null,
      });

      e.preventDefault();
    },
    [enabled, svgRef, scale]
  );

  // Handle mouse move during drag
  useEffect(() => {
    if (!dragState.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const svgElement = dragState.activeSvg ?? svgRef.current;
      if (!svgElement) return;

      const rect = svgElement.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;

      setDragState((prev) => ({
        ...prev,
        currentPoint: { x, y },
      }));
    };

    const handleMouseUp = () => {
      const selectedNotes = getSelectedNotes();

      // Check if there was significant movement (more than 5px) to distinguish from a click
      const hasMoved =
        dragState.startPoint &&
        dragState.currentPoint &&
        (Math.abs(dragState.currentPoint.x - dragState.startPoint.x) > 5 ||
          Math.abs(dragState.currentPoint.y - dragState.startPoint.y) > 5);

      if (hasMoved && selectedNotes.length > 0) {
        onSelectionComplete(selectedNotes, dragState.isAdditive);
        // Only block click if we actually performed a drag selection
        setJustFinishedDrag(true);
        setTimeout(() => setJustFinishedDrag(false), 50);
      }

      setDragState({
        isDragging: false,
        startPoint: null,
        currentPoint: null,
        isAdditive: false,
        activeSvg: null,
        pageIndex: null,
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    dragState.isDragging,
    dragState.isAdditive,
    dragState.startPoint,
    dragState.currentPoint,
    dragState.activeSvg,
    getSelectedNotes,
    onSelectionComplete,
    svgRef,
    scale,
  ]);

  return {
    isDragging: dragState.isDragging,
    justFinishedDrag,
    selectionRect,
    previewNoteIds,
    handleMouseDown,
  };
};
