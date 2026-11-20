import { describe, expect, it } from 'vitest';
import { calculateCusipCheckDigit, validateCusip } from './cusip.utils.js';

describe('calculateCusipCheckDigit', () => {
  it('calculates check digits for standard and special-character CUSIP bases', () => {
    expect(calculateCusipCheckDigit('03783310')).toBe(0);
    expect(calculateCusipCheckDigit('38259P50')).toBe(8);
    expect(calculateCusipCheckDigit('1234*@#A')).toBe(1);
  });
});

describe('validateCusip', () => {
  it('accepts valid CUSIPs', () => {
    expect(validateCusip('037833100')).toEqual({ isValid: true, error: null });
    expect(validateCusip('38259P508')).toEqual({ isValid: true, error: null });
  });

  it('classifies an incorrect length', () => {
    expect(validateCusip('03783310')).toEqual({ isValid: false, error: 'wrong-length' });
  });

  it('classifies invalid characters', () => {
    expect(validateCusip('03783310!')).toEqual({ isValid: false, error: 'invalid-character' });
    expect(validateCusip('03783310A')).toEqual({ isValid: false, error: 'invalid-character' });
  });

  it('classifies a checksum mismatch', () => {
    expect(validateCusip('037833101')).toEqual({ isValid: false, error: 'checksum-mismatch' });
  });
});
