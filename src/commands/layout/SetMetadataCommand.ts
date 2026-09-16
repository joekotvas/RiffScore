/**
 * Command to update score metadata fields.
 */

import { Command } from '../types';
import { Score, ScoreMetadata } from '@/types';
import { normalizeMetadata, resolveScoreMetadata } from '@/services/MetadataService';

export class SetMetadataCommand implements Command {
  readonly type = 'SET_METADATA';
  private previousMetadata!: ScoreMetadata;

  constructor(private updates: Partial<ScoreMetadata>) {}

  execute(score: Score): Score {
    // Merge over what the score already shows: without a metadata block that is its top-level
    // title, so editing the composer never flips the title to "Untitled".
    this.previousMetadata = resolveScoreMetadata(score);

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
