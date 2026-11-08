import { describe, expect, it } from 'vitest';
import { adler32, crc8, crc16CcittFalse, crc32, inputToBytes } from './crcChecksum.utils.js';

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
});
