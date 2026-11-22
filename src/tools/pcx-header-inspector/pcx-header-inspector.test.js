import { describe, expect, it } from 'vitest';
import { decodeBase64Bytes, parseHexBytes, parsePcxHeader } from './pcx-header-inspector.utils.js';

function createHeader() {
  const bytes = new Uint8Array(128);
  const view = new DataView(bytes.buffer);
  bytes.set([0x0a, 5, 1, 8]);
  view.setUint16(4, 2, true);
  view.setUint16(6, 3, true);
  view.setUint16(8, 321, true);
  view.setUint16(10, 202, true);
  view.setUint16(12, 96, true);
  view.setUint16(14, 72, true);
  bytes[16] = 12;
  bytes[63] = 99;
  bytes[64] = 0;
  bytes[65] = 3;
  view.setUint16(66, 320, true);
  view.setUint16(68, 1, true);
  view.setUint16(70, 640, true);
  view.setUint16(72, 480, true);
  return bytes;
}

describe('parsePcxHeader', () => {
  it('parses a complete PCX header and derives its image dimensions', () => {
    const header = parsePcxHeader(createHeader());
    expect(header).toMatchObject({
      manufacturer: 0x0a, version: 5, encoding: 1, bitsPerPixel: 8,
      xmin: 2, ymin: 3, xmax: 321, ymax: 202, width: 320, height: 200,
      hDpi: 96, vDpi: 72, numberOfPlanes: 3, bytesPerLine: 320, paletteInfo: 1,
    });
    expect(header.egaPalette).toHaveLength(48);
    expect(header.egaPalette[0]).toBe(12);
  });

  it('rejects a non-PCX manufacturer byte', () => {
    const bytes = createHeader();
    bytes[0] = 0;
    expect(() => parsePcxHeader(bytes)).toThrow(/manufacturer byte must be 0x0A/);
  });

  it('rejects truncated headers before parsing', () => {
    expect(() => parsePcxHeader(new Uint8Array(127))).toThrow(/requires 128 bytes/);
  });
});

describe('input conversion', () => {
  it('accepts hex and Base64 bytes for header inspection', () => {
    expect(parseHexBytes('0A 05 01 08')).toEqual(new Uint8Array([10, 5, 1, 8]));
    expect(decodeBase64Bytes('CgUBCA==')).toEqual(new Uint8Array([10, 5, 1, 8]));
  });

  it('rejects malformed raw input with readable errors', () => {
    expect(() => parseHexBytes('0AG')).toThrow(/hexadecimal bytes/);
    expect(() => decodeBase64Bytes('not base64!')).toThrow(/valid Base64/);
  });
});
