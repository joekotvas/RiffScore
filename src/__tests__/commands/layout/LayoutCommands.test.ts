/**
 * Layout Commands Tests
 *
 * Tests for SetViewModeCommand, SetLayoutConfigCommand, and SetMetadataCommand.
 */

import {
  SetViewModeCommand,
  SetLayoutConfigCommand,
  SetMetadataCommand,
} from '@/commands/layout';
import { DEFAULT_LAYOUT_CONFIG, DEFAULT_SCORE_METADATA } from '@/config';
import type { Score, LayoutConfig, ScoreMetadata } from '@/types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Creates a minimal score for testing.
 */
const createTestScore = (overrides?: Partial<Score>): Score => ({
  title: 'Test Score',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'C',
      measures: [{ id: 'm0', events: [] }],
    },
  ],
  ...overrides,
});

/**
 * Creates a score with layout config.
 */
const createScoreWithLayout = (layout: LayoutConfig): Score =>
  createTestScore({ layout });

/**
 * Creates a score with metadata.
 */
const createScoreWithMetadata = (metadata: ScoreMetadata): Score =>
  createTestScore({ metadata });

// ============================================================================
// SetViewModeCommand Tests
// ============================================================================

describe('SetViewModeCommand', () => {
  describe('execute', () => {
    it('sets view mode from scroll to page', () => {
      const score = createScoreWithLayout({ ...DEFAULT_LAYOUT_CONFIG, viewMode: 'scroll' });
      const command = new SetViewModeCommand('page');

      const result = command.execute(score);

      expect(result.layout?.viewMode).toBe('page');
    });

    it('sets view mode from page to scroll', () => {
      const score = createScoreWithLayout({ ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page' });
      const command = new SetViewModeCommand('scroll');

      const result = command.execute(score);

      expect(result.layout?.viewMode).toBe('scroll');
    });

    it('returns same score when mode unchanged', () => {
      const score = createScoreWithLayout({ ...DEFAULT_LAYOUT_CONFIG, viewMode: 'scroll' });
      const command = new SetViewModeCommand('scroll');

      const result = command.execute(score);

      expect(result).toBe(score);
    });

    it('creates layout config if missing', () => {
      const score = createTestScore();
      const command = new SetViewModeCommand('page');

      const result = command.execute(score);

      expect(result.layout).toBeDefined();
      expect(result.layout?.viewMode).toBe('page');
    });

    it('preserves other layout properties', () => {
      const score = createScoreWithLayout({
        ...DEFAULT_LAYOUT_CONFIG,
        viewMode: 'scroll',
        staffSize: 120,
        margins: 'wide',
      });
      const command = new SetViewModeCommand('page');

      const result = command.execute(score);

      expect(result.layout?.viewMode).toBe('page');
      expect(result.layout?.staffSize).toBe(120);
      expect(result.layout?.margins).toBe('wide');
    });
  });

  describe('undo', () => {
    it('restores previous view mode', () => {
      const score = createScoreWithLayout({ ...DEFAULT_LAYOUT_CONFIG, viewMode: 'scroll' });
      const command = new SetViewModeCommand('page');

      const afterExecute = command.execute(score);
      const afterUndo = command.undo(afterExecute);

      expect(afterUndo.layout?.viewMode).toBe('scroll');
    });

    it('restores default when original had no layout', () => {
      const score = createTestScore();
      const command = new SetViewModeCommand('page');

      const afterExecute = command.execute(score);
      const afterUndo = command.undo(afterExecute);

      // Should restore to default scroll mode
      expect(afterUndo.layout?.viewMode).toBe('scroll');
    });
  });

  describe('type', () => {
    it('has correct type identifier', () => {
      const command = new SetViewModeCommand('page');
      expect(command.type).toBe('SET_VIEW_MODE');
    });
  });
});

// ============================================================================
// SetLayoutConfigCommand Tests
// ============================================================================

describe('SetLayoutConfigCommand', () => {
  describe('execute', () => {
    it('updates page size', () => {
      const score = createTestScore();
      const command = new SetLayoutConfigCommand({ pageSize: 'a4' });

      const result = command.execute(score);

      expect(result.layout?.pageSize).toBe('a4');
    });

    it('updates margins', () => {
      const score = createTestScore();
      const command = new SetLayoutConfigCommand({ margins: 'wide' });

      const result = command.execute(score);

      expect(result.layout?.margins).toBe('wide');
    });

    it('updates staff size with clamping', () => {
      const score = createTestScore();
      const command = new SetLayoutConfigCommand({ staffSize: 130 });

      const result = command.execute(score);

      expect(result.layout?.staffSize).toBe(130);
    });

    it('clamps staff size to minimum 50', () => {
      const score = createTestScore();
      const command = new SetLayoutConfigCommand({ staffSize: 30 });

      const result = command.execute(score);

      expect(result.layout?.staffSize).toBe(50);
    });

    it('clamps staff size to maximum 150', () => {
      const score = createTestScore();
      const command = new SetLayoutConfigCommand({ staffSize: 200 });

      const result = command.execute(score);

      expect(result.layout?.staffSize).toBe(150);
    });

    it('rounds staff size to nearest 10', () => {
      const score = createTestScore();
      const command = new SetLayoutConfigCommand({ staffSize: 85 });

      const result = command.execute(score);

      expect(result.layout?.staffSize).toBe(90);
    });

    it('updates system spacing', () => {
      const score = createTestScore();
      const command = new SetLayoutConfigCommand({ systemSpacing: 'compact' });

      const result = command.execute(score);

      expect(result.layout?.systemSpacing).toBe('compact');
    });

    it('updates view mode', () => {
      const score = createTestScore();
      const command = new SetLayoutConfigCommand({ viewMode: 'page' });

      const result = command.execute(score);

      expect(result.layout?.viewMode).toBe('page');
    });

    it('updates multiple properties at once', () => {
      const score = createTestScore();
      const command = new SetLayoutConfigCommand({
        pageSize: 'a4',
        margins: 'narrow',
        staffSize: 80,
      });

      const result = command.execute(score);

      expect(result.layout?.pageSize).toBe('a4');
      expect(result.layout?.margins).toBe('narrow');
      expect(result.layout?.staffSize).toBe(80);
    });

    it('ignores invalid page size', () => {
      const score = createScoreWithLayout({ ...DEFAULT_LAYOUT_CONFIG, pageSize: 'letter' });
      const command = new SetLayoutConfigCommand({ pageSize: 'invalid' as LayoutConfig['pageSize'] });

      const result = command.execute(score);

      expect(result.layout?.pageSize).toBe('letter');
    });

    it('ignores invalid margins', () => {
      const score = createScoreWithLayout({ ...DEFAULT_LAYOUT_CONFIG, margins: 'normal' });
      const command = new SetLayoutConfigCommand({ margins: 'invalid' as LayoutConfig['margins'] });

      const result = command.execute(score);

      expect(result.layout?.margins).toBe('normal');
    });

    it('ignores invalid system spacing', () => {
      const score = createScoreWithLayout({ ...DEFAULT_LAYOUT_CONFIG, systemSpacing: 'normal' });
      const command = new SetLayoutConfigCommand({
        systemSpacing: 'invalid' as LayoutConfig['systemSpacing'],
      });

      const result = command.execute(score);

      expect(result.layout?.systemSpacing).toBe('normal');
    });

    it('ignores invalid view mode', () => {
      const score = createScoreWithLayout({ ...DEFAULT_LAYOUT_CONFIG, viewMode: 'scroll' });
      const command = new SetLayoutConfigCommand({ viewMode: 'invalid' as LayoutConfig['viewMode'] });

      const result = command.execute(score);

      expect(result.layout?.viewMode).toBe('scroll');
    });
  });

  describe('undo', () => {
    it('restores previous layout config', () => {
      const originalLayout: LayoutConfig = {
        pageSize: 'letter',
        margins: 'normal',
        staffSize: 100,
        systemSpacing: 'normal',
        viewMode: 'scroll',
      };
      const score = createScoreWithLayout(originalLayout);
      const command = new SetLayoutConfigCommand({
        pageSize: 'a4',
        staffSize: 120,
      });

      const afterExecute = command.execute(score);
      const afterUndo = command.undo(afterExecute);

      expect(afterUndo.layout).toEqual(originalLayout);
    });

    it('restores default config when original had none', () => {
      const score = createTestScore();
      const command = new SetLayoutConfigCommand({ pageSize: 'a4' });

      const afterExecute = command.execute(score);
      const afterUndo = command.undo(afterExecute);

      expect(afterUndo.layout).toEqual(DEFAULT_LAYOUT_CONFIG);
    });
  });

  describe('type', () => {
    it('has correct type identifier', () => {
      const command = new SetLayoutConfigCommand({});
      expect(command.type).toBe('SET_LAYOUT_CONFIG');
    });
  });
});

// ============================================================================
// SetMetadataCommand Tests
// ============================================================================

describe('SetMetadataCommand', () => {
  describe('execute', () => {
    it('sets title', () => {
      const score = createTestScore();
      const command = new SetMetadataCommand({ title: 'My Song' });

      const result = command.execute(score);

      expect(result.metadata?.title).toBe('My Song');
    });

    it('sets composer', () => {
      const score = createTestScore();
      const command = new SetMetadataCommand({ composer: 'John Doe' });

      const result = command.execute(score);

      expect(result.metadata?.composer).toBe('John Doe');
    });

    it('sets lyricist', () => {
      const score = createTestScore();
      const command = new SetMetadataCommand({ lyricist: 'Jane Doe' });

      const result = command.execute(score);

      expect(result.metadata?.lyricist).toBe('Jane Doe');
    });

    it('sets copyright', () => {
      const score = createTestScore();
      const command = new SetMetadataCommand({ copyright: '© 2024 Test' });

      const result = command.execute(score);

      expect(result.metadata?.copyright).toBe('© 2024 Test');
    });

    it('trims whitespace from values', () => {
      const score = createTestScore();
      const command = new SetMetadataCommand({ title: '  My Song  ' });

      const result = command.execute(score);

      expect(result.metadata?.title).toBe('My Song');
    });

    it('defaults empty title to Untitled', () => {
      const score = createScoreWithMetadata({ title: 'Original' });
      const command = new SetMetadataCommand({ title: '' });

      const result = command.execute(score);

      expect(result.metadata?.title).toBe('Untitled');
    });

    it('updates multiple fields at once', () => {
      const score = createTestScore();
      const command = new SetMetadataCommand({
        title: 'My Song',
        composer: 'John Doe',
        copyright: '© 2024',
      });

      const result = command.execute(score);

      expect(result.metadata?.title).toBe('My Song');
      expect(result.metadata?.composer).toBe('John Doe');
      expect(result.metadata?.copyright).toBe('© 2024');
    });

    it('preserves existing fields when updating others', () => {
      const score = createScoreWithMetadata({
        title: 'Original Title',
        composer: 'Original Composer',
      });
      const command = new SetMetadataCommand({ lyricist: 'New Lyricist' });

      const result = command.execute(score);

      expect(result.metadata?.title).toBe('Original Title');
      expect(result.metadata?.composer).toBe('Original Composer');
      expect(result.metadata?.lyricist).toBe('New Lyricist');
    });

    it('removes empty optional fields', () => {
      const score = createScoreWithMetadata({
        title: 'My Song',
        composer: 'John Doe',
      });
      const command = new SetMetadataCommand({ composer: '   ' });

      const result = command.execute(score);

      expect(result.metadata?.title).toBe('My Song');
      expect(result.metadata?.composer).toBeUndefined();
    });
  });

  describe('undo', () => {
    it('restores previous metadata', () => {
      const originalMetadata: ScoreMetadata = {
        title: 'Original Title',
        composer: 'Original Composer',
      };
      const score = createScoreWithMetadata(originalMetadata);
      const command = new SetMetadataCommand({
        title: 'New Title',
        composer: 'New Composer',
      });

      const afterExecute = command.execute(score);
      const afterUndo = command.undo(afterExecute);

      expect(afterUndo.metadata).toEqual(originalMetadata);
    });

    it('restores default when original had no metadata', () => {
      const score = createTestScore();
      const command = new SetMetadataCommand({ title: 'New Title' });

      const afterExecute = command.execute(score);
      const afterUndo = command.undo(afterExecute);

      expect(afterUndo.metadata).toEqual(DEFAULT_SCORE_METADATA);
    });
  });

  describe('type', () => {
    it('has correct type identifier', () => {
      const command = new SetMetadataCommand({});
      expect(command.type).toBe('SET_METADATA');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Layout Commands - Integration', () => {
  it('supports chained operations with undo', () => {
    let score = createTestScore();

    // Execute view mode change
    const viewModeCmd = new SetViewModeCommand('page');
    score = viewModeCmd.execute(score);
    expect(score.layout?.viewMode).toBe('page');

    // Execute layout config change
    const layoutCmd = new SetLayoutConfigCommand({ staffSize: 120 });
    score = layoutCmd.execute(score);
    expect(score.layout?.staffSize).toBe(120);
    expect(score.layout?.viewMode).toBe('page'); // Preserved

    // Execute metadata change
    const metadataCmd = new SetMetadataCommand({ title: 'New Title' });
    score = metadataCmd.execute(score);
    expect(score.metadata?.title).toBe('New Title');

    // Undo in reverse order
    score = metadataCmd.undo(score);
    expect(score.metadata?.title).toBe('Untitled');

    score = layoutCmd.undo(score);
    expect(score.layout?.staffSize).toBe(100);

    score = viewModeCmd.undo(score);
    expect(score.layout?.viewMode).toBe('scroll');
  });
});
