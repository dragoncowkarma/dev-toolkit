import { describe, expect, it } from 'vitest';
import { inspectBrotliHeader } from './brotli-header-inspector.utils.js';

function packedBits(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((bit, index) => {
    bytes[index >> 3] |= bit << (index & 7);
  });
  return bytes;
}

function bits(value, count) {
  return Array.from({ length: count }, (_, index) => (value >> index) & 1);
}

describe('inspectBrotliHeader', () => {
  it('reads the seven-bit WBITS encoding for a small-window last empty stream', () => {
    const result = inspectBrotliHeader(packedBits([1, 0, 0, 0, 0, 1, 0, 1, 1]));

    expect(result).toMatchObject({
      windowBits: 10,
      windowSize: 1008,
      firstMetaBlock: { isLast: true, isLastEmpty: true },
    });
  });

  it('reads a large-window WBITS encoding', () => {
    const result = inspectBrotliHeader(packedBits([1, ...bits(7, 3), 1, 1]));

    expect(result.windowBits).toBe(24);
    expect(result.windowSize).toBe(16777200);
  });

  it('reads a last empty meta-block', () => {
    const result = inspectBrotliHeader(packedBits([1, ...bits(2, 3), 1, 1]));

    expect(result).toMatchObject({
      windowBits: 19,
      firstMetaBlock: { isLast: true, isLastEmpty: true },
    });
  });

  it('reads an uncompressed first meta-block', () => {
    const stream = packedBits([
      0, // WBITS = 16
      0, // ISLAST
      ...bits(0, 2), // MNIBBLES = 4
      ...bits(2, 16), // MLEN - 1 = 2
      1, // ISUNCOMPRESSED
      0, 0, 0, 0, // padding to a byte boundary
      ...bits(0x41, 8), ...bits(0x42, 8), ...bits(0x43, 8),
    ]);

    const result = inspectBrotliHeader(stream);

    expect(result.firstMetaBlock).toMatchObject({
      isLast: false,
      mnibbles: 4,
      length: 3,
      isUncompressed: true,
    });
  });

  it('rejects reserved WBITS and truncated header input with clear errors', () => {
    expect(() => inspectBrotliHeader(packedBits([1, 0, 0, 0, 1, 0, 0]))).toThrow(/reserved/);
    expect(() => inspectBrotliHeader(new Uint8Array())).toThrow(/Truncated.*WBITS/);
  });
});
