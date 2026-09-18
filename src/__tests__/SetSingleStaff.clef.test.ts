import { SetSingleStaffCommand } from '@/commands/SetSingleStaffCommand';
import { createDefaultScore } from '@/types';

it.each(['alto', 'tenor'] as const)(
  'preserves the first staff and supports undo when reducing to %s',
  (clef) => {
    const score = createDefaultScore();
    const command = new SetSingleStaffCommand(clef);
    const result = command.execute(score);
    expect(result.staves).toHaveLength(1);
    expect(result.staves[0]).toEqual({ ...score.staves[0], clef });
    expect(command.undo(result)).toEqual(score);
  }
);
