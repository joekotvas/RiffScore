/**
 * SetBpmCommand
 *
 * The command must return a new Score rather than writing `bpm` in place: the React binding
 * (useScoreEngine) bails out on an identical reference, so an in-place write never reached
 * subscribers such as the toolbar tempo that follows `score.bpm` (#22).
 */

import { SetBpmCommand } from '@/commands/SetBpmCommand';
import { createDefaultScore } from '@/types';

describe('SetBpmCommand', () => {
  test('returns a new Score with the new tempo and leaves the input untouched', () => {
    const score = createDefaultScore();
    const next = new SetBpmCommand(90).execute(score);

    expect(next).not.toBe(score);
    expect(next.bpm).toBe(90);
    expect(score.bpm).toBe(120);
    expect(next.staves).toBe(score.staves); // shallow copy: the notation itself is shared
  });

  test('clamps the tempo to the shared valid range', () => {
    const score = createDefaultScore();
    expect(new SetBpmCommand(1000).execute(score).bpm).toBe(300);
    expect(new SetBpmCommand(5).execute(score).bpm).toBe(30);
  });

  test('undo restores the previous tempo on a fresh object', () => {
    const score = createDefaultScore();
    const cmd = new SetBpmCommand(90);
    const changed = cmd.execute(score);
    const restored = cmd.undo(changed);

    expect(restored).not.toBe(changed);
    expect(restored.bpm).toBe(120);
    expect(changed.bpm).toBe(90);
  });
});
