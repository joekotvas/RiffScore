/**
 * MetadataService - Score Metadata Validation and Normalization
 *
 * Provides functions for validating and normalizing score metadata.
 * Follows the structured feedback pattern (ADR-011) - never throws,
 * returns result objects.
 *
 * All functions are pure and stateless.
 */

import type { ScoreMetadata } from '@/types';
import { DEFAULT_SCORE_METADATA } from '@/config';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum length constraints for metadata fields */
export const METADATA_LIMITS = {
  title: 200,
  composer: 100,
  lyricist: 100,
  copyright: 300,
} as const;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Field-level validation errors.
 */
export interface MetadataFieldErrors {
  title?: string;
  composer?: string;
  lyricist?: string;
  copyright?: string;
}

/**
 * Result of metadata validation.
 * Follows structured feedback pattern (ADR-011).
 */
export interface MetadataValidationResult {
  /** Whether validation passed */
  ok: boolean;
  /** Field-specific error messages (empty if ok is true) */
  errors: MetadataFieldErrors;
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates a single string field against length constraints.
 *
 * @param value - The value to validate
 * @param maxLength - Maximum allowed length
 * @param fieldName - Human-readable field name for error messages
 * @param required - Whether the field is required
 * @returns Error message or undefined if valid
 */
const validateStringField = (
  value: string | undefined,
  maxLength: number,
  fieldName: string,
  required: boolean = false
): string | undefined => {
  // Check required constraint
  if (required) {
    if (value === undefined || value === null) {
      return `${fieldName} is required`;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return `${fieldName} cannot be empty`;
    }
  }

  // If optional and empty/undefined, it's valid
  if (value === undefined || value === null || value.length === 0) {
    return undefined;
  }

  // Check length constraint
  if (value.length > maxLength) {
    return `${fieldName} must be ${maxLength} characters or less`;
  }

  return undefined;
};

/**
 * Validates score metadata.
 *
 * Validation rules:
 * - Title: required, max 200 characters
 * - Composer: optional, max 100 characters
 * - Lyricist: optional, max 100 characters
 * - Copyright: optional, max 300 characters
 *
 * @param metadata - Metadata to validate (can be partial)
 * @returns Validation result with ok flag and errors object
 */
export const validateMetadata = (metadata: Partial<ScoreMetadata>): MetadataValidationResult => {
  const errors: MetadataFieldErrors = {};

  // Validate title (required)
  const titleError = validateStringField(metadata.title, METADATA_LIMITS.title, 'Title', true);
  if (titleError) {
    errors.title = titleError;
  }

  // Validate composer (optional)
  const composerError = validateStringField(
    metadata.composer,
    METADATA_LIMITS.composer,
    'Composer',
    false
  );
  if (composerError) {
    errors.composer = composerError;
  }

  // Validate lyricist (optional)
  const lyricistError = validateStringField(
    metadata.lyricist,
    METADATA_LIMITS.lyricist,
    'Lyricist',
    false
  );
  if (lyricistError) {
    errors.lyricist = lyricistError;
  }

  // Validate copyright (optional)
  const copyrightError = validateStringField(
    metadata.copyright,
    METADATA_LIMITS.copyright,
    'Copyright',
    false
  );
  if (copyrightError) {
    errors.copyright = copyrightError;
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
  };
};

// =============================================================================
// NORMALIZATION FUNCTIONS
// =============================================================================

/**
 * Trims whitespace from a string value.
 *
 * @param value - Value to trim
 * @returns Trimmed string or undefined
 */
const trimString = (value: string | undefined): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Normalizes score metadata.
 *
 * Normalization rules:
 * - Trims whitespace from all string fields
 * - Defaults title to "Untitled" if empty
 * - Removes empty optional fields
 *
 * @param metadata - Metadata to normalize (can be partial)
 * @returns Normalized ScoreMetadata with guaranteed title
 */
export const normalizeMetadata = (metadata: Partial<ScoreMetadata>): ScoreMetadata => {
  const trimmedTitle = trimString(metadata.title);
  const trimmedComposer = trimString(metadata.composer);
  const trimmedLyricist = trimString(metadata.lyricist);
  const trimmedCopyright = trimString(metadata.copyright);

  const normalized: ScoreMetadata = {
    title: trimmedTitle ?? DEFAULT_SCORE_METADATA.title,
  };

  // Only include optional fields if they have values
  if (trimmedComposer) {
    normalized.composer = trimmedComposer;
  }
  if (trimmedLyricist) {
    normalized.lyricist = trimmedLyricist;
  }
  if (trimmedCopyright) {
    normalized.copyright = trimmedCopyright;
  }

  return normalized;
};

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Creates a new ScoreMetadata with defaults.
 *
 * @param overrides - Optional field overrides
 * @returns Normalized ScoreMetadata
 */
export const createMetadata = (overrides: Partial<ScoreMetadata> = {}): ScoreMetadata => {
  return normalizeMetadata({
    ...DEFAULT_SCORE_METADATA,
    ...overrides,
  });
};

/**
 * Checks if metadata has any content beyond the default title.
 *
 * @param metadata - Metadata to check
 * @returns True if metadata has meaningful content
 */
export const hasMetadataContent = (metadata: ScoreMetadata): boolean => {
  return (
    metadata.title !== DEFAULT_SCORE_METADATA.title ||
    !!metadata.composer ||
    !!metadata.lyricist ||
    !!metadata.copyright
  );
};
