import { describe, expect, it } from 'vitest';
import { parseWebp } from './webp.utils.js';

function fourCc(value) {
  return [...value].map((character) => character.charCodeAt(0));
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
  const padding = payload.length % 2 ? [0] : [];
  return [...fourCc(name), ...uint32(payload.length), ...payload, ...padding];
}

function webp(...chunks) {
  const content = [...fourCc('WEBP'), ...chunks.flat()];
  return new Uint8Array([...fourCc('RIFF'), ...uint32(content.length), ...content]);
}

describe('parseWebp', () => {
  it('reads dimensions from a lossy VP8 key frame', () => {
    const bytes = webp(chunk('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01]));
    expect(parseWebp(bytes)).toMatchObject({ primaryChunk: 'VP8 ', width: 640, height: 480 });
  });

  it('reads dimensions from a lossless VP8L header', () => {
    const dimensions = (299 << 14) | 399;
    const payload = [0x2f, dimensions & 0xff, (dimensions >>> 8) & 0xff,
      (dimensions >>> 16) & 0xff, (dimensions >>> 24) & 0xff];
    expect(parseWebp(webp(chunk('VP8L', payload)))).toMatchObject({
      primaryChunk: 'VP8L', width: 400, height: 300,
    });
  });

  it('reads VP8X features, canvas dimensions, and optional chunks', () => {
    const vp8x = [0x12, 0, 0, 0, 0x1f, 0x03, 0, 0x57, 0x02, 0];
    const result = parseWebp(webp(chunk('VP8X', vp8x), chunk('ANIM', [0, 0, 0, 0, 0, 0])));
    expect(result).toMatchObject({ primaryChunk: 'VP8X', width: 800, height: 600 });
    expect(result.features).toEqual(['Alpha', 'Animation']);
    expect(result.optionalChunks).toEqual([{ name: 'ANIM', size: 6 }]);
  });

  it('rejects truncated containers and bad chunk padding with clear errors', () => {
    expect(() => parseWebp(new Uint8Array(fourCc('RIFF')))).toThrow(/shorter/);
    const bytes = webp(chunk('VP8L', [0x2f, 0, 0, 0, 0]));
    bytes[bytes.length - 1] = 1;
    expect(() => parseWebp(bytes)).toThrow(/padding/);
  });

  it('rejects RIFF containers with an invalid signature or form type', () => {
    const invalidRiff = webp(chunk('VP8L', [0x2f, 0, 0, 0, 0]));
    invalidRiff[0] = 0;
    const invalidFormType = webp(chunk('VP8L', [0x2f, 0, 0, 0, 0]));
    invalidFormType[8] = 0;

    expect(() => parseWebp(invalidRiff)).toThrow(/RIFF/);
    expect(() => parseWebp(invalidFormType)).toThrow(/form type/);
  });
});
