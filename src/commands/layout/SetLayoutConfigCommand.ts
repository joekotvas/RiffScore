/**
 * Command to update layout configuration settings.
 */

import { Command } from '../types';
import { Score, LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

/**
 * Clamp a value between min and max.
 */
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Valid margin presets.
 */
const VALID_MARGINS: LayoutConfig['margins'][] = ['narrow', 'normal', 'wide'];

/**
 * Valid page sizes.
 */
const VALID_PAGE_SIZES: LayoutConfig['pageSize'][] = ['letter', 'a4'];

/**
 * Valid system spacing presets.
 */
const VALID_SYSTEM_SPACING: LayoutConfig['systemSpacing'][] = ['compact', 'normal', 'relaxed'];

/**
 * Valid view modes.
 */
const VALID_VIEW_MODES: LayoutConfig['viewMode'][] = ['scroll', 'page'];

export class SetLayoutConfigCommand implements Command {
  readonly type = 'SET_LAYOUT_CONFIG';
  private previousConfig!: LayoutConfig;

  constructor(private updates: Partial<LayoutConfig>) {}

  execute(score: Score): Score {
    this.previousConfig = score.layout ?? { ...DEFAULT_LAYOUT_CONFIG };

    const newConfig: LayoutConfig = {
      ...this.previousConfig,
    };

    // Apply and validate each update
    if (this.updates.pageSize !== undefined) {
      newConfig.pageSize = VALID_PAGE_SIZES.includes(this.updates.pageSize)
        ? this.updates.pageSize
        : this.previousConfig.pageSize;
    }

    if (this.updates.margins !== undefined) {
      newConfig.margins = VALID_MARGINS.includes(this.updates.margins)
        ? this.updates.margins
        : this.previousConfig.margins;
    }

    if (this.updates.staffSize !== undefined) {
      // Clamp and round staff size to nearest 10%
      newConfig.staffSize = Math.round(clamp(this.updates.staffSize, 50, 150) / 10) * 10;
    }

    if (this.updates.systemSpacing !== undefined) {
      newConfig.systemSpacing = VALID_SYSTEM_SPACING.includes(this.updates.systemSpacing)
        ? this.updates.systemSpacing
        : this.previousConfig.systemSpacing;
    }

    if (this.updates.viewMode !== undefined) {
      newConfig.viewMode = VALID_VIEW_MODES.includes(this.updates.viewMode)
        ? this.updates.viewMode
        : this.previousConfig.viewMode;
    }

    return {
      ...score,
      layout: newConfig,
    };
  }

  undo(score: Score): Score {
    return {
      ...score,
      layout: this.previousConfig,
    };
  }
}
