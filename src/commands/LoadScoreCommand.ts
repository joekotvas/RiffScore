import { Command } from './types';
import { Score, migrateScore } from '@/types';

export class LoadScoreCommand implements Command {
  type = 'LOAD_SCORE';
  private previousScore: Score | null = null;
  private newScore: Score;

  constructor(newScore: Score) {
    // Migrate at the load boundary so EVERY public load path (loadScore, reset,
    // the melody picker) stamps schemaVersion and re-anchors legacy chord tracks.
    // migrateScore is idempotent, so an already-current score passes through.
    this.newScore = migrateScore(newScore);
  }

  execute(score: Score): Score {
    this.previousScore = score;
    // A score without `layout` (most host JSON) keeps the layout the editor is already in — view
    // mode, page size, margins — instead of silently falling back to the scroll-view defaults.
    // A score that carries its own `layout` replaces it.
    if (this.newScore.layout === undefined && score.layout !== undefined) {
      return { ...this.newScore, layout: score.layout };
    }
    return this.newScore;
  }

  undo(score: Score): Score {
    return this.previousScore || score;
  }
}
