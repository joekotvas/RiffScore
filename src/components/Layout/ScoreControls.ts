import type { PlaybackState } from '@/api.types';
import type { Score } from '@/types';
import type { ReactNode } from 'react';
import type { InstrumentType } from '@/engines/toneEngine';

/** Reactive controls for a custom toolbar or compact embed, backed by the editor's own state. */
export interface ScoreControls {
  score: Score;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  playbackState: PlaybackState;
  playbackEnabled: boolean;
  isPlaying: boolean;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (measureIndex: number, quant?: number) => void;
  bpm: number;
  setBpm: (bpm: number) => void;
  instrument: InstrumentType;
  setInstrument: (instrument: InstrumentType) => void;
  samplerLoaded: boolean;
}

export type RenderScoreControls = (controls: ScoreControls) => ReactNode;

/** A visual cursor driven by an external transport. Duration is seconds until the next onset. */
export interface PlaybackCursorState {
  measureIndex: number;
  quant: number;
  duration: number;
  isPlaying: boolean;
}
