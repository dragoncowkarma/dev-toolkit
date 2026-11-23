import { describe, expect, it } from 'vitest';
import { decodeInput, parseSunRaster } from './sunraster.utils.js';

function raster({ width = 1, height = 1, depth = 24, length = 4, type = 1,
  maptype = 0, maplength = 0, payload = length + maplength, magic = 0x59a66a95 } = {}) {
  const bytes = new Uint8Array(32 + payload);
  const view = new DataView(bytes.buffer);
  [magic, width, height, depth, length, type, maptype, maplength]
    .forEach((value, index) => view.setUint32(index * 4, value));
  return bytes;
}

describe('Sun Raster parser', () => {
  it('parses a standard 24-bit image with padded rows', () => {
    expect(parseSunRaster(raster())).toMatchObject({
      width: 1, height: 1, depth: 24, typeName: 'Standard',
      expectedPixelLength: '4', availablePayload: 4, availablePixels: 4,
    });
  });
  it('accounts for an RGB colormap', () => {
    expect(parseSunRaster(raster({ depth: 8, length: 2, maptype: 1, maplength: 6 })))
      .toMatchObject({ mapTypeName: 'RGB', maplength: 6, availablePayload: 8, availablePixels: 2 });
  });
  it('keeps RLE encoded length distinct from expected uncompressed length', () => {
    expect(parseSunRaster(raster({ type: 2, length: 2 })))
      .toMatchObject({ typeName: 'Byte-encoded RLE', length: 2, expectedPixelLength: '4' });
  });
  it('rejects invalid magic and a truncated header', () => {
    expect(() => parseSunRaster(raster({ magic: 0 }))).toThrow(/magic/i);
    expect(() => parseSunRaster(new Uint8Array(31))).toThrow(/header/i);
  });
  it('rejects inconsistent lengths and truncated payload', () => {
    expect(() => parseSunRaster(raster({ length: 3 }))).toThrow(/inconsistent/i);
    expect(() => parseSunRaster(raster({ payload: 3 }))).toThrow(/truncated/i);
    expect(() => parseSunRaster(raster({ maptype: 1, maplength: 2 }))).toThrow(/colormap/i);
  });
  it('decodes hex and Base64 input and rejects malformed input', () => {
    expect([...decodeInput('59 a6 6a 95', 'hex')]).toEqual([89, 166, 106, 149]);
    expect([...decodeInput('WaZqlQ==', 'base64')]).toEqual([89, 166, 106, 149]);
    expect(() => decodeInput('abc', 'hex')).toThrow();
    expect(() => decodeInput('!!!!', 'base64')).toThrow();
  });
});
