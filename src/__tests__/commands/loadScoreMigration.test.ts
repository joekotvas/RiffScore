/**
 * LoadScoreCommand migration reachability (Phase 1.5 seam fix).
 *
 * The Model lane added schemaVersion stamping + lossless chord-track re-anchoring
 * inside migrateScore, but migrateScore only ran at first mount — the public
 * loadScore / reset / melody-picker paths all dispatch LoadScoreCommand, which
 * returned the score verbatim, so the migration was effectively dead on real
 * loads. The fix migrates at the load boundary. These tests prove it runs there.
 */

import { LoadScoreCommand } from '@/commands/LoadScoreCommand';
import { Score, SCHEMA_VERSION } from '@/types';

// A legacy score as a host app might pass to loadScore: NO schemaVersion field.
const legacyScore = (): Score =>
  ({
    title: 'Legacy',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      {
        id: 's1',
        clef: 'treble',
        keySignature: 'C',
        measures: [
          { id: 'm1', events: [{ id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] }] },
        ],
      },
    ],
  }) as Score;

describe('LoadScoreCommand migrates at the load boundary', () => {
  it('stamps schemaVersion on a legacy (unversioned) score', () => {
    const legacy = legacyScore();
    expect(legacy.schemaVersion).toBeUndefined();

    const cmd = new LoadScoreCommand(legacy);
    const result = cmd.execute({ ...legacy, title: 'current' } as Score);

    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('is idempotent: an already-current score loads unchanged in version', () => {
    const migratedOnce = new LoadScoreCommand(legacyScore()).execute(legacyScore());
    const migratedTwice = new LoadScoreCommand(migratedOnce).execute(legacyScore());
    expect(migratedTwice.schemaVersion).toBe(SCHEMA_VERSION);
    // Re-loading an already-migrated score must not corrupt it.
    expect(migratedTwice.staves).toEqual(migratedOnce.staves);
  });

  it('undo restores the exact previous score', () => {
    const previous = { ...legacyScore(), title: 'previous' } as Score;
    const cmd = new LoadScoreCommand(legacyScore());
    cmd.execute(previous);
    expect(cmd.undo(legacyScore())).toBe(previous);
  });
});
