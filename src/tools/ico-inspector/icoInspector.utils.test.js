import { describe, expect, it } from 'vitest';
import { formatByteSize, getCompressionName, parseIco } from './icoInspector.utils.js';

function writeEntry(view, entryOffset, { width, height, bitDepth, size, offset }) {
  view.setUint8(entryOffset, width);
  view.setUint8(entryOffset + 1, height);
  view.setUint16(entryOffset + 4, 1, true);
  view.setUint16(entryOffset + 6, bitDepth, true);
  view.setUint32(entryOffset + 8, size, true);
  view.setUint32(entryOffset + 12, offset, true);
}

function createMultiImageIco() {
  const bytes = new Uint8Array(130);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, 2, true);
  writeEntry(view, 6, { width: 16, height: 16, bitDepth: 32, size: 16, offset: 38 });
  writeEntry(view, 22, { width: 32, height: 32, bitDepth: 24, size: 40, offset: 54 });
  bytes.set([0x89, 0x50, 0x4e, 0x47], 38);
  view.setUint32(54, 40, true);
  view.setInt32(58, 32, true);
  view.setInt32(62, 64, true);
  view.setUint16(66, 1, true);
  view.setUint16(68, 24, true);
  view.setUint32(70, 3, true);
  return bytes;
}

describe('parseIco', () => {
  it('parses a valid multi-entry ICO with PNG and BMP images', () => {
    const result = parseIco(createMultiImageIco());

    expect(result.header).toEqual({ reserved: 0, type: 1, imageCount: 2 });
    expect(result.warnings).toEqual([]);
    expect(result.images).toMatchObject([
      { width: 16, height: 16, bitDepth: 32, sizeInBytes: 16, format: 'PNG' },
      {
        width: 32,
        height: 32,
        bitDepth: 24,
        sizeInBytes: 40,
        format: 'BMP (DIB)',
        bitmapHeader: { width: 32, height: 64, bitDepth: 24, compressionName: 'BI_BITFIELDS' },
      },
    ]);
  });

  it('treats zero directory dimensions as 256 pixels', () => {
    const bytes = createMultiImageIco();
    bytes[6] = 0;
    bytes[7] = 0;

    expect(parseIco(bytes).images[0]).toMatchObject({ width: 256, height: 256 });
  });

  it('does not mistake bytes outside an entry for its BMP header', () => {
    const bytes = new Uint8Array(70);
    const view = new DataView(bytes.buffer);
    view.setUint16(2, 1, true);
    view.setUint16(4, 1, true);
    writeEntry(view, 6, { width: 16, height: 16, bitDepth: 32, size: 16, offset: 22 });
    view.setUint32(38, 40, true);

    const image = parseIco(bytes).images[0];

    expect(image.format).toBe('BMP (DIB)');
    expect(image.bitmapHeader).toBeNull();
    expect(image.warnings.join(' ')).toMatch(/BMP \(DIB\) header is missing/i);
  });

  it('returns a clear warning for a truncated ICO header', () => {
    const result = parseIco(new Uint8Array([0, 0, 1]));

    expect(result.images).toEqual([]);
    expect(result.warnings).toContain(
      'The file is truncated: an ICO header requires at least 6 bytes.'
    );
  });

  it('warns when an entry declares image bytes beyond the file length', () => {
    const bytes = new Uint8Array(22);
    const view = new DataView(bytes.buffer);
    view.setUint16(2, 1, true);
    view.setUint16(4, 1, true);
    writeEntry(view, 6, { width: 16, height: 16, bitDepth: 32, size: 50, offset: 20 });

    expect(parseIco(bytes).warnings.join(' ')).toMatch(/exceeds the file length/i);
  });
});

describe('getCompressionName', () => {
  it('names known and unknown bitmap compression values', () => {
    expect(getCompressionName(0)).toBe('BI_RGB');
    expect(getCompressionName(99)).toBe('Unknown (99)');
  });
});

describe('formatByteSize', () => {
  it('formats invalid values, bytes, kilobytes, and megabytes', () => {
    expect(formatByteSize(-1)).toBe('0 B');
    expect(formatByteSize(Number.NaN)).toBe('0 B');
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(1024)).toBe('1.0 KB');
    expect(formatByteSize(1024 * 1024)).toBe('1.0 MB');
  });
});
