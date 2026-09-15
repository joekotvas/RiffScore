/**
 * Compressed MusicXML support: the DEFLATE decoder (against Node's zlib as the oracle), ZIP
 * central-directory reading, container.xml resolution, and score-file text decoding.
 */

import fc from 'fast-check';
import { deflateRawSync } from 'zlib';
import { inflateRaw } from '@/importers/inflate';
import {
  decodeScoreText,
  isZipArchive,
  readZipEntries,
  unpackMxl,
  unpackScoreFile,
} from '@/importers/mxl';

// ---------------------------------------------------------------------------
// A minimal ZIP writer (local headers + central directory + end record)
// ---------------------------------------------------------------------------

interface ZipFile {
  name: string;
  data: Uint8Array;
  method?: 0 | 8 | 12;
}

const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];

const zip = (files: ZipFile[], comment = ''): Uint8Array => {
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

const utf8 = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));

const SCORE_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1"><measure number="1"><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>';
const CONTAINER = (path: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="${path}" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`;

// ---------------------------------------------------------------------------
// inflate
// ---------------------------------------------------------------------------

describe('inflateRaw', () => {
  it.each([0, 1, 6, 9])('inverts zlib deflateRaw at level %d for random data', (level) => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4000 }), (data) => {
        const packed = new Uint8Array(deflateRawSync(data, { level }));
        expect(Buffer.from(inflateRaw(packed)).equals(Buffer.from(data))).toBe(true);
      }),
      { numRuns: 60 }
    );
  });

  it('handles highly repetitive data (long matches), large inputs and empty input', () => {
    const repetitive = utf8('<note><pitch><step>C</step></pitch></note>'.repeat(5000));
    expect(
      Buffer.from(inflateRaw(new Uint8Array(deflateRawSync(repetitive)))).equals(
        Buffer.from(repetitive)
      )
    ).toBe(true);
    const big = new Uint8Array(300_000).map((_, i) => (i * 7919 + (i >> 5)) & 0xff);
    expect(
      Buffer.from(inflateRaw(new Uint8Array(deflateRawSync(big)), big.length)).equals(
        Buffer.from(big)
      )
    ).toBe(true);
    expect(inflateRaw(new Uint8Array(deflateRawSync(new Uint8Array(0))))).toHaveLength(0);
  });

  it('rejects corrupt streams instead of looping or returning garbage silently', () => {
    expect(() => inflateRaw(new Uint8Array([0x07]))).toThrow(/Invalid block type/);
    expect(() => inflateRaw(new Uint8Array([0x01, 0x05, 0x00, 0x00, 0x00]))).toThrow(
      /length check/
    );
    expect(() => inflateRaw(new Uint8Array([]))).toThrow(/Unexpected end/);
    const good = new Uint8Array(deflateRawSync(utf8('hello hello hello hello')));
    expect(() => inflateRaw(good.subarray(0, good.length - 3))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ZIP + .mxl
// ---------------------------------------------------------------------------

describe('readZipEntries / unpackMxl', () => {
  it('lists entries from the central directory and inflates deflated and stored data', () => {
    const bytes = zip(
      [
        { name: 'META-INF/container.xml', data: utf8(CONTAINER('score.xml')), method: 0 },
        { name: 'score.xml', data: utf8(SCORE_XML) },
      ],
      'a comment'
    );
    expect(isZipArchive(bytes)).toBe(true);
    const entries = readZipEntries(bytes);
    expect(entries.map((e) => e.name)).toEqual(['META-INF/container.xml', 'score.xml']);
    expect(Buffer.from(entries[1].read()).toString('utf8')).toBe(SCORE_XML);
    expect(unpackMxl(bytes)).toEqual({ ok: true, text: SCORE_XML });
  });

  it('follows container.xml to a score in a subfolder and prefers the MusicXML rootfile', () => {
    const container = `<container><rootfiles><rootfile full-path="thumb.png" media-type="image/png"/><rootfile full-path="./sub/tune.musicxml"/></rootfiles></container>`;
    const bytes = zip([
      { name: 'thumb.png', data: new Uint8Array([1, 2, 3]) },
      { name: 'sub/tune.musicxml', data: utf8(SCORE_XML) },
      { name: 'META-INF/container.xml', data: utf8(container) },
    ]);
    expect(unpackMxl(bytes)).toEqual({ ok: true, text: SCORE_XML });
  });

  it('falls back to the first .xml/.musicxml entry outside META-INF when the container is missing or broken', () => {
    expect(unpackMxl(zip([{ name: 'a/b/c.musicxml', data: utf8(SCORE_XML) }]))).toEqual({
      ok: true,
      text: SCORE_XML,
    });
    const broken = zip([
      {
        name: 'META-INF/container.xml',
        data: utf8('<container><rootfiles><rootfile full-path="nope.xml"/>'),
      },
      { name: 'score.xml', data: utf8(SCORE_XML) },
    ]);
    expect(unpackMxl(broken)).toEqual({ ok: true, text: SCORE_XML });
  });

  it('explains archives it cannot use', () => {
    expect(
      unpackMxl(zip([{ name: 'META-INF/container.xml', data: utf8(CONTAINER('score.xml')) }]))
    ).toMatchObject({
      ok: false,
      error: /contains no MusicXML score/,
    });
    expect(unpackMxl(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]))).toMatchObject({
      ok: false,
      error: /central directory not found/,
    });
    expect(
      unpackMxl(zip([{ name: 'score.xml', data: utf8(SCORE_XML), method: 12 }]))
    ).toMatchObject({
      ok: false,
      error: /Unsupported ZIP compression method 12/,
    });
  });

  it('unpackScoreFile passes plain text through and unzips archives', () => {
    expect(unpackScoreFile(utf8('X:1\nK:C\nC|'))).toEqual({ ok: true, text: 'X:1\nK:C\nC|' });
    expect(unpackScoreFile(zip([{ name: 'score.xml', data: utf8(SCORE_XML) }]))).toEqual({
      ok: true,
      text: SCORE_XML,
    });
  });
});

// ---------------------------------------------------------------------------
// Text decoding
// ---------------------------------------------------------------------------

describe('decodeScoreText', () => {
  const sample = '<t>Frère — 🎵 ü</t>';

  it('decodes UTF-8 with and without a byte-order mark', () => {
    expect(decodeScoreText(utf8(sample))).toBe(sample);
    expect(decodeScoreText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(sample)]))).toBe(sample);
  });

  it('decodes UTF-16 by its byte-order mark', () => {
    const le = new Uint8Array(
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(sample, 'utf16le')])
    );
    expect(decodeScoreText(le)).toBe(sample);
    const beBody = Buffer.from(sample, 'utf16le').swap16();
    const be = new Uint8Array(Buffer.concat([Buffer.from([0xfe, 0xff]), beBody]));
    expect(decodeScoreText(be)).toBe(sample);
  });

  it('honours a Latin-1 XML declaration', () => {
    const text = '<?xml version="1.0" encoding="ISO-8859-1"?><t>Frère</t>';
    expect(decodeScoreText(new Uint8Array(Buffer.from(text, 'latin1')))).toBe(text);
  });

  it('works without TextDecoder and replaces invalid UTF-8 bytes', () => {
    const original = globalThis.TextDecoder;
    // @ts-expect-error — simulate an environment without TextDecoder
    delete globalThis.TextDecoder;
    try {
      expect(decodeScoreText(utf8(sample))).toBe(sample);
      expect(decodeScoreText(new Uint8Array([0x61, 0xff, 0x62, 0xc3]))).toBe('a�b�');
    } finally {
      globalThis.TextDecoder = original;
    }
  });
});
