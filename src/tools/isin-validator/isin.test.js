import { describe, expect, it } from 'vitest';
import {
  calculateCheckDigit,
  charToDigits,
  expandToDigits,
  SAMPLE_ISINS,
  validateIsin,
} from './isin.utils.js';

describe('isin.utils', () => {
  describe('charToDigits & expandToDigits', () => {
    it('converts letters A-Z to numbers 10-35', () => {
      expect(charToDigits('A')).toBe('10');
      expect(charToDigits('B')).toBe('11');
      expect(charToDigits('U')).toBe('30');
      expect(charToDigits('S')).toBe('28');
      expect(charToDigits('Z')).toBe('35');
    });

    it('leaves numeric characters unchanged', () => {
      expect(charToDigits('0')).toBe('0');
      expect(charToDigits('5')).toBe('5');
      expect(charToDigits('9')).toBe('9');
    });

    it('expands alphanumeric strings to pure digit strings', () => {
      expect(expandToDigits('US0378331005')).toBe('30280378331005');
      expect(expandToDigits('US02079K3059')).toBe('302802079203059');
    });
  });

  describe('calculateCheckDigit', () => {
    it('correctly calculates check digits for known ISIN prefixes', () => {
      // US037833100 -> 5 (Apple)
      expect(calculateCheckDigit('US037833100')).toBe(5);
      // US02079K305 -> 9 (Alphabet A)
      expect(calculateCheckDigit('US02079K305')).toBe(9);
      // DE000519000 -> 3 (BMW)
      expect(calculateCheckDigit('DE000519000')).toBe(3);
      // DE000716460 -> 0 (SAP)
      expect(calculateCheckDigit('DE000716460')).toBe(0);
      // KR700593000 -> 3 (Samsung)
      expect(calculateCheckDigit('KR700593000')).toBe(3);
    });
  });

  describe('validateIsin', () => {
    it('handles non-string inputs', () => {
      const res = validateIsin(null);
      expect(res.isValid).toBe(false);
      expect(res.errorType).toBe('format');
      expect(res.errorMessage).toContain('Input must be a string');
    });

    it('handles empty or whitespace-only inputs', () => {
      const emptyRes = validateIsin('');
      expect(emptyRes.isValid).toBe(false);
      expect(emptyRes.errorType).toBe('empty');

      const spaceRes = validateIsin('   ');
      expect(spaceRes.isValid).toBe(false);
      expect(spaceRes.errorType).toBe('empty');
    });

    it('identifies invalid lengths', () => {
      const shortRes = validateIsin('US037833100');
      expect(shortRes.isValid).toBe(false);
      expect(shortRes.errorType).toBe('length');
      expect(shortRes.errorMessage).toContain('must be exactly 12 characters');

      const longRes = validateIsin('US03783310055');
      expect(longRes.isValid).toBe(false);
      expect(longRes.errorType).toBe('length');
      expect(longRes.errorMessage).toContain('must be exactly 12 characters');
    });

    it('identifies invalid format and characters in country code', () => {
      const lowerRes = validateIsin('us0378331005');
      expect(lowerRes.isValid).toBe(false);
      expect(lowerRes.errorType).toBe('format');
      expect(lowerRes.errorMessage).toContain('First 2 characters must be uppercase letters');

      const numRes = validateIsin('120378331005');
      expect(numRes.isValid).toBe(false);
      expect(numRes.errorType).toBe('format');
      expect(numRes.errorMessage).toContain('First 2 characters must be uppercase letters');
    });

    it('identifies invalid format and characters in NSIN', () => {
      const symbolRes = validateIsin('US037-331005');
      expect(symbolRes.isValid).toBe(false);
      expect(symbolRes.errorType).toBe('format');
      expect(symbolRes.errorMessage).toContain('Characters 3–11 must be uppercase alphanumeric');

      const lowerNsinRes = validateIsin('US02079k3059');
      expect(lowerNsinRes.isValid).toBe(false);
      expect(lowerNsinRes.errorType).toBe('format');
      expect(lowerNsinRes.errorMessage).toContain('Characters 3–11 must be uppercase alphanumeric');
    });

    it('identifies non-numeric check digit character', () => {
      const letterCheckRes = validateIsin('US037833100X');
      expect(letterCheckRes.isValid).toBe(false);
      expect(letterCheckRes.errorType).toBe('format');
      expect(letterCheckRes.errorMessage).toContain('Character 12 must be a numeric check digit');
    });

    it('identifies checksum mismatches', () => {
      const mismatchRes = validateIsin('US0378331006');
      expect(mismatchRes.isValid).toBe(false);
      expect(mismatchRes.errorType).toBe('checksum');
      expect(mismatchRes.errorMessage).toContain('Checksum mismatch');
      expect(mismatchRes.errorMessage).toContain('Expected check digit 5, but got 6');
      expect(mismatchRes.expectedCheckDigit).toBe(5);
      expect(mismatchRes.checkDigit).toBe(6);
    });

    it('validates authentic ISINs', () => {
      const apple = validateIsin('US0378331005');
      expect(apple.isValid).toBe(true);
      expect(apple.errorType).toBeNull();
      expect(apple.errorMessage).toBeNull();
      expect(apple.countryCode).toBe('US');
      expect(apple.nsin).toBe('037833100');
      expect(apple.checkDigit).toBe(5);
      expect(apple.expectedCheckDigit).toBe(5);

      const sap = validateIsin('DE0007164600');
      expect(sap.isValid).toBe(true);
      expect(sap.checkDigit).toBe(0);

      const alphabet = validateIsin('US02079K3059');
      expect(alphabet.isValid).toBe(true);
      expect(alphabet.checkDigit).toBe(9);
    });

    it('trims surrounding whitespace on valid inputs', () => {
      const res = validateIsin('  US0378331005  ');
      expect(res.isValid).toBe(true);
    });
  });

  describe('SAMPLE_ISINS', () => {
    it('provides valid presets', () => {
      expect(SAMPLE_ISINS.length).toBeGreaterThan(0);
      const validSamples = SAMPLE_ISINS.filter((s) => s.label.includes('('));
      for (const sample of validSamples) {
        expect(validateIsin(sample.value).isValid).toBe(true);
      }
    });
  });
});
