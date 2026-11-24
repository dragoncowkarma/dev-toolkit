import { describe, expect, it } from 'vitest';
import { inspectSuperblock, parseHex } from './befs.utils.js';

function fixture(little, offset = 0) {
  const bytes = new Uint8Array(offset + 512);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('Haiku'), offset);
  view.setUint32(offset + 32, 0x42465331, little);
  view.setUint32(offset + 36, 0x42494745, little);
  view.setUint32(offset + 40, 4096, little);
  view.setUint32(offset + 44, 12, little);
  view.setBigInt64(offset + 48, 9007199254740993n, little);
  view.setBigInt64(offset + 56, 9007199254740992n, little);
  view.setUint32(offset + 68, 0xdd121031, little);
  view.setInt32(offset + 88, 42, little);
  view.setUint16(offset + 92, 3, little);
  view.setUint16(offset + 94, 4, little);
  view.setBigInt64(offset + 96, 9007199254740995n, little);
  view.setUint32(offset + 112, 0x15b6830e, little);
  view.setUint16(offset + 122, 5, little);
  view.setUint16(offset + 130, 6, little);
  return bytes;
}

describe('BFS superblock', () => {
  it.each([true, false])('parses byte order %s and exact 64-bit values', (little) => {
    const result = inspectSuperblock(fixture(little));
    expect(result.byteOrder).toBe(little ? 'Little-endian' : 'Big-endian');
    expect(result.name).toBe('Haiku');
    expect(result.numBlocks).toBe(9007199254740993n);
    expect(result.logStart).toBe(9007199254740995n);
    expect(result.logBlocks).toEqual({ allocationGroup: 42, start: 3, length: 4 });
    expect(result.rootDirectory.length).toBe(5);
    expect(result.indices.length).toBe(6);
    expect(result.warnings).toEqual([]);
  });
  it('finds the superblock at byte 512', () => {
    expect(inspectSuperblock(fixture(true, 512)).offset).toBe(512);
  });
  it('flags bad magic and inconsistent block geometry', () => {
    const bytes = fixture(true);
    const view = new DataView(bytes.buffer);
    view.setUint32(112, 0, true);
    view.setUint32(40, 3000, true);
    const { warnings } = inspectSuperblock(bytes);
    expect(warnings).toContain('Invalid magic3.');
    expect(warnings).toContain('block_size is not a power of two.');
    expect(warnings).toContain('block_shift does not match block_size.');
  });
  it('flags truncation and malformed hex', () => {
    expect(() => inspectSuperblock(fixture(true).subarray(0, 511))).toThrow(/Truncated/);
    expect(() => inspectSuperblock(fixture(true, 512).subarray(0, 1023))).toThrow(/Truncated/);
    expect(() => parseHex('abc')).toThrow();
    expect(parseHex('00 ff')).toEqual(new Uint8Array([0, 255]));
  });
});
