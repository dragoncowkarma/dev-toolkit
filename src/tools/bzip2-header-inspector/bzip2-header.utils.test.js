import { describe, expect, it } from 'vitest';
import { parseBzip2Header } from './bzip2-header.utils.js';

function createBuffer(bytes) {
  return Uint8Array.from(bytes).buffer;
}

describe('parseBzip2Header', () => {
  it.each([1, 9])('parses a valid BZip2 header with block size %i', (blockSize) => {
    const result = parseBzip2Header(
      createBuffer([0x42, 0x5a, 0x68, 0x30 + blockSize, 0x31, 0x41, 0x59, 0x26, 0x53, 0x59])
    );

    expect(result).toEqual({
      blockSize,
      marker: 'Block magic (0x314159265359)',
      warnings: [],
    });
  });

  it('parses an empty stream footer marker', () => {
    const result = parseBzip2Header(
      createBuffer([0x42, 0x5a, 0x68, 0x31, 0x17, 0x72, 0x45, 0x38, 0x50, 0x90])
    );

    expect(result.marker).toBe('Stream footer magic (0x177245385090)');
  });

  it('returns a warning for invalid magic bytes', () => {
    const result = parseBzip2Header(createBuffer([0x00, 0x5a, 0x68, 0x31]));

    expect(result.warnings).toEqual([expect.stringMatching(/Invalid BZip2 magic/)]);
  });

  it('returns a warning for truncated input', () => {
    const result = parseBzip2Header(createBuffer([0x42, 0x5a, 0x68]));

    expect(result.warnings).toEqual([expect.stringMatching(/truncated/i)]);
  });

  it('returns a warning for an invalid block-size digit', () => {
    const result = parseBzip2Header(createBuffer([0x42, 0x5a, 0x68, 0x30]));

    expect(result.warnings).toEqual([expect.stringMatching(/block-size digit/i)]);
  });
});
