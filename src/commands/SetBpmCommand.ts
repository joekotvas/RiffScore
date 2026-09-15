import { Command } from './types';
import { Score } from '@/types';
import { clampBpm } from '@/utils/validation';

/**
 * Command to update the score's BPM (Beats Per Minute).
 * BPM is clamped to a valid range using the shared validation utility.
 *
 * Returns a new Score rather than writing `bpm` in place: the React binding (useScoreEngine)
 * bails out on an identical reference, so an in-place write never reached subscribers such as
 * the toolbar tempo that follows `score.bpm` (#22).
 */
export class SetBpmCommand implements Command {
  public readonly type = 'SET_BPM';
  private previousBpm!: number;

  constructor(private bpm: number) {}

  execute(score: Score): Score {
    this.previousBpm = score.bpm || 120;

    // Use shared validation utility for consistent BPM range
    return { ...score, bpm: clampBpm(this.bpm) };
  }

  undo(score: Score): Score {
    return { ...score, bpm: this.previousBpm };
  }
}
