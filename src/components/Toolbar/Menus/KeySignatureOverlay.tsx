import React, { useState, useEffect } from 'react';
import { X, Music } from 'lucide-react';
import { Key } from 'tonal';
import {
  KEY_SIGNATURES,
  KEY_SIGNATURE_OFFSETS,
  KeySignatureOffsets,
  KeySignature,
} from '@/constants';
import { useTheme } from '@/context/ThemeContext';
import { ACCIDENTALS, BRAVURA_FONT } from '@/constants/SMuFL';
import { Theme } from '@/config';

import './styles/KeySignatureOverlay.css';

// ==========================================
// 1. TYPES & INTERFACES
// ==========================================

interface KeySignatureOverlayProps {
  current: string;
  clef?: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}

// ==========================================
// 2. CONSTANTS
// ==========================================

// Circle of fifths order for key signature selection UI
// Derived dynamically using Tonal.js Key.majorKey().minorRelative
const FLAT_ROOTS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
const SHARP_ROOTS = ['G', 'D', 'A', 'E', 'B', 'F#', 'C#'];

const CIRCLE_OF_FIFTHS = {
  flats: FLAT_ROOTS.map(
    (root) => [root, `${Key.majorKey(root).minorRelative}m`] as [string, string]
  ),
  sharps: SHARP_ROOTS.map(
    (root) => [root, `${Key.majorKey(root).minorRelative}m`] as [string, string]
  ),
};

// ==========================================
// 3. SUB-COMPONENTS
// ==========================================

/**
 * StaffPreview: Handles the SVG rendering of the staff lines and accidentals
 */
const StaffPreview = ({
  data,
  clef,
  theme,
}: {
  data: KeySignature;
  clef: string;
  theme: Theme;
}) => {
  const { type, count, accidentals } = data;
  const accWidth = Math.max(40, count * 10 + 20);

  return (
    <div className="riff-KeyOption__preview">
      <svg
        width={accWidth}
        height="60"
        viewBox={`0 0 ${accWidth} 60`}
        style={{ overflow: 'visible' }}
      >
        {/* Staff Lines */}
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={i}
            x1="0"
            y1={10 + i * 10}
            x2={accWidth}
            y2={10 + i * 10}
            stroke={theme.secondaryText}
            strokeWidth="1"
            opacity="0.5"
          />
        ))}

        {/* Accidentals */}
        {accidentals.map((acc, i) => {
          const validClef =
            clef in KEY_SIGNATURE_OFFSETS ? (clef as keyof KeySignatureOffsets) : 'treble';
          const offset = KEY_SIGNATURE_OFFSETS[validClef][type][acc];

          return (
            <text
              key={i}
              x={10 + i * 10}
              y={10 + offset}
              fontSize="32"
              fontFamily={BRAVURA_FONT}
              fill={theme.text}
            >
              {type === 'sharp' ? ACCIDENTALS.sharp : ACCIDENTALS.flat}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

/**
 * KeyOptionButton: The interactive button wrapper
 */
const KeyOptionButton = ({
  keyId,
  current,
  clef,
  theme,
  onSelect,
}: {
  keyId: string;
  current: string;
  clef: string;
  theme: Theme;
  onSelect: (key: string) => void;
}) => {
  const data = KEY_SIGNATURES[keyId];
  if (!data) return null;

  const isSelected = current === keyId;

  return (
    <button
      onClick={() => onSelect(keyId)}
      className="riff-KeyOption"
      style={{
        backgroundColor: isSelected ? theme.buttonHoverBackground : 'transparent',
        borderColor: isSelected ? theme.accent : 'transparent',
        color: theme.text,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = theme.buttonHoverBackground;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isSelected
          ? theme.buttonHoverBackground
          : 'transparent';
      }}
    >
      <StaffPreview data={data} clef={clef} theme={theme} />

      <span className="riff-KeyOption__label">{data.label}</span>
    </button>
  );
};

/**
 * ModeToggle: Major/Minor selector toggle
 */
const ModeToggle = ({
  mode,
  setMode,
  theme,
}: {
  mode: 'major' | 'minor';
  setMode: (mode: 'major' | 'minor') => void;
  theme: Theme;
}) => (
  <div className="riff-ModeToggle" style={{ backgroundColor: theme.buttonBackground }}>
    <button
      onClick={() => setMode('major')}
      className="riff-ModeToggle__btn"
      style={{
        backgroundColor: mode === 'major' ? theme.accent : 'transparent',
        color: mode === 'major' ? '#ffffff' : theme.secondaryText,
      }}
    >
      Major
    </button>
    <button
      onClick={() => setMode('minor')}
      className="riff-ModeToggle__btn"
      style={{
        backgroundColor: mode === 'minor' ? theme.accent : 'transparent',
        color: mode === 'minor' ? '#ffffff' : theme.secondaryText,
      }}
    >
      Minor
    </button>
  </div>
);

/**
 * KeySection: Renders a titled grid of key options
 */
const KeySection = ({
  title,
  keys,
  current,
  clef,
  theme,
  onSelect,
  mode,
}: {
  title: string;
  keys: [string, string][]; // [majorKey, minorKey]
  current: string;
  clef: string;
  theme: Theme;
  onSelect: (key: string) => void;
  mode: 'major' | 'minor';
}) => (
  <div className="riff-KeySection">
    <h3 className="riff-KeySection__title" style={{ color: theme.secondaryText }}>
      {title}
    </h3>
    <div className="riff-KeySection__grid">
      {keys.map(([majorKey, minorKey]) => (
        <KeyOptionButton
          key={mode === 'major' ? majorKey : minorKey}
          keyId={mode === 'major' ? majorKey : minorKey}
          current={current}
          clef={clef}
          theme={theme}
          onSelect={onSelect}
        />
      ))}
    </div>
  </div>
);

// ==========================================
// 4. MAIN COMPONENT
// ==========================================

const KeySignatureOverlay: React.FC<KeySignatureOverlayProps> = ({
  current,
  clef = 'treble',
  onSelect,
  onClose,
}) => {
  const { theme } = useTheme();

  // Determine initial mode from current key
  const currentData = KEY_SIGNATURES[current];
  const initialMode = currentData?.mode || 'major';
  const [mode, setMode] = useState<'major' | 'minor'>(initialMode);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="riff-KeySignatureOverlay" onClick={onClose}>
      <div
        className="riff-KeySignatureOverlay__panel"
        style={{ backgroundColor: theme.panelBackground }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="riff-KeySignatureOverlay__header"
          style={{ backgroundColor: theme.background, borderColor: theme.border }}
        >
          <div className="riff-KeySignatureOverlay__title-group">
            <Music size={20} style={{ color: theme.accent }} />
            <h2 className="riff-KeySignatureOverlay__title" style={{ color: theme.text }}>
              Key Signature
            </h2>
          </div>
          <button
            onClick={onClose}
            className="riff-KeySignatureOverlay__close-btn"
            style={{ color: theme.secondaryText }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="riff-KeySignatureOverlay__content">
          {/* Major/Minor Toggle */}
          <ModeToggle mode={mode} setMode={setMode} theme={theme} />

          {/* Key Sections */}
          <KeySection
            title="Flats"
            keys={CIRCLE_OF_FIFTHS.flats}
            current={current}
            clef={clef}
            theme={theme}
            onSelect={onSelect}
            mode={mode}
          />

          <hr className="riff-KeySignatureOverlay__divider" style={{ borderColor: theme.border }} />

          <KeySection
            title="Sharps"
            keys={CIRCLE_OF_FIFTHS.sharps}
            current={current}
            clef={clef}
            theme={theme}
            onSelect={onSelect}
            mode={mode}
          />
        </div>

        {/* Footer */}
        <div
          className="riff-KeySignatureOverlay__footer"
          style={{
            backgroundColor: theme.background,
            borderColor: theme.border,
            color: theme.secondaryText,
          }}
        >
          Press{' '}
          <kbd
            className="riff-KeySignatureOverlay__kbd"
            style={{
              backgroundColor: theme.buttonBackground,
              borderColor: theme.border,
              color: theme.text,
            }}
          >
            Esc
          </kbd>{' '}
          to close
        </div>
      </div>
    </div>
  );
};

export default KeySignatureOverlay;
