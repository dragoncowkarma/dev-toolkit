import { describe, expect, it } from 'vitest';
import {
  computeMod97,
  constructIban,
  formatIban,
  normalizeIban,
  validateIban,
} from './iban.utils.js';

describe('IBAN validation', () => {
  it('normalizes, validates, formats, and parses a German IBAN', () => {
    expect(validateIban('DE89 3704 0044 0532 0130 00')).toMatchObject({
      isValid: true,
      iban: 'DE89370400440532013000',
      formattedIban: 'DE89 3704 0044 0532 0130 00',
      countryCode: 'DE',
      checkDigits: '89',
      bban: '370400440532013000',
      error: '',
    });
  });

  it.each(['GB29NWBK60161331926819', 'FR1420041010050500013M02606'])(
    'accepts a valid non-German IBAN: %s',
    (iban) => {
      expect(validateIban(iban)).toMatchObject({ isValid: true, error: '' });
    },
  );

  it('reports an invalid MOD-97 checksum without throwing', () => {
    expect(validateIban('DE89370400440532013001')).toMatchObject({
      isValid: false,
      error: expect.stringContaining('checksum failed'),
    });
  });

  it.each([
    ['', 'Enter an IBAN'],
    ['D', 'at least'],
    ['1E89370400440532013000', 'two-letter country code'],
    ['ZZ89370400440532013000', 'unrecognized'],
    ['DE8937040044053201300', 'exactly 22'],
    ['DE89-370400440532013000', 'only letters, numbers'],
  ])('returns a controlled error for malformed input %j', (iban, message) => {
    expect(validateIban(iban)).toMatchObject({
      isValid: false,
      error: expect.stringContaining(message),
    });
  });
});

describe('IBAN construction and safe MOD-97 arithmetic', () => {
  it('calculates known German check digits from a BBAN', () => {
    expect(constructIban('DE', '370400440532013000')).toMatchObject({
      isValid: true,
      checkDigits: '89',
      iban: 'DE89370400440532013000',
    });
  });

  it('handles a long numeric conversion without unsafe Number precision', () => {
    const longBban = '12345678901234567890123456789012345678901234567890';
    const expectedRemainder = longBban.split('').reduce(
      (remainder, digit) => (remainder * 10 + Number(digit)) % 97,
      0,
    );

    expect(computeMod97(longBban)).toBe(expectedRemainder);
    expect(Number(longBban) % 97).not.toBe(expectedRemainder);
  });

  it('formats every four IBAN characters and handles normalization errors', () => {
    expect(formatIban('GB29NWBK60161331926819')).toBe('GB29 NWBK 6016 1331 9268 19');
    expect(normalizeIban('DE89-3704')).toMatchObject({ error: expect.stringContaining('only') });
  });
});
