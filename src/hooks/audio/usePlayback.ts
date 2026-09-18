import { useState, useRef, useCallback, useEffect } from 'react';
import { Score, ChordPlaybackConfig, DEFAULT_CHORD_PLAYBACK } from '@/types';
import {
  initTone,
  scheduleScorePlayback,
  stopTonePlayback,
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
}

export const usePlayback = (
  score: Score,
  bpm: number,
  chordPlayback: ChordPlaybackConfig = DEFAULT_CHORD_PLAYBACK,
  instrument?: InstrumentType
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
    stopTonePlayback();
    setIsPlaying(false);
    // Keep active (cursor visible at 0)
    setIsActive(true);
    setPlaybackPosition({ measureIndex: null, quant: null, duration: 0 });
  }, []);

  /*
   * Pause playback but retain position (Pause Button behavior)
   */
  const pausePlayback = useCallback(() => {
    playbackRequest.current++;
    pending.current?.abort();
    stopTonePlayback();
    setIsPlaying(false);
    setIsActive(true);
    // Do NOT reset playbackPosition, so cursor stays visible and we can resume
  }, []);

  const playScore = useCallback(
    async (startMeasureIndex = 0, startQuant = 0) => {
      const request = ++playbackRequest.current;
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      try {
        await ensureInit();
        if (request !== playbackRequest.current) return;
        if (instrument) setInstrument(instrument);

        // Stop any existing playback (clears position state if we called stopPlayback,
        // but here we are about to overwrite it anyway)
        stopTonePlayback();

        setLastPlayStart({ measureIndex: startMeasureIndex, quant: startQuant });
        setIsPlaying(true);
        setIsActive(true);

        // Generate timeline
        const timeline = createTimeline(score, bpm);

        // Find start offset time
        const startTimeOffset = getPlaybackOffset(score, bpm, startMeasureIndex, startQuant);
        const startEvent = timeline.find(
          (e) =>
            e.measureIndex >= startMeasureIndex &&
            (e.measureIndex > startMeasureIndex || e.quant >= startQuant)
        );

        if (startEvent) {
          // Pre-seed the state so the UI has the correct "From" position and duration immediately
          // This fixes the "First Note Jump" where duration was 0 causing instant transition
          setPlaybackPosition({
            measureIndex: startEvent.measureIndex,
            quant: startEvent.quant,
            duration: startEvent.duration || 0,
          });
        } else {
          setPlaybackPosition({ measureIndex: startMeasureIndex, quant: startQuant, duration: 0 });
        }

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
          score,
          bpm,
          chordPlayback,
          startTimeOffset,
          (measureIndex, quant, duration) => {
            if (request !== playbackRequest.current) return;
            setPlaybackPosition({ measureIndex, quant, duration: duration || 0 });
          },
          () => {
            if (request !== playbackRequest.current) return;
            setIsPlaying(false);
            setPlaybackPosition({ measureIndex: null, quant: null, duration: 0 });
          },
          {
            signal: controller.signal,
            onCancel: () => {
              if (request === playbackRequest.current) setIsPlaying(false);
            },
          }
        );
      } catch (error) {
        if (request !== playbackRequest.current) return;
        setIsPlaying(false);
        setIsActive(false);
        throw error;
      }
    },
    [score, bpm, ensureInit, chordPlayback, instrument]
  );

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) {
      pausePlayback();
    } else {
      // Resume from NEXT event (quant + 1) if valid, otherwise start from beginning
      const resumeMeasure = playbackPosition.measureIndex ?? 0;
      const resumeQuant = (playbackPosition.quant ?? -1) + 1; // +1 to skip to next event
      // Button handlers consume failures; promise-based controls receive the rejection directly.
      return playScore(resumeMeasure, resumeQuant).catch(() => {});
    }
  }, [isPlaying, playScore, pausePlayback, playbackPosition]);

  const seekPlayback = useCallback(
    (measureIndex: number, quant = 0) => {
      pausePlayback();
      setPlaybackPosition({ measureIndex, quant, duration: 0 });
    },
    [pausePlayback]
  );

  return {
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
