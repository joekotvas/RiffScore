/**
 * MetadataTrack.tsx
 *
 * Container component for the metadata editing block.
 * Renders above the score staves in page view and manages metadata display and interaction.
 *
 * @see ChordTrack.tsx for similar pattern
 */
import React, { memo, useState, useCallback, useMemo } from 'react';
import type { ScoreMetadata, MetadataLayout } from '@/types';
import type { MetadataFieldName } from '@/hooks/layout/useMetadataTrack';
import { FIELD_ORDER } from '@/hooks/layout/useMetadataTrack';
import { useModifierKeys } from '@hooks/editor';
import { MetadataField } from './MetadataField';
import { MetadataInput } from './MetadataInput';
import './MetadataTrack.css';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Field configuration for positioning and typography.
 */
interface FieldConfig {
  field: MetadataFieldName;
  placeholder: string;
  fontSize: string;
  fontWeight: string;
  textAnchor: 'start' | 'middle' | 'end';
  textAlign: 'left' | 'center' | 'right';
  required: boolean;
}

export interface MetadataTrackProps {
  /** Current metadata values */
  metadata: ScoreMetadata;

  /** Pre-computed layout for metadata positions */
  layout: MetadataLayout;

  /** Field currently being edited */
  editingField: MetadataFieldName | null;

  /** Field currently selected */
  selectedField: MetadataFieldName | null;

  /** Initial value for editing */
  initialValue: string | null;

  /** Start editing a field */
  onFieldClick: (field: MetadataFieldName) => void;

  /** Select a field without editing (Cmd/Ctrl+click) */
  onFieldSelect: (field: MetadataFieldName) => void;

  /** Complete editing with new value */
  onEditComplete: (field: MetadataFieldName, value: string) => void;

  /** Cancel editing */
  onEditCancel: () => void;

  /** Delete field content (clear to empty) */
  onDelete: (field: MetadataFieldName) => void;

  /** Navigate to next field */
  onNavigateNext: (field: MetadataFieldName, value: string) => void;

  /** Navigate to previous field */
  onNavigatePrevious: (field: MetadataFieldName, value: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Field configurations for each metadata field.
 */
const FIELD_CONFIGS: Record<MetadataFieldName, Omit<FieldConfig, 'field'>> = {
  title: {
    placeholder: 'Title',
    fontSize: '24px',
    fontWeight: 'bold',
    textAnchor: 'middle',
    textAlign: 'center',
    required: true,
  },
  composer: {
    placeholder: 'Composer',
    fontSize: '14px',
    fontWeight: 'normal',
    textAnchor: 'middle',
    textAlign: 'center',
    required: false,
  },
  lyricist: {
    placeholder: 'Lyricist',
    fontSize: '14px',
    fontWeight: 'normal',
    textAnchor: 'middle',
    textAlign: 'center',
    required: false,
  },
  copyright: {
    placeholder: 'Copyright',
    fontSize: '12px',
    fontWeight: 'normal',
    textAnchor: 'middle',
    textAlign: 'center',
    required: false,
  },
};

/**
 * Spacing between composer and lyricist lines.
 */
const COMPOSER_LYRICIST_SPACING = 18;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the value of a metadata field.
 */
function getFieldValue(metadata: ScoreMetadata, field: MetadataFieldName): string {
  switch (field) {
    case 'title':
      return metadata.title;
    case 'composer':
      return metadata.composer ?? '';
    case 'lyricist':
      return metadata.lyricist ?? '';
    case 'copyright':
      return metadata.copyright ?? '';
  }
}

/**
 * Calculate Y position for a field based on layout.
 */
function getFieldY(layout: MetadataLayout, field: MetadataFieldName): number {
  switch (field) {
    case 'title':
      return layout.title?.y ?? 0;
    case 'composer':
      return layout.composer?.y ?? (layout.title?.y ?? 0) + 30;
    case 'lyricist':
      // Lyricist is positioned below composer
      return (layout.composer?.y ?? (layout.title?.y ?? 0) + 30) + COMPOSER_LYRICIST_SPACING;
    case 'copyright':
      // Copyright is in the footer, handled separately
      return 0;
  }
}

/**
 * Calculate X position for a field based on layout.
 */
function getFieldX(layout: MetadataLayout, field: MetadataFieldName): number {
  switch (field) {
    case 'title':
      return layout.title?.x ?? 0;
    case 'composer':
    case 'lyricist':
      return layout.composer?.x ?? layout.title?.x ?? 0;
    case 'copyright':
      return layout.title?.x ?? 0;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export const MetadataTrack = memo(function MetadataTrack({
  metadata,
  layout,
  editingField,
  selectedField,
  initialValue,
  onFieldClick,
  onFieldSelect,
  onEditComplete,
  onEditCancel,
  onDelete,
  onNavigateNext,
  onNavigatePrevious,
}: MetadataTrackProps) {
  const [isBlockHovered, setIsBlockHovered] = useState(false);
  const [hoveredField, setHoveredField] = useState<MetadataFieldName | null>(null);

  // Track CMD/CTRL key state for selection mode
  const isMetaKeyHeld = useModifierKeys();

  // Compute cursor style based on hover state and meta key
  const cursorStyle = useMemo(() => {
    if (hoveredField) {
      return isMetaKeyHeld ? 'pointer' : 'text';
    }
    return 'default';
  }, [isMetaKeyHeld, hoveredField]);

  const handleFieldMouseEnter = useCallback((field: MetadataFieldName) => {
    setHoveredField(field);
  }, []);

  const handleFieldMouseLeave = useCallback(() => {
    setHoveredField(null);
  }, []);

  const handleFieldClick = useCallback(
    (field: MetadataFieldName, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // CMD/CTRL+click selects without editing
      if (e.metaKey || e.ctrlKey) {
        onFieldSelect(field);
      } else {
        onFieldClick(field);
      }
    },
    [onFieldClick, onFieldSelect]
  );

  const handleBlockMouseEnter = useCallback(() => {
    setIsBlockHovered(true);
  }, []);

  const handleBlockMouseLeave = useCallback(() => {
    setIsBlockHovered(false);
    setHoveredField(null);
  }, []);

  // Stop mousedown propagation to prevent drag-to-select from intercepting
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Calculate hit area dimensions
  const hitAreaWidth = 400;
  const hitAreaHeight = layout.bottom - (layout.title?.y ?? 0) + 20;
  const hitAreaX = (layout.title?.x ?? 0) - hitAreaWidth / 2;
  const hitAreaY = (layout.title?.y ?? 0) - 20;

  // Render fields (excluding copyright which is in footer)
  const renderField = (field: MetadataFieldName) => {
    // Skip copyright - it's rendered in the footer
    if (field === 'copyright') return null;

    const config = FIELD_CONFIGS[field];
    const value = getFieldValue(metadata, field);
    const x = getFieldX(layout, field);
    const y = getFieldY(layout, field);

    const isEditing = editingField === field;
    const isSelected = selectedField === field;
    const isHovered = hoveredField === field;
    const showPreview = isBlockHovered && !value && !isEditing;

    if (isEditing) {
      return (
        <MetadataInput
          key={field}
          x={x}
          y={y}
          initialValue={initialValue ?? value}
          placeholder={config.placeholder}
          fontSize={config.fontSize}
          fontWeight={config.fontWeight}
          textAlign={config.textAlign}
          required={config.required}
          onComplete={(newValue) => onEditComplete(field, newValue)}
          onCancel={onEditCancel}
          onDelete={config.required ? undefined : () => onDelete(field)}
          onNavigateNext={(newValue) => onNavigateNext(field, newValue)}
          onNavigatePrevious={(newValue) => onNavigatePrevious(field, newValue)}
        />
      );
    }

    // Only render if has value, is hovered (showing preview), or is selected
    if (!value && !showPreview && !isSelected) {
      // Render invisible hit area for empty fields
      return (
        <rect
          key={`${field}-hit`}
          x={x - 100}
          y={y - 15}
          width={200}
          height={30}
          fill="transparent"
          style={{ cursor: cursorStyle }}
          onMouseEnter={() => handleFieldMouseEnter(field)}
          onMouseLeave={handleFieldMouseLeave}
          onClick={(e) => handleFieldClick(field, e)}
        />
      );
    }

    return (
      <g key={field}>
        {/* Hit area for click detection */}
        <rect
          x={x - 150}
          y={y - 15}
          width={300}
          height={30}
          fill="transparent"
          style={{ cursor: cursorStyle }}
          onMouseEnter={() => handleFieldMouseEnter(field)}
          onMouseLeave={handleFieldMouseLeave}
          onClick={(e) => handleFieldClick(field, e)}
        />
        <MetadataField
          field={field}
          value={value}
          x={x}
          y={y}
          fontSize={config.fontSize}
          fontWeight={config.fontWeight}
          textAnchor={config.textAnchor}
          placeholder={config.placeholder}
          isSelected={isSelected}
          isHovered={isHovered}
          showPreview={showPreview}
        />
      </g>
    );
  };

  return (
    <g
      className="riff-MetadataTrack"
      data-testid="metadata-track"
      role="region"
      aria-label="Score metadata"
      style={{ cursor: cursorStyle }}
      onMouseEnter={handleBlockMouseEnter}
      onMouseLeave={handleBlockMouseLeave}
    >
      {/* Overall hit area for block hover detection */}
      <rect
        className="riff-MetadataTrack__hitArea"
        data-testid="metadata-track-hit-area"
        x={hitAreaX}
        y={hitAreaY}
        width={hitAreaWidth}
        height={hitAreaHeight}
        fill="transparent"
        onMouseDown={handleMouseDown}
      />

      {/* Render each field in order */}
      {FIELD_ORDER.map(renderField)}
    </g>
  );
});

export default MetadataTrack;
