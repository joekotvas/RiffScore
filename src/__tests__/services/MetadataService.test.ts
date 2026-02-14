/**
 * MetadataService Tests
 *
 * Tests for score metadata validation, normalization, and utility functions.
 * Follows structured feedback pattern (ADR-011) - all functions return result objects.
 */

import {
  validateMetadata,
  normalizeMetadata,
  createMetadata,
  hasMetadataContent,
  METADATA_LIMITS,
} from '@/services/MetadataService';
import { DEFAULT_SCORE_METADATA } from '@/config';
import type { ScoreMetadata } from '@/types';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Creates a string of specified length for testing limits.
 */
const createStringOfLength = (length: number): string => 'a'.repeat(length);

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe('MetadataService - Validation', () => {
  describe('validateMetadata', () => {
    describe('valid inputs', () => {
      it('validates minimal metadata with just title', () => {
        const result = validateMetadata({ title: 'My Song' });
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual({});
      });

      it('validates complete metadata', () => {
        const result = validateMetadata({
          title: 'My Song',
          composer: 'John Doe',
          lyricist: 'Jane Doe',
          copyright: '© 2024 Test',
        });
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual({});
      });

      it('validates metadata at exact character limits', () => {
        const result = validateMetadata({
          title: createStringOfLength(METADATA_LIMITS.title),
          composer: createStringOfLength(METADATA_LIMITS.composer),
          lyricist: createStringOfLength(METADATA_LIMITS.lyricist),
          copyright: createStringOfLength(METADATA_LIMITS.copyright),
        });
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual({});
      });

      it('allows empty optional fields', () => {
        const result = validateMetadata({
          title: 'My Song',
          composer: '',
          lyricist: '',
          copyright: '',
        });
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual({});
      });

      it('allows undefined optional fields', () => {
        const result = validateMetadata({
          title: 'My Song',
          composer: undefined,
          lyricist: undefined,
          copyright: undefined,
        });
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual({});
      });
    });

    describe('invalid inputs', () => {
      describe('title validation', () => {
        it('fails when title is missing', () => {
          const result = validateMetadata({});
          expect(result.ok).toBe(false);
          expect(result.errors.title).toBeDefined();
          expect(result.errors.title).toContain('required');
        });

        it('fails when title is empty', () => {
          const result = validateMetadata({ title: '' });
          expect(result.ok).toBe(false);
          expect(result.errors.title).toBeDefined();
          expect(result.errors.title).toContain('empty');
        });

        it('fails when title is only whitespace', () => {
          const result = validateMetadata({ title: '   ' });
          expect(result.ok).toBe(false);
          expect(result.errors.title).toBeDefined();
        });

        it('fails when title exceeds limit', () => {
          const result = validateMetadata({
            title: createStringOfLength(METADATA_LIMITS.title + 1),
          });
          expect(result.ok).toBe(false);
          expect(result.errors.title).toBeDefined();
          expect(result.errors.title).toContain('200');
        });
      });

      describe('composer validation', () => {
        it('fails when composer exceeds limit', () => {
          const result = validateMetadata({
            title: 'My Song',
            composer: createStringOfLength(METADATA_LIMITS.composer + 1),
          });
          expect(result.ok).toBe(false);
          expect(result.errors.composer).toBeDefined();
          expect(result.errors.composer).toContain('100');
        });
      });

      describe('lyricist validation', () => {
        it('fails when lyricist exceeds limit', () => {
          const result = validateMetadata({
            title: 'My Song',
            lyricist: createStringOfLength(METADATA_LIMITS.lyricist + 1),
          });
          expect(result.ok).toBe(false);
          expect(result.errors.lyricist).toBeDefined();
          expect(result.errors.lyricist).toContain('100');
        });
      });

      describe('copyright validation', () => {
        it('fails when copyright exceeds limit', () => {
          const result = validateMetadata({
            title: 'My Song',
            copyright: createStringOfLength(METADATA_LIMITS.copyright + 1),
          });
          expect(result.ok).toBe(false);
          expect(result.errors.copyright).toBeDefined();
          expect(result.errors.copyright).toContain('300');
        });
      });

      describe('multiple errors', () => {
        it('collects errors from multiple fields', () => {
          const result = validateMetadata({
            title: '', // Invalid: empty
            composer: createStringOfLength(METADATA_LIMITS.composer + 1), // Invalid: too long
          });
          expect(result.ok).toBe(false);
          expect(result.errors.title).toBeDefined();
          expect(result.errors.composer).toBeDefined();
        });
      });
    });
  });
});

// ============================================================================
// NORMALIZATION TESTS
// ============================================================================

describe('MetadataService - Normalization', () => {
  describe('normalizeMetadata', () => {
    describe('whitespace trimming', () => {
      it('trims leading whitespace from title', () => {
        const result = normalizeMetadata({ title: '  My Song' });
        expect(result.title).toBe('My Song');
      });

      it('trims trailing whitespace from title', () => {
        const result = normalizeMetadata({ title: 'My Song  ' });
        expect(result.title).toBe('My Song');
      });

      it('trims whitespace from all fields', () => {
        const result = normalizeMetadata({
          title: '  My Song  ',
          composer: '  John Doe  ',
          lyricist: '  Jane Doe  ',
          copyright: '  © 2024  ',
        });
        expect(result.title).toBe('My Song');
        expect(result.composer).toBe('John Doe');
        expect(result.lyricist).toBe('Jane Doe');
        expect(result.copyright).toBe('© 2024');
      });
    });

    describe('default values', () => {
      it('defaults title to "Untitled" when missing', () => {
        const result = normalizeMetadata({});
        expect(result.title).toBe(DEFAULT_SCORE_METADATA.title);
      });

      it('defaults title to "Untitled" when empty', () => {
        const result = normalizeMetadata({ title: '' });
        expect(result.title).toBe(DEFAULT_SCORE_METADATA.title);
      });

      it('defaults title to "Untitled" when only whitespace', () => {
        const result = normalizeMetadata({ title: '   ' });
        expect(result.title).toBe(DEFAULT_SCORE_METADATA.title);
      });
    });

    describe('optional field handling', () => {
      it('excludes empty optional fields from result', () => {
        const result = normalizeMetadata({
          title: 'My Song',
          composer: '',
        });
        expect(result.title).toBe('My Song');
        expect(result).not.toHaveProperty('composer');
      });

      it('excludes whitespace-only optional fields from result', () => {
        const result = normalizeMetadata({
          title: 'My Song',
          composer: '   ',
        });
        expect(result).not.toHaveProperty('composer');
      });

      it('excludes undefined optional fields from result', () => {
        const result = normalizeMetadata({
          title: 'My Song',
          composer: undefined,
        });
        expect(result).not.toHaveProperty('composer');
      });

      it('includes non-empty optional fields in result', () => {
        const result = normalizeMetadata({
          title: 'My Song',
          composer: 'John Doe',
        });
        expect(result.composer).toBe('John Doe');
      });
    });

    describe('return type guarantee', () => {
      it('always returns title field', () => {
        const result = normalizeMetadata({});
        expect(result.title).toBeDefined();
        expect(typeof result.title).toBe('string');
        expect(result.title.length).toBeGreaterThan(0);
      });
    });
  });
});

// ============================================================================
// CONVENIENCE FUNCTION TESTS
// ============================================================================

describe('MetadataService - Convenience Functions', () => {
  describe('createMetadata', () => {
    it('creates default metadata when called with no arguments', () => {
      const result = createMetadata();
      expect(result.title).toBe(DEFAULT_SCORE_METADATA.title);
    });

    it('applies overrides to default values', () => {
      const result = createMetadata({ title: 'Custom Title' });
      expect(result.title).toBe('Custom Title');
    });

    it('normalizes provided values', () => {
      const result = createMetadata({ title: '  Trimmed  ' });
      expect(result.title).toBe('Trimmed');
    });

    it('includes all provided fields', () => {
      const result = createMetadata({
        title: 'My Song',
        composer: 'Test Composer',
        lyricist: 'Test Lyricist',
        copyright: '© 2024',
      });
      expect(result.title).toBe('My Song');
      expect(result.composer).toBe('Test Composer');
      expect(result.lyricist).toBe('Test Lyricist');
      expect(result.copyright).toBe('© 2024');
    });
  });

  describe('hasMetadataContent', () => {
    it('returns false for default metadata', () => {
      const metadata: ScoreMetadata = { title: 'Untitled' };
      expect(hasMetadataContent(metadata)).toBe(false);
    });

    it('returns true for non-default title', () => {
      const metadata: ScoreMetadata = { title: 'My Song' };
      expect(hasMetadataContent(metadata)).toBe(true);
    });

    it('returns true when composer is present', () => {
      const metadata: ScoreMetadata = { title: 'Untitled', composer: 'John' };
      expect(hasMetadataContent(metadata)).toBe(true);
    });

    it('returns true when lyricist is present', () => {
      const metadata: ScoreMetadata = { title: 'Untitled', lyricist: 'Jane' };
      expect(hasMetadataContent(metadata)).toBe(true);
    });

    it('returns true when copyright is present', () => {
      const metadata: ScoreMetadata = { title: 'Untitled', copyright: '© 2024' };
      expect(hasMetadataContent(metadata)).toBe(true);
    });

    it('returns true when multiple fields are present', () => {
      const metadata: ScoreMetadata = {
        title: 'My Song',
        composer: 'John',
        lyricist: 'Jane',
        copyright: '© 2024',
      };
      expect(hasMetadataContent(metadata)).toBe(true);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('MetadataService - Edge Cases', () => {
  describe('unicode handling', () => {
    it('handles unicode characters in title', () => {
      const result = normalizeMetadata({ title: 'Für Elise' });
      expect(result.title).toBe('Für Elise');
    });

    it('handles emoji in fields', () => {
      const result = normalizeMetadata({ title: '🎵 Music 🎵' });
      expect(result.title).toBe('🎵 Music 🎵');
    });

    it('handles CJK characters', () => {
      const result = normalizeMetadata({ title: '音楽' });
      expect(result.title).toBe('音楽');
    });

    it('validates unicode length correctly', () => {
      // 201 characters including unicode
      const longUnicodeTitle = 'Ü'.repeat(201);
      const result = validateMetadata({ title: longUnicodeTitle });
      expect(result.ok).toBe(false);
    });
  });

  describe('special characters', () => {
    it('handles newlines by trimming', () => {
      const result = normalizeMetadata({ title: 'Line1\nLine2' });
      // The title should preserve internal newlines but trim outer whitespace
      expect(result.title).toBe('Line1\nLine2');
    });

    it('handles tabs by trimming', () => {
      const result = normalizeMetadata({ title: '\tTabbed\t' });
      expect(result.title).toBe('Tabbed');
    });

    it('handles mixed whitespace', () => {
      const result = normalizeMetadata({ title: ' \t My Song \n ' });
      expect(result.title).toBe('My Song');
    });
  });

  describe('null-like values', () => {
    it('handles null-ish string "null"', () => {
      const result = normalizeMetadata({ title: 'null' });
      expect(result.title).toBe('null');
    });

    it('handles undefined-ish string "undefined"', () => {
      const result = normalizeMetadata({ title: 'undefined' });
      expect(result.title).toBe('undefined');
    });
  });

  describe('exact boundary values', () => {
    it('accepts title at exactly 200 characters', () => {
      const title = createStringOfLength(200);
      const result = validateMetadata({ title });
      expect(result.ok).toBe(true);
    });

    it('rejects title at 201 characters', () => {
      const title = createStringOfLength(201);
      const result = validateMetadata({ title });
      expect(result.ok).toBe(false);
    });

    it('accepts single character title', () => {
      const result = validateMetadata({ title: 'X' });
      expect(result.ok).toBe(true);
    });
  });
});

// ============================================================================
// METADATA_LIMITS CONSTANT TESTS
// ============================================================================

describe('MetadataService - Constants', () => {
  describe('METADATA_LIMITS', () => {
    it('has correct title limit', () => {
      expect(METADATA_LIMITS.title).toBe(200);
    });

    it('has correct composer limit', () => {
      expect(METADATA_LIMITS.composer).toBe(100);
    });

    it('has correct lyricist limit', () => {
      expect(METADATA_LIMITS.lyricist).toBe(100);
    });

    it('has correct copyright limit', () => {
      expect(METADATA_LIMITS.copyright).toBe(300);
    });
  });
});
