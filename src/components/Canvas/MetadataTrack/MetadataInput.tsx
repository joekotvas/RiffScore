/**
 * MetadataInput.tsx
 *
 * Inline edit field for metadata using foreignObject to embed HTML input in SVG.
 * Handles keyboard navigation and validation.
 *
 * @see ChordInput.tsx for similar pattern
 */
import React, { useState, useRef, useEffect, memo, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface MetadataInputProps {
  /** X coordinate for positioning (center) */
  x: number;

  /** Y coordinate for positioning (center) */
  y: number;

  /** Initial value for the input */
  initialValue: string;

  /** Placeholder text */
  placeholder: string;

  /** Font size for the input */
  fontSize: string;

  /** Font weight for the input */
  fontWeight: string;

  /** Text alignment */
  textAlign: 'left' | 'center' | 'right';

  /** Whether this is a required field (e.g., title) */
  required: boolean;

  /** Called when editing completes with valid value */
  onComplete: (value: string) => void;

  /** Called when editing is cancelled */
  onCancel: () => void;

  /** Called when user clears input and confirms (delete field) */
  onDelete?: () => void;

  /** Called when Tab pressed - save and move to next field */
  onNavigateNext?: (value: string) => void;

  /** Called when Shift+Tab pressed - save and move to previous field */
  onNavigatePrevious?: (value: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const INPUT_HEIGHT = 36;
const INPUT_MIN_WIDTH = 100;
const INPUT_MAX_WIDTH = 400;
const CHAR_WIDTH = 10; // Approximate character width

// ============================================================================
// COMPONENT
// ============================================================================

export const MetadataInput = memo(function MetadataInput({
  x,
  y,
  initialValue,
  placeholder,
  fontSize,
  fontWeight,
  textAlign,
  required,
  onComplete,
  onCancel,
  onDelete,
  onNavigateNext,
  onNavigatePrevious,
}: MetadataInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Calculate width based on content
  const inputWidth = Math.min(
    INPUT_MAX_WIDTH,
    Math.max(INPUT_MIN_WIDTH, (value.length || placeholder.length) * CHAR_WIDTH + 20)
  );

  // Focus and select on mount
  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const handleComplete = useCallback(
    (trimmedValue: string) => {
      if (!trimmedValue && required) {
        // Required field - cancel instead of submitting empty
        onCancel();
        return;
      }

      if (!trimmedValue) {
        // Optional field - delete
        if (onDelete) {
          onDelete();
        } else {
          onCancel();
        }
        return;
      }

      onComplete(trimmedValue);
    },
    [required, onComplete, onCancel, onDelete]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();

        const trimmed = value.trim();
        handleComplete(trimmed);
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

        if (navigateHandler) {
          navigateHandler(trimmed);
        } else {
          handleComplete(trimmed);
        }
      }
    },
    [value, handleComplete, onCancel, onNavigateNext, onNavigatePrevious]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  const handleBlur = useCallback(() => {
    const trimmed = value.trim();
    handleComplete(trimmed);
  }, [value, handleComplete]);

  // foreignObject allows HTML input inside SVG
  // Center the foreignObject at x (offset by half the width)
  const foreignObjectX = textAlign === 'center' ? x - inputWidth / 2 : textAlign === 'right' ? x - inputWidth : x;

  return (
    <foreignObject
      x={foreignObjectX}
      y={y - INPUT_HEIGHT / 2}
      width={inputWidth}
      height={INPUT_HEIGHT}
      className="riff-MetadataInput__foreignObject"
    >
      <div className="riff-MetadataInput__container">
        <input
          ref={inputRef}
          className="riff-MetadataInput"
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          aria-label={`Edit ${placeholder.toLowerCase()}`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          style={{
            fontSize,
            fontWeight,
            textAlign,
            width: '100%',
          }}
        />
      </div>
    </foreignObject>
  );
});

export default MetadataInput;
