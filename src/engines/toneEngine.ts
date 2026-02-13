/**
 * Tone.js Audio Engine
 *
 * Provides multiple instrument options with progressive loading.
 * Users can choose between synth types and piano samples.
 *
 * DYNAMIC LOADING: Tone.js is loaded on first use to reduce bundle size
 * for visual-only consumers. See Issue #196.
 */

import { TimelineEvent } from '@/services/TimelineService';
import { Score, ChordPlaybackConfig } from '@/types';
import { getChordVoicing } from '@/services/ChordService';
import { TIME_SIGNATURES } from '@/constants';

// --- TYPES ---

/**
 * Chord playback event for scheduling.
 */
export interface ChordPlaybackEvent {
  time: number; // Start time in seconds
  duration: number; // Duration in seconds
  notes: string[]; // Voicing notes (e.g., ['C3', 'E3', 'G3'])
  symbol: string; // Original chord symbol
  velocity: number; // Velocity 0-1
}

export type InstrumentType = 'bright' | 'mellow' | 'organ' | 'piano';

export type InstrumentState =
  | 'not-loaded'
  | 'loading'
  | 'initializing'
  | 'ready'
  | 'loading-samples';

interface ToneEngineState {
  instrumentState: InstrumentState;
  selectedInstrument: InstrumentType;
  samplerLoaded: boolean;
  isPlaying: boolean;
}

// Tone.js module type (dynamic import)
type ToneModule = typeof import('tone');

/**
 * Interface for Tone.js PolySynth-like instances.
 * Used for typed synth registry instead of `any`.
 */
interface PolySynthLike {
  triggerAttack: (notes: string | string[], time?: number, velocity?: number) => void;
  triggerRelease: (notes: string | string[], time?: number) => void;
  triggerAttackRelease: (
    notes: string | string[],
    duration: string | number,
    time?: number,
    velocity?: number
  ) => void;
  toDestination: () => PolySynthLike;
  dispose: () => void;
  volume?: { value: number };
}

/**
 * Interface for Tone.js Sampler-like instances.
 */
interface SamplerLike extends PolySynthLike {
  loaded: boolean;
}

/**
 * Interface for Tone.js Part-like instances.
 * Note: Types are widened to accommodate Tone.js's flexible Time type.
 */
interface PartLike {
  start: (time?: number) => void;
  stop: (time?: number) => void;
  dispose: () => void;
  loop?: boolean | number;
  loopEnd?: unknown; // Tone.js Time type is complex, use unknown for flexibility
}

// --- DYNAMIC LOADER ---

let toneModuleCache: ToneModule | null = null;
let toneLoadPromise: Promise<ToneModule> | null = null;

/**
 * Dynamically loads Tone.js on first use.
 * Subsequent calls return cached module.
 * Resets promise on failure to allow retry.
 */
const loadTone = async (): Promise<ToneModule> => {
  if (toneModuleCache) return toneModuleCache;

  if (!toneLoadPromise) {
    updateState({ instrumentState: 'loading' });
    toneLoadPromise = import('tone')
      .then((module) => {
        toneModuleCache = module;
        return module;
      })
      .catch((error) => {
        // Reset promise to allow retry
        toneLoadPromise = null;
        updateState({ instrumentState: 'not-loaded' });
        console.warn('Failed to load Tone.js:', error);
        throw error;
      });
  }

  return toneLoadPromise;
};

/**
 * Gets the loaded Tone module, or null if not yet loaded.
 * Use for synchronous checks only.
 */
const getTone = (): ToneModule | null => toneModuleCache;

// --- CHORD PLAYBACK HELPERS ---

/**
 * Creates chord playback events from a score's chord track.
 * @param score - The score containing chord symbols
 * @param bpm - Tempo in beats per minute
 * @param velocity - Velocity for chord playback (0-127)
 * @returns Array of ChordPlaybackEvent for scheduling
 */
export const createChordPlaybackEvents = (
  score: Score,
  bpm: number,
  velocity: number = 50
): ChordPlaybackEvent[] => {
  const chordTrack = score.chordTrack;
  if (!chordTrack || chordTrack.length === 0) return [];

  const events: ChordPlaybackEvent[] = [];
  const quantsPerMeasure = TIME_SIGNATURES[score.timeSignature] || TIME_SIGNATURES['4/4'];
  const secondsPerBeat = 60 / bpm;
  const secondsPerQuant = secondsPerBeat / 16; // 16 quants per quarter note

  // Calculate total quants in score
  const totalMeasures = score.staves[0]?.measures.length || 0;
  const totalQuants = totalMeasures * quantsPerMeasure;

  for (let i = 0; i < chordTrack.length; i++) {
    const chord = chordTrack[i];
    const nextChord = chordTrack[i + 1];

    // Get voicing notes
    const notes = getChordVoicing(chord.symbol);
    if (notes.length === 0) continue;

    // Calculate time in seconds
    const startTime = chord.quant * secondsPerQuant;

    // Calculate measure boundary
    const measureIndex = Math.floor(chord.quant / quantsPerMeasure);
    const measureEndQuant = (measureIndex + 1) * quantsPerMeasure;

    // Duration: until next chord, end of measure, or end of score (whichever comes first)
    let endQuant: number;
    if (nextChord && nextChord.quant <= measureEndQuant) {
      // Next chord is in same measure or at measure boundary
      endQuant = nextChord.quant;
    } else {
      // Cap at end of current measure
      endQuant = Math.min(measureEndQuant, totalQuants);
    }

    const duration = (endQuant - chord.quant) * secondsPerQuant;
    if (duration <= 0) continue;

    events.push({
      time: startTime,
      duration,
      notes,
      symbol: chord.symbol,
      velocity: velocity / 127, // Convert MIDI velocity to 0-1
    });
  }

  return events;
};

// --- STATE ---

// Mutable registry of synth instances. Properties are added dynamically as instruments are loaded.
const synths: Record<string, PolySynthLike> = {};
let sampler: SamplerLike | null = null;
let currentPart: PartLike | null = null;
let chordPart: PartLike | null = null;
let state: ToneEngineState = {
  instrumentState: 'not-loaded',
  selectedInstrument: 'bright',
  samplerLoaded: false,
  isPlaying: false,
};

// Callbacks for state changes
let onStateChange: ((state: ToneEngineState) => void) | null = null;

// --- HELPERS ---

const freqToNote = (frequency: number): string => {
  const Tone = getTone();
  if (!Tone) return 'C4'; // Fallback
  return Tone.Frequency(frequency).toNote();
};

const updateState = (partial: Partial<ToneEngineState>) => {
  state = { ...state, ...partial };
  onStateChange?.(state);
};

// --- SYNTH PRESET FACTORIES ---
// These return factory functions that create synths using the loaded Tone module

const createSynthPresets = (Tone: ToneModule) => ({
  bright: {
    name: 'Bright Synth',
    create: () =>
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3,
        modulationIndex: 10,
        oscillator: { type: 'sine' as const },
        envelope: {
          attack: 0.01,
          decay: 0.4,
          sustain: 0.2,
          release: 1.5,
        },
        modulation: { type: 'triangle' as const },
        modulationEnvelope: {
          attack: 0.01,
          decay: 0.3,
          sustain: 0.1,
          release: 0.5,
        },
      }),
    volume: -10,
  },
  mellow: {
    name: 'Mellow Synth',
    create: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' as const },
        envelope: {
          attack: 0.05,
          decay: 0.6,
          sustain: 0.3,
          release: 2.0,
        },
      }),
    volume: -8,
  },
  organ: {
    name: 'Organ Synth',
    create: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' as const },
        envelope: {
          attack: 0.02,
          decay: 0.3,
          sustain: 0.4,
          release: 0.8,
        },
      }),
    volume: -6,
  },
});

// --- INITIALIZATION ---

/**
 * Initializes Tone.js audio context and instruments.
 * Must be called from a user gesture (click/tap) due to browser autoplay policy.
 * Dynamically loads Tone.js on first call.
 */
export const initTone = async (onState?: (state: ToneEngineState) => void): Promise<void> => {
  if (onState) onStateChange = onState;

  // Load Tone.js dynamically
  const Tone = await loadTone();

  updateState({ instrumentState: 'initializing' });

  // Start audio context (requires user gesture)
  await Tone.start();

  // Initialize all synth presets
  const presets = createSynthPresets(Tone);
  for (const [key, preset] of Object.entries(presets)) {
    if (!synths[key]) {
      const synth = preset.create().toDestination();
      synth.volume.value = preset.volume;
      synth.maxPolyphony = 24;
      synths[key] = synth;
    }
  }

  updateState({ instrumentState: 'ready' });

  // Begin loading piano samples in background
  loadPianoSampler(Tone);
};

/**
 * Loads piano samples in background.
 */
const loadPianoSampler = (Tone: ToneModule) => {
  if (sampler) return;

  updateState({ instrumentState: 'loading-samples' });

  const baseUrl = '/audio/piano/';

  sampler = new Tone.Sampler({
    urls: {
      A0: 'A0.mp3',
      C1: 'C1.mp3',
      'D#1': 'Ds1.mp3',
      'F#1': 'Fs1.mp3',
      A1: 'A1.mp3',
      C2: 'C2.mp3',
      'D#2': 'Ds2.mp3',
      'F#2': 'Fs2.mp3',
      A2: 'A2.mp3',
      C3: 'C3.mp3',
      'D#3': 'Ds3.mp3',
      'F#3': 'Fs3.mp3',
      A3: 'A3.mp3',
      C4: 'C4.mp3',
      'D#4': 'Ds4.mp3',
      'F#4': 'Fs4.mp3',
      A4: 'A4.mp3',
      C5: 'C5.mp3',
      'D#5': 'Ds5.mp3',
      'F#5': 'Fs5.mp3',
      A5: 'A5.mp3',
      C6: 'C6.mp3',
      'D#6': 'Ds6.mp3',
      'F#6': 'Fs6.mp3',
      A6: 'A6.mp3',
      C7: 'C7.mp3',
      'D#7': 'Ds7.mp3',
      'F#7': 'Fs7.mp3',
      A7: 'A7.mp3',
      C8: 'C8.mp3',
    },
    baseUrl,
    onload: () => {
      updateState({ samplerLoaded: true, instrumentState: 'ready' });
    },
    onerror: (error: Error) => {
      console.warn('Failed to load piano samples:', error);
      updateState({ instrumentState: 'ready' });
    },
  }).toDestination();
};

// --- INSTRUMENT SELECTION ---

/**
 * Changes the active instrument.
 */
export const setInstrument = (type: InstrumentType): void => {
  updateState({ selectedInstrument: type });
};

/**
 * Gets the currently active instrument for playback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getActiveInstrument = (): any => {
  const selected = state.selectedInstrument;

  // Piano samples - use if loaded, else fallback to bright synth
  if (selected === 'piano') {
    if (sampler && state.samplerLoaded) {
      return sampler;
    }
    // Fallback while loading
    return synths['bright'] || null;
  }

  // Synth presets
  return synths[selected] || synths['bright'] || null;
};

/**
 * Gets available instruments for UI dropdown.
 */
export const getInstrumentOptions = (): {
  id: InstrumentType;
  name: string;
  loading?: boolean;
}[] => {
  return [
    { id: 'bright', name: 'Bright Synth' },
    { id: 'mellow', name: 'Mellow Synth' },
    { id: 'organ', name: 'Organ Synth' },
    {
      id: 'piano',
      name: state.samplerLoaded ? 'Piano Samples' : 'Piano (Loading...)',
      loading: !state.samplerLoaded,
    },
  ];
};

// --- PLAYBACK ---

/**
 * Schedules the score for playback using Tone.js Transport and Part.
 * Ensures Tone.js is loaded before playback.
 */
export const scheduleTonePlayback = async (
  timeline: TimelineEvent[],
  bpm: number,
  startTimeOffset: number = 0,
  onPositionUpdate?: (measureIndex: number, quant: number, duration: number) => void,
  onComplete?: () => void
): Promise<void> => {
  // Ensure Tone is loaded
  const Tone = await loadTone();

  const instrument = getActiveInstrument();
  if (!instrument) {
    // Not initialized yet, auto-init
    await initTone();
    return await scheduleTonePlayback(timeline, bpm, startTimeOffset, onPositionUpdate, onComplete);
  }

  stopTonePlayback();
  Tone.Transport.bpm.value = bpm;

  const filteredTimeline = timeline.filter((e) => e.time >= startTimeOffset);
  if (filteredTimeline.length === 0) {
    onComplete?.();
    return;
  }

  const adjustedTimeline = filteredTimeline.map((e) => ({
    ...e,
    time: e.time - startTimeOffset,
  }));

  const events = adjustedTimeline.map((e) => ({
    time: e.time,
    note: e.pitch || freqToNote(e.frequency),
    duration: e.duration,
    measureIndex: e.measureIndex,
    quant: e.quant,
  }));

  const part = new Tone.Part((time: number, event: (typeof events)[0]) => {
    instrument.triggerAttackRelease(event.note, event.duration, time);
    Tone.Draw.schedule(() => {
      onPositionUpdate?.(event.measureIndex, event.quant, event.duration);
    }, time);
  }, events);
  currentPart = part;

  part.start(0);

  const lastEvent = events[events.length - 1];
  const endTime = lastEvent.time + lastEvent.duration + 0.1;

  Tone.Transport.scheduleOnce(() => {
    updateState({ isPlaying: false });
    onComplete?.();
  }, endTime);

  Tone.Transport.start();
  updateState({ isPlaying: true });
};

/**
 * Schedules chord playback events alongside the melody.
 * Call this after scheduleTonePlayback to add chord accompaniment.
 * @param chordEvents - Array of ChordPlaybackEvent from createChordPlaybackEvents
 * @param startTimeOffset - Time offset in seconds for partial playback
 */
export const scheduleChordPlayback = async (
  chordEvents: ChordPlaybackEvent[],
  startTimeOffset: number = 0
): Promise<void> => {
  if (chordEvents.length === 0) return;

  const Tone = await loadTone();
  const instrument = getActiveInstrument();
  if (!instrument) return;

  // Filter and adjust events based on start offset
  const adjustedEvents = chordEvents
    .filter((e) => e.time + e.duration > startTimeOffset)
    .map((e) => ({
      ...e,
      time: Math.max(0, e.time - startTimeOffset),
      // Adjust duration if starting mid-chord
      duration: e.time < startTimeOffset ? e.duration - (startTimeOffset - e.time) : e.duration,
    }));

  if (adjustedEvents.length === 0) return;

  // Dispose of existing chord part
  if (chordPart) {
    chordPart.dispose();
    chordPart = null;
  }

  const chordPartInstance = new Tone.Part((time: number, event: ChordPlaybackEvent) => {
    // Play all notes in the chord voicing with the specified velocity
    for (const note of event.notes) {
      instrument.triggerAttackRelease(note, event.duration, time, event.velocity);
    }
  }, adjustedEvents);
  chordPart = chordPartInstance;

  chordPartInstance.start(0);
};

/**
 * Combined playback scheduling for melody and chords.
 * @param timeline - Melody timeline events
 * @param score - Full score (for chord track)
 * @param bpm - Tempo in beats per minute
 * @param chordConfig - Optional chord playback configuration
 * @param startTimeOffset - Time offset in seconds
 * @param onPositionUpdate - Callback for playhead position updates
 * @param onComplete - Callback when playback finishes
 */
export const scheduleScorePlayback = async (
  timeline: TimelineEvent[],
  score: Score,
  bpm: number,
  chordConfig?: ChordPlaybackConfig,
  startTimeOffset: number = 0,
  onPositionUpdate?: (measureIndex: number, quant: number, duration: number) => void,
  onComplete?: () => void
): Promise<void> => {
  // Schedule melody playback
  await scheduleTonePlayback(timeline, bpm, startTimeOffset, onPositionUpdate, onComplete);

  // Schedule chord playback if enabled
  if (chordConfig?.enabled && score.chordTrack && score.chordTrack.length > 0) {
    const chordEvents = createChordPlaybackEvents(score, bpm, chordConfig.velocity);
    await scheduleChordPlayback(chordEvents, startTimeOffset);
  }
};

/**
 * Stops playback and cleans up resources.
 */
export const stopTonePlayback = (): void => {
  const Tone = getTone();
  if (!Tone) return;

  Tone.Transport.stop();
  Tone.Transport.cancel();

  if (currentPart) {
    currentPart.dispose();
    currentPart = null;
  }

  if (chordPart) {
    chordPart.dispose();
    chordPart = null;
  }

  updateState({ isPlaying: false });
};

/**
 * Sets the tempo (BPM) - can be called during playback.
 */
export const setTempo = (bpm: number): void => {
  const Tone = getTone();
  if (Tone) {
    Tone.Transport.bpm.value = bpm;
  }
};

/**
 * Plays a single note (for preview/click feedback).
 * Initializes Tone.js if not already loaded.
 */
export const playNote = async (pitch: string, duration: string = '8n'): Promise<void> => {
  // Wait for initialization if not ready
  if (
    state.instrumentState === 'not-loaded' ||
    state.instrumentState === 'loading' ||
    state.instrumentState === 'initializing'
  ) {
    await initTone();
  }

  const instrument = getActiveInstrument();
  if (instrument) {
    instrument.triggerAttackRelease(pitch, duration);
  }
};

// --- STATE GETTERS ---

/** Returns current instrument loading state. */
export const getInstrumentState = (): InstrumentState => state.instrumentState;
/** Returns currently selected instrument type. */
export const getSelectedInstrument = (): InstrumentType => state.selectedInstrument;
/** Returns true if piano samples are loaded. */
export const isSamplerLoaded = (): boolean => state.samplerLoaded;
/** Returns true if playback is active. */
export const isPlaying = (): boolean => state.isPlaying;
/** Returns a copy of the full engine state. */
export const getState = (): ToneEngineState => ({ ...state });

/**
 * Checks if Tone.js is loaded (for UI indicators).
 */
export const isToneLoaded = (): boolean => toneModuleCache !== null;
