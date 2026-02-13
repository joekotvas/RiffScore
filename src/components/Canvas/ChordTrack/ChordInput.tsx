/**
 * ChordInput.tsx
 *
 * Inline edit field for chord symbols using foreignObject to embed HTML input in SVG.
 * Handles chord parsing, validation, and keyboard navigation.
 *
 * @see SDD.md Section 6.3
 */
import React, { useState, useRef, useEffect, memo } from 'react';
import { parseChord } from '@/services/ChordService';

// ============================================================================
// TYPES
// ============================================================================

interface ChordInputProps {
  /** X coordinate for positioning */
  x: number;

  /** Initial value for the input */
  initialValue: string;

  /** Called when editing completes with valid chord */
  onComplete: (value: string) => void;

  /** Called when editing is cancelled */
  onCancel: () => void;

  /** Called when user clears input and confirms (delete chord) */
  onDelete?: () => void;

  /** Called when Tab pressed - save and move to next chord */
  onNavigateNext?: (value: string) => void;

  /** Called when Shift+Tab pressed - save and move to previous chord */
  onNavigatePrevious?: (value: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ChordInput = memo(function ChordInput({
  x,
  initialValue,
  onComplete,
  onCancel,
  onDelete,
  onNavigateNext,
  onNavigatePrevious,
}: ChordInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus and select on mount
  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      const trimmed = value.trim();
      if (!trimmed) {
        // Empty input: delete if editing existing chord, otherwise cancel
        if (onDelete) {
          onDelete();
        } else {
          onCancel();
        }
        return;
      }

      const result = parseChord(trimmed);
      if (result.ok) {
        onComplete(result.symbol);
      } else {
        // Silently fail: treat invalid as empty/delete
        if (onDelete) {
          onDelete();
        } else {
          onCancel();
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();

      const trimmed = value.trim();
      const isShift = e.shiftKey;
      const navigateHandler = isShift ? onNavigatePrevious : onNavigateNext;

      if (trimmed) {
        const result = parseChord(trimmed);
        if (result.ok) {
          // If navigation handler exists, use it; otherwise just complete
          if (navigateHandler) {
            navigateHandler(result.symbol);
          } else {
            onComplete(result.symbol);
          }
        } else {
          // Silently fail: navigate with empty string (clear/delete)
          if (navigateHandler) {
            navigateHandler('');
          } else {
            onCancel();
          }
        }
      } else {
        // Empty value on tab - navigate without saving (pass empty string)
        if (navigateHandler) {
          navigateHandler('');
        } else {
          onCancel();
        }
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const handleBlur = () => {
    const trimmed = value.trim();

    if (!trimmed) {
      onCancel();
      return;
    }

    const result = parseChord(trimmed);
    if (result.ok) {
      onComplete(result.symbol);
    } else {
      // Silently fail: treat invalid as empty/cancel
      if (onDelete) {
        onDelete();
      } else {
        onCancel();
      }
    }
  };

  // foreignObject allows HTML input inside SVG
  // Center the foreignObject at x (offset by half the width)
  return (
    <foreignObject
      x={x - 50}
      y={-15}
      width={100}
      height={50}
      className="riff-ChordInput__foreignObject"
    >
      <div className="riff-ChordInput__container">
        <input
          ref={inputRef}
          className="riff-ChordInput"
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="e.g., Cmaj7"
          aria-label="Enter chord symbol"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
    </foreignObject>
  );
});

export default ChordInput;
