import { describe, expect, it } from 'vitest';
import {
  computeCheckDigit,
  computeLuhnCheckDigit,
  detectNetwork,
  formatCardNumber,
  isLuhnValid,
  normalizeCardNumber,
  validateCard,
  validateLength,
} from './card.utils.js';

describe('Card validation', () => {
  it('normalizes, validates, formats, and parses a Visa test PAN', () => {
    expect(validateCard('4111 1111 1111 1111')).toMatchObject({
      isValid: true,
      digits: '4111111111111111',
      formattedNumber: '4111 1111 1111 1111',
      network: 'Visa',
      digitCount: 16,
      lastFour: '1111',
      error: '',
    });
  });

  it('validates a Mastercard test PAN', () => {
    expect(validateCard('5500 0055 5555 5559')).toMatchObject({
      isValid: true,
      network: 'Mastercard',
      digitCount: 16,
      lastFour: '5559',
      error: '',
    });
  });

  it('validates an American Express test PAN and formats it 4-6-5', () => {
    expect(validateCard('340000000000009')).toMatchObject({
      isValid: true,
      network: 'American Express',
      formattedNumber: '3400 000000 00009',
      digitCount: 15,
      lastFour: '0009',
      error: '',
    });
  });

  it.each([
    ['6011000000000004', 'Discover'],
    ['3530111333300000', 'JCB'],
  ])('detects the %s network as %s', (number, network) => {
    expect(validateCard(number)).toMatchObject({ isValid: true, network });
  });

  it('rejects an unrecognized network prefix with a null network rather than a guess', () => {
    expect(detectNetwork('9999999999999999')).toBeNull();
  });

  it('reports a Luhn checksum failure when a digit is altered, without throwing', () => {
    expect(validateCard('4111111111111112')).toMatchObject({
      isValid: false,
      error: expect.stringContaining('Luhn'),
    });
  });

  it.each([
    ['', 'Enter a card number'],
    ['1234567', 'at least 8'],
    ['12345678901234567890', 'at most 19'],
    ['4111-1111-1111-111a', 'only digits'],
  ])('returns a controlled error for malformed input %j', (number, message) => {
    expect(validateCard(number)).toMatchObject({
      isValid: false,
      error: expect.stringContaining(message),
    });
  });

  it('strips spaces and hyphens during normalization', () => {
    expect(normalizeCardNumber('4111-1111-1111-1111')).toMatchObject({
      digits: '4111111111111111',
      error: '',
    });
  });

  it('flags non-digit characters after normalization', () => {
    expect(normalizeCardNumber('4111 1111 1111 111X')).toMatchObject({
      digits: '',
      error: expect.stringContaining('only digits'),
    });
  });

  it('validates length independently of Luhn correctness', () => {
    expect(validateLength('1234567')).toContain('at least 8');
    expect(validateLength('12345678901234567890')).toContain('at most 19');
    expect(validateLength('12345678')).toBe('');
  });

  it('verifies Luhn validity directly', () => {
    expect(isLuhnValid('4111111111111111')).toBe(true);
    expect(isLuhnValid('4111111111111112')).toBe(false);
  });

  it('formats a 16-digit number as 4-4-4-4', () => {
    expect(formatCardNumber('4111111111111111', 'Visa')).toBe('4111 1111 1111 1111');
  });

  it('formats an Amex number as 4-6-5', () => {
    expect(formatCardNumber('340000000000009', 'American Express')).toBe('3400 000000 00009');
  });
});

describe('Luhn check-digit computation', () => {
  it('computes the known-good check digit for a 15-digit Visa partial', () => {
    expect(computeLuhnCheckDigit('411111111111111')).toBe(1);
  });

  it('computes a full, checksum-valid number from a partial number', () => {
    expect(computeCheckDigit('411111111111111')).toMatchObject({
      isValid: true,
      checkDigit: '1',
      fullNumber: '4111111111111111',
      formattedNumber: '4111 1111 1111 1111',
      network: 'Visa',
      error: '',
    });
  });

  it('computes the correct check digit for a Mastercard partial', () => {
    expect(computeCheckDigit('550000555555555')).toMatchObject({
      isValid: true,
      fullNumber: '5500005555555559',
      network: 'Mastercard',
      error: '',
    });
  });

  it('rejects a partial number that is too short to form a valid PAN', () => {
    expect(computeCheckDigit('123456')).toMatchObject({
      isValid: false,
      error: expect.stringContaining('at least 8'),
    });
  });

  it('rejects a partial number containing non-digit characters', () => {
    expect(computeCheckDigit('41111111111111X')).toMatchObject({
      isValid: false,
      error: expect.stringContaining('only digits'),
    });
  });

  it('rejects empty partial input', () => {
    expect(computeCheckDigit('')).toMatchObject({
      isValid: false,
      error: expect.stringContaining('Enter a card number'),
    });
  });
});
