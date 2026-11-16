import { describe, expect, it } from 'vitest';
import { getCompressionName, parseBmpHeader } from './bmp-header-inspector.utils.js';

function makeBmp({ height = 2, compression = 0, dibSize = 40, declaredSize = 54 } = {}) {
  const buffer = new ArrayBuffer(54);
  const view = new DataView(buffer);
  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4d);
  view.setUint32(2, declaredSize, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, dibSize, true);
  view.setInt32(18, 3, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(30, compression, true);
  view.setUint32(34, 24, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 16, true);
  return buffer;
}

describe('parseBmpHeader', () => {
  it('parses a valid uncompressed BITMAPINFOHEADER BMP', () => {
    const result = parseBmpHeader(makeBmp());

    expect(result.fileHeader.magic).toBe('BM');
    expect(result.dibHeader).toMatchObject({
      type: 'BITMAPINFOHEADER-compatible',
      width: 3,
      height: 2,
      bitDepth: 24,
      compressionName: 'BI_RGB (uncompressed)',
      imageSize: 24,
      colorsUsed: 16,
    });
    expect(result.warnings).toEqual([]);
  });

  it('reports top-down images when height is negative', () => {
    expect(parseBmpHeader(makeBmp({ height: -2 })).dibHeader.orientation).toBe('top-down');
    expect(parseBmpHeader(makeBmp()).dibHeader.orientation).toBe('bottom-up');
  });

  it('labels RLE8 and bitfields compression', () => {
    expect(parseBmpHeader(makeBmp({ compression: 1 })).dibHeader.compressionName).toBe('BI_RLE8');
    expect(parseBmpHeader(makeBmp({ compression: 3 })).dibHeader.compressionName)
      .toBe('BI_BITFIELDS');
    expect(getCompressionName(99)).toBe('Unknown compression (99)');
  });

  it('warns for an unsupported DIB header size without crashing', () => {
    const result = parseBmpHeader(makeBmp({ dibSize: 41 }));

    expect(result.dibHeader.width).toBe(3);
    expect(result.warnings).toContain('Unsupported or unknown DIB header size: 41 bytes.');
  });

  it('rejects a file without BM magic bytes', () => {
    const buffer = makeBmp();
    new DataView(buffer).setUint8(0, 0);

    expect(() => parseBmpHeader(buffer)).toThrow(/not a BMP/);
  });

  it('warns when declared file data is truncated', () => {
    const result = parseBmpHeader(makeBmp({ declaredSize: 100 }));

    expect(result.warnings.join(' ')).toMatch(/declared file size.*truncated/i);
  });
});
