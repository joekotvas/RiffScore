/**
 * Metadata API Factory
 *
 * Creates API methods for score metadata (title, composer, etc.)
 * and navigation helpers for Tab/Shift+Tab from metadata fields.
 */

import { MusicEditorAPI } from '@/api.types';
import { APIContext } from './types';
import { SetMetadataCommand } from '@/commands/layout';
import { ScoreMetadata, Score } from '@/types';
import { DEFAULT_SCORE_METADATA } from '@/config';
import { SetSelectionCommand } from '@/commands/selection';

/**
 * Metadata method names provided by this factory.
 */
type MetadataMethodNames =
  | 'getMetadata'
  | 'setMetadata'
  | 'getTitle'
  | 'setTitle'
  | 'getComposer'
  | 'setComposer'
  | 'getLyricist'
  | 'setLyricist'
  | 'getCopyright'
  | 'setCopyright';

/**
 * Navigation method names for Tab navigation from metadata.
 */
type NavigationMethodNames = 'selectFirstElement' | 'selectLastElement';

/**
 * Find the first selectable event in the score.
 */
function findFirstEvent(
  score: Score
): { staffIndex: number; measureIndex: number; eventId: string; noteId: string | null } | null {
  for (let staffIndex = 0; staffIndex < score.staves.length; staffIndex++) {
    const staff = score.staves[staffIndex];
    for (let measureIndex = 0; measureIndex < staff.measures.length; measureIndex++) {
      const measure = staff.measures[measureIndex];
      const firstEvent = measure.events[0];
      if (firstEvent) {
        const firstNote = firstEvent.notes[0];
        return {
          staffIndex,
          measureIndex,
          eventId: firstEvent.id,
          noteId: firstNote?.id ?? null,
        };
      }
    }
  }
  return null;
}

/**
 * Find the last selectable event in the score.
 */
function findLastEvent(
  score: Score
): { staffIndex: number; measureIndex: number; eventId: string; noteId: string | null } | null {
  for (let staffIndex = score.staves.length - 1; staffIndex >= 0; staffIndex--) {
    const staff = score.staves[staffIndex];
    for (let measureIndex = staff.measures.length - 1; measureIndex >= 0; measureIndex--) {
      const measure = staff.measures[measureIndex];
      const lastEvent = measure.events[measure.events.length - 1];
      if (lastEvent) {
        const lastNote = lastEvent.notes[lastEvent.notes.length - 1];
        return {
          staffIndex,
          measureIndex,
          eventId: lastEvent.id,
          noteId: lastNote?.id ?? null,
        };
      }
    }
  }
  return null;
}

/**
 * Factory for creating Metadata API methods.
 * Handles score metadata CRUD operations.
 *
 * @param ctx - Shared API context
 * @returns Partial API implementation for metadata
 */
export const createMetadataMethods = (
  ctx: APIContext
): Pick<MusicEditorAPI, MetadataMethodNames> & ThisType<MusicEditorAPI> => {
  // Read LIVE engine state (getScore) rather than the React-state mirror
  // (scoreRef), which lags one tick because it is synced inside a useEffect.
  // Dispatch is synchronous (ADR-006), so getScore() reflects mutations
  // immediately, enabling synchronous chaining like
  // `api.setMetadata({ title: 'X' }); api.getTitle() === 'X'`.
  const { dispatch, getScore, setResult } = ctx;

  return {
    getMetadata(): ScoreMetadata {
      return getScore().metadata ?? { ...DEFAULT_SCORE_METADATA };
    },

    setMetadata(metadata) {
      dispatch(new SetMetadataCommand(metadata));
      setResult({
        ok: true,
        status: 'info',
        method: 'setMetadata',
        message: 'Metadata updated',
        details: { updates: metadata },
      });
      return this as MusicEditorAPI;
    },

    getTitle(): string {
      return this.getMetadata().title;
    },

    setTitle(title) {
      return this.setMetadata({ title });
    },

    getComposer(): string | undefined {
      return this.getMetadata().composer;
    },

    setComposer(composer) {
      return this.setMetadata({ composer });
    },

    getLyricist(): string | undefined {
      return this.getMetadata().lyricist;
    },

    setLyricist(lyricist) {
      return this.setMetadata({ lyricist });
    },

    getCopyright(): string | undefined {
      return this.getMetadata().copyright;
    },

    setCopyright(copyright) {
      return this.setMetadata({ copyright });
    },
  };
};

/**
 * Factory for creating Navigation API methods for metadata focus transitions.
 * Enables Tab/Shift+Tab navigation between metadata fields and score.
 *
 * @param ctx - Shared API context
 * @returns Partial API implementation for navigation
 */
export const createMetadataNavigationMethods = (
  ctx: APIContext
): Pick<MusicEditorAPI, NavigationMethodNames> & ThisType<MusicEditorAPI> => {
  // Read LIVE engine state (getScore) so navigation reflects structural
  // mutations (added/removed events) made in the same synchronous tick,
  // rather than the lagging scoreRef mirror.
  const { getScore, selectionEngine, setResult } = ctx;

  return {
    selectFirstElement() {
      const score = getScore();
      const firstEvent = findFirstEvent(score);

      if (firstEvent) {
        selectionEngine.dispatch(
          new SetSelectionCommand({
            staffIndex: firstEvent.staffIndex,
            measureIndex: firstEvent.measureIndex,
            eventId: firstEvent.eventId,
            noteId: firstEvent.noteId,
            selectedNotes: [
              {
                staffIndex: firstEvent.staffIndex,
                measureIndex: firstEvent.measureIndex,
                eventId: firstEvent.eventId,
                noteId: firstEvent.noteId,
              },
            ],
          })
        );
        setResult({
          ok: true,
          status: 'info',
          method: 'selectFirstElement',
          message: 'Selected first element in score',
        });
      } else {
        setResult({
          ok: true,
          status: 'warning',
          method: 'selectFirstElement',
          message: 'No elements to select',
        });
      }

      return this as MusicEditorAPI;
    },

    selectLastElement() {
      const score = getScore();
      const lastEvent = findLastEvent(score);

      if (lastEvent) {
        selectionEngine.dispatch(
          new SetSelectionCommand({
            staffIndex: lastEvent.staffIndex,
            measureIndex: lastEvent.measureIndex,
            eventId: lastEvent.eventId,
            noteId: lastEvent.noteId,
            selectedNotes: [
              {
                staffIndex: lastEvent.staffIndex,
                measureIndex: lastEvent.measureIndex,
                eventId: lastEvent.eventId,
                noteId: lastEvent.noteId,
              },
            ],
          })
        );
        setResult({
          ok: true,
          status: 'info',
          method: 'selectLastElement',
          message: 'Selected last element in score',
        });
      } else {
        setResult({
          ok: true,
          status: 'warning',
          method: 'selectLastElement',
          message: 'No elements to select',
        });
      }

      return this as MusicEditorAPI;
    },
  };
};
