/**
 * A minimal ZIP writer for tests: local headers, a central directory and an end record, with
 * stored or deflated entries. `mxl(xml)` wraps a MusicXML document the way notation apps do —
 * a `META-INF/container.xml` naming the score, then the score itself.
 */

import { deflateRawSync } from 'zlib';

export interface ZipFile {
  name: string;
  data: Uint8Array;
  /** 0 = stored, 8 = deflated (default), anything else to test an unsupported method. */
  method?: number;
}

const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];

export const zip = (files: ZipFile[], comment = ''): Uint8Array<ArrayBuffer> => {
  const out: number[] = [];
  const central: number[] = [];
  for (const f of files) {
    const name = [...Buffer.from(f.name, 'utf8')];
    const method = f.method ?? 8;
    const packed = method === 8 ? new Uint8Array(deflateRawSync(f.data)) : f.data;
    const offset = out.length;
    const common = [
      ...u16(20),
      ...u16(0),
      ...u16(method),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(packed.length),
      ...u32(f.data.length),
      ...u16(name.length),
    ];
    out.push(...u32(0x04034b50), ...common, ...u16(0), ...name, ...packed);
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...common,
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...name
    );
  }
  const commentBytes = [...Buffer.from(comment, 'utf8')];
  const directoryOffset = out.length;
  out.push(...central);
  out.push(
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(central.length),
    ...u32(directoryOffset),
    ...u16(commentBytes.length),
    ...commentBytes
  );
  return new Uint8Array(out);
};

export const utf8 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'utf8'));

export const container = (path: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="${path}" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`;

/** A compressed MusicXML archive holding `xml` as `score.xml`, listed in its container. */
export const mxl = (xml: string): Uint8Array<ArrayBuffer> =>
  zip([
    { name: 'META-INF/container.xml', data: utf8(container('score.xml')), method: 0 },
    { name: 'score.xml', data: utf8(xml) },
  ]);
