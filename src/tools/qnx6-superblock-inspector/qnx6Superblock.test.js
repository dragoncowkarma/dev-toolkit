import { describe, expect, it } from 'vitest';
import { BOOTBLOCK_SIZE, parseQnx6Superblock, PREFIX_SIZE } from './qnx6Superblock.utils.js';

function image(little, offset = 0) {
  const buffer = new ArrayBuffer(offset + 512);
  const view = new DataView(buffer);
  view.setUint32(offset, 0x68191122, little);
  view.setUint32(offset + 4, 0xfedcba98, little);
  view.setBigUint64(offset + 8, 0xfedcba9876543210n, little);
  [16, 20, 24, 48, 52, 56, 60, 64, 68].forEach((pos) => {
    view.setUint32(offset + pos, pos * 17, little);
  });
  view.setUint16(offset + 28, 3, little);
  view.setUint16(offset + 30, 7, little);
  new Uint8Array(buffer, offset + 32, 16).set([1, 2, 3]);
  [72, 152, 232, 312].forEach((pos) => {
    view.setBigUint64(offset + pos, 0x20000000000001n + BigInt(pos), little);
    for (let i = 0; i < 16; i += 1) view.setUint32(offset + pos + 8 + 4 * i, pos + i, little);
    view.setUint8(offset + pos + 72, 4);
    view.setUint8(offset + pos + 73, 5);
  });
  return buffer;
}

describe('QNX6 superblock parser', () => {
  it.each([[true, 0], [false, BOOTBLOCK_SIZE]])('parses endian=%s at %i', (little, offset) => {
    const parsed = parseQnx6Superblock(image(little, offset));
    expect(parsed).toMatchObject({
      offset, endianness: little ? 'Little-endian' : 'Big-endian', checksum: 0xfedcba98,
      serial: 0xfedcba9876543210n, ctime: 272, atime: 340, flags: 408,
      version1: 3, version2: 7, volumeId: '01020300000000000000000000000000',
      blockSize: 816, inodeCount: 884, freeInodes: 952, blockCount: 1020,
      freeBlocks: 1088, allocationGroup: 1156,
    });
    Object.entries(parsed.roots).forEach(([, root], index) => {
      const position = 72 + index * 80;
      expect(root.size).toBe(0x20000000000001n + BigInt(position));
      expect(root.pointers).toEqual(Array.from({ length: 16 }, (_, i) => position + i));
      expect(root.levels).toBe(4);
      expect(root.mode).toBe(5);
    });
  });

  it('rejects truncated input including a partial boot-offset superblock', () => {
    expect(() => parseQnx6Superblock(new ArrayBuffer(511))).toThrow(/truncated/i);
    expect(() => parseQnx6Superblock(image(true, BOOTBLOCK_SIZE).slice(0, PREFIX_SIZE - 1)))
      .toThrow(/truncated/i);
  });

  it('rejects bad magic', () => {
    expect(() => parseQnx6Superblock(new ArrayBuffer(PREFIX_SIZE))).toThrow(/bad magic/i);
  });
});
