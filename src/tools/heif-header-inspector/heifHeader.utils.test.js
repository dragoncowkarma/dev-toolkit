import { describe, expect, it } from 'vitest';
import { parseHeifHeader } from './heifHeader.utils.js';

function box(type, data = [], extended = false) {
  const size = data.length + (extended ? 16 : 8);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, extended ? 1 : size);
  [...type].forEach((character, index) => view.setUint8(4 + index, character.charCodeAt(0)));
  if (extended) { view.setUint32(8, 0); view.setUint32(12, size); }
  bytes.set(data, extended ? 16 : 8);
  return bytes;
}

function join(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

function text(value) {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

describe('parseHeifHeader', () => {
  it('parses a valid HEIC ftyp and still-image metadata', () => {
    const ftyp = box('ftyp', join(text('heic'), new Uint8Array(4), text('mif1')));
    const pitm = box('pitm', Uint8Array.from([0, 0, 0, 0, 0, 7]));
    const ispe = box('ispe', Uint8Array.from([0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 3, 0]));
    const irot = box('irot', Uint8Array.from([0, 0, 0, 0, 1]));
    const ipco = box('ipco', join(ispe, irot));
    const meta = box('meta', join(new Uint8Array(4), pitm, box('iprp', ipco)));
    const result = parseHeifHeader(join(ftyp, meta));
    expect(result).toMatchObject({ ok: true, majorBrand: 'heic', primaryItemId: 7, rotation: 90 });
    expect(result.compatibleBrands).toEqual(['mif1']);
    expect(result.dimensions).toEqual({ width: 1024, height: 768 });
    expect(result.boxes[1].children.map((child) => child.type)).toEqual(['pitm', 'iprp']);
  });

  it('labels missing or non-HEIF brands without throwing', () => {
    expect(parseHeifHeader(new Uint8Array(8)).error).toMatch(/Missing ftyp/);
    const result = parseHeifHeader(box('ftyp', join(text('avif'), new Uint8Array(4))));
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/Unsupported brand/) });
  });

  it('returns a clear error for truncated input', () => {
    const truncated = Uint8Array.from([0, 0, 0, 20, 102, 116, 121, 112]);
    expect(parseHeifHeader(truncated).error).toMatch(/Invalid ftyp box size/);
  });

  it('supports 64-bit extended box sizes', () => {
    const result = parseHeifHeader(box('ftyp', join(text('heic'), new Uint8Array(4)), true));
    expect(result).toMatchObject({ ok: true, majorBrand: 'heic' });
    expect(result.boxes[0].headerSize).toBe(16);
  });
});
