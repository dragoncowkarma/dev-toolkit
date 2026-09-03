import { describe, expect, it } from 'vitest';
import { decodeFromBase36, encodeToBase36, isValidBase36 } from './base36.utils.js';

describe('encodeToBase36', () => {
  it('encodes known values using uppercase output', () => {
    expect(encodeToBase36('0')).toBe('0');
    expect(encodeToBase36('35')).toBe('Z');
    expect(encodeToBase36('36')).toBe('10');
  });

  it('encodes arbitrarily large integers without precision loss', () => {
    expect(encodeToBase36(123456789012345678901234567890n)).toBe('BYW97UM9S91DLZ68TSI');
  });

  it('rejects empty, negative, and non-integer decimal values', () => {
    expect(() => encodeToBase36('')).toThrow('Enter a non-negative integer.');
    expect(() => encodeToBase36('-1')).toThrow('Enter a non-negative integer');
    expect(() => encodeToBase36('1.5')).toThrow('Enter a non-negative integer');
  });
});

describe('decodeFromBase36', () => {
  it('decodes uppercase and lowercase values', () => {
    expect(decodeFromBase36('Z')).toBe(35n);
    expect(decodeFromBase36('10')).toBe(36n);
    expect(decodeFromBase36('byw97um9s91dlz68tsi')).toBe(123456789012345678901234567890n);
  });

  it('round-trips a large integer', () => {
    const value = 900719925474099312345678901234567890n;
    expect(decodeFromBase36(encodeToBase36(value))).toBe(value);
  });

  it('rejects empty and invalid Base36 input', () => {
    const invalidBase36Message = 'Base36 can only contain digits 0-9 and letters A-Z.';

    expect(() => decodeFromBase36('')).toThrow('Enter a Base36 value.');
    expect(() => decodeFromBase36('A-1')).toThrow(invalidBase36Message);
    expect(() => decodeFromBase36('ABC ')).toThrow(invalidBase36Message);
  });
});

describe('isValidBase36', () => {
  it('only accepts non-empty Base36 strings', () => {
    expect(isValidBase36('0Zaz')).toBe(true);
    expect(isValidBase36('')).toBe(false);
    expect(isValidBase36('10!')).toBe(false);
  });
});
