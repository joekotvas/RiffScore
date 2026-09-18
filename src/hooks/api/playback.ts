import { MusicEditorAPI } from '@/api.types';
import { APIContext } from './types';
import {
  initTone,
  scheduleScorePlayback,
  stopTonePlayback,
  setInstrument as toneSetInstrument,
  isPlaying as toneIsPlaying,
  InstrumentType,
} from '@/engines/toneEngine';
import { createTimeline } from '@/services/TimelineService';
import { getPlaybackOffset } from '@/services/MeasureTiming';
import { DEFAULT_CHORD_PLAYBACK } from '@/types';

/**
 * Playback method names provided by this factory
 */
type PlaybackMethodNames =
  | 'play'
  | 'pause'
  | 'stop'
  | 'rewind'
  | 'setInstrument'
  | 'seek'
  | 'getPlaybackState';

/**
 * Factory for creating Playback API methods.
 * Handles playback controls and transport via toneEngine.
 *
 * Uses ThisType<MusicEditorAPI> so `this` is correctly typed without explicit casts.
 *
 * @param ctx - Shared API context
 * @returns Partial API implementation for playback
 */
export const createPlaybackMethods = (
  ctx: APIContext
): Pick<MusicEditorAPI, PlaybackMethodNames> & ThisType<MusicEditorAPI> => {
  const { setResult } = ctx;
  let lastPlayPosition = { measureIndex: 0, quant: 0 };
  let isInitialized = false;

  /**
   * Ensures Tone.js is initialized before playback.
   * Must be called from user gesture context (click/tap).
   */
  const ensureInit = async (): Promise<void> => {
    if (isInitialized) return;
    await initTone();
    isInitialized = true;
  };

  const validPosition = (method: string, measure = 0, quant = 0): boolean => {
    if (Number.isInteger(measure) && measure >= 0 && Number.isFinite(quant) && quant >= 0)
      return true;
    setResult({
      ok: false,
      status: 'error',
      method,
      code: 'INVALID_PLAYBACK_POSITION',
      message: 'Use a nonnegative integer measure index and a finite nonnegative quant position.',
    });
    return false;
  };

  return {
    getPlaybackState() {
      const position =
        ctx.playback?.getPosition?.() ?? ctx.playback?.playbackPosition ?? lastPlayPosition;
      return {
        isPlaying: ctx.playback?.getIsPlaying?.() ?? ctx.playback?.isPlaying ?? toneIsPlaying(),
        measureIndex: position.measureIndex,
        quant: position.quant,
        duration: 'duration' in position ? Number(position.duration) : 0,
      };
    },
    seek(measureIndex, quant = 0) {
      if (!validPosition('seek', measureIndex, quant)) return this;
      if (ctx.playback?.seekPlayback) ctx.playback.seekPlayback(measureIndex, quant);
      else {
        stopTonePlayback();
        lastPlayPosition = { measureIndex, quant };
      }
      setResult({
        ok: true,
        status: 'info',
        method: 'seek',
        message: 'Playback position updated; call play() to resume.',
      });
      return this;
    },
    async play(startMeasure, startQuant) {
      if (!validPosition('play', startMeasure, startQuant)) return this;
      try {
        if (ctx.playback) {
          const measure =
            startMeasure ??
            (ctx.playback.getPosition?.() ?? ctx.playback.playbackPosition)?.measureIndex ??
            0;
          const quant =
            startQuant ??
            (startMeasure === undefined
              ? ((ctx.playback.getPosition?.() ?? ctx.playback.playbackPosition)?.quant ?? 0)
              : 0);
          await ctx.playback.playScore(measure, quant);
          setResult({ ok: true, status: 'info', method: 'play', message: 'Playback started' });
          return this;
        }
        await ensureInit();

        // Use provided start position, or resume from last, or start from beginning
        const measureIndex = startMeasure ?? lastPlayPosition.measureIndex;
        const quant = startQuant ?? (startMeasure === undefined ? lastPlayPosition.quant : 0);

        // Save for potential resume
        lastPlayPosition = { measureIndex, quant };

        const score = ctx.getScore();
        const bpm = score.bpm || 120;

        // Generate timeline
        const timeline = createTimeline(score, bpm);

        const startTimeOffset = getPlaybackOffset(score, bpm, measureIndex, quant);

        // Schedule playback. Route through scheduleScorePlayback (melody + chord
        // accompaniment) so api.play() matches the UI's transport — the API was
        // previously melody-only via scheduleTonePlayback, silently dropping the
        // chord track it advertises (#242 carve-out: api-play-ignores-chords).
        // Honor the embedder's configured chord playback (config.chord.playback —
        // the same value getChordPlayback() reports) so an `enabled: false` or a
        // custom velocity is respected; fall back to DEFAULT_CHORD_PLAYBACK. Chord
        // events are only emitted when chord playback is enabled AND
        // score.chordTrack is non-empty, so chordless scores are unaffected.
        const chordPlayback = ctx.config.chord?.playback ?? DEFAULT_CHORD_PLAYBACK;
        await scheduleScorePlayback(
          timeline,
          score,
          bpm,
          chordPlayback,
          startTimeOffset,
          // Position update callback - store for potential resume
          (m, q) => {
            lastPlayPosition = { measureIndex: m, quant: q };
          },
          // Completion callback
          () => {
            lastPlayPosition = { measureIndex: 0, quant: 0 };
          }
        );

        setResult({
          ok: true,
          status: 'info',
          method: 'play',
          message: 'Playback started',
          details: { startMeasure: measureIndex, startQuant: quant, bpm },
        });
      } catch (error) {
        setResult({
          ok: false,
          status: 'error',
          method: 'play',
          message: `Playback failed: ${error instanceof Error ? error.message : String(error)}`,
          code: 'PLAYBACK_ERROR',
        });
        console.error(error);
      }

      return this;
    },

    pause() {
      // Stop transport but retain position for resume
      if (ctx.playback) ctx.playback.pausePlayback();
      else stopTonePlayback();
      // lastPlayPosition is already updated during playback
      setResult({
        ok: true,
        status: 'info',
        method: 'pause',
        message: 'Playback paused',
        details: { position: lastPlayPosition },
      });
      return this;
    },

    stop() {
      if (ctx.playback) ctx.playback.stopPlayback();
      else stopTonePlayback();
      // Reset to beginning
      lastPlayPosition = { measureIndex: 0, quant: 0 };
      setResult({
        ok: true,
        status: 'info',
        method: 'stop',
        message: 'Playback stopped',
      });
      return this;
    },

    rewind(measureNum = 0) {
      if (!validPosition('rewind', measureNum)) return this;
      if (ctx.playback) {
        const wasPlaying = ctx.playback.getIsPlaying?.() ?? ctx.playback.isPlaying;
        ctx.playback.seekPlayback?.(measureNum, 0);
        if (wasPlaying) void this.play(measureNum, 0);
        setResult({
          ok: true,
          status: 'info',
          method: 'rewind',
          message: `Rewound to measure ${measureNum + 1}`,
        });
        return this;
      }
      // Stop any current playback
      const wasPlaying = toneIsPlaying();
      stopTonePlayback();

      // Reset position
      lastPlayPosition = { measureIndex: measureNum, quant: 0 };

      // If was playing, restart from new position
      if (wasPlaying) {
        // Use setTimeout to allow stop to complete
        setTimeout(() => {
          this.play(measureNum, 0);
        }, 0);
      }

      setResult({
        ok: true,
        status: 'info',
        method: 'rewind',
        message: `Rewound to measure ${measureNum + 1}`,
        details: { measureIndex: measureNum, wasPlaying },
      });

      return this;
    },

    setInstrument(instrumentId) {
      // Valid instruments matching InstrumentType
      const validInstruments: InstrumentType[] = ['bright', 'mellow', 'organ', 'piano'];

      if (!validInstruments.includes(instrumentId as InstrumentType)) {
        setResult({
          ok: false,
          status: 'error',
          method: 'setInstrument',
          message: `Invalid instrument '${instrumentId}'. Valid instruments: ${validInstruments.join(', ')}`,
          code: 'INVALID_INSTRUMENT',
          details: { instrumentId, validInstruments },
        });
        return this;
      }

      if (ctx.playback?.setInstrument) ctx.playback.setInstrument(instrumentId as InstrumentType);
      else toneSetInstrument(instrumentId as InstrumentType);
      setResult({
        ok: true,
        status: 'info',
        method: 'setInstrument',
        message: `Instrument set to ${instrumentId}`,
        details: { instrumentId },
      });
      return this;
    },
  };
};
