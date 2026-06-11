// PreviewNote has a single canonical definition in '@/types'; re-export it so callers can keep
// importing it from here (#12 — there used to be a second, drift-prone copy in this file).
import type { PreviewNote } from '@/types';
export type { PreviewNote };

/**
 * Inputs to {@link createPreviewNote}: the preview's fields minus the computed quant positions
 * (`quant`/`visualQuant`), with `isRest` optional (it defaults to false).
 */
export type PreviewNoteOptions = Omit<PreviewNote, 'quant' | 'visualQuant' | 'isRest'> & {
  isRest?: boolean;
};

/**
 * Creates a preview note object for visual feedback during note entry.
 *
 * This utility centralizes preview note construction to ensure consistency
 * and reduce duplication in hover and keyboard entry handlers.
 *
 * @param options - Preview note options
 * @returns A PreviewNote object for rendering
 *
 * @example
 * ```typescript
 * const preview = createPreviewNote({
 *   measureIndex: 0,
 *   staffIndex: 0,
 *   pitch: 'C4',
 *   duration: 'quarter',
 *   dotted: false,
 *   mode: 'APPEND',
 *   index: 0,
 *   source: 'hover',
 * });
 * setPreviewNote(preview);
 * ```
 *
 * @tested src/__tests__/utils/entry/previewNote.test.ts
 */
export function createPreviewNote(options: PreviewNoteOptions): PreviewNote {
  return {
    measureIndex: options.measureIndex,
    staffIndex: options.staffIndex,
    quant: 0,
    visualQuant: 0,
    pitch: options.pitch,
    duration: options.duration,
    dotted: options.dotted,
    mode: options.mode,
    index: options.index,
    eventId: options.eventId,
    isRest: options.isRest ?? false,
    source: options.source ?? 'hover',
    ...(options.blocked ? { blocked: options.blocked } : {}),
  };
}

/**
 * Checks if two preview notes are equivalent (to avoid unnecessary re-renders).
 *
 * @param prev - Previous preview note (or null)
 * @param next - Next preview note
 * @returns true if previews are equivalent and should not trigger re-render
 *
 * @tested src/__tests__/utils/entry/previewNote.test.ts
 */
export function arePreviewsEqual(prev: PreviewNote | null, next: PreviewNote): boolean {
  if (!prev) return false;

  // For rests, ignore pitch since it's not used
  const pitchMatch = next.isRest ? true : prev.pitch === next.pitch;

  return (
    prev.measureIndex === next.measureIndex &&
    prev.staffIndex === next.staffIndex &&
    pitchMatch &&
    prev.mode === next.mode &&
    prev.index === next.index &&
    prev.isRest === next.isRest &&
    prev.duration === next.duration &&
    prev.dotted === next.dotted &&
    prev.blocked === next.blocked &&
    prev.eventId === next.eventId
  );
}
