import { describe, expect, it } from 'vitest';
import { parseWebp } from './webp.utils.js';

function fourCc(value) {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function chunk(name, data) {
  const size = data.length;
  return [...fourCc(name), size & 0xff, (size >> 8) & 0xff, 0, 0, ...data, ...(size % 2 ? [0] : [])];
}

function webp(...chunks) {
  const body = [...fourCc('WEBP'), ...chunks.flat()];
  const size = body.length;
  return new Uint8Array([...fourCc('RIFF'), size & 0xff, (size >> 8) & 0xff, 0, 0, ...body]);
}

describe('parseWebp', () => {
  it('parses dimensions from a lossy VP8 image chunk', () => {
    const vp8 = [0, 0, 0, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01];
    expect(parseWebp(webp(chunk('VP8 ', vp8)))).toMatchObject({
      imageType: 'VP8 ', width: 640, height: 480, features: [], optionalChunks: [],
    });
  });

  it('parses dimensions from a lossless VP8L image chunk', () => {
    const vp8l = [0x2f, 0x7f, 0x00, 0x3f, 0x00];
    expect(parseWebp(webp(chunk('VP8L', vp8l)))).toMatchObject({
      imageType: 'VP8L', width: 128, height: 253, features: [],
    });
  });

  it('parses VP8X features, canvas dimensions, and optional chunks', () => {
    const vp8x = [0x22, 0, 0, 0, 0x1f, 0x00, 0x00, 0x0f, 0x00, 0x00];
    expect(parseWebp(webp(chunk('VP8X', vp8x), chunk('ANIM', [1, 2, 3, 4, 5, 6])))).toMatchObject({
      imageType: 'VP8X', width: 32, height: 16,
      features: ['ICC profile', 'Animation'],
      optionalChunks: [{ name: 'ANIM', size: 6 }],
    });
  });

  it('rejects a truncated chunk and a missing odd-byte padding byte', () => {
    const truncated = webp(chunk('VP8 ', [0, 0, 0, 0x9d]));
    expect(() => parseWebp(truncated)).toThrow(/truncated/i);

    const missingPadding = webp(chunk('VP8L', [0x2f, 0, 0, 0, 0])).slice(0, -1);
    missingPadding[4] -= 1;
    expect(() => parseWebp(missingPadding)).toThrow(/padding/i);
  });

  it('rejects incorrect RIFF and WEBP magic values', () => {
    const invalid = webp(chunk('VP8L', [0x2f, 0, 0, 0, 0]));
    invalid[0] = 0;
    expect(() => parseWebp(invalid)).toThrow(/RIFF magic/i);
  });
});
