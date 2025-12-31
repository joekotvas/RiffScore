import React from 'react';
import './styles/ScoreTitleField.css';

interface ScoreTitleFieldProps {
  title: string;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  buffer: string;
  setBuffer: (value: string) => void;
  commit: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  theme: {
    text: string;
    border: string;
  };
  scale?: number;
}

/**
 * Displays the score title as an h2 or an editable input field.
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

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
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
