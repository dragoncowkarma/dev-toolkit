import { describe, expect, it } from 'vitest';
import {
  computeLuhnCheckDigit,
  detectIdentifierType,
  IDENTIFIER_TYPES,
  isValidImei,
  normalizeIdentifier,
  parseIdentifier,
} from './imeiValidator.utils.js';

describe('IMEI validation utilities', () => {
  it('normalizes supported separators', () => {
    expect(normalizeIdentifier('49 015420-323751 8')).toBe('490154203237518');
  });

  it('computes the Luhn check digit for a 14-digit IMEI body', () => {
    expect(computeLuhnCheckDigit('49015420323751')).toBe('8');
    expect(computeLuhnCheckDigit('4901542032375')).toBeNull();
  });

  it('validates a complete IMEI with Luhn', () => {
    expect(isValidImei('490154203237518')).toBe(true);
    expect(isValidImei('490154203237519')).toBe(false);
  });

  it('detects IMEI, IMEI without a check digit, and IMEISV lengths', () => {
    expect(detectIdentifierType('49015420323751')).toBe(IDENTIFIER_TYPES.IMEI_WITHOUT_CHECK_DIGIT);
    expect(detectIdentifierType('490154203237518')).toBe(IDENTIFIER_TYPES.IMEI);
    expect(detectIdentifierType('4901542032375101')).toBe(IDENTIFIER_TYPES.IMEISV);
    expect(detectIdentifierType('49015420abc')).toBe(IDENTIFIER_TYPES.INVALID);
  });

  it('parses a 14-digit IMEI body and returns its calculated full IMEI', () => {
    expect(parseIdentifier('49015420-323751')).toMatchObject({
      type: IDENTIFIER_TYPES.IMEI_WITHOUT_CHECK_DIGIT,
      tac: '49015420',
      snr: '323751',
      checkDigit: '8',
      fullImei: '490154203237518',
      svn: null,
      isValid: true,
    });
  });

  it('parses IMEI fields and reports a failed check digit', () => {
    expect(parseIdentifier('490154203237519')).toMatchObject({
      type: IDENTIFIER_TYPES.IMEI,
      tac: '49015420',
      snr: '323751',
      checkDigit: '9',
      svn: null,
      isValid: false,
    });
  });

  it('parses IMEISV fields without applying a check digit', () => {
    expect(parseIdentifier('49015420 323751 01')).toMatchObject({
      type: IDENTIFIER_TYPES.IMEISV,
      tac: '49015420',
      snr: '323751',
      checkDigit: null,
      svn: '01',
      fullImei: null,
      isValid: true,
    });
  });
});
