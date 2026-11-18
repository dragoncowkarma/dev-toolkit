import { describe, expect, it } from 'vitest';
import { parseMp4Boxes } from './mp4-box-inspector.utils.js';

function fourCc(value) {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function uint32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function box(type, payload = []) {
  return [...uint32(payload.length + 8), ...fourCc(type), ...payload];
}

function extendedBox(type, payload = []) {
  const size = BigInt(payload.length + 16);
  const high = Number(size >> 32n);
  const low = Number(size & 0xffffffffn);
  return [...uint32(1), ...fourCc(type), ...uint32(high), ...uint32(low), ...payload];
}

function uuidBox(payload = []) {
  const userType = Array.from({ length: 16 }, (_, index) => index);
  return [...uint32(payload.length + 24), ...fourCc('uuid'), ...userType, ...payload];
}

function toBuffer(bytes) {
  return Uint8Array.from(bytes).buffer;
}

describe('parseMp4Boxes', () => {
  it('parses a minimal ftyp and moov fixture with movie metadata', () => {
    const ftyp = box('ftyp', [
      ...fourCc('isom'), ...uint32(512), ...fourCc('isom'), ...fourCc('mp42'),
    ]);
    const mvhd = box('mvhd', [
      0, 0, 0, 0, ...uint32(0), ...uint32(0), ...uint32(1000), ...uint32(5000),
    ]);
    const parsed = parseMp4Boxes(toBuffer([...ftyp, ...box('moov', mvhd)]));

    expect(parsed.boxes.map((item) => item.type)).toEqual(['ftyp', 'moov']);
    expect(parsed.boxes[1].children[0]).toMatchObject({ type: 'mvhd', offset: ftyp.length + 8 });
    expect(parsed.metadata.fileType).toEqual({
      majorBrand: 'isom',
      minorVersion: 512,
      compatibleBrands: ['isom', 'mp42'],
    });
    expect(parsed.metadata.movie).toEqual({ timescale: 1000, duration: 5000 });
  });

  it('reports a clear error for a truncated box', () => {
    const truncated = toBuffer([...uint32(20), ...fourCc('ftyp'), 1, 2]);

    expect(() => parseMp4Boxes(truncated)).toThrow(/Truncated/);
  });

  it('supports boxes with 64-bit extended sizes', () => {
    const parsed = parseMp4Boxes(toBuffer(extendedBox('free', [1, 2, 3, 4])));

    expect(parsed.boxes[0]).toMatchObject({ type: 'free', size: 20, headerSize: 16 });
  });

  it('reads the UUID user type from uuid box headers', () => {
    const parsed = parseMp4Boxes(toBuffer(uuidBox([1, 2])));

    expect(parsed.boxes[0]).toMatchObject({
      type: 'uuid',
      headerSize: 24,
      userType: '00010203-0405-0607-0809-0a0b0c0d0e0f',
    });
  });
});
