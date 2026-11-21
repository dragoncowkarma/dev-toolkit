import { describe, expect, it } from 'vitest';
import { decodePsdInput, parsePsdHeader } from './psd-header.utils.js';

function writeU16(bytes, value) {
  bytes.push((value >>> 8) & 0xff, value & 0xff);
}

function writeU32(bytes, value) {
  bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function createDocument(version = 1) {
  const bytes = [...'8BPS'].map((character) => character.charCodeAt(0));
  writeU16(bytes, version);
  bytes.push(0, 0, 0, 0, 0, 0);
  writeU16(bytes, 3);
  writeU32(bytes, 480);
  writeU32(bytes, 640);
  writeU16(bytes, 8);
  writeU16(bytes, 3);
  writeU32(bytes, 0);
  writeU32(bytes, 0);
  if (version === 1) {
    writeU32(bytes, 0);
  } else {
    bytes.push(0, 0, 0, 0, 0, 0, 0, 0);
  }
  return Uint8Array.from(bytes);
}

describe('parsePsdHeader', () => {
  it('parses a minimal valid PSD header', () => {
    expect(parsePsdHeader(createDocument())).toMatchObject({
      signature: '8BPS',
      format: 'PSD',
      version: 1,
      channels: 3,
      width: 640,
      height: 480,
      depth: 8,
      colorMode: 'RGB',
      colorModeDataLength: 0,
      layerMaskLength: '0',
    });
  });

  it('rejects an invalid signature', () => {
    const bytes = createDocument();
    bytes[0] = 'X'.charCodeAt(0);
    expect(() => parsePsdHeader(bytes)).toThrow('Invalid PSD signature');
  });

  it('fails gracefully for truncated section data', () => {
    const bytes = createDocument().slice(0, 30);
    bytes[26] = 0;
    bytes[27] = 0;
    bytes[28] = 0;
    bytes[29] = 2;
    expect(() => parsePsdHeader(bytes)).toThrow(/Color Mode Data section is truncated/);
  });

  it('parses a PSB version 2 header with its 64-bit layer length', () => {
    expect(parsePsdHeader(createDocument(2))).toMatchObject({
      format: 'PSB',
      version: 2,
      layerMaskLength: '0',
    });
  });
});

describe('decodePsdInput', () => {
  it('decodes hexadecimal and Base64 byte input', () => {
    expect(decodePsdInput('38 42 50 53')).toEqual(Uint8Array.from([56, 66, 80, 83]));
    expect(decodePsdInput('OEJQUw==')).toEqual(Uint8Array.from([56, 66, 80, 83]));
  });
});
