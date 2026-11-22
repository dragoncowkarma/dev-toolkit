import { describe, expect, it } from 'vitest';
import { parseSwfHeader, twipsToPixels } from './swfHeader.utils.js';

function writeBits(values) {
  const bytes = new Uint8Array(Math.ceil(values.length / 8));
  values.forEach((value, index) => {
    if (value) {
      bytes[Math.floor(index / 8)] |= 1 << (7 - (index % 8));
    }
  });
  return bytes;
}

function signedBits(value, width) {
  const normalized = value < 0 ? 2 ** width + value : value;
  return Array.from({ length: width }, (_, index) => (normalized >> (width - index - 1)) & 1);
}

function createFwsHeader() {
  const nbits = 15;
  const bits = [0, 1, 1, 1, 1];
  for (const value of [0, 11000, 0, 8000]) {
    bits.push(...signedBits(value, nbits));
  }
  const rect = writeBits(bits);
  const bytes = new Uint8Array(8 + rect.length + 4);
  bytes.set([0x46, 0x57, 0x53, 9], 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length, true);
  bytes.set(rect, 8);
  bytes.set([0, 24, 42, 0], 8 + rect.length);
  return bytes.buffer;
}

function createCompressedHeader(signature) {
  const bytes = new Uint8Array(8);
  bytes.set([...signature].map((character) => character.charCodeAt(0)));
  bytes[3] = 20;
  new DataView(bytes.buffer).setUint32(4, 12345, true);
  return bytes.buffer;
}

describe('parseSwfHeader', () => {
  it('parses an uncompressed FWS header including frame data', () => {
    expect(parseSwfHeader(createFwsHeader())).toMatchObject({
      signature: 'FWS',
      compression: 'Uncompressed',
      version: 9,
      frameSize: { xmin: 0, xmax: 11000, ymin: 0, ymax: 8000 },
      frameRate: 24,
      frameCount: 42,
    });
  });

  it.each(['CWS', 'ZWS'])('reports decompression as required for %s', (signature) => {
    expect(parseSwfHeader(createCompressedHeader(signature))).toEqual({
      signature,
      compression: signature === 'CWS' ? 'zlib-compressed' : 'LZMA-compressed',
      version: 20,
      fileLength: 12345,
      decompressionRequired: true,
    });
  });

  it('reports missing or truncated input clearly', () => {
    expect(() => parseSwfHeader()).toThrow('No file selected');
    const truncatedFws = new Uint8Array(8);
    truncatedFws.set([0x46, 0x57, 0x53]);
    expect(() => parseSwfHeader(truncatedFws.buffer)).toThrow('too short or truncated');
  });

  it('reports an unrecognized signature clearly', () => {
    const bytes = new Uint8Array(8);
    bytes.set([0x42, 0x41, 0x44]);
    expect(() => parseSwfHeader(bytes.buffer)).toThrow('Unrecognized SWF signature "BAD"');
  });
});

describe('twipsToPixels', () => {
  it('converts twentieths of a pixel to pixels', () => {
    expect(twipsToPixels(11000)).toBe(550);
  });
});
