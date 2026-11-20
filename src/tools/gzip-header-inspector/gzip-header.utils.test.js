import { describe, expect, it } from 'vitest';
import { formatModificationTime, parseGzipHeader } from './gzip-header.utils.js';

function gzipBytes(header = [], trailer = [0, 0, 0, 0, 0, 0, 0, 0]) {
  return Uint8Array.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, ...header, ...trailer]);
}

describe('parseGzipHeader', () => {
  it('parses a valid minimal header and its final trailer', () => {
    const bytes = gzipBytes([], [0x78, 0x56, 0x34, 0x12, 0xef, 0xcd, 0xab, 0x90]);
    const parsed = parseGzipHeader(bytes);

    expect(parsed.compressionMethod).toBe(8);
    expect(parsed.operatingSystem).toEqual({ value: 3, name: 'Unix' });
    expect(parsed.flags).toEqual([]);
    expect(parsed.trailer).toEqual({ crc32: 0x12345678, inputSize: 0x90abcdef });
  });

  it('parses FEXTRA, FNAME, and FCOMMENT fields', () => {
    const bytes = Uint8Array.from([
      0x1f, 0x8b, 8, 0x1c, 0, 0, 0, 0, 2, 11,
      6, 0, 0x41, 0x42, 2, 0, 0x10, 0x20,
      0x66, 0x69, 0x6c, 0x65, 0, 0x68, 0x69, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const parsed = parseGzipHeader(bytes);

    expect(parsed.flags).toEqual(['FEXTRA', 'FNAME', 'FCOMMENT']);
    expect(parsed.optional.extra).toEqual({
      length: 6,
      subfields: [{ identifier: 'AB', length: 2 }],
    });
    expect(parsed.optional.filename).toBe('file');
    expect(parsed.optional.comment).toBe('hi');
    expect(parsed.operatingSystem.name).toBe('NTFS filesystem');
  });

  it('rejects an unsupported compression method', () => {
    const bytes = gzipBytes();
    bytes[2] = 7;
    expect(() => parseGzipHeader(bytes)).toThrow('Unsupported GZIP compression method');
  });

  it('rejects truncated and malformed input', () => {
    expect(() => parseGzipHeader(Uint8Array.from([0x1f, 0x8b]))).toThrow('Truncated GZIP');
    const malformed = gzipBytes([0x66, 0x69, 0x6c, 0x65]);
    malformed[3] = 0x08;
    expect(() => parseGzipHeader(malformed)).toThrow('Malformed GZIP');
  });
});

describe('formatModificationTime', () => {
  it('formats specified and unspecified timestamps', () => {
    expect(formatModificationTime(0)).toBe('Not specified');
    expect(formatModificationTime(1)).toBe('1970-01-01T00:00:01.000Z');
  });
});
