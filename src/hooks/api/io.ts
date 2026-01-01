import { MusicEditorAPI } from '@/api.types';
import { Score } from '@/types';
import { APIContext } from './types';
import { LoadScoreCommand } from '@/commands';
import { generateABC } from '@/exporters/abcExporter';
import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { generateStaves } from '@/utils/generateScore';

/**
 * IO method names provided by this factory
 */
type IOMethodNames = 'loadScore' | 'reset' | 'export';

/**
 * Factory for creating I/O and Lifecycle API methods.
 * Handles score loading, exporting, and resetting.
 *
 * Uses ThisType<MusicEditorAPI> so `this` is correctly typed without explicit casts.
 *
 * @param ctx - Shared API context
 * @returns Partial API implementation for I/O
 */
export const createIOMethods = (
  ctx: APIContext
): Pick<MusicEditorAPI, IOMethodNames> & ThisType<MusicEditorAPI> => {
  const { scoreRef, setResult } = ctx;

  return {
    loadScore(newScore) {
      /** @tested src/__tests__/ScoreAPI.modification.test.tsx */
      const { dispatch } = ctx;
      dispatch(new LoadScoreCommand(newScore));
      setResult({
        ok: true,
        status: 'info',
        method: 'loadScore',
        message: 'Score loaded',
        details: { title: newScore.title, measures: newScore.staves[0]?.measures.length },
      });
      return this;
    },

    reset(template = 'grand', measures = 4) {
      const { dispatch } = ctx;
      // Default key signature 'C' (implied)
      const staves = generateStaves(template, measures, 'C');

      // Create a fresh score with default values (including BPM)
      const newScore: Score = {
        ...scoreRef.current,
        staves,
        title: 'New Score',
        bpm: 120, // Reset BPM to default
      };

      dispatch(new LoadScoreCommand(newScore));
      setResult({
        ok: true,
        status: 'info',
        method: 'reset',
        message: 'Score reset',
        details: { template, measures },
      });
      return this;
    },

    export(format) {
      const score = scoreRef.current;
      let output = '';

      try {
        if (format === 'json') {
          output = JSON.stringify(score, null, 2);
        } else if (format === 'abc') {
          output = generateABC(score, score.bpm);
        } else if (format === 'musicxml') {
          output = generateMusicXML(score);
        } else {
          const msg = `Export format '${format}' not yet implemented`;
          setResult({
            ok: false,
            status: 'error',
            method: 'export',
            message: msg,
            code: 'NOT_IMPLEMENTED',
          });
          throw new Error(msg);
        }

        setResult({
          ok: true,
          status: 'info',
          method: 'export',
          message: `Exported to ${format}`,
          details: { format, length: output.length },
        });

        return output;
      } catch (e) {
        // Ensure result is set on error if not already set by explicit else block
        // (though re-throwing error is standard behavior for return types)
        if (format !== 'json' && format !== 'abc' && format !== 'musicxml') {
            // Already handled above
        } else {
             setResult({
                ok: false,
                status: 'error',
                method: 'export',
                message: `Export failed: ${e instanceof Error ? e.message : String(e)}`,
                code: 'EXPORT_FAILED',
             });
        }
        throw e;
      }
    },
  };
};
