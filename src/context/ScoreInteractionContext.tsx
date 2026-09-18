import React, { useMemo } from 'react';
import { ScoreContext, useScoreContext, type ScoreContextType } from './ScoreContext';
import type { InteractionPolicy } from '@/types';
import { allowsInteraction, allowsPreview } from '@/utils/interactionPolicy';

/** View-local UI facade. The API bridge sits outside this boundary, so loading a
 * score or running a host-controlled animation never inherits UI restrictions. */
export function ScoreInteractionProvider({
  policy,
  children,
}: {
  policy: InteractionPolicy;
  children: React.ReactNode;
}): React.ReactElement {
  const source = useScoreContext();
  const { allowEventInsertion, allowDurationChanges, allowEventDeletion } = policy;
  const value = useMemo((): ScoreContextType => {
    const permissions = { allowEventInsertion, allowDurationChanges, allowEventDeletion };
    if (Object.values(permissions).every((value) => value !== false)) return source;
    const { engine, selectionEngine } = source.engines;
    const guard =
      <Args extends unknown[], Result>(action: (...args: Args) => Result) =>
      (...args: Args): Result => {
        const selection = selectionEngine.getState();
        let accepted = false;
        try {
          const result = engine.withMutationGuard(
            (before, after) => allowsInteraction(before, after, permissions),
            () => action(...args)
          );
          accepted = result.accepted;
          return result.value;
        } finally {
          if (!accepted) {
            selectionEngine.setState(selection);
            source.setPreviewNote(null);
          }
        }
      };
    // All editing domains use the same entity policy, including nested/batch commands
    // and undo/redo. No command-name allowlist or duplicated keyboard/mouse rules.
    const guardGroup = <T extends object>(group: T): T =>
      Object.fromEntries(
        Object.entries(group).map(([key, member]) => [
          key,
          typeof member === 'function' ? guard(member as (...args: never[]) => unknown) : member,
        ])
      ) as T;
    const preview = allowsPreview(source.state.score, source.state.previewNote, permissions)
      ? source.state.previewNote
      : null;
    const modifiers = guardGroup(source.modifiers);
    const tuplets = guardGroup(source.tuplets);
    if (allowDurationChanges === false) {
      modifiers.duration = () => {};
      modifiers.dot = () => {};
      modifiers.checkDurationValidity = () => false;
      modifiers.checkDotValidity = () => false;
      tuplets.apply = () => false;
      tuplets.remove = () => {};
      tuplets.canApply = () => false;
    }
    const entry = guardGroup(source.entry);
    if (allowEventInsertion === false) {
      entry.handleMeasureHover = (measure, hit, pitch, staff) => {
        if (hit?.type !== 'EVENT') {
          source.setPreviewNote(null);
          return;
        }
        source.entry.handleMeasureHover(measure, hit, pitch, staff);
      };
    }
    return {
      ...source,
      state: { ...source.state, previewNote: preview },
      entry,
      modifiers,
      tuplets,
      measures: guardGroup(source.measures),
      navigation: {
        ...guardGroup(source.navigation),
        move: guard((direction, shift, chords) =>
          source.navigation.move(direction, shift, chords, allowEventInsertion !== false)
        ),
      },
      historyAPI: guardGroup(source.historyAPI),
      engines: { ...source.engines, dispatch: guard(source.engines.dispatch) },
      handleClefChange: guard(source.handleClefChange),
    };
  }, [source, allowEventInsertion, allowDurationChanges, allowEventDeletion]);
  return <ScoreContext.Provider value={value}>{children}</ScoreContext.Provider>;
}
