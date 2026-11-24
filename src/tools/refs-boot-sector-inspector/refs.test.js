import { describe, expect, it } from 'vitest';
import { parseBootSector } from './refs.utils.js';

function bootSector() {
  const buffer = new ArrayBuffer(512);
  const bytes = new Uint8Array(buffer);
  bytes.set([82, 101, 70, 83], 3);
  bytes.set([70, 83, 82, 83], 16);
  const view = new DataView(buffer);
  view.setUint16(20, 512, true);
  view.setUint16(22, 0xabcd, true);
  view.setBigUint64(24, 9007199254740993n, true);
  view.setUint32(32, 4096, true);
  view.setUint32(36, 16, true);
  view.setUint8(40, 3);
  view.setUint8(41, 4);
  view.setBigUint64(56, 0xfedcba9876543210n, true);
  return buffer;
}

describe('parseBootSector', () => {
  it('parses a ReFS v3.4 sector without losing 64-bit precision', () => {
    expect(parseBootSector(bootSector())).toEqual({
      structureLength: 512, checksum: 0xabcd, sectorCount: 9007199254740993n,
      bytesPerSector: 4096, sectorsPerCluster: 16, majorVersion: 3, minorVersion: 4,
      serialNumber: 0xfedcba9876543210n,
    });
  });

  it('rejects invalid file system names and FSRS signatures', () => {
    const buffer = bootSector();
    new Uint8Array(buffer)[3] = 0;
    expect(() => parseBootSector(buffer)).toThrow('file system name');
    new Uint8Array(buffer)[3] = 82;
    new Uint8Array(buffer)[16] = 0;
    expect(() => parseBootSector(buffer)).toThrow('FSRS signature');
  });

  it('rejects a truncated sector', () => {
    expect(() => parseBootSector(bootSector().slice(0, 511))).toThrow('Truncated');
  });
});
