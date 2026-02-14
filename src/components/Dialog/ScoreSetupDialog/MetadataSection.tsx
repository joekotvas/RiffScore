/**
 * MetadataSection
 *
 * Form fields for score metadata editing within the Score Setup dialog.
 *
 * @module components/Dialog/ScoreSetupDialog
 */

import React, { useCallback } from 'react';
import type { ScoreMetadata } from '@/types';

interface MetadataSectionProps {
  /** Current metadata values */
  metadata: ScoreMetadata;
  /** Called when any field changes */
  onChange: (metadata: ScoreMetadata) => void;
  /** Field validation errors */
  errors: Record<string, string>;
}

/**
 * Metadata form section component.
 *
 * Provides input fields for:
 * - Title (required)
 * - Composer
 * - Lyricist
 * - Copyright
 */
export const MetadataSection: React.FC<MetadataSectionProps> = ({ metadata, onChange, errors }) => {
  const handleChange = useCallback(
    (field: keyof ScoreMetadata, value: string) => {
      onChange({
        ...metadata,
        [field]: value || undefined, // Convert empty string to undefined
      });
    },
    [metadata, onChange]
  );

  return (
    <section className="riff-ScoreSetupDialog__section">
      <h3 className="riff-ScoreSetupDialog__section-header">Metadata</h3>

      {/* Title (Required) */}
      <div className="riff-ScoreSetupDialog__field">
        <label htmlFor="metadata-title" className="riff-ScoreSetupDialog__label">
          Title <span className="riff-ScoreSetupDialog__required">*</span>
        </label>
        <input
          id="metadata-title"
          type="text"
          className={`riff-ScoreSetupDialog__input ${errors.title ? 'riff-ScoreSetupDialog__input--error' : ''}`}
          value={metadata.title}
          onChange={(e) => handleChange('title', e.target.value)}
          aria-required="true"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'title-error' : undefined}
        />
        {errors.title && (
          <span id="title-error" className="riff-ScoreSetupDialog__error" role="alert">
            {errors.title}
          </span>
        )}
      </div>

      {/* Composer */}
      <div className="riff-ScoreSetupDialog__field">
        <label htmlFor="metadata-composer" className="riff-ScoreSetupDialog__label">
          Composer
        </label>
        <input
          id="metadata-composer"
          type="text"
          className="riff-ScoreSetupDialog__input"
          value={metadata.composer ?? ''}
          onChange={(e) => handleChange('composer', e.target.value)}
        />
      </div>

      {/* Lyricist */}
      <div className="riff-ScoreSetupDialog__field">
        <label htmlFor="metadata-lyricist" className="riff-ScoreSetupDialog__label">
          Lyricist
        </label>
        <input
          id="metadata-lyricist"
          type="text"
          className="riff-ScoreSetupDialog__input"
          value={metadata.lyricist ?? ''}
          onChange={(e) => handleChange('lyricist', e.target.value)}
        />
      </div>

      {/* Copyright */}
      <div className="riff-ScoreSetupDialog__field">
        <label htmlFor="metadata-copyright" className="riff-ScoreSetupDialog__label">
          Copyright
        </label>
        <input
          id="metadata-copyright"
          type="text"
          className="riff-ScoreSetupDialog__input"
          value={metadata.copyright ?? ''}
          onChange={(e) => handleChange('copyright', e.target.value)}
          placeholder="© 2026 Your Name"
        />
      </div>
    </section>
  );
};
