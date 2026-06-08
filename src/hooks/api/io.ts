import { MusicEditorAPI } from '@/api.types';
import { Score, migrateScore } from '@/types';
import { APIContext } from './types';
import { LoadScoreCommand } from '@/commands';
import { validateScore } from '@/utils/validation';
import { generateABC } from '@/exporters/abcExporter';
import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { generateStaves } from '@/utils/generateScore';
import { refuse } from '@/refusals';

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

      // #209 / Lane G: don't claim success on structurally malformed input — the dispatch would
      // otherwise no-op (invalid state) while loadScore still reported ok:true.
      if (!newScore || !Array.isArray(newScore.staves) || newScore.staves.length === 0) {
        setResult({
          ok: false,
          status: 'error',
          method: 'loadScore',
          message: 'Cannot load score: missing or empty staves',
          code: 'INVALID_SCORE',
        });
        return this;
      }

      dispatch(new LoadScoreCommand(newScore));

      // Surface content-validity problems (over-full / incomplete-tuplet bars, grand-staff parity)
      // as a NON-blocking warning: the score still loads (so it can be fixed) but the caller is told.
      const validation = validateScore(migrateScore(newScore));
      setResult(
        validation.valid
          ? {
              ok: true,
              status: 'info',
              method: 'loadScore',
              message: 'Score loaded',
              details: { title: newScore.title, measures: newScore.staves[0]?.measures.length },
            }
          : {
              ok: true,
              status: 'warning',
              method: 'loadScore',
              message: `Score loaded with ${validation.errors.length} validation issue(s)`,
              code: 'SCORE_VALIDATION_WARNINGS',
              details: { title: newScore.title, errors: validation.errors },
            }
      );
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
        chordTrack: [], // fresh staves have no events — drop the old chords (#242)
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

    /**
     * @tested src/__tests__/ScoreAPI.feedback.test.tsx
     */
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
          // A hard failure (the export did not happen), distinct from the lenient NOT_IMPLEMENTED
          // stubs — so it keeps error severity / ok:false.
          setResult({
            method: 'export',
            ...refuse('EXPORT_NOT_IMPLEMENTED', { messageCtx: { format } }),
          });
          return ''; // Fail-safe: return empty string
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
        setResult({
          ok: false,
          status: 'error',
          method: 'export',
          message: `Export failed: ${e instanceof Error ? e.message : String(e)}`,
          code: 'EXPORT_FAILED',
        });
        return ''; // Fail-safe: return empty string
      }
    },
  };
};
