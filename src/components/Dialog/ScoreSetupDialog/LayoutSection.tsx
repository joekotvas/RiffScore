/**
 * LayoutSection
 *
 * Layout configuration controls within the Score Setup dialog.
 *
 * @module components/Dialog/ScoreSetupDialog
 */

import React, { useCallback } from 'react';
import type { LayoutConfig } from '@/types';

interface LayoutSectionProps {
  /** Current layout configuration */
  layout: LayoutConfig;
  /** Called when any setting changes */
  onChange: (updates: Partial<LayoutConfig>) => void;
}

/**
 * Layout configuration section component.
 *
 * Provides controls for:
 * - Page Size (Letter, A4)
 * - Margins (Narrow, Normal, Wide)
 * - Staff Size (50-150%)
 * - System Spacing (Compact, Normal, Relaxed)
 */
export const LayoutSection: React.FC<LayoutSectionProps> = ({
  layout,
  onChange,
}) => {
  const handlePageSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ pageSize: e.target.value as LayoutConfig['pageSize'] });
    },
    [onChange]
  );

  const handleMarginsChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ margins: e.target.value as LayoutConfig['margins'] });
    },
    [onChange]
  );

  const handleStaffSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ staffSize: parseInt(e.target.value, 10) });
    },
    [onChange]
  );

  const handleSpacingChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ systemSpacing: e.target.value as LayoutConfig['systemSpacing'] });
    },
    [onChange]
  );

  return (
    <section className="riff-ScoreSetupDialog__section">
      <h3 className="riff-ScoreSetupDialog__section-header">Layout</h3>

      {/* Page Size */}
      <div className="riff-ScoreSetupDialog__field">
        <label htmlFor="layout-page-size" className="riff-ScoreSetupDialog__label">
          Page Size
        </label>
        <select
          id="layout-page-size"
          className="riff-ScoreSetupDialog__select"
          value={layout.pageSize}
          onChange={handlePageSizeChange}
        >
          <option value="letter">Letter (8.5&quot; &times; 11&quot;)</option>
          <option value="a4">A4 (210 &times; 297 mm)</option>
        </select>
      </div>

      {/* Margins */}
      <div className="riff-ScoreSetupDialog__field">
        <label htmlFor="layout-margins" className="riff-ScoreSetupDialog__label">
          Margins
        </label>
        <select
          id="layout-margins"
          className="riff-ScoreSetupDialog__select"
          value={layout.margins}
          onChange={handleMarginsChange}
        >
          <option value="narrow">Narrow (0.5&quot;)</option>
          <option value="normal">Normal (0.75&quot;)</option>
          <option value="wide">Wide (1&quot;)</option>
        </select>
      </div>

      {/* Staff Size Slider */}
      <div className="riff-ScoreSetupDialog__field">
        <label htmlFor="layout-staff-size" className="riff-ScoreSetupDialog__label">
          Staff Size: {layout.staffSize}%
        </label>
        <div className="riff-ScoreSetupDialog__slider-group">
          <input
            id="layout-staff-size"
            type="range"
            className="riff-ScoreSetupDialog__slider"
            min="50"
            max="150"
            step="10"
            value={layout.staffSize}
            onChange={handleStaffSizeChange}
          />
          <span className="riff-ScoreSetupDialog__slider-value">{layout.staffSize}%</span>
        </div>
        <div className="riff-ScoreSetupDialog__slider-labels">
          <span>50%</span>
          <span>150%</span>
        </div>
      </div>

      {/* System Spacing */}
      <div className="riff-ScoreSetupDialog__field">
        <label htmlFor="layout-spacing" className="riff-ScoreSetupDialog__label">
          System Spacing
        </label>
        <select
          id="layout-spacing"
          className="riff-ScoreSetupDialog__select"
          value={layout.systemSpacing}
          onChange={handleSpacingChange}
        >
          <option value="compact">Compact</option>
          <option value="normal">Normal</option>
          <option value="relaxed">Relaxed</option>
        </select>
      </div>
    </section>
  );
};
