import { describe, expect, it } from 'vitest';
import { parseLz4Frame } from './lz4-header.utils.js';

function frameBytes({ contentSize, dictionaryId, blocks = [] } = {}) {
  const flags = 0x40 | (contentSize === undefined ? 0 : 0x08) |
    (dictionaryId === undefined ? 0 : 0x01);
  const bytes = [0x04, 0x22, 0x4d, 0x18, flags, 0x40];
  if (contentSize !== undefined) {
    const value = BigInt(contentSize);
    for (let index = 0n; index < 8n; index += 1n) {
      bytes.push(Number((value >> (index * 8n)) & 255n));
    }
  }
  if (dictionaryId !== undefined) {
    for (let index = 0; index < 4; index += 1) bytes.push((dictionaryId >>> (index * 8)) & 255);
  }
  bytes.push(0); // Header checksum is displayed, not validated by this inspector.
  blocks.forEach(({ size, uncompressed }) => {
    const encoded = size | (uncompressed ? 0x80000000 : 0);
    for (let index = 0; index < 4; index += 1) bytes.push((encoded >>> (index * 8)) & 255);
    bytes.push(...Array(size).fill(0));
  });
  bytes.push(0, 0, 0, 0);
  return Uint8Array.from(bytes).buffer;
}

describe('parseLz4Frame', () => {
  it('parses a regular little-endian frame header', () => {
    const parsed = parseLz4Frame(frameBytes());
    expect(parsed.kind).toBe('frame');
    expect(parsed.magic).toBe(0x184d2204);
    expect(parsed.flags.contentSize).toBe(false);
    expect(parsed.flags.dictionaryId).toBe(false);
    expect(parsed.blockMaximumSize).toBe(64 * 1024);
  });

  it('parses Content Size and Dictionary ID fields', () => {
    const parsed = parseLz4Frame(frameBytes({ contentSize: 123456789n, dictionaryId: 0x1234abcd }));
    expect(parsed.contentSize).toBe(123456789n);
    expect(parsed.dictionaryId).toBe(0x1234abcd);
  });

  it('lists compressed and uncompressed blocks', () => {
    const parsed = parseLz4Frame(frameBytes({
      blocks: [{ size: 3, uncompressed: false }, { size: 2, uncompressed: true }],
    }));
    expect(parsed.blocks).toMatchObject([
      { size: 3, uncompressed: false },
      { size: 2, uncompressed: true },
    ]);
  });

  it('recognizes the distinct LZ4IO legacy magic', () => {
    expect(parseLz4Frame(Uint8Array.from([2, 33, 76, 24]).buffer)).toEqual({ kind: 'legacy' });
  });

  it('reports truncated and malformed input as errors', () => {
    expect(() => parseLz4Frame(new ArrayBuffer(2))).toThrow(/truncated/i);
    expect(() => parseLz4Frame(Uint8Array.from([0, 0, 0, 0]).buffer)).toThrow(/magic/i);
  });

  it('rejects a block larger than the declared maximum', () => {
    const bytes = new Uint8Array(frameBytes());
    bytes.set([1, 0, 1, 0], 7);
    expect(() => parseLz4Frame(bytes.buffer)).toThrow(/out-of-range/i);
  });
});
