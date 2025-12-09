import { useState, useRef, useCallback } from 'react';
import { initAudio, scheduleScorePlayback } from '../engines/audioEngine';

export const usePlayback = (score: any, bpm: number) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState<{ measureIndex: number | null; quant: number | null; duration: number }>({ measureIndex: null, quant: null, duration: 0 });
  const [lastPlayStart, setLastPlayStart] = useState({ measureIndex: 0, quant: 0 });
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackRef = useRef<{ disconnect: () => void } | null>(null);
  const playbackTimeout = useRef<NodeJS.Timeout | null>(null);

  const stopPlayback = useCallback(() => {
    if (playbackRef.current && typeof playbackRef.current.disconnect === 'function') {
      playbackRef.current.disconnect();
      playbackRef.current = null;
    }
    if (playbackTimeout.current) {
      clearTimeout(playbackTimeout.current);
      playbackTimeout.current = null;
    }
    setIsPlaying(false);
  }, []);

  const playScore = useCallback((startMeasureIndex = 0, startQuant = 0) => {
    const ctx = initAudio(audioCtxRef);
    if (!ctx) return;
    stopPlayback();

    setLastPlayStart({ measureIndex: startMeasureIndex, quant: startQuant });

    setIsPlaying(true);
    
    const stopFn = scheduleScorePlayback(
        ctx, 
        score, 
        bpm, 
        startMeasureIndex, 
        startQuant, 
        () => {
            setIsPlaying(false);
            playbackRef.current = null;
        },
        (mIndex: number, quant: number, duration: number) => {
            setPlaybackPosition({ measureIndex: mIndex, quant: quant, duration: duration || 0 });
        }
    );
    
    playbackRef.current = { disconnect: stopFn };
  }, [score, bpm, stopPlayback]);

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      playScore();
    }
  }, [isPlaying, playScore, stopPlayback]);

  return {
    isPlaying,
    playbackPosition,
    playScore,
    stopPlayback,
    handlePlayToggle,
    lastPlayStart
  };
};
