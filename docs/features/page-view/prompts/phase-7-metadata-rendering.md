# Phase 7: Metadata Rendering

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Estimated Effort:** 3-4 days
**Dependencies:** Phase 2 (Commands & API), Phase 3 (Multi-System Rendering)

---

## Objective

Implement WYSIWYG inline editing for score metadata (title, composer, lyricist, copyright) using the same interaction pattern as chord editing, plus page numbers.

---

## Deliverables

1. `MetadataTrack.tsx` - Container with hover state (like ChordTrack)
2. `MetadataField.tsx` - Display component (like ChordSymbol)
3. `MetadataInput.tsx` - Input component (like ChordInput)
4. `PageFooter.tsx` - Copyright and page number
5. `useMetadataTrack.ts` - State management hook
6. `MetadataTrack.css` - Styling
7. Integration tests

---

## Requirements Reference

From PRD:
- **FR-47:** Hover preview shows placeholders at 50% opacity
- **FR-48:** Click to enter edit mode with text selected
- **FR-49:** Tab/Shift+Tab navigation, Enter to commit, Escape to cancel
- **FR-50:** Cmd/Ctrl+Click to select without editing, Delete to clear
- **FR-51:** Edits execute via `SetMetadataCommand`
- **FR-52:** Dialog and inline editing share same state
- **FR-30a:** Page numbers centered at bottom of each page

---

## Interaction Pattern

> **Reuses ChordTrack interaction pattern.** Before implementing, read:
> - `src/components/Canvas/ChordTrack.tsx`
> - `src/components/Canvas/ChordSymbol.tsx`
> - `src/components/Canvas/ChordInput.tsx`
> - `src/hooks/useChordTrack.ts`

### Behavior Summary

| Action | Result |
|--------|--------|
| Hover over title block | Show placeholder text for empty fields at 50% opacity |
| Click field | Enter edit mode, select all text |
| Tab | Save current, edit next field |
| Shift+Tab | Save current, edit previous field |
| Tab from last field | Save and exit to first note via `api.selectFirstElement()` |
| Enter | Commit changes |
| Escape | Cancel, revert to original |
| Cmd/Ctrl+Click | Select field (without editing) |
| Delete/Backspace (selected) | Clear field content |

### Field Order

1. Title (centered, required)
2. Composer (right-aligned)
3. Lyricist (left-aligned)
4. Copyright (footer, page 1 only)

---

## Component Designs

### MetadataTrack.tsx

```typescript
/**
 * MetadataTrack
 *
 * Container component for metadata editing in the title block.
 * Reuses ChordTrack interaction pattern.
 *
 * @see ChordTrack.tsx for the base pattern
 */

import React, { useState, useCallback } from 'react';
import { MetadataField } from './MetadataField';
import { MetadataInput } from './MetadataInput';
import { ScoreMetadata } from '@/types';
import { METADATA_TYPOGRAPHY } from '@/config';
import { useModifierKeys } from '@/hooks/useModifierKeys';
import './MetadataTrack.css';

type MetadataFieldType = 'title' | 'composer' | 'lyricist';

const FIELD_ORDER: MetadataFieldType[] = ['title', 'composer', 'lyricist'];

interface MetadataTrackProps {
  metadata: ScoreMetadata;
  contentWidth: number;
  staffScale: number;
  editingField: MetadataFieldType | null;
  selectedField: MetadataFieldType | null;
  onFieldClick: (field: MetadataFieldType) => void;
  onFieldSelect: (field: MetadataFieldType) => void;
  onEditComplete: (field: MetadataFieldType, value: string) => void;
  onEditCancel: () => void;
  onDelete: (field: MetadataFieldType) => void;
  onNavigateNext: (field: MetadataFieldType, value: string) => void;
  onNavigatePrevious: (field: MetadataFieldType, value: string) => void;
  onExitToScore: () => void;
}

export const MetadataTrack: React.FC<MetadataTrackProps> = ({
  metadata,
  contentWidth,
  staffScale,
  editingField,
  selectedField,
  onFieldClick,
  onFieldSelect,
  onEditComplete,
  onEditCancel,
  onDelete,
  onNavigateNext,
  onNavigatePrevious,
  onExitToScore,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredField, setHoveredField] = useState<MetadataFieldType | null>(null);
  const { isMetaKeyHeld } = useModifierKeys();

  const { titleHeight, composerHeight } = METADATA_TYPOGRAPHY;
  const titleY = titleHeight * staffScale;
  const subtitleY = titleY + composerHeight * staffScale + 8;
  const blockHeight = titleY + composerHeight * staffScale + 16;

  const handleFieldClick = useCallback((field: MetadataFieldType) => {
    if (isMetaKeyHeld) {
      onFieldSelect(field);
    } else {
      onFieldClick(field);
    }
  }, [isMetaKeyHeld, onFieldClick, onFieldSelect]);

  const handleNavigateNext = useCallback((field: MetadataFieldType, value: string) => {
    const currentIndex = FIELD_ORDER.indexOf(field);
    if (currentIndex === FIELD_ORDER.length - 1) {
      onEditComplete(field, value);
      onExitToScore();
    } else {
      onNavigateNext(field, value);
    }
  }, [onEditComplete, onNavigateNext, onExitToScore]);

  const fieldConfigs = {
    title: {
      x: contentWidth / 2,
      y: titleY,
      fontSize: 24 * staffScale,
      fontWeight: 'bold' as const,
      textAnchor: 'middle' as const,
      placeholder: 'Title',
      required: true,
    },
    composer: {
      x: contentWidth,
      y: subtitleY,
      fontSize: 12 * staffScale,
      fontWeight: 'normal' as const,
      textAnchor: 'end' as const,
      placeholder: 'Composer',
      required: false,
    },
    lyricist: {
      x: 0,
      y: subtitleY,
      fontSize: 12 * staffScale,
      fontWeight: 'normal' as const,
      textAnchor: 'start' as const,
      placeholder: 'Lyricist',
      required: false,
    },
  };

  return (
    <g
      className="riff-MetadataTrack"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setHoveredField(null); }}
    >
      <rect
        x={0}
        y={0}
        width={contentWidth}
        height={blockHeight}
        fill="transparent"
        className="riff-MetadataTrack__hitArea"
      />

      {FIELD_ORDER.map((field) => {
        const config = fieldConfigs[field];
        const value = metadata[field] ?? '';
        const isEmpty = !value;
        const isEditing = editingField === field;
        const isSelected = selectedField === field;
        const isFieldHovered = hoveredField === field;
        const showPreview = isHovered && isEmpty && !isEditing;

        if (isEditing) {
          return (
            <MetadataInput
              key={field}
              field={field}
              initialValue={value}
              {...config}
              onComplete={(val) => onEditComplete(field, val)}
              onCancel={onEditCancel}
              onDelete={() => onDelete(field)}
              onNavigateNext={(val) => handleNavigateNext(field, val)}
              onNavigatePrevious={(val) => onNavigatePrevious(field, val)}
            />
          );
        }

        return (
          <MetadataField
            key={field}
            field={field}
            value={value}
            {...config}
            isHovered={isFieldHovered}
            isSelected={isSelected}
            showPreview={showPreview}
            onClick={() => handleFieldClick(field)}
            onMouseEnter={() => setHoveredField(field)}
            onMouseLeave={() => setHoveredField(null)}
          />
        );
      })}
    </g>
  );
};
```

### MetadataField.tsx

```typescript
/**
 * MetadataField
 *
 * Renders a single metadata field with selection/hover/preview states.
 * Analogous to ChordSymbol.
 */

import React from 'react';
import './MetadataField.css';

type MetadataFieldType = 'title' | 'composer' | 'lyricist' | 'copyright';

interface MetadataFieldProps {
  field: MetadataFieldType;
  value: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  textAnchor: 'start' | 'middle' | 'end';
  placeholder: string;
  isHovered: boolean;
  isSelected: boolean;
  showPreview: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const MetadataField: React.FC<MetadataFieldProps> = ({
  field,
  value,
  x,
  y,
  fontSize,
  fontWeight,
  textAnchor,
  placeholder,
  isHovered,
  isSelected,
  showPreview,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const displayValue = value || (showPreview ? placeholder : '');

  if (!displayValue) return null;

  const className = [
    'riff-MetadataField',
    isHovered && 'riff-MetadataField--hovered',
    isSelected && 'riff-MetadataField--selected',
    showPreview && 'riff-MetadataField--preview',
  ].filter(Boolean).join(' ');

  return (
    <text
      x={x}
      y={y}
      fontSize={fontSize}
      fontWeight={fontWeight}
      textAnchor={textAnchor}
      className={className}
      data-field={field}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      {displayValue}
    </text>
  );
};
```

### MetadataInput.tsx

```typescript
/**
 * MetadataInput
 *
 * Inline input for editing metadata fields.
 * Analogous to ChordInput with same keyboard handling.
 */

import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import './MetadataInput.css';

type MetadataFieldType = 'title' | 'composer' | 'lyricist' | 'copyright';

interface MetadataInputProps {
  field: MetadataFieldType;
  initialValue: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  textAnchor: 'start' | 'middle' | 'end';
  placeholder: string;
  required: boolean;
  onComplete: (value: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onNavigateNext: (value: string) => void;
  onNavigatePrevious: (value: string) => void;
}

export const MetadataInput: React.FC<MetadataInputProps> = ({
  field,
  initialValue,
  x,
  y,
  fontSize,
  fontWeight,
  textAnchor,
  placeholder,
  required,
  onComplete,
  onCancel,
  onDelete,
  onNavigateNext,
  onNavigatePrevious,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [inputWidth, setInputWidth] = useState(100);

  // Focus and select on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // Auto-size input width
  useLayoutEffect(() => {
    const measureSpan = document.createElement('span');
    measureSpan.style.font = `${fontWeight} ${fontSize}px sans-serif`;
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.position = 'absolute';
    measureSpan.style.whiteSpace = 'pre';
    measureSpan.textContent = value || placeholder || ' ';
    document.body.appendChild(measureSpan);
    const width = measureSpan.getBoundingClientRect().width + 16;
    document.body.removeChild(measureSpan);
    setInputWidth(Math.max(width, 80));
  }, [value, fontSize, fontWeight, placeholder]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed && !required) {
          onDelete();
        } else {
          onComplete(required && !trimmed ? initialValue : trimmed);
        }
        break;

      case 'Escape':
        e.preventDefault();
        onCancel();
        break;

      case 'Tab':
        e.preventDefault();
        const tabValue = value.trim();
        if (e.shiftKey) {
          onNavigatePrevious(required && !tabValue ? initialValue : tabValue);
        } else {
          onNavigateNext(required && !tabValue ? initialValue : tabValue);
        }
        break;
    }
  };

  const handleBlur = () => {
    const trimmed = value.trim();
    if (!trimmed && !required) {
      onDelete();
    } else {
      onComplete(required && !trimmed ? initialValue : trimmed);
    }
  };

  const getInputX = () => {
    switch (textAnchor) {
      case 'middle': return x - inputWidth / 2;
      case 'end': return x - inputWidth;
      default: return x;
    }
  };

  return (
    <foreignObject
      x={getInputX()}
      y={y - fontSize}
      width={inputWidth}
      height={fontSize + 8}
      className="riff-MetadataInput__foreign"
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="riff-MetadataInput"
        style={{
          fontSize: `${fontSize}px`,
          fontWeight,
          width: `${inputWidth}px`,
          textAlign: textAnchor === 'middle' ? 'center' :
                     textAnchor === 'end' ? 'right' : 'left',
        }}
        placeholder={placeholder}
        data-field={field}
      />
    </foreignObject>
  );
};
```

### PageFooter.tsx

```typescript
/**
 * PageFooter
 *
 * Renders copyright (page 1 only) and page number.
 */

import React from 'react';
import { MetadataField } from './MetadataField';
import { MetadataInput } from './MetadataInput';
import { ScoreMetadata } from '@/types';

interface PageFooterProps {
  pageNumber: number;
  totalPages: number;
  metadata: ScoreMetadata;
  contentWidth: number;
  pageHeight: number;
  marginBottom: number;
  staffScale: number;
  isEditingCopyright: boolean;
  isCopyrightSelected: boolean;
  isCopyrightHovered: boolean;
  showCopyrightPreview: boolean;
  onCopyrightClick: () => void;
  onCopyrightComplete: (value: string) => void;
  onCopyrightCancel: () => void;
  onCopyrightDelete: () => void;
  onCopyrightHover: (hovered: boolean) => void;
}

export const PageFooter: React.FC<PageFooterProps> = ({
  pageNumber,
  metadata,
  contentWidth,
  pageHeight,
  marginBottom,
  staffScale,
  isEditingCopyright,
  isCopyrightSelected,
  isCopyrightHovered,
  showCopyrightPreview,
  onCopyrightClick,
  onCopyrightComplete,
  onCopyrightCancel,
  onCopyrightDelete,
  onCopyrightHover,
}) => {
  const fontSize = 10 * staffScale;
  const copyrightFontSize = 8 * staffScale;
  const pageNumberY = pageHeight - marginBottom / 2;
  const copyrightY = pageNumberY - 14;

  return (
    <g className="riff-page-footer">
      {/* Copyright - page 1 only */}
      {pageNumber === 1 && (isEditingCopyright ? (
        <MetadataInput
          field="copyright"
          initialValue={metadata.copyright ?? ''}
          x={contentWidth / 2}
          y={copyrightY}
          fontSize={copyrightFontSize}
          fontWeight="normal"
          textAnchor="middle"
          placeholder="© Your Name"
          required={false}
          onComplete={onCopyrightComplete}
          onCancel={onCopyrightCancel}
          onDelete={onCopyrightDelete}
          onNavigateNext={onCopyrightComplete}
          onNavigatePrevious={onCopyrightComplete}
        />
      ) : (metadata.copyright || showCopyrightPreview) && (
        <MetadataField
          field="copyright"
          value={metadata.copyright ?? ''}
          x={contentWidth / 2}
          y={copyrightY}
          fontSize={copyrightFontSize}
          fontWeight="normal"
          textAnchor="middle"
          placeholder="© Your Name"
          isHovered={isCopyrightHovered}
          isSelected={isCopyrightSelected}
          showPreview={showCopyrightPreview && !metadata.copyright}
          onClick={onCopyrightClick}
          onMouseEnter={() => onCopyrightHover(true)}
          onMouseLeave={() => onCopyrightHover(false)}
        />
      ))}

      {/* Page number - all pages */}
      <text
        x={contentWidth / 2}
        y={pageNumberY}
        fontSize={fontSize}
        textAnchor="middle"
        className="riff-page-number"
      >
        {pageNumber}
      </text>
    </g>
  );
};
```

### useMetadataTrack.ts

```typescript
/**
 * useMetadataTrack
 *
 * Manages metadata editing state and command dispatch.
 * Reuses useChordTrack pattern.
 */

import { useState, useCallback } from 'react';
import { useScoreAPI } from '@/hooks/api/useScoreAPI';
import { ScoreMetadata } from '@/types';

type MetadataField = 'title' | 'composer' | 'lyricist' | 'copyright';

const FIELD_ORDER: MetadataField[] = ['title', 'composer', 'lyricist'];

interface MetadataEditingState {
  editingField: MetadataField | null;
  initialValue: string | null;
}

export const useMetadataTrack = () => {
  const api = useScoreAPI();
  const [editingState, setEditingState] = useState<MetadataEditingState>({
    editingField: null,
    initialValue: null,
  });
  const [selectedField, setSelectedField] = useState<MetadataField | null>(null);

  const metadata = api.getMetadata();

  const startEditing = useCallback((field: MetadataField) => {
    setSelectedField(null);
    setEditingState({
      editingField: field,
      initialValue: metadata[field] ?? '',
    });
  }, [metadata]);

  const completeEdit = useCallback((field: MetadataField, value: string) => {
    const trimmed = value.trim();
    const currentValue = metadata[field] ?? '';

    if (trimmed !== currentValue) {
      if (field === 'title' && !trimmed) {
        api.setMetadata({ title: 'Untitled' });
      } else {
        api.setMetadata({ [field]: trimmed || undefined });
      }
    }

    setEditingState({ editingField: null, initialValue: null });
  }, [metadata, api]);

  const cancelEdit = useCallback(() => {
    setEditingState({ editingField: null, initialValue: null });
  }, []);

  const deleteField = useCallback((field: MetadataField) => {
    if (field === 'title') {
      api.setMetadata({ title: 'Untitled' });
    } else {
      api.setMetadata({ [field]: undefined });
    }
    setEditingState({ editingField: null, initialValue: null });
  }, [api]);

  const selectField = useCallback((field: MetadataField) => {
    setEditingState({ editingField: null, initialValue: null });
    setSelectedField(field);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedField(null);
  }, []);

  const navigateToNext = useCallback((currentField: MetadataField, value: string) => {
    completeEdit(currentField, value);
    const currentIndex = FIELD_ORDER.indexOf(currentField);
    if (currentIndex < FIELD_ORDER.length - 1) {
      const nextField = FIELD_ORDER[currentIndex + 1];
      startEditing(nextField);
    }
  }, [completeEdit, startEditing]);

  const navigateToPrevious = useCallback((currentField: MetadataField, value: string) => {
    completeEdit(currentField, value);
    const currentIndex = FIELD_ORDER.indexOf(currentField);
    if (currentIndex > 0) {
      const prevField = FIELD_ORDER[currentIndex - 1];
      startEditing(prevField);
    }
  }, [completeEdit, startEditing]);

  const exitToScore = useCallback(() => {
    api.selectFirstElement();
  }, [api]);

  return {
    metadata,
    selectedField,
    editingField: editingState.editingField,
    startEditing,
    completeEdit,
    cancelEdit,
    deleteField,
    selectField,
    clearSelection,
    navigateToNext,
    navigateToPrevious,
    exitToScore,
    trackProps: {
      metadata,
      editingField: editingState.editingField,
      selectedField,
      onFieldClick: startEditing,
      onFieldSelect: selectField,
      onEditComplete: completeEdit,
      onEditCancel: cancelEdit,
      onDelete: deleteField,
      onNavigateNext: navigateToNext,
      onNavigatePrevious: navigateToPrevious,
      onExitToScore: exitToScore,
    },
  };
};
```

---

## CSS Styling

Create `src/components/Canvas/MetadataTrack.css`:

```css
/**
 * MetadataTrack Styles
 * Chord-like WYSIWYG editing for score metadata.
 */

.riff-MetadataTrack__hitArea {
  cursor: default;
}

.riff-MetadataField {
  cursor: pointer;
  fill: var(--riff-text-primary);
  user-select: none;
  transition: fill 0.15s ease;
}

.riff-MetadataField--hovered {
  fill: var(--riff-color-primary);
}

.riff-MetadataField--selected {
  fill: var(--riff-color-primary);
}

/* Preview: placeholder at 50% opacity */
.riff-MetadataField--preview {
  fill: var(--riff-color-primary);
  opacity: 0.5;
  pointer-events: none;
}

.riff-MetadataInput__foreign {
  overflow: visible;
}

.riff-MetadataInput {
  box-sizing: border-box;
  padding: 2px 8px;
  border: none;
  border-radius: 2px;
  background: transparent;
  outline: none;
  font-family: var(--riff-font-sans);
  color: var(--riff-text-primary);
}

.riff-MetadataInput::placeholder {
  color: var(--riff-color-muted);
  opacity: 0.7;
}

.riff-page-number {
  fill: var(--riff-text-secondary);
  font-family: var(--riff-font-sans);
}

@media print {
  .riff-MetadataField {
    cursor: default;
    fill: black !important;
  }

  .riff-MetadataField--preview {
    display: none !important;
  }

  .riff-MetadataInput__foreign {
    display: none !important;
  }
}
```

---

## Parallelization Strategy

### Parallel Research (2 subagents)
1. **ChordTrack Agent:** Read ChordTrack.tsx, ChordSymbol.tsx, ChordInput.tsx to understand pattern
2. **useChordTrack Agent:** Read useChordTrack.ts for state management pattern

### Parallel Implementation (3 subagents)
After research:
1. **Track Agent:** Create MetadataTrack.tsx and useMetadataTrack.ts
2. **Field Agent:** Create MetadataField.tsx and MetadataInput.tsx
3. **Footer Agent:** Create PageFooter.tsx

### Sequential Integration (Executor)
1. Create MetadataTrack.css
2. Integrate into ScoreCanvas
3. Add selectFirstElement/selectLastElement to API if not present

### Parallel Testing (2 subagents)
1. **Component Tests Agent:** Write rendering tests
2. **Interaction Tests Agent:** Write keyboard navigation tests

### Final Step (Executor)
Run `npm run test` and visual verification.

---

## Acceptance Criteria

- [ ] All components created with correct props
- [ ] Hover shows placeholder text at 50% opacity
- [ ] Click enters edit mode with text selected
- [ ] Tab navigates to next field
- [ ] Tab from last field exits to first note
- [ ] Shift+Tab navigates to previous field
- [ ] Enter commits changes
- [ ] Escape cancels changes
- [ ] Cmd/Ctrl+Click selects without editing
- [ ] Delete clears selected field
- [ ] Page numbers appear on all pages
- [ ] Copyright appears only on page 1
- [ ] CSS matches ChordTrack styling
- [ ] All tests pass

---

## Files to Create

| File | Action |
|------|--------|
| `src/components/Canvas/MetadataTrack.tsx` | Create |
| `src/components/Canvas/MetadataField.tsx` | Create |
| `src/components/Canvas/MetadataInput.tsx` | Create |
| `src/components/Canvas/PageFooter.tsx` | Create |
| `src/components/Canvas/MetadataTrack.css` | Create |
| `src/hooks/layout/useMetadataTrack.ts` | Create |
| `src/__tests__/components/Canvas/MetadataTrack.test.tsx` | Create |
| `src/__tests__/hooks/useMetadataTrack.test.ts` | Create |
