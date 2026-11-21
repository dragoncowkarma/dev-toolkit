import { describe, expect, it } from 'vitest';
import {
  TgaParseError,
  formatFileSize,
  getColorMapTypeLabel,
  getImageTypeLabel,
  parseTgaHeader,
} from './tga-header-inspector.utils.js';

/**
 * Builds the 18-byte fixed TGA header from the given field values.
 * @param {object} fields
 * @returns {Uint8Array}
 */
function makeHeaderBytes(fields = {}) {
  const buf = new Uint8Array(18);
  const view = new DataView(buf.buffer);
  view.setUint8(0, fields.idLength ?? 0);
  view.setUint8(1, fields.colorMapType ?? 0);
  view.setUint8(2, fields.imageType ?? 2);
  view.setUint16(3, fields.firstEntryIndex ?? 0, true);
  view.setUint16(5, fields.colorMapLength ?? 0, true);
  view.setUint8(7, fields.colorMapEntrySize ?? 0);
  view.setUint16(8, fields.xOrigin ?? 0, true);
  view.setUint16(10, fields.yOrigin ?? 0, true);
  view.setUint16(12, fields.width ?? 1, true);
  view.setUint16(14, fields.height ?? 1, true);
  view.setUint8(16, fields.pixelDepth ?? 24);
  view.setUint8(17, fields.descriptor ?? 0);
  return buf;
}

/**
 * Builds the 26-byte TGA 2.0 footer.
 * @param {object} fields
 * @returns {Uint8Array}
 */
function makeFooterBytes(fields = {}) {
  const buf = new Uint8Array(26);
  const view = new DataView(buf.buffer);
  view.setUint32(0, fields.extensionAreaOffset ?? 0, true);
  view.setUint32(4, fields.developerDirectoryOffset ?? 0, true);
  const signature = 'TRUEVISION-XFILE.';
  for (let i = 0; i < signature.length; i += 1) {
    buf[8 + i] = signature.charCodeAt(i);
  }
  buf[8 + 17] = 0;
  return buf;
}

/**
 * Writes a NUL-padded ASCII string into a byte buffer.
 * @param {Uint8Array} buf
 * @param {number} offset
 * @param {string} text
 * @param {number} maxLen
 */
function writeCString(buf, offset, text, maxLen) {
  for (let i = 0; i < Math.min(text.length, maxLen - 1); i += 1) {
    buf[offset + i] = text.charCodeAt(i);
  }
}

/**
 * Builds a 495-byte TGA 2.0 extension area.
 * @param {object} fields
 * @returns {Uint8Array}
 */
function makeExtensionAreaBytes(fields = {}) {
  const buf = new Uint8Array(495);
  const view = new DataView(buf.buffer);
  view.setUint16(0, 495, true);
  writeCString(buf, 2, fields.authorName ?? '', 41);
  (fields.comments ?? []).forEach((line, index) => {
    writeCString(buf, 43 + index * 81, line, 81);
  });
  if (fields.timestamp) {
    const { month, day, year, hour, minute, second } = fields.timestamp;
    view.setUint16(367, month, true);
    view.setUint16(369, day, true);
    view.setUint16(371, year, true);
    view.setUint16(373, hour, true);
    view.setUint16(375, minute, true);
    view.setUint16(377, second, true);
  }
  if (fields.aspectRatio) {
    view.setUint16(474, fields.aspectRatio.numerator, true);
    view.setUint16(476, fields.aspectRatio.denominator, true);
  }
  view.setUint8(494, fields.attributesType ?? 0);
  return buf;
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('parseTgaHeader', () => {
  it('decodes an uncompressed 24bpp true-color header (type 2)', () => {
    const bytes = makeHeaderBytes({ imageType: 2, width: 640, height: 480, pixelDepth: 24 });
    const { header, footer, warnings } = parseTgaHeader(toArrayBuffer(bytes));

    expect(header.imageType).toEqual({ value: 2, label: 'Uncompressed true-color' });
    expect(header.image.width).toBe(640);
    expect(header.image.height).toBe(480);
    expect(header.image.pixelDepth).toBe(24);
    expect(footer).toBeNull();
    expect(warnings).toEqual([]);
  });

  it('decodes an uncompressed 32bpp true-color header with alpha bits', () => {
    const descriptor = 0x08; // 8 alpha bits, bottom-left origin, no interleaving
    const bytes = makeHeaderBytes({
      imageType: 2,
      width: 100,
      height: 50,
      pixelDepth: 32,
      descriptor,
    });
    const { header } = parseTgaHeader(toArrayBuffer(bytes));

    expect(header.image.pixelDepth).toBe(32);
    expect(header.image.descriptor.alphaBits).toBe(8);
    expect(header.image.descriptor.horizontalOrigin).toBe('left');
    expect(header.image.descriptor.verticalOrigin).toBe('bottom');
    expect(header.image.descriptor.interleaving).toBe('None');
  });

  it('decodes an uncompressed color-mapped header (type 1)', () => {
    const header = makeHeaderBytes({
      colorMapType: 1,
      imageType: 1,
      colorMapLength: 256,
      colorMapEntrySize: 24,
      pixelDepth: 8,
    });
    const colorMapData = new Uint8Array(256 * 3); // 256 entries, 24 bits (3 bytes) each
    const bytes = concatBytes(header, colorMapData);
    const { header: parsedHeader, warnings } = parseTgaHeader(toArrayBuffer(bytes));

    expect(parsedHeader.colorMapType).toEqual({ value: 1, label: 'Color map present' });
    expect(parsedHeader.imageType).toEqual({ value: 1, label: 'Uncompressed color-mapped' });
    expect(parsedHeader.colorMap).toEqual({ firstEntryIndex: 0, length: 256, entrySize: 24 });
    expect(warnings).toEqual([]);
  });

  it.each([
    [9, 'RLE color-mapped'],
    [10, 'RLE true-color'],
    [11, 'RLE black-and-white (grayscale)'],
  ])('decodes RLE image type %i (%s)', (imageType, label) => {
    const bytes = makeHeaderBytes({ imageType, width: 16, height: 16 });
    const { header } = parseTgaHeader(toArrayBuffer(bytes));

    expect(header.imageType).toEqual({ value: imageType, label });
  });

  it('decodes an uncompressed grayscale header (type 3)', () => {
    const bytes = makeHeaderBytes({ imageType: 3, pixelDepth: 8, width: 32, height: 32 });
    const { header } = parseTgaHeader(toArrayBuffer(bytes));

    expect(header.imageType).toEqual({
      value: 3,
      label: 'Uncompressed black-and-white (grayscale)',
    });
    expect(header.image.pixelDepth).toBe(8);
  });

  it('parses the image descriptor origin and interleaving flags', () => {
    // bit4=1 (right), bit5=1 (top), bits6-7=10 (four-way interleaving)
    const descriptor = 0b10110000;
    const bytes = makeHeaderBytes({ descriptor });
    const { header } = parseTgaHeader(toArrayBuffer(bytes));

    expect(header.image.descriptor.horizontalOrigin).toBe('right');
    expect(header.image.descriptor.verticalOrigin).toBe('top');
    expect(header.image.descriptor.interleaving).toBe('Four-way');
  });

  it('decodes the Image ID field when present and in-bounds', () => {
    const id = 'hello';
    const idBytes = new Uint8Array(id.length);
    for (let i = 0; i < id.length; i += 1) idBytes[i] = id.charCodeAt(i);
    const header = makeHeaderBytes({ idLength: id.length });
    const full = concatBytes(header, idBytes);

    const { header: parsedHeader, warnings } = parseTgaHeader(toArrayBuffer(full));
    expect(parsedHeader.imageId).toBe('hello');
    expect(warnings).toEqual([]);
  });

  it('warns when the Image ID field is truncated', () => {
    const header = makeHeaderBytes({ idLength: 10 });
    const { warnings, header: parsedHeader } = parseTgaHeader(toArrayBuffer(header));

    expect(parsedHeader.imageId).toBeNull();
    expect(warnings.some((w) => /Image ID field/.test(w))).toBe(true);
  });

  it('warns when the color map data is truncated', () => {
    const header = makeHeaderBytes({ colorMapType: 1, colorMapLength: 256, colorMapEntrySize: 24 });
    const { warnings } = parseTgaHeader(toArrayBuffer(header));

    expect(warnings.some((w) => /Color map data/.test(w))).toBe(true);
  });

  it('warns on invalid (zero) dimensions', () => {
    const header = makeHeaderBytes({ width: 0, height: 0 });
    const { warnings } = parseTgaHeader(toArrayBuffer(header));

    expect(warnings.some((w) => /invalid dimensions/.test(w))).toBe(true);
  });

  it('throws a TgaParseError for a truncated header buffer', () => {
    const tooShort = new Uint8Array(10);
    expect(() => parseTgaHeader(toArrayBuffer(tooShort))).toThrow(TgaParseError);
    expect(() => parseTgaHeader(toArrayBuffer(tooShort))).toThrow(/too small/);
  });

  it('throws a TypeError for non-ArrayBuffer input', () => {
    expect(() => parseTgaHeader('not a buffer')).toThrow(TypeError);
  });

  it('detects the TGA 2.0 footer signature and offsets', () => {
    const header = makeHeaderBytes({ width: 4, height: 4 });
    const footer = makeFooterBytes({ extensionAreaOffset: 0, developerDirectoryOffset: 0 });
    const full = concatBytes(header, footer);

    const { footer: parsedFooter } = parseTgaHeader(toArrayBuffer(full));
    expect(parsedFooter).toEqual({
      extensionAreaOffset: 0,
      developerDirectoryOffset: 0,
      extensionArea: null,
    });
  });

  it('decodes the extension area attributes when the offset is valid', () => {
    const header = makeHeaderBytes({ width: 4, height: 4 });
    const extensionOffset = header.length;
    const extensionArea = makeExtensionAreaBytes({
      authorName: 'Jane Doe',
      comments: ['First line', 'Second line'],
      timestamp: { month: 1, day: 2, year: 2024, hour: 3, minute: 4, second: 5 },
      aspectRatio: { numerator: 4, denominator: 3 },
      attributesType: 3,
    });
    const footer = makeFooterBytes({ extensionAreaOffset: extensionOffset });
    const full = concatBytes(header, extensionArea, footer);

    const { footer: parsedFooter } = parseTgaHeader(toArrayBuffer(full));
    expect(parsedFooter.extensionAreaOffset).toBe(extensionOffset);
    expect(parsedFooter.extensionArea.authorName).toBe('Jane Doe');
    expect(parsedFooter.extensionArea.comments).toEqual(['First line', 'Second line']);
    expect(parsedFooter.extensionArea.timestamp).toEqual({
      month: 1,
      day: 2,
      year: 2024,
      hour: 3,
      minute: 4,
      second: 5,
    });
    expect(parsedFooter.extensionArea.aspectRatio.value).toBeCloseTo(4 / 3);
    expect(parsedFooter.extensionArea.attributesType).toBe(3);
  });

  it('warns and skips the extension area when its offset is out of bounds', () => {
    const header = makeHeaderBytes({ width: 4, height: 4 });
    const footer = makeFooterBytes({ extensionAreaOffset: 999999 });
    const full = concatBytes(header, footer);

    const { footer: parsedFooter, warnings } = parseTgaHeader(toArrayBuffer(full));
    expect(parsedFooter.extensionArea).toBeNull();
    expect(warnings.some((w) => /out of bounds|outside of the file/.test(w))).toBe(true);
  });

  it('returns null footer for a legacy TGA file with no footer', () => {
    const header = makeHeaderBytes({ width: 4, height: 4 });
    const imageData = new Uint8Array(4 * 4 * 3);
    const full = concatBytes(header, imageData);

    const { footer } = parseTgaHeader(toArrayBuffer(full));
    expect(footer).toBeNull();
  });
});

describe('getImageTypeLabel', () => {
  it('returns a descriptive label for known codes', () => {
    expect(getImageTypeLabel(2)).toBe('Uncompressed true-color');
    expect(getImageTypeLabel(0)).toBe('No image data');
  });

  it('labels unknown codes gracefully', () => {
    expect(getImageTypeLabel(42)).toBe('Unknown (code 42)');
  });
});

describe('getColorMapTypeLabel', () => {
  it('returns a descriptive label for known codes', () => {
    expect(getColorMapTypeLabel(0)).toBe('No color map');
    expect(getColorMapTypeLabel(1)).toBe('Color map present');
  });

  it('labels reserved/custom codes gracefully', () => {
    expect(getColorMapTypeLabel(5)).toBe('Reserved/custom (code 5)');
  });
});

describe('formatFileSize', () => {
  it('formats bytes below 1KB', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });
});
