import { describe, expect, it } from 'vitest';
import { parseAvif } from './avif.utils.js';

const encoder = new TextEncoder();

function bytes(...values) {
  return Uint8Array.from(values.flatMap((value) =>
    typeof value === 'string' ? [...encoder.encode(value)] : Array.from(value)
  ));
}

function u16(value) {
  return [(value >>> 8) & 255, value & 255];
}

function u32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function box(type, payload) {
  return bytes(u32(payload.length + 8), type, payload);
}

function fullBox(type, version, payload) {
  return box(type, bytes([version, 0, 0, 0], payload));
}

function avifFile(...children) {
  return bytes(box('ftyp', bytes('avif', u32(0), 'mif1', 'avif')), ...children).buffer;
}

describe('parseAvif', () => {
  it('parses a minimal valid still-image AVIF', () => {
    const parsed = parseAvif(avifFile(box('mdat', bytes([1, 2, 3]))));

    expect(parsed.majorBrand).toBe('avif');
    expect(parsed.summary.isSequence).toBe(false);
    expect(parsed.boxes.map((entry) => entry.type)).toEqual(['ftyp', 'mdat']);
  });

  it('rejects a truncated box with a bounds-checked error', () => {
    expect(() => parseAvif(bytes(u32(24), 'ftyp', 'avif').buffer)).toThrow(/bounds|truncated/i);
  });

  it('rejects an invalid major brand', () => {
    const file = bytes(box('ftyp', bytes('heic', u32(0), 'mif1'))).buffer;
    expect(() => parseAvif(file)).toThrow(/major brand must be avif or avis/i);
  });

  it('resolves dimensions and bit depth from ispe and pixi properties', () => {
    const infe = fullBox('infe', 2, bytes(u16(1), u16(0), 'av01', 'Color', [0]));
    const iinf = fullBox('iinf', 0, bytes(u16(1), infe));
    const ispe = fullBox('ispe', 0, bytes(u32(1920), u32(1080)));
    const pixi = fullBox('pixi', 0, bytes([3, 10, 10, 10]));
    const ipco = box('ipco', bytes(ispe, pixi));
    const ipma = fullBox('ipma', 0, bytes(u32(1), u16(1), [2, 1, 2]));
    const meta = fullBox('meta', 0, bytes(iinf, box('iprp', bytes(ipco, ipma))));
    const parsed = parseAvif(avifFile(meta));

    expect(parsed.summary).toMatchObject({ width: 1920, height: 1080, bitDepth: 10 });
    expect(parsed.items[0]).toMatchObject({ itemId: 1, itemType: 'av01', name: 'Color' });
  });
});
