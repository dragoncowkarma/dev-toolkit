import { describe, expect, it } from 'vitest';
import { inspectBitlocker, parseHex } from './bitlocker.utils.js';

function volume(toGo = false, length = 1024) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode(toGo ? 'MSWIN4.1' : '-FVE-FS-'), 3);
  if (toGo) {
    bytes.set([
      0x3b, 0xd6, 0x67, 0x49, 0x29, 0x2e, 0xd8, 0x4a,
      0x83, 0x99, 0xf6, 0xa3, 0x39, 0xe3, 0xd0, 0x01,
    ], 424);
  }
  view.setUint16(11, 512, true);
  view.setUint8(13, 8);
  view.setUint32(32, 200000, true);
  const offset = toGo ? 440 : 176;
  view.setBigUint64(offset, 512n, true);
  view.setBigUint64(offset + 8, 9007199254740993n, true);
  if (length >= 524) {
    bytes.set(new TextEncoder().encode('-FVE-FS-'), 512);
    view.setUint16(520, 64, true);
    view.setUint16(522, 2, true);
  }
  return bytes;
}

describe('BitLocker header inspection', () => {
  it('reads BPB and metadata with lossless offsets', () => {
    const result = inspectBitlocker(volume());
    expect(result).toMatchObject({
      variant: 'BitLocker', bytesPerSector: 512, sectorsPerCluster: 8, totalSectors: '200000',
      offsets: ['512', '9007199254740993', '0'],
    });
    expect(result.blocks[0]).toEqual({
      status: 'Available', signature: '-FVE-FS-', size: 64, version: 2,
    });
    expect(result.blocks[1].status).toBe('Not included in input');
  });

  it('recognizes To Go using its GUID and distinct offsets', () => {
    expect(inspectBitlocker(volume(true)).offsets[0]).toBe('512');
    const bytes = volume(true);
    bytes[424] = 0;
    expect(() => inspectBitlocker(bytes)).toThrow('identifier');
  });

  it('handles truncated input and partially included metadata', () => {
    expect(() => inspectBitlocker(new Uint8Array(511))).toThrow('Truncated');
    expect(inspectBitlocker(volume(false, 518)).blocks[0].status)
      .toBe('Truncated metadata header');
  });

  it('rejects non-BitLocker, empty and invalid hex', () => {
    expect(() => inspectBitlocker(new Uint8Array(512))).toThrow('Not a BitLocker');
    expect(() => parseHex('')).toThrow('Enter');
    expect(() => parseHex('0xz')).toThrow('hexadecimal');
    expect([...parseHex('00 ff\nA1')]).toEqual([0, 255, 161]);
  });
});
