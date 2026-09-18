import { MusicGlyph } from '@/components/Assets/MusicGlyph';
/**
 * InputModeToggle
 *
 * Switch for toggling between Note Entry and Rest Entry modes.
 */
import React from 'react';
import { useTheme } from '@/context/ThemeContext';
import { RESTS, NOTEHEADS } from '@/constants/SMuFL';
import { CONFIG } from '@/config';

const ICON_SIZE = CONFIG.toolbar.iconSize;

/**
 * Input mode for the toolbar - determines whether clicks/keyboard
 * entry creates notes or rests.
 */
export type InputMode = 'NOTE' | 'REST';

interface InputModeToggleProps {
  /** Current input mode */
  mode: InputMode;
  /** Callback when mode is toggled */
  onToggle: () => void;
  variant?: 'default' | 'ghost';
}

/**
 * Composite icon showing multiple rests to represent "Rest Mode".
 * Used when current mode is "NOTE" (shows what clicking will switch to).
 * Scaled down by ~0.83x.
 */
const RestGroupIcon = ({ color }: { color: string }) => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`} fill="none">
    {/* Eighth Rest */}
    <MusicGlyph
      x={4}
      y={13}
      fontSize={17}
      fill={color}
      textAnchor="middle"
      style={{ userSelect: 'none' }}
    >
      {RESTS.eighth}
    </MusicGlyph>

    {/* Quarter Rest (Center, larger) */}
    <MusicGlyph
      x={10}
      y={12}
      fontSize={20}
      fill={color}
      textAnchor="middle"
      style={{ userSelect: 'none' }}
    >
      {RESTS.quarter}
    </MusicGlyph>

    {/* Sixteenth Rest */}
    <MusicGlyph
      x={16}
      y={11}
      fontSize={15}
      fill={color}
      textAnchor="middle"
      style={{ userSelect: 'none' }}
    >
      {RESTS.sixteenth}
    </MusicGlyph>
  </svg>
);

/**
 * Composite icon showing multiple notes to represent "Note Mode".
 * Used when current mode is "REST" (shows what clicking will switch to).
 * Scaled down by ~0.83x.
 */
const NoteGroupIcon = ({ color }: { color: string }) => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`} fill="none">
    {/* Eighth Note (Black notehead) */}
    <MusicGlyph
      x={5}
      y={15}
      fontSize={17}
      fill={color}
      textAnchor="middle"
      style={{ userSelect: 'none' }}
    >
      {NOTEHEADS.black}
    </MusicGlyph>
    {/* Stem for Eighth */}
    <line x1={7} y1={15} x2={7} y2={7} stroke={color} strokeWidth={1.25} />

    {/* Quarter Note (Center, larger) */}
    <MusicGlyph
      x={10}
      y={16}
      fontSize={20}
      fill={color}
      textAnchor="middle"
      style={{ userSelect: 'none' }}
    >
      {NOTEHEADS.black}
    </MusicGlyph>
    <line x1={12.5} y1={16} x2={12.5} y2={5} stroke={color} strokeWidth={1.5} />

    {/* Half Note (White notehead) */}
    <MusicGlyph
      x={15}
      y={15}
      fontSize={17}
      fill={color}
      textAnchor="middle"
      style={{ userSelect: 'none' }}
    >
      {NOTEHEADS.half}
    </MusicGlyph>
    <line x1={17} y1={15} x2={17} y2={7} stroke={color} strokeWidth={1.25} />
  </svg>
);

import ToolbarButton from './ToolbarButton';

const InputModeToggle: React.FC<InputModeToggleProps> = ({
  mode,
  onToggle,
  variant = 'default',
}) => {
  const { theme } = useTheme();

  const isActive = mode === 'REST';

  return (
    <ToolbarButton
      label="Toggle Input Mode"
      onClick={onToggle}
      isActive={false}
      title={isActive ? 'Switch to Note Mode (R)' : 'Switch to Rest Mode (R)'}
      preventFocus={true}
      icon={
        isActive ? (
          <NoteGroupIcon color={theme.secondaryText} />
        ) : (
          <RestGroupIcon color={theme.secondaryText} />
        )
      }
      variant={variant}
    />
  );
};

export default InputModeToggle;
