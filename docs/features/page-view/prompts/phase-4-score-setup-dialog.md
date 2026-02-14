# Phase 4: Score Setup Dialog

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Estimated Effort:** 2-3 days
**Dependencies:** Phase 2 (Commands & API)

---

## Objective

Create a modal dialog for editing score metadata and layout configuration with live preview and batched undo-on-cancel.

---

## Deliverables

1. `ScoreSetupDialog.tsx` - Main dialog component
2. `MetadataSection.tsx` - Metadata form fields
3. `LayoutSection.tsx` - Layout controls
4. `useScoreSetup.ts` - Dialog state hook
5. `ScoreSetupDialog.css` - Styling
6. Accessibility testing

---

## Requirements Reference

From PRD:
- **FR-35–38:** Metadata fields (title, composer, lyricist, copyright)
- **FR-39–42:** Layout settings (page size, margins, staff size, system spacing)
- **FR-40:** Live preview with batched undo on cancel
- **FR-43–46:** Modal behavior, Escape/Enter shortcuts, single scrollable form

---

## Dialog Design

### ScoreSetupDialog.tsx

```typescript
/**
 * ScoreSetupDialog
 *
 * Modal dialog for editing score metadata and layout configuration.
 * Uses live preview with batched undo on cancel.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useScoreAPI } from '@/hooks/api/useScoreAPI';
import { MetadataSection } from './MetadataSection';
import { LayoutSection } from './LayoutSection';
import { ScoreMetadata, LayoutConfig } from '@/types';
import './ScoreSetupDialog.css';

interface ScoreSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScoreSetupDialog: React.FC<ScoreSetupDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const api = useScoreAPI();
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Track command count for batch undo on cancel
  const [commandCountOnOpen, setCommandCountOnOpen] = useState(0);

  // Capture command count when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCommandCountOnOpen(api.getCommandCount());
      setErrors({});
    }
  }, [isOpen, api]);

  // Live preview: apply changes immediately
  const handleMetadataChange = useCallback((metadata: ScoreMetadata) => {
    if (!metadata.title?.trim()) {
      setErrors({ title: 'Title is required' });
      return;
    }
    setErrors({});
    api.setMetadata(metadata);
  }, [api]);

  const handleLayoutChange = useCallback((layout: Partial<LayoutConfig>) => {
    api.setLayoutConfig(layout);
  }, [api]);

  const handleSave = useCallback(() => {
    const currentMetadata = api.getMetadata();
    if (!currentMetadata.title?.trim()) {
      setErrors({ title: 'Title is required' });
      return;
    }
    onClose();
  }, [api, onClose]);

  const handleCancel = useCallback(() => {
    // Batch undo all commands since dialog opened
    const currentCount = api.getCommandCount();
    const commandsToUndo = currentCount - commandCountOnOpen;
    for (let i = 0; i < commandsToUndo; i++) {
      api.undo();
    }
    onClose();
  }, [api, commandCountOnOpen, onClose]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && !isTextInput(e.target)) {
        handleSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCancel, handleSave]);

  if (!isOpen) return null;

  return (
    <div
      className="riff-dialog-backdrop"
      onClick={handleCancel}
      role="presentation"
    >
      <div
        className="riff-dialog riff-score-setup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="score-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="riff-dialog__header">
          <h2 id="score-setup-title">Score Setup</h2>
          <button
            className="riff-dialog__close"
            onClick={handleCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Single scrollable form */}
        <div className="riff-dialog__content riff-dialog__content--scrollable">
          <MetadataSection
            metadata={api.getMetadata()}
            onChange={handleMetadataChange}
            errors={errors}
          />
          <LayoutSection
            layout={api.getLayoutConfig()}
            onChange={handleLayoutChange}
          />
        </div>

        {/* Footer */}
        <div className="riff-dialog__footer">
          <button className="riff-btn riff-btn--secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="riff-btn riff-btn--primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

const isTextInput = (target: EventTarget | null): boolean => {
  if (!target) return false;
  const el = target as HTMLElement;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
};
```

### MetadataSection.tsx

```typescript
/**
 * MetadataSection
 *
 * Form fields for score metadata editing.
 */

import React from 'react';
import { ScoreMetadata } from '@/types';

interface MetadataSectionProps {
  metadata: ScoreMetadata;
  onChange: (metadata: ScoreMetadata) => void;
  errors: Record<string, string>;
}

export const MetadataSection: React.FC<MetadataSectionProps> = ({
  metadata,
  onChange,
  errors,
}) => {
  const handleChange = (field: keyof ScoreMetadata, value: string) => {
    onChange({
      ...metadata,
      [field]: value || undefined,
    });
  };

  return (
    <section className="riff-form-section">
      <h3 className="riff-form-section__header">Metadata</h3>

      <div className="riff-form-field">
        <label htmlFor="metadata-title">
          Title <span className="riff-required">*</span>
        </label>
        <input
          id="metadata-title"
          type="text"
          value={metadata.title}
          onChange={(e) => handleChange('title', e.target.value)}
          aria-required="true"
          aria-invalid={!!errors.title}
        />
        {errors.title && (
          <span className="riff-field-error" role="alert">
            {errors.title}
          </span>
        )}
      </div>

      <div className="riff-form-field">
        <label htmlFor="metadata-composer">Composer</label>
        <input
          id="metadata-composer"
          type="text"
          value={metadata.composer ?? ''}
          onChange={(e) => handleChange('composer', e.target.value)}
        />
      </div>

      <div className="riff-form-field">
        <label htmlFor="metadata-lyricist">Lyricist</label>
        <input
          id="metadata-lyricist"
          type="text"
          value={metadata.lyricist ?? ''}
          onChange={(e) => handleChange('lyricist', e.target.value)}
        />
      </div>

      <div className="riff-form-field">
        <label htmlFor="metadata-copyright">Copyright</label>
        <input
          id="metadata-copyright"
          type="text"
          value={metadata.copyright ?? ''}
          onChange={(e) => handleChange('copyright', e.target.value)}
          placeholder="© 2026 Your Name"
        />
      </div>
    </section>
  );
};
```

### LayoutSection.tsx

```typescript
/**
 * LayoutSection
 *
 * Layout configuration controls (page size, margins, staff size, spacing).
 */

import React from 'react';
import { LayoutConfig } from '@/types';

interface LayoutSectionProps {
  layout: LayoutConfig;
  onChange: (layout: Partial<LayoutConfig>) => void;
}

export const LayoutSection: React.FC<LayoutSectionProps> = ({
  layout,
  onChange,
}) => {
  return (
    <section className="riff-form-section">
      <h3 className="riff-form-section__header">Layout</h3>

      {/* Page Size */}
      <div className="riff-form-field">
        <label htmlFor="layout-page-size">Page Size</label>
        <select
          id="layout-page-size"
          value={layout.pageSize}
          onChange={(e) => onChange({ pageSize: e.target.value as 'letter' | 'a4' })}
        >
          <option value="letter">Letter (8.5" × 11")</option>
          <option value="a4">A4 (210 × 297 mm)</option>
        </select>
      </div>

      {/* Margins */}
      <div className="riff-form-field">
        <label htmlFor="layout-margins">Margins</label>
        <select
          id="layout-margins"
          value={layout.margins}
          onChange={(e) => onChange({ margins: e.target.value as 'narrow' | 'normal' | 'wide' })}
        >
          <option value="narrow">Narrow (0.5")</option>
          <option value="normal">Normal (0.75")</option>
          <option value="wide">Wide (1")</option>
        </select>
      </div>

      {/* Staff Size Slider */}
      <div className="riff-form-field">
        <label htmlFor="layout-staff-size">
          Staff Size: {layout.staffSize}%
        </label>
        <div className="riff-slider-group">
          <input
            id="layout-staff-size"
            type="range"
            min="50"
            max="150"
            step="10"
            value={layout.staffSize}
            onChange={(e) => onChange({ staffSize: parseInt(e.target.value, 10) })}
          />
          <span className="riff-slider-value">{layout.staffSize}%</span>
        </div>
        <div className="riff-slider-labels">
          <span>50%</span>
          <span>150%</span>
        </div>
      </div>

      {/* System Spacing */}
      <div className="riff-form-field">
        <label htmlFor="layout-spacing">System Spacing</label>
        <select
          id="layout-spacing"
          value={layout.systemSpacing}
          onChange={(e) => onChange({ systemSpacing: e.target.value as 'compact' | 'normal' | 'relaxed' })}
        >
          <option value="compact">Compact</option>
          <option value="normal">Normal</option>
          <option value="relaxed">Relaxed</option>
        </select>
      </div>
    </section>
  );
};
```

### useScoreSetup.ts

```typescript
/**
 * useScoreSetup
 *
 * Manages Score Setup dialog state.
 */

import { useState, useCallback } from 'react';

interface UseScoreSetupResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useScoreSetup = (): UseScoreSetupResult => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return { isOpen, open, close, toggle };
};
```

---

## CSS Styling

Create `src/components/Dialog/ScoreSetupDialog/ScoreSetupDialog.css`:

```css
.riff-score-setup-dialog {
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
}

/* Section headers */
.riff-form-section {
  margin-bottom: var(--riff-spacing-lg);
}

.riff-form-section__header {
  font-size: 14px;
  font-weight: 600;
  color: var(--riff-text-secondary);
  border-bottom: 1px solid var(--riff-border-color);
  padding-bottom: var(--riff-spacing-xs);
  margin-bottom: var(--riff-spacing-md);
}

/* Scrollable content */
.riff-dialog__content--scrollable {
  max-height: 60vh;
  overflow-y: auto;
  padding: var(--riff-spacing-md);
}

/* Form fields */
.riff-form-field {
  margin-bottom: var(--riff-spacing-md);
}

.riff-form-field label {
  display: block;
  margin-bottom: var(--riff-spacing-xs);
  font-weight: 500;
}

.riff-form-field input,
.riff-form-field select {
  width: 100%;
  padding: var(--riff-spacing-sm);
  border: 1px solid var(--riff-border-color);
  border-radius: var(--riff-border-radius);
}

.riff-form-field input:focus,
.riff-form-field select:focus {
  outline: none;
  border-color: var(--riff-accent-color);
  box-shadow: 0 0 0 2px rgba(var(--riff-accent-rgb), 0.2);
}

.riff-required {
  color: var(--riff-error-color);
}

.riff-field-error {
  display: block;
  margin-top: var(--riff-spacing-xs);
  color: var(--riff-error-color);
  font-size: 12px;
}

/* Slider */
.riff-slider-group {
  display: flex;
  align-items: center;
  gap: var(--riff-spacing-sm);
}

.riff-slider-group input[type="range"] {
  flex: 1;
}

.riff-slider-value {
  min-width: 45px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.riff-slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--riff-text-secondary);
  margin-top: 2px;
}
```

---

## Accessibility Requirements

- Dialog has `role="dialog"` and `aria-modal="true"`
- Title linked via `aria-labelledby`
- Required fields marked with `aria-required="true"`
- Invalid fields have `aria-invalid="true"`
- Error messages use `role="alert"`
- Close button has `aria-label="Close"`
- Focus trapped within dialog
- Escape closes dialog
- Enter (outside text fields) saves

---

## Coding Standards

### CSS Conventions
- Namespace: `.riff-` prefix
- BEM: `.riff-Block__element--modifier`
- Use CSS variables for spacing, colors
- Co-locate styles with components

### Component Pattern
- Single responsibility per component
- Props for data, callbacks for events
- useCallback for stable handler references

---

## Parallelization Strategy

### Parallel Implementation (3 subagents)
1. **Dialog Agent:** Create ScoreSetupDialog.tsx with modal behavior
2. **Section Agent:** Create MetadataSection.tsx and LayoutSection.tsx
3. **Style Agent:** Create ScoreSetupDialog.css

### Sequential Integration (Executor)
1. Create useScoreSetup.ts hook
2. Create barrel export index.ts
3. Wire up components

### Accessibility Testing (1 subagent)
Run accessibility audit on dialog component.

### Final Step (Executor)
Run `npm run test` and verify in demo app.

---

## Acceptance Criteria

- [ ] `ScoreSetupDialog.tsx` created with modal behavior
- [ ] `MetadataSection.tsx` created with all fields
- [ ] `LayoutSection.tsx` created with all controls
- [ ] `useScoreSetup.ts` hook created
- [ ] CSS styling complete
- [ ] Escape closes dialog
- [ ] Enter (outside text field) saves
- [ ] Cancel undoes all changes made during session
- [ ] Live preview works for all settings
- [ ] Accessibility requirements met
- [ ] All tests pass

---

## Files to Create

| File | Action |
|------|--------|
| `src/components/Dialog/ScoreSetupDialog/ScoreSetupDialog.tsx` | Create |
| `src/components/Dialog/ScoreSetupDialog/MetadataSection.tsx` | Create |
| `src/components/Dialog/ScoreSetupDialog/LayoutSection.tsx` | Create |
| `src/components/Dialog/ScoreSetupDialog/ScoreSetupDialog.css` | Create |
| `src/components/Dialog/ScoreSetupDialog/index.ts` | Create |
| `src/hooks/layout/useScoreSetup.ts` | Create |
| `src/__tests__/components/Dialog/ScoreSetupDialog.test.tsx` | Create |
