/**
 * Score file unpacking: compressed MusicXML (.mxl) containers and text decoding.
 *
 * An .mxl file is a ZIP archive whose `META-INF/container.xml` names the score inside it. This
 * module reads the archive's central directory, inflates the entry (see inflate.ts) and decodes
 * it to text; plain files are decoded straight from their bytes, honouring a byte-order mark and
 * the XML declaration's `encoding`. Nothing here depends on the browser: it runs under Node and
 * jsdom too.
 *
 * @tested src/__tests__/importers/mxl.test.ts
 */

import { inflateRaw } from './inflate';
import { parseXml, xmlChild, xmlChildren } from './xml';

// ============================================================================
// Text decoding
// ============================================================================

const utf8Decode = (bytes: Uint8Array): string => {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    let code = b0;
    let extra = 0;
    if (b0 >= 0x80) {
      if ((b0 & 0xe0) === 0xc0) {
        code = b0 & 0x1f;
        extra = 1;
      } else if ((b0 & 0xf0) === 0xe0) {
        code = b0 & 0x0f;
        extra = 2;
      } else if ((b0 & 0xf8) === 0xf0) {
        code = b0 & 0x07;
        extra = 3;
      } else {
        out += '\ufffd';
        i += 1;
        continue;
      }
    }
    let valid = i + extra < bytes.length;
    for (let k = 1; k <= extra && valid; k++) {
      const b = bytes[i + k];
      if ((b & 0xc0) !== 0x80) valid = false;
      else code = (code << 6) | (b & 0x3f);
    }
    if (!valid) {
      out += '\ufffd';
      i += 1;
      continue;
    }
    out += String.fromCodePoint(code);
    i += extra + 1;
  }
  return out;
};

const utf16Decode = (bytes: Uint8Array, littleEndian: boolean): string => {
  const units: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    units.push(littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
  }
  let out = '';
  for (let i = 0; i < units.length; i += 8192) {
    out += String.fromCharCode(...units.slice(i, i + 8192));
  }
  return out;
};

const latin1Decode = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return out;
};

/** The `encoding="…"` of an XML declaration at the start of `bytes` (ASCII scan), lower-cased. */
const declaredEncoding = (bytes: Uint8Array): string | null => {
  const head = latin1Decode(bytes.subarray(0, Math.min(bytes.length, 200)));
  const m = head.match(/^\s*<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i);
  return m ? m[1].toLowerCase() : null;
};

/**
 * Decode a score file's bytes to text: UTF-16 with a byte-order mark, an XML declaration's
 * ISO-8859-1 / Windows-1252 (read as Latin-1), else UTF-8 (a BOM is dropped).
 */
export const decodeScoreText = (bytes: Uint8Array): string => {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return utf16Decode(bytes.subarray(2), true);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return utf16Decode(bytes.subarray(2), false);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
  }
  const encoding = declaredEncoding(bytes);
  if (encoding && /^(iso-8859-1|latin-?1|windows-1252|cp1252|us-ascii|ascii)$/.test(encoding)) {
    return latin1Decode(bytes);
  }
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      // fall through to the manual decoder
    }
  }
  return utf8Decode(bytes);
};

// ============================================================================
// ZIP reading
// ============================================================================

export interface ZipEntry {
  name: string;
  /** Decompress the entry (throws on an unsupported method or corrupt data). */
  read: () => Uint8Array;
}

const u16 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number): number =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** Whether `bytes` start with a ZIP local-file-header signature ("PK\3\4"). */
export const isZipArchive = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;

/**
 * List the entries of a ZIP archive from its central directory. Only the stored and deflated
 * methods are supported (the only ones .mxl writers use); ZIP64 archives are not.
 */
export const readZipEntries = (bytes: Uint8Array): ZipEntry[] => {
  // End-of-central-directory record: signature, then (at +10) entry count, (+12) directory
  // size, (+16) directory offset, (+20) comment length. Scan back over a possible comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('ZIP central directory not found');
  const entryCount = u16(bytes, eocd + 10);
  const directoryOffset = u32(bytes, eocd + 16);

  const entries: ZipEntry[] = [];
  let at = directoryOffset;
  for (let i = 0; i < entryCount; i++) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) {
      throw new Error('Corrupt ZIP central directory');
    }
    const method = u16(bytes, at + 10);
    const compressedSize = u32(bytes, at + 20);
    const uncompressedSize = u32(bytes, at + 24);
    const nameLength = u16(bytes, at + 28);
    const extraLength = u16(bytes, at + 30);
    const commentLength = u16(bytes, at + 32);
    const localOffset = u32(bytes, at + 42);
    const name = utf8Decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;

    entries.push({
      name,
      read: () => {
        if (localOffset + 30 > bytes.length || u32(bytes, localOffset) !== 0x04034b50) {
          throw new Error(`Corrupt ZIP entry "${name}"`);
        }
        const dataStart =
          localOffset + 30 + u16(bytes, localOffset + 26) + u16(bytes, localOffset + 28);
        const data = bytes.subarray(dataStart, dataStart + compressedSize);
        if (data.length < compressedSize) throw new Error(`Truncated ZIP entry "${name}"`);
        if (method === 0) return data;
        if (method === 8) return inflateRaw(data, uncompressedSize);
        throw new Error(`Unsupported ZIP compression method ${method} for "${name}"`);
      },
    });
  }
  return entries;
};

// ============================================================================
// MusicXML containers
// ============================================================================

export type UnpackResult = { ok: true; text: string } | { ok: false; error: string };

const normalizePath = (p: string): string => p.replace(/^\.?\//, '');

/** Unpack a compressed MusicXML (.mxl) archive to the text of its root score file. */
export const unpackMxl = (bytes: Uint8Array): UnpackResult => {
  let entries: ZipEntry[];
  try {
    entries = readZipEntries(bytes);
  } catch (e) {
    return { ok: false, error: `not a readable .mxl archive (${(e as Error).message})` };
  }
  const byName = new Map(entries.map((e) => [normalizePath(e.name), e]));

  // META-INF/container.xml names the score; fall back to the first score-looking entry.
  let scoreEntry: ZipEntry | undefined;
  const container = byName.get('META-INF/container.xml');
  if (container) {
    try {
      const parsed = parseXml(decodeScoreText(container.read()));
      if (parsed.ok) {
        const rootfiles = xmlChildren(xmlChild(parsed.root, 'rootfiles'), 'rootfile');
        const preferred =
          rootfiles.find((r) => /musicxml/i.test(r.attrs['media-type'] ?? 'musicxml')) ??
          rootfiles[0];
        const path = preferred?.attrs['full-path'];
        if (path) scoreEntry = byName.get(normalizePath(path));
      }
    } catch {
      // A broken container listing is not fatal: look for the score directly.
    }
  }
  scoreEntry ??= entries.find(
    (e) => /\.(musicxml|xml)$/i.test(e.name) && !/^META-INF\//i.test(normalizePath(e.name))
  );
  if (!scoreEntry) return { ok: false, error: 'the .mxl archive contains no MusicXML score' };

  try {
    return { ok: true, text: decodeScoreText(scoreEntry.read()) };
  } catch (e) {
    return {
      ok: false,
      error: `could not decompress "${scoreEntry.name}" (${(e as Error).message})`,
    };
  }
};

/**
 * The text of a score file given its bytes: an .mxl archive is unpacked, anything else is
 * decoded as text (ABC, JSON or uncompressed MusicXML).
 */
export const unpackScoreFile = (bytes: Uint8Array): UnpackResult =>
  isZipArchive(bytes) ? unpackMxl(bytes) : { ok: true, text: decodeScoreText(bytes) };
