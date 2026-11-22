import { describe, expect, it } from 'vitest';
import { parseXcfHeader } from './xcf.utils.js';

function uint32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function float32(value) {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, false);
  return [...new Uint8Array(buffer)];
}

function xcfBytes(version, properties = []) {
  const bytes = [
    ...new TextEncoder().encode(`gimp xcf ${version}\0`),
    ...uint32(800),
    ...uint32(600),
    ...uint32(0),
  ];
  if (Number(version.slice(1)) >= 4) bytes.push(...uint32(150));
  for (const [type, payload] of properties) {
    bytes.push(...uint32(type), ...uint32(payload.length), ...payload);
  }
  bytes.push(...uint32(0), ...uint32(0));
  return new Uint8Array(bytes).buffer;
}

describe('parseXcfHeader', () => {
  it('parses a v011 header and selected image properties', () => {
    const header = parseXcfHeader(xcfBytes('v011', [
      [17, [2]],
      [19, [...float32(300), ...float32(150)]],
    ]));

    expect(header).toMatchObject({
      version: 'v011', width: 800, height: 600, baseType: 'RGB',
      precision: '8-bit integer non-linear', compression: 'Zlib',
      resolution: { x: 300, y: 150 }, propertyCount: 2,
    });
  });

  it('parses a legacy v000-era header without a precision field', () => {
    const header = parseXcfHeader(xcfBytes('file', [[17, [1]]]));

    expect(header).toMatchObject({
      version: 'v000 (unversioned)', precision: '8-bit integer non-linear (legacy default)',
      compression: 'RLE',
    });
  });

  it('rejects truncated input', () => {
    expect(() => parseXcfHeader(new ArrayBuffer(12))).toThrow(/Truncated/);
  });

  it('rejects non-XCF magic bytes', () => {
    const bytes = new Uint8Array(xcfBytes('v011'));
    bytes[0] = 0;
    expect(() => parseXcfHeader(bytes.buffer)).toThrow(/not a GIMP XCF/);
  });
});
