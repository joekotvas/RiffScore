import type { MusicEditorAPI } from '@/api.types';
import { DEFAULT_RIFF_CONFIG, type InteractionConfig } from '@/types';
import type { APIContext } from './types';

type Methods = 'getInteractionConfig' | 'setInteractionConfig' | 'resetInteractionConfig';

/** Configures user editing for this view; score-authoring API calls stay unrestricted. */
export function createInteractionMethods(
  ctx: APIContext
): Pick<MusicEditorAPI, Methods> & ThisType<MusicEditorAPI> {
  return {
    getInteractionConfig() {
      return { ...(ctx.interaction?.getSnapshot() ?? ctx.config.interaction) };
    },
    setInteractionConfig(patch) {
      const valid =
        patch !== null &&
        typeof patch === 'object' &&
        !Array.isArray(patch) &&
        Object.entries(patch).every(
          ([key, value]) =>
            Object.hasOwn(DEFAULT_RIFF_CONFIG.interaction, key) && typeof value === 'boolean'
        );
      if (!valid || !ctx.interaction) {
        ctx.setResult({
          ok: false,
          status: 'error',
          method: 'setInteractionConfig',
          code: 'INVALID_INTERACTION_CONFIG',
          message: 'Expected a partial interaction configuration with boolean values.',
        });
        return this as MusicEditorAPI;
      }
      ctx.interaction.update(patch as Partial<InteractionConfig>);
      ctx.setResult({
        ok: true,
        status: 'info',
        method: 'setInteractionConfig',
        message: 'Interaction configuration updated for this view.',
      });
      return this as MusicEditorAPI;
    },
    resetInteractionConfig() {
      ctx.interaction?.reset();
      ctx.setResult({
        ok: true,
        status: 'info',
        method: 'resetInteractionConfig',
        message: 'Interaction configuration reset to config props.',
      });
      return this as MusicEditorAPI;
    },
  };
}
