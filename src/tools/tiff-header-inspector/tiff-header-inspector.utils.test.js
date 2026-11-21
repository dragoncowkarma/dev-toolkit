import { describe, expect, it } from 'vitest';
import { inspectTiff } from './tiff-header-inspector.utils.js';

function makeTiff(littleEndian, includeSecondPage = false) {
  const buffer = new ArrayBuffer(256);
  const view = new DataView(buffer);
  const write16 = (offset, value) => view.setUint16(offset, value, littleEndian);
  const write32 = (offset, value) => view.setUint32(offset, value, littleEndian);
  view.setUint8(0, littleEndian ? 0x49 : 0x4d);
  view.setUint8(1, littleEndian ? 0x49 : 0x4d);
  write16(2, 42);
  write32(4, 8);
  write16(8, 6);
  const entries = [
    [256, 4, 1, 640], [257, 4, 1, 480], [258, 3, 3, 160],
    [259, 3, 1, 5], [262, 3, 1, 2], [282, 5, 1, 168],
  ];
  entries.forEach(([tag, type, count, value], index) => {
    const offset = 10 + index * 12;
    write16(offset, tag);
    write16(offset + 2, type);
    write32(offset + 4, count);
    write32(offset + 8, value);
  });
  write32(82, includeSecondPage ? 100 : 0);
  write16(160, 8); write16(162, 8); write16(164, 8);
  write32(168, 300); write32(172, 1);
  if (includeSecondPage) {
    write16(100, 2);
    [[256, 4, 1, 320], [257, 4, 1, 240]].forEach(([tag, type, count, value], index) => {
      const offset = 102 + index * 12;
      write16(offset, tag);
      write16(offset + 2, type);
      write32(offset + 4, count);
      write32(offset + 8, value);
    });
    write32(126, 0);
  }
  return buffer;
}

describe('inspectTiff', () => {
  it('parses a valid little-endian TIFF including inline and offset values', () => {
    const result = inspectTiff(makeTiff(true));
    expect(result.error).toBeUndefined();
    expect(result.byteOrder).toBe('Little-endian (II)');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'ImageWidth', value: '640' }),
      expect.objectContaining({ name: 'BitsPerSample', value: '8, 8, 8' }),
      expect.objectContaining({ name: 'Compression', label: 'LZW' }),
      expect.objectContaining({ name: 'XResolution', value: '300' }),
    ]));
  });

  it('parses a valid big-endian TIFF', () => {
    const result = inspectTiff(makeTiff(false));
    expect(result.error).toBeUndefined();
    expect(result.byteOrder).toBe('Big-endian (MM)');
    expect(result.pages[0].tags).toContainEqual(
      expect.objectContaining({ name: 'ImageLength', value: '480' })
    );
  });

  it('walks a multi-IFD TIFF chain', () => {
    const result = inspectTiff(makeTiff(true, true));
    expect(result.pages).toHaveLength(2);
    expect(result.pages[1].tags).toContainEqual(
      expect.objectContaining({ name: 'ImageWidth', value: '320' })
    );
  });

  it('returns a clear error for truncated data', () => {
    expect(inspectTiff(new ArrayBuffer(4)).error).toMatch(/header.*bounds/i);
  });

  it('returns a clear error for an invalid magic version', () => {
    const buffer = makeTiff(true);
    new DataView(buffer).setUint16(2, 99, true);
    expect(inspectTiff(buffer).error).toMatch(/magic version 99/i);
  });
});
