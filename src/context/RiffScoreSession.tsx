import React, { createContext, useContext } from 'react';
import { ScoreProvider } from './ScoreContext';
import { useRiffScore } from '@/hooks/useRiffScore';
import type { DeepPartial, RiffScoreConfig } from '@/types';

/** A session owns one document, selection and undo history. Views own presentation and input. */
const SessionConfig = createContext<RiffScoreConfig | null>(null);
export const useSessionConfig = (): RiffScoreConfig | null => useContext(SessionConfig);

export interface RiffScoreSessionProps {
  config?: {
    score?: DeepPartial<RiffScoreConfig['score']>;
    chord?: { recognition?: DeepPartial<NonNullable<RiffScoreConfig['chord']>['recognition']> };
  };
  children: React.ReactNode;
}

/** Nested RiffScore views share this session. Seed score options are read only on mount;
 * replace the React key to create a new session, or use a view's API to load a score. */
export function RiffScoreSession({
  config: seed,
  children,
}: RiffScoreSessionProps): React.ReactElement {
  const { config, initialScore } = useRiffScore(seed);
  return (
    <SessionConfig.Provider value={config}>
      <ScoreProvider initialScore={initialScore} chordRecognition={config.chord?.recognition}>
        {children}
      </ScoreProvider>
    </SessionConfig.Provider>
  );
}

export function ScoreOwner({
  children,
  initialScore,
  chordRecognition,
}: React.ComponentProps<typeof ScoreProvider>): React.ReactElement {
  return useSessionConfig() ? (
    <>{children}</>
  ) : (
    <ScoreProvider initialScore={initialScore} chordRecognition={chordRecognition}>
      {children}
    </ScoreProvider>
  );
}
