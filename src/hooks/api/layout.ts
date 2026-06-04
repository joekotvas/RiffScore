/**
 * Layout API Factory
 *
 * Creates API methods for view mode and layout configuration.
 */

import { MusicEditorAPI } from '@/api.types';
import { APIContext } from './types';
import { SetViewModeCommand, SetLayoutConfigCommand } from '@/commands/layout';
import { LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

/**
 * Layout method names provided by this factory.
 */
type LayoutMethodNames =
  | 'getViewMode'
  | 'setViewMode'
  | 'toggleViewMode'
  | 'getLayoutConfig'
  | 'setLayoutConfig'
  | 'resetLayoutConfig';

/**
 * Factory for creating Layout API methods.
 * Handles view mode toggling and layout configuration.
 *
 * @param ctx - Shared API context
 * @returns Partial API implementation for layout
 */
export const createLayoutMethods = (
  ctx: APIContext
): Pick<MusicEditorAPI, LayoutMethodNames> & ThisType<MusicEditorAPI> => {
  // Read LIVE engine state (getScore) rather than the React-state mirror
  // (scoreRef), which lags one tick because it is synced inside a useEffect.
  // Dispatch is synchronous (ADR-006), so getScore() reflects mutations
  // immediately, enabling synchronous chaining like
  // `api.setViewMode('page').getViewMode()`.
  const { dispatch, getScore, setResult } = ctx;

  return {
    getViewMode(): LayoutConfig['viewMode'] {
      return getScore().layout?.viewMode ?? DEFAULT_LAYOUT_CONFIG.viewMode;
    },

    setViewMode(mode) {
      dispatch(new SetViewModeCommand(mode));
      setResult({
        ok: true,
        status: 'info',
        method: 'setViewMode',
        message: `View mode set to ${mode}`,
        details: { mode },
      });
      return this as MusicEditorAPI;
    },

    toggleViewMode() {
      const current = this.getViewMode();
      const newMode = current === 'scroll' ? 'page' : 'scroll';
      return this.setViewMode(newMode);
    },

    getLayoutConfig(): LayoutConfig {
      return getScore().layout ?? { ...DEFAULT_LAYOUT_CONFIG };
    },

    setLayoutConfig(config) {
      dispatch(new SetLayoutConfigCommand(config));
      setResult({
        ok: true,
        status: 'info',
        method: 'setLayoutConfig',
        message: 'Layout configuration updated',
        details: { updates: config },
      });
      return this as MusicEditorAPI;
    },

    resetLayoutConfig() {
      dispatch(new SetLayoutConfigCommand(DEFAULT_LAYOUT_CONFIG));
      setResult({
        ok: true,
        status: 'info',
        method: 'resetLayoutConfig',
        message: 'Layout configuration reset to defaults',
      });
      return this as MusicEditorAPI;
    },
  };
};
