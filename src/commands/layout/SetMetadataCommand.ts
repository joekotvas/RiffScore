/**
 * Command to update score metadata fields.
 */

import { Command } from '../types';
import { Score, ScoreMetadata } from '@/types';
import { DEFAULT_SCORE_METADATA } from '@/config';
import { normalizeMetadata } from '@/services/MetadataService';

export class SetMetadataCommand implements Command {
  readonly type = 'SET_METADATA';
  private previousMetadata!: ScoreMetadata;

  constructor(private updates: Partial<ScoreMetadata>) {}

  execute(score: Score): Score {
    this.previousMetadata = score.metadata ?? { ...DEFAULT_SCORE_METADATA };

    // Merge updates with previous metadata
    const merged = { ...this.previousMetadata, ...this.updates };

    // Normalize (trims whitespace, applies defaults)
    const normalized = normalizeMetadata(merged);

    return {
      ...score,
      metadata: normalized,
    };
  }

  undo(score: Score): Score {
    return {
      ...score,
      metadata: this.previousMetadata,
    };
  }
}
