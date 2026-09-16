/**
 * Compressed MusicXML support: the DEFLATE decoder (against Node's zlib as the oracle), ZIP
 * central-directory reading, container.xml resolution, and score-file text decoding.
 */

import fc from 'fast-check';
import { deflateRawSync } from 'zlib';
import { container as CONTAINER, utf8, zip } from '../helpers/zip';
import { inflateRaw } from '@/importers/inflate';
import {
  decodeScoreText,
  isZipArchive,
  readZipEntries,
  unpackMxl,
  unpackScoreFile,
} from '@/importers/mxl';

const SCORE_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1"><measure number="1"><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>';

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

  it('works without TextDecoder and replaces invalid UTF-8 bytes instead of throwing', () => {
    const original = globalThis.TextDecoder;
    // @ts-expect-error — simulate an environment without TextDecoder
    delete globalThis.TextDecoder;
    try {
      expect(decodeScoreText(utf8(sample))).toBe(sample);
      expect(decodeScoreText(new Uint8Array([0x61, 0xff, 0x62, 0xc3]))).toBe('a\ufffdb\ufffd');
      // Beyond U+10FFFF (F4 90…, F5–F7 leads) and encoded surrogates are not characters.
      expect(decodeScoreText(new Uint8Array([0x3c, 0xf4, 0x90, 0x80, 0x80, 0x3e]))).toMatch(
        /^<\ufffd/
      );
      expect(decodeScoreText(new Uint8Array([0xf5, 0x80, 0x80, 0x80]))).toMatch(/^\ufffd/);
      expect(decodeScoreText(new Uint8Array([0xed, 0xa0, 0x80]))).toMatch(/^\ufffd/);
      expect(() => unpackScoreFile(new Uint8Array([0xf7, 0xbf, 0xbf, 0xbf]))).not.toThrow();
    } finally {
      globalThis.TextDecoder = original;
    }
  });

  it('uses the platform decoder for UTF-16 and Windows-1252 when there is one', () => {
    const original = globalThis.TextDecoder;
    // jsdom has no TextDecoder; borrow Node's to exercise the platform path.
    globalThis.TextDecoder = require('util').TextDecoder;
    try {
      const le = new Uint8Array(
        Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(sample, 'utf16le')])
      );
      expect(decodeScoreText(le)).toBe(sample);
      // What windows-1252 decodes to depends on the platform's ICU data (small-ICU Node reads it
      // as Latin-1), so the assertion is that the platform decoder's own answer is used, and the
      // manual Latin-1 mapping only where the label is unknown.
      const latin = '<?xml version="1.0" encoding="windows-1252"?><t>Fr\u00e8re \u20ac</t>';
      const bytes = new Uint8Array(Buffer.from(latin.replace('\u20ac', '\x80'), 'latin1'));
      let platform: string | null = null;
      try {
        platform = new TextDecoder('windows-1252').decode(bytes);
      } catch {
        platform = null;
      }
      expect(decodeScoreText(bytes)).toBe(platform ?? latin.replace('\u20ac', '\u0080'));
      expect(decodeScoreText(bytes)).toMatch(
        /^<\?xml version="1.0" encoding="windows-1252"\?><t>Fr\u00e8re /
      );
    } finally {
      globalThis.TextDecoder = original;
    }
  });
});
