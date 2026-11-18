import { describe, expect, it } from 'vitest';
import { parseGif } from './gifHeaderInspector.utils.js';

function gifBytes(signature, body) {
  return new Uint8Array([...signature].map((character) => character.charCodeAt(0)).concat(body));
}

describe('parseGif', () => {
  it.each(['GIF87a', 'GIF89a'])('accepts the %s signature', (signature) => {
    const result = parseGif(gifBytes(signature, [1, 0, 1, 0, 0, 0, 0, 0x3b]));
    expect(result.signature).toBe(signature);
    expect(result.errors).toEqual([]);
    expect(result.hasTrailer).toBe(true);
  });

  it('reports an invalid signature without throwing', () => {
    const result = parseGif(gifBytes('NOTGIF', [1, 0, 1, 0, 0, 0, 0]));
    expect(result.errors[0]).toMatch(/invalid gif signature/i);
  });

  it('decodes the Logical Screen Descriptor fields', () => {
    const result = parseGif(gifBytes('GIF89a', [0x20, 0x03, 0x58, 0x02, 0xbd, 7, 42, 0x3b]));
    expect(result.logicalScreen).toMatchObject({
      width: 800,
      height: 600,
      globalColorTableFlag: true,
      colorResolution: 4,
      sortFlag: true,
      globalColorTableSize: 64,
      backgroundColorIndex: 7,
      pixelAspectRatio: 42,
    });
  });

  it('decodes the Global Color Table', () => {
    const result = parseGif(gifBytes('GIF87a', [1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 0, 0, 0x3b]));
    expect(result.globalColorTable).toMatchObject({
      size: 2,
      colors: [{ hex: '#000000' }, { hex: '#FF0000' }],
    });
  });

  it('parses a Graphic Control Extension', () => {
    const result = parseGif(gifBytes('GIF89a', [
      1, 0, 1, 0, 0, 0, 0,
      0x21, 0xf9, 4, 0x05, 10, 0, 3, 0,
      0x3b,
    ]));
    expect(result.blocks[0]).toMatchObject({
      type: 'Graphic Control Extension',
      details: {
        disposalMethod: 1,
        transparentColor: true,
        delayTime: 10,
        transparentColorIndex: 3,
      },
    });
  });

  it.each([
    ['a truncated descriptor', gifBytes('GIF89a', [1, 0])],
    [
      'a malformed block introducer',
      gifBytes('GIF89a', [1, 0, 1, 0, 0, 0, 0, 0x00]),
    ],
    ['a missing trailer', gifBytes('GIF89a', [1, 0, 1, 0, 0, 0, 0])],
  ])('reports %s without throwing', (_name, bytes) => {
    expect(() => parseGif(bytes)).not.toThrow();
    expect(parseGif(bytes).errors).not.toHaveLength(0);
  });
});
