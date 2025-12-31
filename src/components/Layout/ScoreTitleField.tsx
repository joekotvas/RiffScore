import React from 'react';
import './styles/ScoreTitleField.css';

interface ScoreTitleFieldProps {
  /** The current title text */
  title: string;
  /** Whether the field is currently in edit mode */
  isEditing: boolean;
  /** State setter for edit mode */
  setIsEditing: (editing: boolean) => void;
  /** Temporary text buffer while editing */
  buffer: string;
  /** State setter for buffer */
  setBuffer: (value: string) => void;
  /** Commits the buffer to the actual title */
  commit: () => void;
  /** Ref to the input element for measurement and focus */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Theme colors */
  theme: {
    text: string;
    border: string;
  };
  /** Zoom scale factor usually passed from ScoreContext */
  scale?: number;
}

/**
 * ScoreTitleField
 *
 * Displays the score title as an H2 or an editable input field.
 * Handles auto-resizing the input to fit content and ensures style parity
 * between display and edit modes.
 *
 * @param props - ScoreTitleFieldProps
 */
export function ScoreTitleField({
  title,
  isEditing,
  setIsEditing,
  buffer,
  setBuffer,
  commit,
  inputRef,
  theme,
  scale = 1,
}: ScoreTitleFieldProps) {
  // Base font size is 1.875rem (text-3xl), scaled by the zoom factor
  const fontSize = `calc(1.875rem * ${scale})`;
  
  // Auto-resize input width to fit content
  // Creates a hidden span with identical font metrics to measure text width
  React.useLayoutEffect(() => {
    if (isEditing && inputRef.current) {
      const input = inputRef.current;
      const measureSpan = document.createElement('span');
      const computed = window.getComputedStyle(input);
      
      // Copy relevant styles for accurate measurement
      measureSpan.style.font = computed.font;
      measureSpan.style.fontSize = fontSize; // Ensure dynamic scale is applied
      measureSpan.style.fontWeight = computed.fontWeight;
      measureSpan.style.letterSpacing = computed.letterSpacing;
      measureSpan.style.fontKerning = computed.fontKerning;
      measureSpan.style.padding = computed.padding;
      measureSpan.style.border = computed.border;
      measureSpan.style.boxSizing = 'border-box';
      measureSpan.style.visibility = 'hidden';
      measureSpan.style.position = 'absolute';
      measureSpan.style.whiteSpace = 'pre';
      
      measureSpan.textContent = buffer || ' ';
      document.body.appendChild(measureSpan);
      // measureSpan.getBoundingClientRect().width gives subpixel float
      // Add small buffer (2px) to prevent scroll/jitter on rounding
      const width = measureSpan.getBoundingClientRect().width + 2; 
      document.body.removeChild(measureSpan);
      
      input.style.width = `${width}px`;
    }
  }, [buffer, isEditing, fontSize, inputRef]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setIsEditing(false);
          }
        }}
        className="riff-ScoreTitleField__input"
        style={{ fontSize, color: theme.text, borderColor: theme.border }}
      />
    );
  }

  return (
    <h2
      onClick={() => setIsEditing(true)}
      className="riff-ScoreTitleField"
      style={{ fontSize, color: theme.text }}
    >
      {title}
    </h2>
  );
}
