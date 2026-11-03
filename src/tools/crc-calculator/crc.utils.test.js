import { describe, expect, it } from 'vitest';
import {
  crc8,
  crc16,
  crc32,
  fileToBytes,
  formatChecksum,
  MAX_INPUT_BYTES,
  textToBytes,
} from './crc.utils.js';

describe('CRC checksum algorithms', () => {
  const bytes = textToBytes('123456789');

  it('calculates the CRC-8 check value', () => {
    expect(formatChecksum(crc8(bytes), 2)).toBe('0xF4');
  });

  it('calculates the CRC-16/CCITT-FALSE check value', () => {
    expect(formatChecksum(crc16(bytes), 4)).toBe('0x29B1');
  });

  it('calculates the standard zlib-compatible CRC-32 check value', () => {
    expect(formatChecksum(crc32(bytes), 8)).toBe('0xCBF43926');
  });

  it('accepts arbitrary binary bytes without text conversion', () => {
    expect(formatChecksum(crc32(new Uint8Array([0, 255, 128, 1])), 8)).toBe('0xD358432C');
  });

  it('rejects files exceeding the input limit before reading them', () => {
    const file = new File([new Uint8Array(MAX_INPUT_BYTES + 1)], 'large.bin');

    expect(() => fileToBytes(file)).toThrow('File is too large. Choose a file up to 256.0 KB.');
  });
});
