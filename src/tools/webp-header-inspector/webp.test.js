import { describe, expect, it } from 'vitest';
import { WebpParseError, parseWebp } from './webp.utils.js';

function fourCc(value) {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function uint32(value) {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

function chunk(name, payload) {
  return [...fourCc(name), ...uint32(payload.length), ...payload, ...(payload.length % 2 ? [0] : [])];
}

function webp(chunks) {
  const body = [...fourCc('WEBP'), ...chunks.flat()];
  const header = [...fourCc('RIFF'), ...uint32(body.length)];
  return new Uint8Array([...header, ...body]);
}

describe('parseWebp', () => {
  it('parses a valid lossy VP8 header', () => {
    const bytes = webp([
      chunk('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01]),
    ]);

    expect(parseWebp(bytes)).toMatchObject({
      formType: 'WEBP',
      chunkType: 'VP8 ',
      width: 640,
      height: 480,
      features: {},
      optionalChunks: [],
    });
  });

  it('parses a valid lossless VP8L header', () => {
    const dimensions = ((599 << 14) | 799) >>> 0;
    const bytes = webp([chunk('VP8L', [0x2f, ...uint32(dimensions)])]);

    expect(parseWebp(bytes)).toMatchObject({ chunkType: 'VP8L', width: 800, height: 600 });
  });

  it('parses VP8X flags, canvas dimensions, and optional chunks', () => {
    const bytes = webp([
      chunk('VP8X', [0x32, 0, 0, 0, 0x7f, 0x02, 0, 0xdf, 0x01, 0]),
      chunk('ANIM', [0, 0, 0, 0, 0, 0]),
    ]);

    expect(parseWebp(bytes)).toMatchObject({
      chunkType: 'VP8X',
      width: 640,
      height: 480,
      features: { iccProfile: true, alpha: true, exif: false, xmp: false, animation: true },
      optionalChunks: [{ name: 'ANIM', size: 6 }],
    });
  });

  it('rejects truncated containers and missing odd-byte chunk padding', () => {
    const truncated = new Uint8Array([...fourCc('RIFF'), ...uint32(4), ...fourCc('WEBP')]);
    const unpadded = new Uint8Array([
      ...fourCc('RIFF'),
      ...uint32(21),
      ...fourCc('WEBP'),
      ...fourCc('VP8L'),
      ...uint32(5),
      0x2f,
      0,
      0,
      0,
      0,
    ]);

    expect(() => parseWebp(truncated)).toThrow(WebpParseError);
    expect(() => parseWebp(unpadded)).toThrow(/non-even chunk padding|truncated/i);
  });

  it('rejects files with invalid RIFF or WEBP magic', () => {
    const invalidRiff = webp([chunk('VP8L', [0x2f, 0, 0, 0, 0])]);
    invalidRiff[0] = 0;
    const invalidWebp = webp([chunk('VP8L', [0x2f, 0, 0, 0, 0])]);
    invalidWebp[8] = 0;

    expect(() => parseWebp(invalidRiff)).toThrow(/RIFF magic/i);
    expect(() => parseWebp(invalidWebp)).toThrow(/WEBP form type/i);
  });
});
