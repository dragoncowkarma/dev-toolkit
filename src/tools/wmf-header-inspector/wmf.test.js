import { describe, expect, it } from 'vitest';
import { computePlaceableChecksum, decodeInput, parseWmfHeader } from './wmf.utils.js';

function createMetaHeader(bytes, offset = 0, totalWords = 9) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint16(offset, 1, true);
  view.setUint16(offset + 2, 9, true);
  view.setUint16(offset + 4, 0x0300, true);
  view.setUint32(offset + 6, totalWords, true);
  view.setUint16(offset + 10, 4, true);
  view.setUint32(offset + 12, 6, true);
  view.setUint16(offset + 16, 0, true);
}

function createPlaceableWmf(extraBytes = 0) {
  const bytes = new Uint8Array(40 + extraBytes);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x9ac6cdd7, true);
  view.setUint16(4, 0, true);
  view.setInt16(6, -10, true);
  view.setInt16(8, -20, true);
  view.setInt16(10, 300, true);
  view.setInt16(12, 200, true);
  view.setUint16(14, 1440, true);
  view.setUint32(16, 0, true);
  view.setUint16(20, computePlaceableChecksum(bytes), true);
  createMetaHeader(bytes, 22, 9 + extraBytes / 2);
  return bytes;
}

describe('parseWmfHeader', () => {
  it('parses a valid placeable WMF header with signed bounds and checksum', () => {
    expect(parseWmfHeader(createPlaceableWmf())).toMatchObject({
      ok: true,
      header: {
        placeable: true,
        magic: 0x9ac6cdd7,
        bounds: [-10, -20, 300, 200],
        unitsPerInch: 1440,
        type: 1,
        headerSize: 9,
        version: 0x0300,
        fileSize: 9,
        objectCount: 4,
        maxRecord: 6,
        memberCount: 0,
      },
    });
  });

  it('parses a standard non-placeable META_HEADER', () => {
    const bytes = new Uint8Array(18);
    createMetaHeader(bytes, 0, 9);
    expect(parseWmfHeader(bytes)).toMatchObject({
      ok: true,
      header: {
        placeable: false,
        magic: null,
        bounds: null,
        type: 1,
        headerSize: 9,
        version: 0x0300,
        fileSize: 9,
      },
    });
  });

  it('rejects wrong magic signatures and invalid META_HEADER fields', () => {
    const bytes = createPlaceableWmf();
    bytes[0] = 0;
    expect(parseWmfHeader(bytes).error).toMatch(/magic/i);

    const invalidMeta = createPlaceableWmf();
    const view = new DataView(invalidMeta.buffer);
    view.setUint16(22, 3, true);
    expect(parseWmfHeader(invalidMeta).error).toMatch(/type/i);
  });

  it('rejects bad placeable checksums and invalid bounds or units', () => {
    const badChecksum = createPlaceableWmf();
    badChecksum[20] ^= 0xff;
    expect(parseWmfHeader(badChecksum).error).toMatch(/checksum/i);

    const badBounds = createPlaceableWmf();
    const view = new DataView(badBounds.buffer);
    view.setInt16(6, 400, true);
    view.setUint16(20, computePlaceableChecksum(badBounds), true);
    expect(parseWmfHeader(badBounds).error).toMatch(/bounding box/i);

    const zeroUnits = createPlaceableWmf();
    const unitView = new DataView(zeroUnits.buffer);
    unitView.setUint16(14, 0, true);
    unitView.setUint16(20, computePlaceableChecksum(zeroUnits), true);
    expect(parseWmfHeader(zeroUnits).error).toMatch(/units per inch/i);
  });

  it('rejects truncated buffers and mismatched file or record lengths', () => {
    expect(parseWmfHeader(new Uint8Array(17)).error).toMatch(/truncated/i);
    expect(parseWmfHeader(createPlaceableWmf().subarray(0, 39)).error).toMatch(/truncated/i);

    const badSize = createPlaceableWmf();
    const view = new DataView(badSize.buffer);
    view.setUint32(28, 12, true);
    expect(parseWmfHeader(badSize).error).toMatch(/file size/i);

    view.setUint32(28, 9, true);
    view.setUint32(34, 20, true);
    expect(parseWmfHeader(badSize).error).toMatch(/max record/i);
  });

  it('accepts typed array slices without reading adjacent bytes', () => {
    const padded = new Uint8Array(60);
    padded.set(createPlaceableWmf(), 8);
    expect(parseWmfHeader(padded.subarray(8, 48)).ok).toBe(true);
  });
});

describe('decodeInput', () => {
  it('decodes hex and Base64 and rejects malformed data', () => {
    expect([...decodeInput('d7 cd', 'hex').bytes]).toEqual([0xd7, 0xcd]);
    expect([...decodeInput('180=', 'base64').bytes]).toEqual([0xd7, 0xcd]);
    expect(decodeInput('d', 'hex').ok).toBe(false);
    expect(decodeInput('!bad', 'base64').ok).toBe(false);
  });
});
