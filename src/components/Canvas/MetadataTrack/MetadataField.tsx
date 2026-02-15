/**
 * MetadataField.tsx
 *
 * Renders an individual metadata field as SVG text.
 * Handles display states: normal, hovered, selected, preview.
 *
 * @see ChordSymbol.tsx for similar pattern
 */
import React, { memo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface MetadataFieldProps {
  /** Field identifier */
  field: string;

  /** Display value */
  value: string;

  /** X coordinate for positioning */
  x: number;

  /** Y coordinate for positioning */
  y: number;

  /** Font size (e.g., '24px', '14px') */
  fontSize: string;

  /** Font weight (e.g., 'bold', 'normal') */
  fontWeight: string;

  /** Text anchor (e.g., 'middle', 'start', 'end') */
  textAnchor: 'start' | 'middle' | 'end';

  /** Placeholder text to show when empty */
  placeholder: string;

  /** Whether this field is currently selected */
  isSelected: boolean;

  /** Whether this field is currently hovered */
  isHovered: boolean;

  /** Whether to show as preview (placeholder at 50% opacity) */
  showPreview: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const MetadataField = memo(function MetadataField({
  field,
  value,
  x,
  y,
  fontSize,
  fontWeight,
  textAnchor,
  placeholder,
  isSelected,
  isHovered,
  showPreview,
}: MetadataFieldProps) {
  // Determine what text to display
  const hasValue = value.trim().length > 0;
  const displayText = hasValue ? value : placeholder;

  // Build class name based on state
  const className = [
    'riff-MetadataField',
    isSelected && 'riff-MetadataField--selected',
    isHovered && 'riff-MetadataField--hovered',
    showPreview && !hasValue && 'riff-MetadataField--preview',
  ]
    .filter(Boolean)
    .join(' ');

  // Generate accessible label
  const ariaLabel = hasValue
    ? `${field}: ${value}${isSelected ? ' (selected)' : ''}`
    : `${field}: empty${isSelected ? ' (selected)' : ''}`;

  return (
    <text
      className={className}
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline="central"
      style={{
        fontSize,
        fontWeight,
      }}
      aria-label={ariaLabel}
      data-field={field}
      pointerEvents="none"
    >
      {displayText}
    </text>
  );
});

export default MetadataField;
