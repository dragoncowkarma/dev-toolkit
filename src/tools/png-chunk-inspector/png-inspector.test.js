import { describe, expect, it } from 'vitest';
import { crc32, parsePng } from './png-inspector.utils.js';

const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const encoder = new TextEncoder();

function chunk(type, data = []) {
  const typeBytes = encoder.encode(type); const payload = Uint8Array.from(data);
  const output = new Uint8Array(12 + payload.length); const view = new DataView(output.buffer);
  view.setUint32(0, payload.length); output.set(typeBytes, 4); output.set(payload, 8);
  view.setUint32(8 + payload.length, crc32(output.slice(4, 8 + payload.length)));
  return output;
}
function png(...chunks) {
  return Uint8Array.from([...signature, ...chunks.flatMap((item) => [...item])]);
}

describe('parsePng', () => {
  it('rejects an invalid PNG signature', () => {
    expect(() => parsePng(new Uint8Array(8))).toThrow('Invalid PNG signature');
  });
  it('parses chunks, validates CRCs, and decodes IHDR', () => {
    const ihdr = chunk('IHDR', [0, 0, 0, 2, 0, 0, 0, 3, 8, 6, 0, 0, 0]);
    const result = parsePng(png(ihdr, chunk('IEND')));
    expect(result.errors).toEqual([]);
    expect(result.chunks[0]).toMatchObject({
      type: 'IHDR', offset: 8, length: 13, crcValid: true,
      decoded: { width: 2, height: 3, bitDepth: 8, colorType: 6 },
    });
  });
  it('decodes tEXt metadata', () => {
    const ihdr = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
    const text = chunk('tEXt', [...encoder.encode('Author'), 0, ...encoder.encode('Ada')]);
    const result = parsePng(png(ihdr, text, chunk('IEND')));
    expect(result.chunks[1].decoded).toEqual({ keyword: 'Author', text: 'Ada' });
  });
  it('reports bad CRCs and truncated chunks without crashing', () => {
    const ihdr = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
    const image = png(ihdr, chunk('IEND'));
    image[20] ^= 1;
    expect(parsePng(image).errors[0]).toMatch(/CRC mismatch.*chunk 0.*offset 8/);
    expect(() => parsePng(png(Uint8Array.from([0, 0, 0, 4, 73, 68, 65, 84]))))
      .toThrow(/Truncated chunk header|declares/);
  });
});
