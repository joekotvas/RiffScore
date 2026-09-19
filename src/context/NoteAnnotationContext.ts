import { createContext } from 'react';
import type { NoteheadAnnotation } from '@/components/Canvas/ScoreAnnotations';
/** Per-view presentation only; never part of the editor's score or undo history. */
export const NoteAnnotationContext = createContext<ReadonlyMap<string, NoteheadAnnotation>>(
  new Map()
);
