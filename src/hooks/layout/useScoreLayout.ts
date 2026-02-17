import { useMemo } from 'react';
import { Score } from '@/types';
import { calculateScoreLayout } from '@/engines/layout/scoreLayout';
import { ScoreLayout, SystemPreamble } from '@/engines/layout/types';
import { calculateSystemPreamble } from '@/engines/layout';

interface UseScoreLayoutProps {
  score: Score;
}

interface UseScoreLayoutReturn {
  layout: ScoreLayout;
  /** System preamble layout (clef, key sig, time sig positioning) */
  preamble: SystemPreamble;
}

/**
 * Hook to calculate and memoize the full score layout.
 * This serves as the single source of truth for rendering and hit detection.
 *
 * @param score - The score data
 * @returns ScoreLayout object and system preamble layout
 */
export const useScoreLayout = ({ score }: UseScoreLayoutProps): UseScoreLayoutReturn => {
  const layout = useMemo(() => {
    return calculateScoreLayout(score);
  }, [score]);

  const preamble = useMemo(() => {
    const activeStaff = score.staves?.[0];
    const keySignature = score.keySignature || activeStaff?.keySignature || 'C';
    return calculateSystemPreamble(keySignature);
  }, [score.staves, score.keySignature]);

  return {
    layout,
    preamble,
  };
};
