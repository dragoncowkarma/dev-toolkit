import { describe, expect, it } from 'vitest';
import { parseSuperblock, SUPERBLOCK_SIZE } from './f2fs.utils.js';

function fixture() {
  const buffer = new ArrayBuffer(SUPERBLOCK_SIZE);
  const view = new DataView(buffer);
  view.setUint32(0, 0xf2f52010, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 15, true);
  view.setUint32(8, 9, true);
  view.setUint32(16, 12, true);
  view.setUint32(20, 9, true);
  view.setBigUint64(36, 9007199254740993n, true);
  view.setUint32(48, 123, true);
  view.setUint32(2180, 0x80000001, true);
  new Uint8Array(buffer, 108, 16).set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  return buffer;
}

describe('F2FS superblock parser', () => {
  it('decodes a valid superblock without losing 64-bit precision', () => {
    expect(parseSuperblock(fixture())).toMatchObject({
      version: '1.15', logSectorSize: 9, logBlockSize: 12, logBlocksPerSegment: 9,
      blockCount: '9007199254740993', segmentCount: 123, features: '0x80000001',
      uuid: '00010203-0405-0607-0809-0a0b0c0d0e0f',
    });
  });
  it('rejects a bad magic', () => {
    const buffer = fixture();
    new DataView(buffer).setUint32(0, 0, true);
    expect(() => parseSuperblock(buffer)).toThrow(/magic/i);
  });
  it('rejects truncated input', () => {
    expect(() => parseSuperblock(new ArrayBuffer(SUPERBLOCK_SIZE - 1))).toThrow(/short/i);
  });
  it('decodes a null-terminated UTF-16LE volume name', () => {
    const buffer = fixture();
    const view = new DataView(buffer);
    [0x0041, 0xd83d, 0xde80, 0, 0x42].forEach((unit, i) => {
      view.setUint16(124 + i * 2, unit, true);
    });
    expect(parseSuperblock(buffer).volumeName).toBe('A🚀');
  });
});
