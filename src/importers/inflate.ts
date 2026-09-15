/**
 * Raw DEFLATE (RFC 1951) decoder for compressed MusicXML (.mxl) containers.
 *
 * A straightforward, dependency-free port of the reference algorithm (zlib's puff.c): stored,
 * fixed-Huffman and dynamic-Huffman blocks, decoded bit by bit. MusicXML files are small enough
 * that the simple decoder is plenty fast, and it runs everywhere — browsers, Node, jsdom —
 * without `DecompressionStream`. Throws on corrupt input.
 *
 * @tested src/__tests__/importers/mxl.test.ts
 */

const MAX_BITS = 15;

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
/** Order in which code-length code lengths are transmitted in a dynamic block header. */
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman {
  /** Number of codes of each length (index = length). */
  count: Uint16Array;
  /** Symbols ordered by code. */
  symbol: Uint16Array;
}

const buildHuffman = (lengths: ArrayLike<number>, n: number): Huffman => {
  const count = new Uint16Array(MAX_BITS + 1);
  for (let i = 0; i < n; i++) count[lengths[i]] += 1;
  count[0] = 0;
  let left = 1;
  for (let len = 1; len <= MAX_BITS; len++) {
    left <<= 1;
    left -= count[len];
    if (left < 0) throw new Error('Over-subscribed Huffman code');
  }
  const offsets = new Uint16Array(MAX_BITS + 2);
  for (let len = 1; len <= MAX_BITS; len++) offsets[len + 1] = offsets[len] + count[len];
  const symbol = new Uint16Array(n);
  for (let i = 0; i < n; i++) if (lengths[i] !== 0) symbol[offsets[lengths[i]]++] = i;
  return { count, symbol };
};

const FIXED_LITERAL = (() => {
  const lengths = new Uint8Array(288);
  lengths.fill(8, 0, 144);
  lengths.fill(9, 144, 256);
  lengths.fill(7, 256, 280);
  lengths.fill(8, 280, 288);
  return buildHuffman(lengths, 288);
})();
const FIXED_DISTANCE = buildHuffman(new Uint8Array(30).fill(5), 30);

/**
 * Inflate a raw DEFLATE stream. `sizeHint` (the entry's uncompressed size, when known)
 * pre-sizes the output buffer.
 */
export const inflateRaw = (input: Uint8Array, sizeHint?: number): Uint8Array => {
  let out = new Uint8Array(Math.max(sizeHint ?? 0, input.length * 4, 1024));
  let outLen = 0;
  let pos = 0;
  let bitBuf = 0;
  let bitCnt = 0;

  const bits = (n: number): number => {
    while (bitCnt < n) {
      if (pos >= input.length) throw new Error('Unexpected end of compressed data');
      bitBuf |= input[pos++] << bitCnt;
      bitCnt += 8;
    }
    const value = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return value;
  };

  const ensure = (extra: number): void => {
    if (outLen + extra <= out.length) return;
    const grown = new Uint8Array(Math.max(out.length * 2, outLen + extra));
    grown.set(out.subarray(0, outLen));
    out = grown;
  };

  const decodeSymbol = (h: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= MAX_BITS; len++) {
      code |= bits(1);
      const count = h.count[len];
      if (code - count < first) return h.symbol[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error('Invalid Huffman code');
  };

  const inflateCodes = (literal: Huffman, distance: Huffman): void => {
    for (;;) {
      const symbol = decodeSymbol(literal);
      if (symbol < 256) {
        ensure(1);
        out[outLen++] = symbol;
        continue;
      }
      if (symbol === 256) return;
      const lengthIndex = symbol - 257;
      if (lengthIndex >= LENGTH_BASE.length) throw new Error('Invalid length code');
      const length = LENGTH_BASE[lengthIndex] + bits(LENGTH_EXTRA[lengthIndex]);
      const distIndex = decodeSymbol(distance);
      if (distIndex >= DIST_BASE.length) throw new Error('Invalid distance code');
      const dist = DIST_BASE[distIndex] + bits(DIST_EXTRA[distIndex]);
      if (dist > outLen) throw new Error('Distance too far back');
      ensure(length);
      for (let i = 0; i < length; i++) {
        out[outLen] = out[outLen - dist];
        outLen += 1;
      }
    }
  };

  let last = 0;
  do {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      // Stored block: byte-aligned length, one's complement, raw bytes.
      bitBuf = 0;
      bitCnt = 0;
      if (pos + 4 > input.length) throw new Error('Unexpected end of compressed data');
      const length = input[pos] | (input[pos + 1] << 8);
      const check = input[pos + 2] | (input[pos + 3] << 8);
      pos += 4;
      if ((length ^ 0xffff) !== check) throw new Error('Stored block length check failed');
      if (pos + length > input.length) throw new Error('Unexpected end of compressed data');
      ensure(length);
      out.set(input.subarray(pos, pos + length), outLen);
      outLen += length;
      pos += length;
    } else if (type === 1) {
      inflateCodes(FIXED_LITERAL, FIXED_DISTANCE);
    } else if (type === 2) {
      const nlen = bits(5) + 257;
      const ndist = bits(5) + 1;
      const ncode = bits(4) + 4;
      if (nlen > 286 || ndist > 30) throw new Error('Bad dynamic block header');
      const codeLengths = new Uint8Array(19);
      for (let i = 0; i < ncode; i++) codeLengths[CODE_LENGTH_ORDER[i]] = bits(3);
      const lengthCode = buildHuffman(codeLengths, 19);
      const lengths = new Uint8Array(nlen + ndist);
      let index = 0;
      while (index < nlen + ndist) {
        const symbol = decodeSymbol(lengthCode);
        if (symbol < 16) {
          lengths[index++] = symbol;
          continue;
        }
        let value = 0;
        let repeat: number;
        if (symbol === 16) {
          if (index === 0) throw new Error('Repeat with no previous length');
          value = lengths[index - 1];
          repeat = 3 + bits(2);
        } else if (symbol === 17) {
          repeat = 3 + bits(3);
        } else {
          repeat = 11 + bits(7);
        }
        if (index + repeat > nlen + ndist) throw new Error('Too many code lengths');
        while (repeat-- > 0) lengths[index++] = value;
      }
      if (lengths[256] === 0) throw new Error('Missing end-of-block code');
      inflateCodes(
        buildHuffman(lengths.subarray(0, nlen), nlen),
        buildHuffman(lengths.subarray(nlen), ndist)
      );
    } else {
      throw new Error('Invalid block type');
    }
  } while (!last);

  return out.subarray(0, outLen);
};
