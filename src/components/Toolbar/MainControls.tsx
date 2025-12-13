import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import ToolbarButton from './ToolbarButton';
import FileMenu from './FileMenu';
import HistoryControls from './HistoryControls';
import PlaybackControls from './PlaybackControls';
import MidiControls from './MidiControls';
import { InstrumentType } from '@/engines/toneEngine';
import { Score } from '@/types';

interface MainControlsProps {
  isPlaying: boolean;
  onPlayToggle?: () => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  midiStatus: { connected: boolean; deviceName: string | null; error: string | null };
  onToggleHelp: () => void;
  canUndo: boolean;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  selectedInstrument: InstrumentType;
  onInstrumentChange: (instrument: InstrumentType) => void;
  samplerLoaded: boolean;
  score: Score;
  rowHeight?: string;
  buttonVariant?: 'default' | 'ghost';
}

const MainControls: React.FC<MainControlsProps & { children?: React.ReactNode }> = ({
  isPlaying,
  onPlayToggle,
  bpm,
  onBpmChange,
  midiStatus,
  onToggleHelp,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  selectedInstrument,
  onInstrumentChange,
  samplerLoaded,
  score,
  children,
  rowHeight = "h-9",
  buttonVariant = "default"
}) => {
  const { theme } = useTheme();

  return (
    <div className="flex items-center gap-4">

      {/* File Menu */}
      <FileMenu score={score} bpm={bpm} height={rowHeight} variant={buttonVariant} />

      <div className="w-px h-6" style={{ backgroundColor: theme.border }}></div>

      {/* Undo / Redo */}
      <HistoryControls
        canUndo={canUndo}
        onUndo={onUndo}
        canRedo={canRedo}
        onRedo={onRedo}
        height={rowHeight}
        variant={buttonVariant}
      />

      <div className="w-px h-6" style={{ backgroundColor: theme.border }}></div>

      {/* Playback Controls */}
      <PlaybackControls
        isPlaying={isPlaying}
        onPlayToggle={onPlayToggle}
        bpm={bpm}
        onBpmChange={onBpmChange}
        height={rowHeight}
        variant={buttonVariant}
      />

      <div className="w-px h-6" style={{ backgroundColor: theme.border }}></div>

      {/* MIDI & Instrument */}
      <MidiControls
        midiStatus={midiStatus}
        selectedInstrument={selectedInstrument}
        onInstrumentChange={onInstrumentChange}
        samplerLoaded={samplerLoaded}
        height={rowHeight}
        variant={buttonVariant}
      />

      <div className="flex-1"></div>

      {children}

      <div className="w-px h-6" style={{ backgroundColor: theme.border }}></div>

      <ToolbarButton 
        onClick={onToggleHelp}
        label="Keyboard Shortcuts"
        icon={<HelpCircle size={18} />}
        preventFocus={true}
        height={rowHeight}
        variant={buttonVariant}
      />
    </div>
  );
};

export default MainControls;

