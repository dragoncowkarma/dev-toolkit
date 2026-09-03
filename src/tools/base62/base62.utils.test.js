import { describe, expect, it } from 'vitest';
import { BASE62_ALPHABET, decodeBase62, encodeBase62 } from './base62.utils.js';

describe('encodeBase62', () => {
  it('uses the standard 0-9, a-z, A-Z alphabet', () => {
    expect(BASE62_ALPHABET).toBe('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(encodeBase62('61')).toBe('Z');
    expect(encodeBase62('62')).toBe('10');
  });

  it('encodes zero and canonicalizes leading decimal zeroes', () => {
    expect(encodeBase62('0')).toBe('0');
    expect(encodeBase62('000123')).toBe('1Z');
  });

  it('handles integers larger than Number.MAX_SAFE_INTEGER', () => {
    const value = '1234567890123456789012345678901234567890';
    expect(decodeBase62(encodeBase62(value))).toBe(value);
  });

  it('rejects negative and non-integer decimal values', () => {
    expect(() => encodeBase62('-1')).toThrow('Negative numbers');
    expect(() => encodeBase62('1.5')).toThrow('non-negative whole number');
    expect(() => encodeBase62('12e3')).toThrow('non-negative whole number');
  });
});

describe('decodeBase62', () => {
  it('decodes values using case-sensitive Base62 digits', () => {
    expect(decodeBase62('10')).toBe('62');
    expect(decodeBase62('a')).toBe('10');
    expect(decodeBase62('A')).toBe('36');
  });

  it('round-trips a very large Base62 value', () => {
    const value = 'zzZZ00123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(encodeBase62(decodeBase62(value))).toBe(value);
  });

  it('rejects invalid characters with a clear validation message', () => {
    expect(() => decodeBase62('abc-123')).toThrow('0-9, a-z, and A-Z');
    expect(() => decodeBase62('abc 123')).toThrow('0-9, a-z, and A-Z');
  });
});
