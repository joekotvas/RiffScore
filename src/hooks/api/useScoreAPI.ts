/**
 * useScoreAPI Hook
 *
 * Machine-addressable API hook that provides external script control
 * of RiffScore instances via `window.riffScore`.
 *
 * DESIGN NOTE:
 * This hook consumes the ScoreContext directly. It maintains internal Refs
 * to the latest state to ensure that imperative calls (which don't follow
 * React's render cycle) always have access to the latest data without
 * closure staleness.
 *
 * @see docs/migration/api_reference_draft.md
 */

import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useScoreContext } from '@/context/ScoreContext';
import { useTheme } from '@/context/ThemeContext';
import { useAPISubscriptions } from './useAPISubscriptions';
import type { MusicEditorAPI, RiffScoreRegistry } from '@/api.types';
import type { RiffScoreConfig } from '@/types';
import { SetSelectionCommand } from '@/commands/selection';
import {
  createNavigationMethods,
  createSelectionMethods,
  createEntryMethods,
  createModificationMethods,
  createHistoryMethods,
  createPlaybackMethods,
  createIOMethods,
  APIContext,
} from '.';

// Extend Window interface for TypeScript
declare global {
  interface Window {
    riffScore: RiffScoreRegistry;
  }
}

/**
 * Initialize the global registry if it doesn't exist
 */
const initRegistry = (): void => {
  if (typeof window === 'undefined') return;
  if (!window.riffScore) {
    window.riffScore = {
      instances: new Map<string, MusicEditorAPI>(),
      active: null,
      get: (id: string) => window.riffScore.instances.get(id),
    };
  }
};

/**
 * Props for the useScoreAPI hook
 */
export interface UseScoreAPIProps {
  /** Unique instance ID for registry */
  instanceId: string;
  /** Current config */
  config: RiffScoreConfig;
}

/**
 * Creates a MusicEditorAPI instance for external script control.
 *
 * This hook consumes ScoreContext internally, so it must be used within
 * a ScoreProvider. It only needs instanceId and config from props.
 *
 * @example
 * ```typescript
 * const api = useScoreAPI({ instanceId: 'my-score', config });
 * // API is automatically registered to window.riffScore
 * ```
 */
export function useScoreAPI({ instanceId, config }: UseScoreAPIProps): MusicEditorAPI {
  // 1. Consume Context Directly (Grouped API)
  const ctx = useScoreContext();
  const { score, selection } = ctx.state;
  const { dispatch, selectionEngine } = ctx.engines;
  const {
    begin: beginTransaction,
    commit: commitTransaction,
    rollback: rollbackTransaction,
    undo,
    redo,
  } = ctx.historyAPI;

  // 2. Synchronous State Refs (authoritative for API methods to avoid stale closures)
  const scoreRef = useRef(score);
  const selectionRef = useRef(selection);

  // Keep refs in sync with React state
  useEffect(() => {
    scoreRef.current = score;
    selectionRef.current = selection;
  }, [score, selection]);

  // 3. Selection Sync Helper
  // Updates both the authoritative Ref (for immediate chaining) and dispatches to engine (for UI)
  const syncSelection = useCallback(
    (newSelection: typeof selection) => {
      selectionRef.current = newSelection;
      selectionEngine.dispatch(
        new SetSelectionCommand({
          staffIndex: newSelection.staffIndex,
          measureIndex: newSelection.measureIndex,
          eventId: newSelection.eventId,
          noteId: newSelection.noteId,
          selectedNotes: newSelection.selectedNotes,
          anchor: newSelection.anchor,
        })
      );
    },
    [selectionEngine]
  );

  // 4. API Event Subscriptions
  // Delegates listener management to the dedicated hook
  const { on, notify } = useAPISubscriptions(score, selection, ctx.engines.engine);

  // 4a. Consume Theme Logic
  const { setTheme, setZoom } = useTheme();

  // 4b. Internal Result State (Refs for synchronous access)
  const resultRef = useRef<import('@/api.types').Result>({
    ok: true,
    status: 'info',
    method: 'init',
    message: 'API Initialized',
    timestamp: Date.now(),
  });
  const hasErrorRef = useRef(false);
  const debugModeRef = useRef(false);
  const collectorRef = useRef<{ results: import('@/api.types').Result[] } | null>(null);

  /**
   * Internal helper to report operation results.
   * Updates state, emits events, and logs to console if needed.
   */
  const setResult = useCallback(
    (partial: Omit<import('@/api.types').Result, 'timestamp'>) => {
      const timestamp = Date.now();
      const result: import('@/api.types').Result = { ...partial, timestamp };

      // Update Result State
      resultRef.current = result;

      // Update Sticky Error State
      if (result.status === 'error') {
        hasErrorRef.current = true;
      }

      // Collect for batch if active
      if (collectorRef.current) {
        collectorRef.current.results.push(result);
      }

      // Emit Events
      notify('operation', result);
      if (result.status === 'error') {
        notify('error', result);
      }

      // Console Logging
      if (debugModeRef.current || result.status === 'warning' || result.status === 'error') {
        const prefix = `[RiffScore API] ${result.method}:`;
        if (result.status === 'error') {
          console.error(`${prefix} ${result.message}`, result.details || '');
        } else if (result.status === 'warning') {
          console.warn(`${prefix} ${result.message}`, result.details || '');
        } else if (debugModeRef.current) {
          // eslint-disable-next-line no-console
          console.log(`${prefix} ${result.message}`, result.details || '');
        }
      }
    },
    [notify]
  );

  // 5. Build API Object (memoized to maintain stable reference)
  const api: MusicEditorAPI = useMemo(() => {
    const context: APIContext = {
      scoreRef,
      selectionRef,
      getScore: () => ctx.engines.engine.getState(),
      getSelection: () => selectionEngine.getState(),
      syncSelection,
      dispatch,
      selectionEngine,
      history: {
        undo,
        redo,
        begin: beginTransaction,
        commit: commitTransaction,
        rollback: rollbackTransaction,
      },
      config,
      setTheme: (name) => {
        const normalized = name.trim().toUpperCase();
        if (
          normalized === 'LIGHT' ||
          normalized === 'DARK' ||
          normalized === 'WARM' ||
          normalized === 'COOL'
        ) {
          setTheme(normalized as 'LIGHT' | 'DARK' | 'WARM' | 'COOL');
          setResult({
            ok: true,
            status: 'info',
            method: 'setTheme',
            message: `Theme set to ${normalized}`,
          });
        } else {
          setResult({
            ok: true,
            status: 'warning',
            method: 'setTheme',
            message: `Ignoring invalid theme name "${name}". Expected one of: LIGHT, DARK, WARM, COOL.`,
          });
        }
      },
      setZoom: (zoom) => {
        setZoom(zoom);
        setResult({
          ok: true,
          status: 'info',
          method: 'setZoom',
          message: `Zoom set to ${zoom}`,
        });
      },
      setInputMode: (mode) => {
        if (mode === 'note' || mode === 'rest') {
          ctx.tools.setInputMode(mode.toUpperCase() as 'NOTE' | 'REST');
          setResult({
            ok: true,
            status: 'info',
            method: 'setInputMode',
            message: `Input mode set to ${mode}`,
          });
        } else {
          setResult({
            ok: true,
            status: 'warning',
            method: 'setInputMode',
            message: `Ignoring invalid input mode "${mode}". Expected "note" or "rest".`,
          });
        }
      },
      // API Feedback Internals
      setResult,
      get debugMode() {
        return debugModeRef.current;
      },
    };

    // Factory methods access refs via context, not directly during render.
    // The refs are only read when API methods are called (in event handlers).
    // Base instance with methods
    const instance = {
      // Composition: Mixin all factory methods
      ...createNavigationMethods(context),
      ...createSelectionMethods(context),
      ...createEntryMethods(context),
      ...createModificationMethods(context),
      ...createHistoryMethods(context),
      ...createPlaybackMethods(context),
      ...createIOMethods(context),

      // Data Accessors (Bound Closures)
      getScore: () => ctx.engines.engine.getState(),
      getConfig: () => config,
      getSelection: () => selectionRef.current,

      // Feedback & Status helpers
      clearStatus: () => {
        /** @tested src/__tests__/ScoreAPI.feedback.test.tsx */
        hasErrorRef.current = false;
        setResult({
          ok: true,
          status: 'info',
          method: 'clearStatus',
          message: 'Status cleared',
        });
        return instance as MusicEditorAPI;
      },
      debug: (enabled: boolean) => {
        /** @tested src/__tests__/ScoreAPI.feedback.test.tsx */
        debugModeRef.current = enabled;
        setResult({
          ok: true,
          status: 'info',
          method: 'debug',
          message: `Debug mode ${enabled ? 'enabled' : 'disabled'}`,
        });
        return instance as MusicEditorAPI;
      },
      collect: (callback: (api: MusicEditorAPI) => void) => {
        /** @tested src/__tests__/ScoreAPI.feedback.test.tsx */
        // Start collection
        const captured: import('@/api.types').Result[] = [];
        const prevCollector = collectorRef.current; // Support nested collection (restore prev)
        collectorRef.current = { results: captured };

        try {
          callback(instance as MusicEditorAPI);
        } catch (error) {
          console.error('[RiffScore API] collect callback failed:', error);
        } finally {
          // End collection
          collectorRef.current = prevCollector;
        }

        const errors = captured.filter((r) => r.status === 'error');
        const warnings = captured.filter((r) => r.status === 'warning');

        return {
          ok: errors.length === 0,
          results: captured,
          warnings,
          errors,
        };
      },

      // Events
      on,
    };

    // explicit properties for getters to prevent flattening
    Object.defineProperties(instance, {
      result: {
        get: () => resultRef.current,
        enumerable: true,
      },
      ok: {
        get: () => resultRef.current.ok,
        enumerable: true,
      },
      hasError: {
        get: () => hasErrorRef.current,
        enumerable: true,
      },
    });

    return instance as MusicEditorAPI;
  }, [
    config,
    dispatch,
    syncSelection,
    selectionEngine,
    on,
    undo,
    redo,
    beginTransaction,
    commitTransaction,
    rollbackTransaction,
    ctx.engines.engine,
    setTheme,
    setZoom,
    ctx.tools,
    setResult,
  ]);
  // 5. Registry registration/cleanup
  useEffect(() => {
    initRegistry();

    // Register this instance
    window.riffScore.instances.set(instanceId, api);
    window.riffScore.active = api;

    // Cleanup on unmount
    return () => {
      window.riffScore.instances.delete(instanceId);
      if (window.riffScore.active === api) {
        window.riffScore.active = null;
      }
    };
  }, [instanceId, api]);

  return api;
}
