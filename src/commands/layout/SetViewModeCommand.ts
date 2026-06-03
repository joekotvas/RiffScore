/**
 * Command to toggle between scroll and page view modes.
 */

import { Command } from '../types';
import { Score, LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

export class SetViewModeCommand implements Command {
  readonly type = 'SET_VIEW_MODE';
  private previousMode!: LayoutConfig['viewMode'];

  constructor(private newMode: LayoutConfig['viewMode']) {}

  execute(score: Score): Score {
    const layout = score.layout ?? { ...DEFAULT_LAYOUT_CONFIG };
    this.previousMode = layout.viewMode;

    if (this.previousMode === this.newMode) {
      return score;
    }

    return {
      ...score,
      layout: { ...layout, viewMode: this.newMode },
    };
  }

  undo(score: Score): Score {
    const layout = score.layout ?? { ...DEFAULT_LAYOUT_CONFIG };
    return {
      ...score,
      layout: { ...layout, viewMode: this.previousMode },
    };
  }
}
