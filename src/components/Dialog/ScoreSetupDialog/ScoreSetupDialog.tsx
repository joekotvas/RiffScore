/**
 * ScoreSetupDialog
 *
 * Modal dialog for editing score metadata and layout configuration.
 * Uses transaction batching for live preview with batched undo on cancel.
 *
 * @module components/Dialog/ScoreSetupDialog
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useScoreContext } from '@/context/ScoreContext';
import { useFocusTrap } from '@/hooks/layout';
import { SetMetadataCommand } from '@/commands/layout';
import { SetLayoutConfigCommand } from '@/commands/layout';
import { MetadataSection } from './MetadataSection';
import { LayoutSection } from './LayoutSection';
import type { ScoreMetadata, LayoutConfig } from '@/types';
import { DEFAULT_SCORE_METADATA, DEFAULT_LAYOUT_CONFIG } from '@/config';
import './ScoreSetupDialog.css';

interface ScoreSetupDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Called when dialog should close after saving */
  onSave: () => void;
  /** Called when dialog should close after canceling */
  onCancel: () => void;
}

/**
 * Checks if the target element is a text input.
 */
const isTextInput = (target: EventTarget | null): boolean => {
  if (!target) return false;
  const el = target as HTMLElement;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
};

/**
 * Inner dialog content component.
 * Separated to ensure fresh state on each dialog open (component remounts).
 */
const ScoreSetupDialogContent: React.FC<{
  onSave: () => void;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const ctx = useScoreContext();
  const { score } = ctx.state;
  const { dispatch } = ctx.engines;

  const dialogRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get current values with defaults
  const metadata: ScoreMetadata = score.metadata ?? { ...DEFAULT_SCORE_METADATA };
  const layout: LayoutConfig = score.layout ?? { ...DEFAULT_LAYOUT_CONFIG };

  // Focus trap for accessibility
  useFocusTrap({
    containerRef: dialogRef,
    isActive: true,
    onEscape: onCancel,
    autoFocus: true,
  });

  // Handle metadata changes (live preview)
  const handleMetadataChange = useCallback(
    (newMetadata: ScoreMetadata) => {
      // Validate title
      if (!newMetadata.title?.trim()) {
        setErrors((prev) => ({ ...prev, title: 'Title is required' }));
        return;
      }
      setErrors((prev) => {
        const { title: _, ...rest } = prev;
        return rest;
      });

      dispatch(new SetMetadataCommand(newMetadata));
    },
    [dispatch]
  );

  // Handle layout changes (live preview)
  const handleLayoutChange = useCallback(
    (updates: Partial<LayoutConfig>) => {
      dispatch(new SetLayoutConfigCommand(updates));
    },
    [dispatch]
  );

  // Handle save button click
  const handleSave = useCallback(() => {
    // Check if there are pending validation errors
    if (errors.title) {
      return;
    }
    // Also validate current metadata
    if (!metadata.title?.trim()) {
      setErrors((prev) => ({ ...prev, title: 'Title is required' }));
      return;
    }
    onSave();
  }, [metadata.title, onSave, errors.title]);

  // Keyboard handling for Enter key (save when not in text input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isTextInput(e.target)) {
        e.preventDefault();
        handleSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <div className="riff-ScoreSetupDialog-backdrop" onClick={onCancel} role="presentation">
      <div
        ref={dialogRef}
        className="riff-ScoreSetupDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="score-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="riff-ScoreSetupDialog__header">
          <h2 id="score-setup-title" className="riff-ScoreSetupDialog__title">
            Score Setup
          </h2>
          <button
            type="button"
            className="riff-ScoreSetupDialog__close"
            onClick={onCancel}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Scrollable content */}
        <div className="riff-ScoreSetupDialog__content">
          <MetadataSection metadata={metadata} onChange={handleMetadataChange} errors={errors} />
          <LayoutSection layout={layout} onChange={handleLayoutChange} />
        </div>

        {/* Footer */}
        <div className="riff-ScoreSetupDialog__footer">
          <button
            type="button"
            className="riff-ScoreSetupDialog__button riff-ScoreSetupDialog__button--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="riff-ScoreSetupDialog__button riff-ScoreSetupDialog__button--primary"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Score Setup Dialog component.
 *
 * Features:
 * - Metadata editing (title, composer, lyricist, copyright)
 * - Layout configuration (page size, margins, staff size, spacing)
 * - Live preview of changes
 * - Batched undo on cancel
 * - Full keyboard support (Escape to cancel, Enter to save)
 * - Focus trapping for accessibility
 */
export const ScoreSetupDialog: React.FC<ScoreSetupDialogProps> = ({ isOpen, onSave, onCancel }) => {
  // Render nothing when closed.
  // The inner component remounts on each open, resetting all state.
  if (!isOpen) return null;

  return <ScoreSetupDialogContent onSave={onSave} onCancel={onCancel} />;
};
