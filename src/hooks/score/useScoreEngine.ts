import { useState, useEffect } from 'react';
import { ScoreEngine } from '@/engines/ScoreEngine';
import { Score, ChordRecognitionConfig } from '@/types';

export const useScoreEngine = (initialScore?: Score, recognition?: ChordRecognitionConfig) => {
  // Use useState with lazy initializer to create engine instance only once
  const [engine] = useState(() => new ScoreEngine(initialScore, recognition));

  // Local state to trigger re-renders when the engine state changes
  const [score, setScore] = useState<Score>(engine.getState());

  useEffect(() => {
    // Subscribe to engine changes
    const unsubscribe = engine.subscribe((newScore) => {
      setScore(newScore);
    });

    return () => {
      unsubscribe();
    };
  }, [engine]);

  useEffect(() => {
    engine.setChordRecognition(recognition);
  }, [engine, recognition]);

  return {
    score,
    engine,
  };
};
