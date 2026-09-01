import { describe, expect, it } from 'vitest';
import {
  analyzeBarcode,
  computeCheckDigit,
  normalizeBarcode,
  validateCheckDigit,
} from './eanUpcValidator.utils.js';

describe('EAN/UPC barcode utilities', () => {
  it('normalizes whitespace and hyphens before processing', () => {
    expect(normalizeBarcode('400-6381 333931')).toBe('4006381333931');
  });

  it('computes GS1 modulo-10 digits for EAN-13, EAN-8, and UPC-A payloads', () => {
    expect(computeCheckDigit('400638133393')).toBe(1);
    expect(computeCheckDigit('9638507')).toBe(4);
    expect(computeCheckDigit('03600029145')).toBe(2);
  });

  it('rejects non-numeric payloads for check-digit calculation', () => {
    expect(computeCheckDigit('400-638')).toBeNull();
    expect(computeCheckDigit('')).toBeNull();
  });

  it('validates complete EAN-13, EAN-8, and UPC-A values', () => {
    expect(validateCheckDigit('4006381333931')).toMatchObject({ expected: 1, isValid: true });
    expect(validateCheckDigit('96385074')).toMatchObject({ expected: 4, isValid: true });
    expect(validateCheckDigit('036000291452')).toMatchObject({ expected: 2, isValid: true });
  });

  it('detects an incorrect final check digit', () => {
    expect(validateCheckDigit('4006381333932')).toMatchObject({ expected: 1, isValid: false });
  });

  it('returns null when validating non-numeric or too-short identifiers', () => {
    expect(validateCheckDigit('abc')).toBeNull();
    expect(validateCheckDigit('4')).toBeNull();
  });

  it('validates full UPC-A input and exposes its zero-prefixed GTIN-13', () => {
    expect(analyzeBarcode('036000291452')).toMatchObject({
      canonicalGtin: '0036000291452',
      format: 'UPC-A',
      isComplete: true,
      isValid: true,
    });
  });

  it('calculates missing EAN-8 and explicitly selected EAN-13 check digits', () => {
    expect(analyzeBarcode('9638507')).toMatchObject({
      checkDigit: 4,
      format: 'EAN-8',
      fullValue: '96385074',
      isComplete: false,
    });
    expect(analyzeBarcode('400638133393', 'ean13')).toMatchObject({
      checkDigit: 1,
      format: 'EAN-13',
      fullValue: '4006381333931',
      isComplete: false,
    });
  });

  it('returns clear errors for invalid length and non-numeric input', () => {
    expect(analyzeBarcode('12345').error).toMatch(/Enter 7 or 8 digits/);
    expect(analyzeBarcode('4006abcd')).toMatchObject({
      error: expect.stringMatching(/digits only/i),
    });
  });
});
