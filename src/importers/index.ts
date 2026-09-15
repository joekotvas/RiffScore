/**
 * Score importers.
 *
 * `importScoreText` is the one entry point the API (`import()`), the File menu dialog and the
 * `config.score.abc` / `config.score.musicxml` options share: it tells ABC, MusicXML and the
 * editor's own JSON apart, parses, validates, and reports problems as warnings instead of
 * throwing. `importScoreData` adds the binary step in front of it — a compressed `.mxl`
 * archive, or any score file read as bytes.
 *
 * @tested src/__tests__/importers/importScoreText.test.ts
 */

import type { Score } from '@/types';
import { migrateScore } from '@/types';
import { validateScore } from '@/utils/validation';
import { toDisplayMeasureNumber } from '@/utils/measureIndex';
import { parseABC } from './abcImporter';
import { parseMusicXML } from './musicXmlImporter';
import { unpackScoreFile } from './mxl';

export { parseABC } from './abcImporter';
export type { AbcImportResult, AbcImportSuccess, AbcImportFailure } from './abcImporter';
export { parseMusicXML } from './musicXmlImporter';
export type {
  MusicXmlImportResult,
  MusicXmlImportSuccess,
  MusicXmlImportFailure,
} from './musicXmlImporter';
export { unpackScoreFile, unpackMxl, decodeScoreText, isZipArchive } from './mxl';
export type { UnpackResult } from './mxl';

/** Formats the importers understand. */
export type ImportFormat = 'abc' | 'json' | 'musicxml';

/** Score text, or the bytes of a score file (a compressed `.mxl`, or any format read as binary). */
export type ImportContent = string | ArrayBuffer | Uint8Array;

export type ImportTextResult =
  | { ok: true; format: ImportFormat; score: Score; warnings: string[] }
  | { ok: false; format: ImportFormat; error: string; warnings: string[] };

/** Human-readable name of an import format, for messages. */
export const IMPORT_FORMAT_LABELS: Record<ImportFormat, string> = {
  abc: 'ABC notation',
  json: 'JSON',
  musicxml: 'MusicXML',
};

/** The editor's JSON export is an object literal, MusicXML starts with a tag; anything else is ABC. */
export const detectImportFormat = (text: string): ImportFormat => {
  const head = text.replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('{')) return 'json';
  if (head.startsWith('<')) return 'musicxml';
  return 'abc';
};

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
  const result = format === 'musicxml' ? parseMusicXML(text) : parseABC(text);
  return result.ok
    ? { ok: true, format, score: result.score, warnings: result.warnings }
    : { ok: false, format, error: result.error, warnings: result.warnings };
};

/**
 * The bytes of `content`, whatever realm its buffer came from (an iframe's ArrayBuffer, a Node
 * Buffer under jsdom): `instanceof` is not enough, so views and buffers are recognized by shape.
 */
const toBytes = (content: unknown): Uint8Array | null => {
  if (content instanceof Uint8Array) return content;
  if (ArrayBuffer.isView(content)) {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }
  const tag = Object.prototype.toString.call(content);
  if (tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]') {
    return new Uint8Array(content as ArrayBuffer);
  }
  return null;
};

/**
 * Parse score text or a score file's bytes. A compressed MusicXML archive (`.mxl`) is unpacked
 * first; other bytes are decoded as text and handled like {@link importScoreText}. Never throws.
 */
export const importScoreData = (
  content: ImportContent,
  format?: ImportFormat
): ImportTextResult => {
  if (typeof content === 'string') return importScoreText(content, format);
  const bytes = toBytes(content);
  if (!bytes) {
    return {
      ok: false,
      format: format ?? 'musicxml',
      error: 'content must be text, an ArrayBuffer or a Uint8Array',
      warnings: [],
    };
  }
  const unpacked = unpackScoreFile(bytes);
  if (!unpacked.ok) return { ok: false, format: 'musicxml', error: unpacked.error, warnings: [] };
  return importScoreText(unpacked.text, format);
};
