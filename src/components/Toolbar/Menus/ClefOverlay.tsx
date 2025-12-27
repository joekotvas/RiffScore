import React from 'react';
import ClefIcon from '@assets/ClefIcon';
import { CLEF_TYPES } from '@/constants';
import { useTheme } from '@context/ThemeContext';
import DropdownOverlay from './DropdownOverlay';

import './styles/ClefOverlay.css';

interface ClefOverlayProps {
  current: string;
  onSelect: (clef: string) => void;
  onClose: () => void;
  position: { x: number; y: number };
  triggerRef: React.RefObject<HTMLElement>;
}

const ClefOverlay: React.FC<ClefOverlayProps> = ({
  current,
  onSelect,
  onClose,
  position,
  triggerRef,
}) => {
  const { theme } = useTheme();

  return (
    <DropdownOverlay
      onClose={onClose}
      position={position}
      triggerRef={triggerRef}
      width="auto"
      className="riff-ClefOverlay"
    >
      <div className="riff-ClefOverlay__grid">
        {['grand', 'treble', 'bass', 'alto', 'tenor'].map((key) => {
          const data = CLEF_TYPES[key];
          const isSelected = current === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`riff-ClefOverlay__option ${isSelected ? 'riff-ClefOverlay__option--selected' : ''}`}
              style={{ color: theme.text }}
            >
              <div className="riff-ClefOverlay__preview">
                <ClefIcon
                  clef={key}
                  style={{ width: '56px', height: '56px', overflow: 'visible' }}
                />
              </div>
              <span className="riff-ClefOverlay__label">{data.label}</span>
            </button>
          );
        })}
      </div>
    </DropdownOverlay>
  );
};

export default ClefOverlay;

