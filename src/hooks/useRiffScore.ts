/**
 * useRiffScore Hook
 *
 * Config-aware wrapper around useScoreLogic that normalizes configuration
 * and derives initial score state from config options.
 */

import { useMemo } from 'react';
import { RiffScoreConfig, DeepPartial, Score } from '@/types';
import { mergeRiffConfig } from '@/utils/mergeConfig';
import { generateStaves } from '@/utils/generateScore';
import { importScoreText } from '@/importers';
import { logger, LogLevel } from '@/utils/debug';

export interface UseRiffScoreResult {
  config: RiffScoreConfig;
  initialScore: Score;
}

/**
 * Hook that processes RiffScore configuration and derives initial score.
 *
 * Logic:
 * 1. Merge user config with defaults
 * 2. If config.score.abc or config.score.musicxml is provided, import it (Import Mode); on
 *    failure fall through
 * 3. If config.score.staves is provided, use it directly (Render Mode)
 * 4. Otherwise, generate staves from template (Generator Mode)
 */
export const useRiffScore = (userConfig: DeepPartial<RiffScoreConfig> = {}): UseRiffScoreResult => {
  // 1. Merge with defaults
  const config = useMemo(() => mergeRiffConfig(userConfig), [userConfig]);

  // 2. Derive initial score. The memo keys on the seed values themselves, not the merged config
  //    object (rebuilt on every host render), so a multi-megabyte MusicXML seed is parsed once.
  const { abc, musicxml, staves, staff, measureCount, title, timeSignature, keySignature, bpm } =
    config.score;
  const initialScore = useMemo((): Score => {
    // Import Mode: the tune carries its own title, key, meter and tempo.
    const seeds: [string, string | undefined, 'abc' | 'musicxml'][] = [
      ['ABC', abc, 'abc'],
      ['MusicXML', musicxml, 'musicxml'],
    ];
    for (const [label, text, format] of seeds) {
      if (!text) continue;
      const result = importScoreText(text, format);
      if (result.ok) {
        result.warnings.forEach((w) =>
          logger.log(`${label} import: ${w}`, undefined, LogLevel.WARN)
        );
        return result.score;
      }
      logger.log(`${label} import failed: ${result.error}`, undefined, LogLevel.WARN);
    }

    // Render Mode: Use explicit staves if provided
    if (staves && staves.length > 0) {
      return { title, timeSignature, keySignature, bpm, staves };
    }

    // Generator Mode: Generate staves from template
    const generatedStaves = generateStaves(staff ?? 'grand', measureCount ?? 2, keySignature);
    return { title, timeSignature, keySignature, bpm, staves: generatedStaves };
  }, [abc, musicxml, staves, staff, measureCount, title, timeSignature, keySignature, bpm]);

  return { config, initialScore };
};
