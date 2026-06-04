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
    return this.newScore;
  }

  undo(score: Score): Score {
    return this.previousScore || score;
  }
}
