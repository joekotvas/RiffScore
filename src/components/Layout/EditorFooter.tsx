import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTheme } from '@context/ThemeContext';
import { useZoomDrag } from '@hooks/interaction';
import { useSelectionStatus, type SelectionStatus } from '@hooks/editor';
import { CONFIG } from '@/config';
import type { Selection, PreviewNote, Score } from '@/types';

import './styles/EditorFooter.css';

// -----------------------------------------------------------------------------
// Props Interface
// -----------------------------------------------------------------------------

interface EditorFooterProps {
  /** Current selection state */
  selection: Selection;
  /** Current preview note (ghost cursor) */
  previewNote: PreviewNote | null;
  /** Current score for deriving selection info */
  score: Score;
  /** Current zoom level as percentage (e.g., 100 for 100%) */
  zoom: number;
  /** Callback when zoom changes */
  onZoomChange: (zoom: number) => void;
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

interface SelectionStatusDisplayProps {
  status: SelectionStatus;
}

const SelectionStatusDisplay: React.FC<SelectionStatusDisplayProps> = ({ status }) => {
  return (
    <div
      className={`riff-EditorFooter__status riff-EditorFooter__status--${status.type}`}
      data-testid="selection-status"
    >
      <span className="riff-EditorFooter__status-text">{status.text}</span>
    </div>
  );
};

interface ZoomControlProps {
  value: number;
  onChange: (value: number) => void;
}

const ZoomControl: React.FC<ZoomControlProps> = ({ value, onChange }) => {
  const [inputValue, setInputValue] = useState(String(value));
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isDragging, handleMouseDown } = useZoomDrag({
    value,
    onChange,
  });

  // Sync input value when zoom changes externally (e.g., via drag)
  useEffect(() => {
    if (!isEditing) {
      setInputValue(String(value));
    }
  }, [value, isEditing]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  const handleInputFocus = useCallback(() => {
    setIsEditing(true);
    // Select all text on focus
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const handleInputBlur = useCallback(() => {
    setIsEditing(false);
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(
        CONFIG.footer.zoom.min,
        Math.min(CONFIG.footer.zoom.max, parsed)
      );
      onChange(clamped);
      setInputValue(String(clamped));
    } else {
      // Reset to current value if invalid
      setInputValue(String(value));
    }
  }, [inputValue, value, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setInputValue(String(value));
        inputRef.current?.blur();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newValue = Math.min(CONFIG.footer.zoom.max, value + 10);
        onChange(newValue);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newValue = Math.max(CONFIG.footer.zoom.min, value - 10);
        onChange(newValue);
      }
    },
    [value, onChange]
  );

  return (
    <div
      className={`riff-EditorFooter__zoom ${isDragging ? 'riff-EditorFooter__zoom--dragging' : ''}`}
      data-testid="zoom-control"
    >
      <div
        className="riff-EditorFooter__zoom-handle"
        onMouseDown={handleMouseDown}
        title="Drag to adjust zoom"
        data-testid="zoom-handle"
      >
        <div className="riff-EditorFooter__zoom-handle-icon" />
      </div>
      <input
        ref={inputRef}
        type="text"
        className="riff-EditorFooter__zoom-input"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        aria-label="Zoom percentage"
        data-testid="zoom-input"
      />
      <span className="riff-EditorFooter__zoom-unit">%</span>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

/**
 * Editor footer with selection status and zoom control.
 * Selection status is on the left, zoom control on the right.
 */
const EditorFooter: React.FC<EditorFooterProps> = ({
  selection,
  previewNote,
  score,
  zoom,
  onZoomChange,
}) => {
  const { theme } = useTheme();
  const status = useSelectionStatus({ selection, previewNote, score });

  return (
    <footer
      className="riff-EditorFooter"
      style={{
        backgroundColor: theme.panelBackground,
        borderColor: theme.border,
        color: theme.secondaryText,
      }}
      data-testid="editor-footer"
    >
      <SelectionStatusDisplay status={status} />
      <ZoomControl value={zoom} onChange={onZoomChange} />
    </footer>
  );
};

export default EditorFooter;
