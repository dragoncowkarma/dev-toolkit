import { describe, expect, it } from 'vitest';
import { parseTiffHeader } from './tiff-header-inspector.utils.js';

function createTiff(littleEndian = true) {
  const buffer = new ArrayBuffer(38);
  const view = new DataView(buffer);
  view.setUint8(0, littleEndian ? 0x49 : 0x4d);
  view.setUint8(1, littleEndian ? 0x49 : 0x4d);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  view.setUint16(8, 2, littleEndian);
  view.setUint16(10, 256, littleEndian);
  view.setUint16(12, 4, littleEndian);
  view.setUint32(14, 1, littleEndian);
  view.setUint32(18, 800, littleEndian);
  view.setUint16(22, 257, littleEndian);
  view.setUint16(24, 3, littleEndian);
  view.setUint32(26, 1, littleEndian);
  view.setUint16(30, 600, littleEndian);
  view.setUint32(34, 0, littleEndian);
  return buffer;
}

describe('parseTiffHeader', () => {
  it('parses a valid little-endian TIFF', () => {
    const result = parseTiffHeader(createTiff());
    expect(result.byteOrder).toBe('Little-endian (II)');
    expect(result.ifds[0].entryCount).toBe(2);
    expect(result.ifds[0].entries[0]).toMatchObject({ tagName: 'ImageWidth', value: '800' });
    expect(result.ifds[0].entries[1]).toMatchObject({ tagName: 'ImageLength', value: '600' });
  });

  it('parses a valid big-endian TIFF', () => {
    const result = parseTiffHeader(createTiff(false));
    expect(result.byteOrder).toBe('Big-endian (MM)');
    expect(result.ifds[0].entries[0].value).toBe('800');
  });

  it('walks the next IFD offset and decodes an out-of-line SHORT value', () => {
    const buffer = new ArrayBuffer(56);
    const view = new DataView(buffer);
    view.setUint8(0, 0x49);
    view.setUint8(1, 0x49);
    view.setUint16(2, 42, true);
    view.setUint32(4, 8, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 258, true);
    view.setUint16(12, 3, true);
    view.setUint32(14, 3, true);
    view.setUint32(18, 50, true);
    view.setUint32(22, 30, true);
    view.setUint16(30, 1, true);
    view.setUint16(32, 278, true);
    view.setUint16(34, 4, true);
    view.setUint32(36, 1, true);
    view.setUint32(40, 20, true);
    view.setUint32(44, 0, true);
    view.setUint16(50, 8, true);
    view.setUint16(52, 8, true);
    view.setUint16(54, 8, true);

    const result = parseTiffHeader(buffer);
    expect(result.ifds).toHaveLength(2);
    expect(result.ifds[0].entries[0]).toMatchObject({
      tagName: 'BitsPerSample',
      value: '8, 8, 8',
      valueOffset: 50,
    });
    expect(result.ifds[1].entries[0]).toMatchObject({ tagName: 'RowsPerStrip', value: '20' });
  });

  it('labels standard metadata values and supports IFD field values', () => {
    const buffer = new ArrayBuffer(38);
    const view = new DataView(buffer);
    view.setUint8(0, 0x49);
    view.setUint8(1, 0x49);
    view.setUint16(2, 42, true);
    view.setUint32(4, 8, true);
    view.setUint16(8, 2, true);
    view.setUint16(10, 259, true);
    view.setUint16(12, 3, true);
    view.setUint32(14, 1, true);
    view.setUint16(18, 5, true);
    view.setUint16(22, 274, true);
    view.setUint16(24, 13, true);
    view.setUint32(26, 1, true);
    view.setUint32(30, 123, true);
    view.setUint32(34, 0, true);

    const entries = parseTiffHeader(buffer).ifds[0].entries;
    expect(entries[0]).toMatchObject({ value: '5 (LZW)' });
    expect(entries[1]).toMatchObject({ tagName: 'Orientation', typeName: 'IFD', value: '123' });
  });

  it('rejects an invalid byte-order marker', () => {
    const buffer = createTiff();
    new DataView(buffer).setUint8(0, 0x58);
    expect(() => parseTiffHeader(buffer)).toThrow('Invalid TIFF byte-order marker');
  });

  it('rejects an invalid magic number', () => {
    const buffer = createTiff();
    new DataView(buffer).setUint16(2, 43, true);
    expect(() => parseTiffHeader(buffer)).toThrow('Invalid TIFF magic number');
  });

  it('rejects truncated and out-of-range IFD data', () => {
    const truncated = createTiff().slice(0, 12);
    expect(() => parseTiffHeader(truncated)).toThrow('IFD entries');
    const outOfRange = createTiff();
    new DataView(outOfRange).setUint32(4, 1000, true);
    expect(() => parseTiffHeader(outOfRange)).toThrow('IFD is outside');
  });
});
