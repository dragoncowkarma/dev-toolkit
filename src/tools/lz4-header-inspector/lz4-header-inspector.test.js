import { describe, expect, it } from 'vitest';
import { parseLz4Frame, xxhash32 } from './lz4-header-inspector.utils.js';

function validFrame() {
  const descriptor = Uint8Array.from([
    0x69, 0x70, 0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x78, 0x56, 0x34, 0x12,
  ]);
  const checksum = (xxhash32(descriptor) >>> 8) & 0xff;
  return Uint8Array.from([
    0x04, 0x22, 0x4d, 0x18, ...descriptor, checksum,
    0x03, 0x00, 0x00, 0x00, 0xaa, 0xbb, 0xcc,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

describe('parseLz4Frame', () => {
  it('parses content size, dictionary ID, descriptor flags, and block totals', () => {
    const result = parseLz4Frame(validFrame());
    expect(result).toMatchObject({
      version: 1,
      blockIndependent: true,
      contentSize: 0x1122334455667788n,
      dictionaryId: 0x12345678,
      maxBlockSize: '4 MB',
      blockCount: 1,
      compressedSize: 3,
    });
  });

  it('rejects an invalid header checksum', () => {
    const frame = validFrame();
    frame[18] ^= 0xff;
    expect(() => parseLz4Frame(frame)).toThrow('Invalid LZ4 header checksum');
  });

  it('rejects a truncated frame gracefully', () => {
    expect(() => parseLz4Frame(validFrame().slice(0, 20))).toThrow('Truncated LZ4 frame');
  });
});
