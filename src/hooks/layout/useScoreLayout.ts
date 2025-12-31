import { useMemo } from 'react';
import { Score } from '@/types';
import { calculateScoreLayout } from '@/engines/layout/scoreLayout';
import { ScoreLayout } from '@/engines/layout/types';
import { calculateHeaderLayout } from '@/engines/layout';

interface UseScoreLayoutProps {
  score: Score;
}

interface UseScoreLayoutReturn {
  layout: ScoreLayout;
  headerLayout: {
    keySigStartX: number;
    keySigVisualWidth: number;
    timeSigStartX: number;
    startOfMeasures: number;
  };
}

/**
 * Hook to calculate and memoize the full score layout.
 * This serves as the single source of truth for rendering and hit detection.
 *
 * @param score - The score data
 * @returns ScoreLayout object and header layout
 */
export const useScoreLayout = ({ score }: UseScoreLayoutProps): UseScoreLayoutReturn => {
  const layout = useMemo(() => {
    return calculateScoreLayout(score);
  }, [score]);

  const headerLayout = useMemo(() => {
    const activeStaff = score.staves?.[0];
    const keySignature = score.keySignature || activeStaff?.keySignature || 'C';
    return calculateHeaderLayout(keySignature);
  }, [score.staves, score.keySignature]);

  return {
    layout,
    headerLayout,
  };
};
