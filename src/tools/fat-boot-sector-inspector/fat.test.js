import { describe, expect, it } from 'vitest';
import { parseBootSector } from './fat.utils.js';

function bootSector(type) {
  const buffer = new ArrayBuffer(512);
  const view = new DataView(buffer);
  const write = (offset, text) => [...text].forEach(
    (char, i) => view.setUint8(offset + i, char.charCodeAt(0))
  );
  write(3, 'MSDOS5.0');
  view.setUint16(11, 512, true);
  view.setUint8(13, 1);
  view.setUint16(14, type === 32 ? 32 : 1, true);
  view.setUint8(16, 2);
  view.setUint16(17, type === 32 ? 0 : 512, true);
  view.setUint8(21, 0xf8);
  if (type === 32) {
    view.setUint32(32, 100000, true);
    view.setUint32(36, 800, true);
    view.setUint32(44, 2, true);
    view.setUint16(48, 1, true);
    write(71, 'MY VOLUME  ');
    write(82, 'FAT32   ');
  } else {
    view.setUint16(19, type === 12 ? 2880 : 30000, true);
    view.setUint16(22, type === 12 ? 9 : 120, true);
  }
  view.setUint8(510, 0x55);
  view.setUint8(511, 0xaa);
  return buffer;
}

describe('parseBootSector', () => {
  it.each([[12, 51, 2829], [16, 273, 29727], [32, 1632, 98368]])(
    'parses FAT%i and its geometry', (type, start, clusters) => {
      const result = parseBootSector(bootSector(type));
      expect(result).toMatchObject({ fatType: `FAT${type}`, oemName: 'MSDOS5.0',
        bytesPerSector: 512, dataRegionStart: start, clusterCount: clusters });
      if (type === 32) expect(result).toMatchObject({ rootCluster: 2, fsInfoSector: 1,
        volumeLabel: 'MY VOLUME', filesystemType: 'FAT32' });
    }
  );
  it('rejects truncated sectors and invalid signatures', () => {
    expect(() => parseBootSector(new ArrayBuffer(511))).toThrow(/Truncated/);
    const buffer = bootSector(12);
    new DataView(buffer).setUint8(511, 0);
    expect(() => parseBootSector(buffer)).toThrow(/signature/);
  });
  it.each([0, 513, 256])('rejects invalid sector size %i', (size) => {
    const buffer = bootSector(12);
    new DataView(buffer).setUint16(11, size, true);
    expect(() => parseBootSector(buffer)).toThrow(/bytes per sector/);
  });
  it('rejects invalid cluster size and geometry', () => {
    const buffer = bootSector(12);
    const view = new DataView(buffer);
    view.setUint8(13, 3);
    expect(() => parseBootSector(buffer)).toThrow(/sectors per cluster/);
    view.setUint8(13, 1);
    view.setUint16(19, 10, true);
    expect(() => parseBootSector(buffer)).toThrow(/data region/);
  });
});
