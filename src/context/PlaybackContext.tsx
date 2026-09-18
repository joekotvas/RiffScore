import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { useScoreContext } from './ScoreContext';
import { usePlayback } from '@/hooks/audio/usePlayback';
import type { ChordPlaybackConfig } from '@/types';
import type { InstrumentType } from '@/engines/toneEngine';

function useEditorTransport(chordPlayback?: ChordPlaybackConfig) {
  const { state, engines } = useScoreContext();
  const [tempo, setTempo] = useState<{ source: number; value: number }>();
  const [instrument, updateInstrument] = useState<InstrumentType>('bright');
  const instrumentRef = useRef(instrument);
  const setInstrument = (value: InstrumentType): void => {
    instrumentRef.current = value;
    updateInstrument(value);
  };
  const bpm = tempo && tempo.source === state.score.bpm ? tempo.value : state.score.bpm || 120;
  const tempoRef = useRef(tempo);
  useEffect(() => {
    let previousBpm = engines.engine.getState().bpm;
    return engines.engine.subscribe((score) => {
      if (score.bpm !== previousBpm) {
        previousBpm = score.bpm;
        tempoRef.current = undefined;
        setTempo(undefined);
      }
    });
  }, [engines.engine]);
  const playback = usePlayback(state.score, bpm, chordPlayback, instrument, () => {
    const score = engines.engine.getState();
    return {
      score,
      instrument: instrumentRef.current,
      bpm:
        tempoRef.current && tempoRef.current.source === score.bpm
          ? tempoRef.current.value
          : score.bpm || 120,
    };
  });
  const setBpm = (value: number): void => {
    if (!Number.isFinite(value) || value <= 0) return;
    playback.pausePlayback();
    const next = { source: engines.engine.getState().bpm, value };
    tempoRef.current = next;
    setTempo(next);
  };
  return { ...playback, bpm, setBpm, instrument, setInstrument };
}

const PlaybackContext = createContext<ReturnType<typeof useEditorTransport> | null>(null);

export function PlaybackProvider({
  children,
  chordPlayback,
}: {
  children: React.ReactNode;
  chordPlayback?: ChordPlaybackConfig;
}): React.ReactElement {
  const transport = useEditorTransport(chordPlayback);
  return <PlaybackContext.Provider value={transport}>{children}</PlaybackContext.Provider>;
}

export const useEditorPlayback = (): ReturnType<typeof useEditorTransport> | null =>
  useContext(PlaybackContext);
