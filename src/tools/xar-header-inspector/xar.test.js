import { describe, expect, it } from 'vitest';
import { parseXarHeader } from './xar.utils.js';

function header({ size = 28, compressed = 0n, uncompressed = 0n, checksum = 0 } = {}) {
  const buffer = new ArrayBuffer(28);
  const view = new DataView(buffer);
  view.setUint32(0, 0x78617221);
  view.setUint16(4, size);
  view.setUint16(6, 1);
  view.setBigUint64(8, compressed);
  view.setBigUint64(16, uncompressed);
  view.setUint32(24, checksum);
  return buffer;
}

describe('parseXarHeader', () => {
  it('parses a valid header and derives the heap offset', () => {
    expect(parseXarHeader(header({ compressed: 5n, uncompressed: 12n }), 33)).toEqual({
      size: 28, version: 1, tocLengthCompressed: 5n, tocLengthUncompressed: 12n,
      checksum: 'None', heapOffset: 33n, tocPastEof: false,
    });
  });

  it.each([[0, 'None'], [1, 'SHA-1'], [2, 'MD5'], [3, 'SHA-256'], [4, 'SHA-512'],
    [99, 'Unknown (99)']])('labels checksum %i as %s', (checksum, expected) => {
    expect(parseXarHeader(header({ checksum })).checksum).toBe(expected);
  });

  it('preserves 64-bit lengths and flags a TOC past EOF', () => {
    const length = 18446744073709551615n;
    const result = parseXarHeader(header({ compressed: length, uncompressed: length }));
    expect(result.tocLengthCompressed).toBe(length);
    expect(result.tocLengthUncompressed).toBe(length);
    expect(result.heapOffset).toBe(length + 28n);
    expect(result.tocPastEof).toBe(true);
  });

  it('reports missing, truncated, invalid magic and unsupported sizes', () => {
    expect(() => parseXarHeader(null)).toThrow(/select a file/i);
    expect(() => parseXarHeader(new ArrayBuffer(27))).toThrow(/shorter than 28/i);
    expect(() => parseXarHeader(new ArrayBuffer(28))).toThrow(/magic/i);
    expect(() => parseXarHeader(header({ size: 27 }))).toThrow(/below 28/i);
    expect(() => parseXarHeader(header({ size: 29 }))).toThrow(/extends past/i);
  });
});
