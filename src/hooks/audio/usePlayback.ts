import { useState, useRef, useCallback, useEffect } from 'react';
import { Score, ChordPlaybackConfig, DEFAULT_CHORD_PLAYBACK } from '@/types';
import {
  initTone,
  scheduleScorePlayback,
  InstrumentState,
  InstrumentType,
  setInstrument,
} from '@/engines/toneEngine';
import { createTimeline } from '@/services/TimelineService';
import { getPlaybackOffset } from '@/services/MeasureTiming';

export interface UsePlaybackReturn {
  isPlaying: boolean;
  isActive: boolean; // "Playback Mode" - visible cursor
  playbackPosition: {
    measureIndex: number | null;
    quant: number | null;
    duration: number;
  };
  playScore: (startMeasureIndex?: number, startQuant?: number) => Promise<void>;
  stopPlayback: () => void;
  seekPlayback?: (measureIndex: number, quant?: number) => void;
  pausePlayback: () => void;
  handlePlayToggle: () => void;
  exitPlaybackMode: () => void;
  lastPlayStart: { measureIndex: number; quant: number };
  instrumentState: InstrumentState;
  getPosition: () => { measureIndex: number | null; quant: number | null; duration: number };
  getIsPlaying: () => boolean;
}

export const usePlayback = (
  score: Score,
  bpm: number,
  chordPlayback: ChordPlaybackConfig = DEFAULT_CHORD_PLAYBACK,
  instrument?: InstrumentType,
  getCurrent?: () => { score: Score; bpm: number; instrument?: InstrumentType }
): UsePlaybackReturn => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState<{
    measureIndex: number | null;
    quant: number | null;
    duration: number;
  }>({ measureIndex: null, quant: null, duration: 0 });
  const [lastPlayStart, setLastPlayStart] = useState({ measureIndex: 0, quant: 0 });
  const [instrumentState, setInstrumentState] = useState<InstrumentState>('initializing');

  const currentRef = useRef(getCurrent);
  useEffect(() => {
    currentRef.current = getCurrent;
  }, [getCurrent]);
  const positionRef = useRef(playbackPosition);
  const updatePosition = useCallback((position: typeof playbackPosition): void => {
    positionRef.current = position;
    setPlaybackPosition(position);
  }, []);
  const playingRef = useRef(false);
  const updatePlaying = useCallback((value: boolean): void => {
    playingRef.current = value;
    setIsPlaying(value);
  }, []);
  const isInitialized = useRef(false);
  // A newer seek or pause invalidates an older pending audio start and its callbacks.
  const playbackRequest = useRef(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      playbackRequest.current++;
      pending.current?.abort();
    },
    []
  );

  // Initialize Tone.js on first user interaction
  const ensureInit = useCallback(async () => {
    if (isInitialized.current) return;

    await initTone((state) => {
      setInstrumentState(state.instrumentState);
    });

    isInitialized.current = true;
  }, []);

  const exitPlaybackMode = useCallback(() => {
    setIsActive(false);
  }, []);

  /*
   * Stop playback and reset position (Stop Button behavior)
   */
  const stopPlayback = useCallback(() => {
    playbackRequest.current++;
    pending.current?.abort();
    updatePlaying(false);
    // Keep active (cursor visible at 0)
    setIsActive(true);
    updatePosition({ measureIndex: null, quant: null, duration: 0 });
  }, [updatePosition, updatePlaying]);

  /*
   * Pause playback but retain position (Pause Button behavior)
   */
  const pausePlayback = useCallback(() => {
    playbackRequest.current++;
    pending.current?.abort();
    updatePlaying(false);
    setIsActive(true);
    // Do NOT reset playbackPosition, so cursor stays visible and we can resume
  }, [updatePlaying]);

  const playScore = useCallback(
    async (startMeasureIndex = 0, startQuant = 0) => {
      const request = ++playbackRequest.current;
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      try {
        await ensureInit();
        if (request !== playbackRequest.current) return;

        setLastPlayStart({ measureIndex: startMeasureIndex, quant: startQuant });
        updatePlaying(true);
        setIsActive(true);

        // Generate timeline
        const current = currentRef.current?.() ?? { score, bpm, instrument };
        if (current.instrument ?? instrument) setInstrument((current.instrument ?? instrument)!);
        const timeline = createTimeline(current.score, current.bpm);

        // Find start offset time
        const startTimeOffset = getPlaybackOffset(
          current.score,
          current.bpm,
          startMeasureIndex,
          startQuant
        );
        // Keep the requested rest position; the scheduler reports subsequent musical onsets.
        const onset = timeline.find(
          (event) => event.measureIndex === startMeasureIndex && event.quant === startQuant
        );
        updatePosition({
          measureIndex: startMeasureIndex,
          quant: startQuant,
          duration: onset?.duration ?? 0,
        });

        // Ensure cursor is mounted in "Stopped" state (at start) before animating
        setIsActive(true);

        // Use double-RAF to guarantee a paint frame occurs for the "Start" position.
        // This is more reliable than setTimeout for CSS transitions on newly mounted/updated elements.
        await new Promise<void>((resolve) => {
          const finish = () => {
            controller.signal.removeEventListener('abort', finish);
            resolve();
          };
          controller.signal.addEventListener('abort', finish, { once: true });
          requestAnimationFrame(() => requestAnimationFrame(finish));
        });
        if (request !== playbackRequest.current || controller.signal.aborted) return;
        await scheduleScorePlayback(
          timeline,
          current.score,
          current.bpm,
          chordPlayback,
          startTimeOffset,
          (measureIndex, quant, duration) => {
            if (request !== playbackRequest.current) return;
            updatePosition({ measureIndex, quant, duration: duration || 0 });
          },
          () => {
            if (request !== playbackRequest.current) return;
            updatePlaying(false);
            updatePosition({ measureIndex: null, quant: null, duration: 0 });
          },
          {
            signal: controller.signal,
            onCancel: () => {
              if (request === playbackRequest.current) updatePlaying(false);
            },
          }
        );
      } catch (error) {
        if (request !== playbackRequest.current) return;
        updatePlaying(false);
        setIsActive(false);
        throw error;
      }
    },
    [score, bpm, ensureInit, chordPlayback, instrument, updatePosition, updatePlaying]
  );

  const handlePlayToggle = useCallback(() => {
    if (playingRef.current) {
      pausePlayback();
    } else {
      const resumeMeasure = positionRef.current.measureIndex ?? 0;
      const resumeQuant = positionRef.current.quant ?? 0;
      // Button handlers consume failures; promise-based controls receive the rejection directly.
      return playScore(resumeMeasure, resumeQuant).catch(() => {});
    }
  }, [playScore, pausePlayback]);

  const seekPlayback = useCallback(
    (measureIndex: number, quant = 0) => {
      pausePlayback();
      updatePosition({ measureIndex, quant, duration: 0 });
    },
    [pausePlayback, updatePosition]
  );

  return {
    getPosition: () => positionRef.current,
    getIsPlaying: () => playingRef.current,
    seekPlayback,
    isPlaying,
    isActive,
    playbackPosition,
    playScore,
    stopPlayback,
    pausePlayback,
    handlePlayToggle,
    exitPlaybackMode,
    lastPlayStart,
    instrumentState, // Expose for UI (e.g., "Loading piano samples...")
  };
};
