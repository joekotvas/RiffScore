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
import { LayoutConfig, Score, SCHEMA_VERSION } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

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
          {
            id: 'm1',
            events: [
              { id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
            ],
          },
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

describe('LoadScoreCommand keeps the current layout when the loaded score has none', () => {
  // An embedder in page view loads host JSON that (like most scores) carries no `layout`; the
  // editor must stay in page view instead of falling back to the scroll-view defaults.
  const pageLayout: LayoutConfig = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page', pageSize: 'a4' };
  const currentScore = (): Score => ({ ...legacyScore(), title: 'current', layout: pageLayout });

  it('carries the current layout over to a score loaded without one', () => {
    const incoming = legacyScore();
    expect(incoming.layout).toBeUndefined();

    const result = new LoadScoreCommand(incoming).execute(currentScore());

    expect(result.title).toBe('Legacy');
    expect(result.layout).toEqual(pageLayout);
  });

  it('uses the loaded layout when the score carries one', () => {
    const scrollLayout: LayoutConfig = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'scroll' };
    const incoming: Score = { ...legacyScore(), layout: scrollLayout };

    const result = new LoadScoreCommand(incoming).execute(currentScore());

    expect(result.layout).toEqual(scrollLayout);
  });

  it('undo restores the exact previous score in both cases', () => {
    const previous = currentScore();

    const withoutLayout = new LoadScoreCommand(legacyScore());
    expect(withoutLayout.undo(withoutLayout.execute(previous))).toBe(previous);

    const withLayout = new LoadScoreCommand({
      ...legacyScore(),
      layout: { ...DEFAULT_LAYOUT_CONFIG },
    });
    expect(withLayout.undo(withLayout.execute(previous))).toBe(previous);
  });
});
