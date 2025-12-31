import React from 'react';
import { ACCIDENTALS, DOTS, BRAVURA_FONT } from '@/constants/SMuFL';
import ToolbarButton from './ToolbarButton';

// SVG viewport and font size for compact toolbar icons
const ICON_SIZE = 20;
const FONT_SIZE = 20;

interface AccidentalIconProps {
  type: 'flat' | 'natural' | 'sharp';
  color?: string;
}

/**
 * Bravura-based accidental icon for toolbar
 */
const AccidentalIcon: React.FC<AccidentalIconProps> = ({ type, color = 'currentColor' }) => {
  const glyph = ACCIDENTALS[type];
  // Y positions tuned for each glyph
  const yPos = type === 'flat' ? 15 : type === 'natural' ? 14 : 14;

  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`} fill="none">
      <text
        x={ICON_SIZE / 2}
        y={yPos}
        fontFamily={BRAVURA_FONT}
        fontSize={FONT_SIZE}
        fill={color}
        textAnchor="middle"
        style={{ userSelect: 'none' }}
      >
        {glyph}
      </text>
    </svg>
  );
};

interface AccidentalControlsProps {
  activeAccidental: 'flat' | 'natural' | 'sharp' | null;
  onToggleAccidental: (accidental: 'flat' | 'natural' | 'sharp') => void;
  selectedAccidentals?: (string | null)[];
  editorState?: string;
  variant?: 'default' | 'ghost';
}

const AccidentalControls: React.FC<AccidentalControlsProps> = ({
  activeAccidental,
  onToggleAccidental,
  selectedAccidentals = [],
  editorState = 'IDLE',
  variant = 'default',
}) => {
  const getVisualState = (type: 'flat' | 'natural' | 'sharp') => {
    let isActive = activeAccidental === type;
    let isDashed = false;
    let isEmphasized = false;

    if (editorState === 'SELECTION_READY' && selectedAccidentals.length > 0) {
      const present = selectedAccidentals.includes(type);

      if (selectedAccidentals.length > 1) {
        // Mixed state
        isActive = false;
        if (present) {
          isDashed = true;
          isEmphasized = true;
        }
      } else {
        // Homogeneous state
        isActive = present;
        isDashed = false;
      }
    }

    return { isActive, isDashed, isEmphasized };
  };

  const flatState = getVisualState('flat');
  const naturalState = getVisualState('natural');
  const sharpState = getVisualState('sharp');

  return (
    <div className="riff-ControlGroup">
      <ToolbarButton
        onClick={() => onToggleAccidental('flat')}
        label="Flat"
        isActive={flatState.isActive}
        isDashed={flatState.isDashed}
        isEmphasized={flatState.isEmphasized}
        icon={<AccidentalIcon type="flat" />}
        preventFocus={true}
        variant={variant}
      />
      <ToolbarButton
        onClick={() => onToggleAccidental('natural')}
        label="Natural"
        isActive={naturalState.isActive}
        isDashed={naturalState.isDashed}
        isEmphasized={naturalState.isEmphasized}
        icon={<AccidentalIcon type="natural" />}
        preventFocus={true}
        variant={variant}
      />
      <ToolbarButton
        onClick={() => onToggleAccidental('sharp')}
        label="Sharp"
        isActive={sharpState.isActive}
        isDashed={sharpState.isDashed}
        isEmphasized={sharpState.isEmphasized}
        icon={<AccidentalIcon type="sharp" />}
        preventFocus={true}
        variant={variant}
      />
    </div>
  );
};

export default AccidentalControls;
