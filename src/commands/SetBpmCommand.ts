import { Command } from './types';
import { Score } from '@/types';

/**
 * Command to update the score's BPM (Beats Per Minute)
 */
export class SetBpmCommand implements Command {
  public readonly type = 'SET_BPM';
  private previousBpm: number;

  constructor(private bpm: number) {
    this.previousBpm = 120; // Default fallback
  }

  execute(score: Score): Score {
    this.previousBpm = score.bpm || 120;
    
    // Validate range (e.g., 10-500)
    let safeBpm = this.bpm;
    if (safeBpm < 10) safeBpm = 10;
    if (safeBpm > 500) safeBpm = 500;

    score.bpm = safeBpm;
    return score;
  }

  undo(score: Score): Score {
    score.bpm = this.previousBpm;
    return score;
  }
}
