import React, { useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import ToolbarButton from './ToolbarButton';
import InstrumentSelector from './InstrumentSelector';
import { PRECOMPOSED_NOTES_UP, BRAVURA_FONT } from '@/constants/SMuFL';
import { InstrumentType } from '@/engines/toneEngine';
import './styles/PlaybackControls.css';

interface PlaybackControlsProps {
  isPlaying: boolean;
  onPlayToggle?: () => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  selectedInstrument: InstrumentType;
  onInstrumentChange: (instrument: InstrumentType) => void;
  samplerLoaded: boolean;
  height?: string;
  variant?: 'default' | 'ghost';
}

const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  onPlayToggle,
  bpm,
  onBpmChange,
  selectedInstrument,
  onInstrumentChange,
  samplerLoaded,
  height = 'h-9',
  variant = 'default',
}) => {
  const [bpmBuffer, setBpmBuffer] = useState(String(bpm));
  const [isFocused, setIsFocused] = useState(false);
  const [isBpmHovered, setIsBpmHovered] = useState(false);

  useEffect(() => {
    setBpmBuffer(String(bpm));
  }, [bpm]);

  const handleBpmBlur = () => {
    setIsFocused(false);
    const value = Number(bpmBuffer);
    if (!bpmBuffer || isNaN(value) || value <= 0) {
      setBpmBuffer('120');
      onBpmChange(120);
    } else {
      const clamped = Math.max(1, Math.min(300, value));
      setBpmBuffer(String(clamped));
      onBpmChange(clamped);
    }
  };

  const isGhost = variant === 'ghost';

  const bpmWrapperClasses = [
    'riff-PlaybackControls__bpm-wrapper',
    isFocused ? 'riff-PlaybackControls__bpm-wrapper--focused' : '',
    isGhost ? 'riff-PlaybackControls__bpm-wrapper--ghost' : '',
    isBpmHovered ? 'riff-PlaybackControls__bpm-wrapper--hovered' : '',
  ].join(' ');

  return (
    <div className="riff-PlaybackControls">
      <button
        type="button"
        className={`riff-PlaybackControls__play-button ${isGhost ? 'riff-PlaybackControls__play-button--ghost' : ''}`}
        onClick={onPlayToggle}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        <span className="riff-PlaybackControls__label">
          {isPlaying ? 'Pause' : 'Play'}
        </span>
      </button>

      <div
        className={bpmWrapperClasses}
        onMouseEnter={() => setIsBpmHovered(true)}
        onMouseLeave={() => setIsBpmHovered(false)}
      >
        <span className="riff-PlaybackControls__bpm-label">
          <span className="riff-PlaybackControls__bpm-note" style={{ fontFamily: BRAVURA_FONT }}>
            {PRECOMPOSED_NOTES_UP.quarter}
          </span>
          <span className="riff-PlaybackControls__bpm-equals"> ＝ </span>
        </span>
        <input
          type="text"
          value={bpmBuffer}
          onChange={(e) => setBpmBuffer(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBpmBlur}
          className="riff-PlaybackControls__bpm-input"
        />
      </div>

      {/* Instrument Selector */}
      <InstrumentSelector
        selectedInstrument={selectedInstrument}
        onInstrumentChange={onInstrumentChange}
        samplerLoaded={samplerLoaded}
      />
    </div>
  );
};

export default PlaybackControls;
