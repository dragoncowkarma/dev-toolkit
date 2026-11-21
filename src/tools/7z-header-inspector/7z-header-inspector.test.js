import { describe, expect, it } from 'vitest';
import { calculateCrc32, parse7zSignatureHeader } from './7z-header-inspector.utils.js';

function createSignatureHeader({ crcIsValid = true } = {}) {
  const bytes = new Uint8Array(32);
  bytes.set([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
  bytes[6] = 0;
  bytes[7] = 4;
  const view = new DataView(bytes.buffer);
  view.setBigUint64(12, 1234567890123456789n, true);
  view.setBigUint64(20, 9876543210n, true);
  view.setUint32(28, 0xa1b2c3d4, true);
  view.setUint32(8, calculateCrc32(bytes.slice(12)), true);
  if (!crcIsValid) bytes[8] ^= 0xff;
  return bytes;
}

describe('parse7zSignatureHeader', () => {
  it('parses and validates a complete 7-Zip signature header', () => {
    expect(parse7zSignatureHeader(createSignatureHeader())).toEqual({
      version: '0.4',
      declaredStartHeaderCrc32: '0x45F96D28',
      computedStartHeaderCrc32: '0x45F96D28',
      nextHeaderOffset: '1234567890123456789',
      nextHeaderSize: '9876543210',
      nextHeaderCrc32: '0xA1B2C3D4',
    });
  });

  it('rejects a header with a mismatched start-header CRC32', () => {
    expect(() => parse7zSignatureHeader(createSignatureHeader({ crcIsValid: false }))).toThrow(
      /Start header CRC32 mismatch/
    );
  });

  it('rejects truncated files', () => {
    expect(() => parse7zSignatureHeader(new Uint8Array(31))).toThrow(/too short/);
  });

  it('rejects files without the 7-Zip signature', () => {
    const invalidHeader = createSignatureHeader();
    invalidHeader[0] = 0;
    expect(() => parse7zSignatureHeader(invalidHeader)).toThrow(/Invalid 7-Zip signature/);
  });
});
