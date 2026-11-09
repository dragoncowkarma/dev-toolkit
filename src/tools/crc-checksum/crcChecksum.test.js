import { describe, expect, it } from 'vitest';
import {
  adler32,
  crc8,
  crc16CcittFalse,
  crc32,
  inputToBytes,
  MAX_INPUT_BYTES,
} from './crcChecksum.utils.js';

describe('checksum algorithms', () => {
  const bytes = new TextEncoder().encode('123456789');

  it('matches standard CRC-8, CRC-16, CRC-32, and Adler-32 vectors', () => {
    expect(crc8(bytes)).toBe(0xf4);
    expect(crc16CcittFalse(bytes)).toBe(0x29b1);
    expect(crc32(bytes)).toBe(0xcbf43926);
    expect(adler32(bytes)).toBe(0x091e01de);
  });

  it('converts hexadecimal bytes and rejects invalid hex safely', () => {
    expect([...inputToBytes('31 32 33', 'hex')]).toEqual([0x31, 0x32, 0x33]);
    expect(() => inputToBytes('abc', 'hex')).toThrow(/even number/);
    expect(() => inputToBytes('gg', 'hex')).toThrow(/hexadecimal/);
  });

  it('accepts text input exactly at the MAX_INPUT_BYTES boundary', () => {
    const text = 'a'.repeat(MAX_INPUT_BYTES);
    expect(inputToBytes(text, 'text').byteLength).toBe(MAX_INPUT_BYTES);
  });

  it('rejects text input whose character length exceeds MAX_INPUT_BYTES', () => {
    const text = 'a'.repeat(MAX_INPUT_BYTES + 1);
    expect(() => inputToBytes(text, 'text')).toThrow(/too long/);
  });

  it('rejects multi-byte UTF-8 text over MAX_INPUT_BYTES bytes under the char limit', () => {
    // Each '한' is 3 bytes in UTF-8, so well under MAX_INPUT_BYTES characters
    // still produces more than MAX_INPUT_BYTES encoded bytes.
    const text = '한'.repeat(Math.floor(MAX_INPUT_BYTES / 2));
    expect(text.length).toBeLessThan(MAX_INPUT_BYTES);
    expect(() => inputToBytes(text, 'text')).toThrow(/too long/);
  });

  it('does not run the CRC loops on oversized input', () => {
    const text = 'a'.repeat(MAX_INPUT_BYTES + 1);
    expect(() => crc8(inputToBytes(text, 'text'))).toThrow(/too long/);
  });
});
