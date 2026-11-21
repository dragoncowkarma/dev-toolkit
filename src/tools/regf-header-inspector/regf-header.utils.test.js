import { describe, expect, it } from 'vitest';
import {
  computeRegfChecksum,
  decodeBase64,
  decodeHex,
  parseRegfHeader,
} from './regf-header.utils.js';

function createHeader({ sequence1 = 7, sequence2 = sequence1, validChecksum = true } = {}) {
  const bytes = new Uint8Array(512);
  bytes.set([0x72, 0x65, 0x67, 0x66]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, sequence1, true);
  view.setUint32(8, sequence2, true);
  view.setBigUint64(12, 132223104000000000n, true);
  view.setUint32(20, 1, true);
  view.setUint32(24, 5, true);
  view.setUint32(28, 0, true);
  view.setUint32(32, 1, true);
  view.setUint32(36, 32, true);
  view.setUint32(40, 4096, true);
  [...'SYSTEM'].forEach((character, index) => {
    view.setUint16(48 + index * 2, character.charCodeAt(0), true);
  });
  const checksum = computeRegfChecksum(bytes);
  view.setUint32(508, validChecksum ? checksum : checksum ^ 0xFFFFFFFF, true);
  return bytes;
}

describe('parseRegfHeader', () => {
  it('parses a valid minimal fixed header', () => {
    const result = parseRegfHeader(createHeader());

    expect(result).toMatchObject({
      magic: 'regf',
      sequence1: 7,
      sequence2: 7,
      sequencesMatch: true,
      majorVersion: 1,
      minorVersion: 5,
      fileType: 0,
      fileFormat: 1,
      rootCellOffset: 32,
      hiveBinDataSize: 4096,
      hiveName: 'SYSTEM',
      checksumMatches: true,
    });
    expect(result.lastWritten.utc).toBe('2020-01-01T00:00:00.000Z');
  });

  it('rejects a bad magic signature', () => {
    const bytes = createHeader();
    bytes[0] = 0;
    expect(() => parseRegfHeader(bytes)).toThrow(/Invalid REGF signature/);
  });

  it('rejects a truncated buffer with its actual length', () => {
    expect(() => parseRegfHeader(new Uint8Array(511))).toThrow(
      'Truncated REGF header: expected at least 512 bytes, got 511.'
    );
  });

  it('returns a warning state rather than throwing for a checksum mismatch', () => {
    const result = parseRegfHeader(createHeader({ validChecksum: false }));
    expect(result.checksumMatches).toBe(false);
    expect(result.declaredChecksum).not.toBe(result.computedChecksum);
  });

  it('reports matching and mismatched sequence numbers', () => {
    expect(parseRegfHeader(createHeader()).sequencesMatch).toBe(true);
    expect(parseRegfHeader(createHeader({ sequence2: 8 })).sequencesMatch).toBe(false);
  });

  it('reads only the fixed header when trailing hive bytes are present', () => {
    const input = new Uint8Array(4096);
    input.set(createHeader());
    expect(parseRegfHeader(input).hiveName).toBe('SYSTEM');
  });
});

describe('text input decoders', () => {
  it('decodes whitespace-separated hexadecimal bytes', () => {
    expect(decodeHex('72 65\n67 66')).toEqual(Uint8Array.from([0x72, 0x65, 0x67, 0x66]));
  });

  it('decodes Base64 bytes', () => {
    expect(decodeBase64('cmVnZg==')).toEqual(Uint8Array.from([0x72, 0x65, 0x67, 0x66]));
  });

  it('rejects malformed text encodings', () => {
    expect(() => decodeHex('regf')).toThrow(/Invalid hexadecimal/);
    expect(() => decodeBase64('***=')).toThrow(/Invalid Base64/);
  });
});
