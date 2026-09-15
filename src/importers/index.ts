/**
 * Score importers.
 *
 * `importScoreText` is the one entry point the API (`import()`), the File menu dialog and the
 * `config.score.abc` option share: it tells ABC from the editor's own JSON, parses, validates,
 * and reports problems as warnings instead of throwing.
 *
 * @tested src/__tests__/importers/importScoreText.test.ts
 */

import type { Score } from '@/types';
import { migrateScore } from '@/types';
import { validateScore } from '@/utils/validation';
import { toDisplayMeasureNumber } from '@/utils/measureIndex';
import { parseABC } from './abcImporter';

export { parseABC } from './abcImporter';
export type { AbcImportResult, AbcImportSuccess, AbcImportFailure } from './abcImporter';

/** Text formats the importers understand. */
export type ImportFormat = 'abc' | 'json';

export type ImportTextResult =
  | { ok: true; format: ImportFormat; score: Score; warnings: string[] }
  | { ok: false; format: ImportFormat; error: string; warnings: string[] };

/** The editor's JSON export is an object literal; anything else is read as ABC. */
export const detectImportFormat = (text: string): ImportFormat =>
  text.trimStart().startsWith('{') ? 'json' : 'abc';

const importJSON = (text: string): ImportTextResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, format: 'json', error: `not valid JSON (${detail})`, warnings: [] };
  }
  const score = parsed as Score | null;
  if (
    !score ||
    typeof score !== 'object' ||
    !Array.isArray(score.staves) ||
    score.staves.length === 0
  ) {
    return { ok: false, format: 'json', error: 'missing or empty staves', warnings: [] };
  }
  const validation = validateScore(migrateScore(score));
  const warnings = validation.errors.map((err) =>
    err.measureIndex < 0
      ? `Staff ${err.staffIndex + 1}: ${err.reason}`
      : `Bar ${toDisplayMeasureNumber(err.measureIndex)} (staff ${err.staffIndex + 1}): ${err.reason}`
  );
  return { ok: true, format: 'json', score, warnings };
};

/**
 * Parse score text in `format` (auto-detected when omitted). Never throws.
 */
export const importScoreText = (
  text: string,
  format: ImportFormat = detectImportFormat(text)
): ImportTextResult => {
  if (format === 'json') return importJSON(text);
  const result = parseABC(text);
  return result.ok
    ? { ok: true, format: 'abc', score: result.score, warnings: result.warnings }
    : { ok: false, format: 'abc', error: result.error, warnings: result.warnings };
};
