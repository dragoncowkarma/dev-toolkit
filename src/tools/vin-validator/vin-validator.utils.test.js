import { describe, expect, it } from 'vitest';
import {
  calculateCheckDigit,
  decodeModelYear,
  decodeWmi,
  normalizeVin,
  resolveModelYear,
  transliterateChar,
  validateVin,
} from './vin-validator.utils.js';

describe('vin-validator utils', () => {
  describe('normalizeVin', () => {
    it('strips spaces and hyphens and converts to uppercase', () => {
      expect(normalizeVin('1hg-cr2f8-5-ha000000')).toBe('1HGCR2F85HA000000');
      expect(normalizeVin(' 1FA6P8CFXH5123457 ')).toBe('1FA6P8CFXH5123457');
      expect(normalizeVin('wvw-zzz-3czwe-000000')).toBe('WVWZZZ3CZWE000000');
    });

    it('handles non-string input safely', () => {
      expect(normalizeVin(null)).toBe('');
      expect(normalizeVin(undefined)).toBe('');
    });
  });

  describe('transliterateChar', () => {
    it('correctly maps digits to their numeric values', () => {
      expect(transliterateChar('0')).toBe(0);
      expect(transliterateChar('5')).toBe(5);
      expect(transliterateChar('9')).toBe(9);
    });

    it('correctly maps standard letters per NHTSA table', () => {
      expect(transliterateChar('A')).toBe(1);
      expect(transliterateChar('H')).toBe(8);
      expect(transliterateChar('J')).toBe(1);
      expect(transliterateChar('N')).toBe(5);
      expect(transliterateChar('P')).toBe(7);
      expect(transliterateChar('R')).toBe(9);
      expect(transliterateChar('S')).toBe(2);
      expect(transliterateChar('Z')).toBe(9);
    });

    it('returns null for disallowed letters I, O, Q and non-alphanumeric chars', () => {
      expect(transliterateChar('I')).toBeNull();
      expect(transliterateChar('O')).toBeNull();
      expect(transliterateChar('Q')).toBeNull();
      expect(transliterateChar('@')).toBeNull();
    });
  });

  describe('calculateCheckDigit', () => {
    it('validates a numeric check digit correctly', () => {
      const result = calculateCheckDigit('1HGCR2F85HA000000');
      expect(result.expected).toBe('5');
      expect(result.actual).toBe('5');
      expect(result.matches).toBe(true);
    });

    it('validates an X check digit correctly', () => {
      const result = calculateCheckDigit('1FA6P8CFXH5123457');
      expect(result.expected).toBe('X');
      expect(result.actual).toBe('X');
      expect(result.matches).toBe(true);
    });

    it('detects check digit mismatch', () => {
      const result = calculateCheckDigit('1HGCR2F83HA000000');
      expect(result.expected).toBe('5');
      expect(result.actual).toBe('3');
      expect(result.matches).toBe(false);
    });
  });

  describe('decodeWmi', () => {
    it('decodes North American region (USA)', () => {
      const wmi = decodeWmi('1HG');
      expect(wmi.region).toBe('North America');
      expect(wmi.country).toBe('United States');
      expect(wmi.isNorthAmerica).toBe(true);
      expect(wmi.manufacturer).toBe('Honda (USA)');
    });

    it('decodes European region (Germany)', () => {
      const wmi = decodeWmi('WVW');
      expect(wmi.region).toBe('Europe');
      expect(wmi.country).toBe('Germany');
      expect(wmi.isNorthAmerica).toBe(false);
      expect(wmi.manufacturer).toBe('Volkswagen (Germany)');
    });

    it('decodes Asian region (Japan)', () => {
      const wmi = decodeWmi('JHM');
      expect(wmi.region).toBe('Asia');
      expect(wmi.country).toBe('Japan');
      expect(wmi.isNorthAmerica).toBe(false);
    });
  });

  describe('decodeModelYear', () => {
    it('decodes candidate years for code H (1987 or 2017)', () => {
      expect(decodeModelYear('H')).toEqual([1987, 2017]);
    });

    it('decodes candidate years for code 5 (2005 or 2035)', () => {
      expect(decodeModelYear('5')).toEqual([2005, 2035]);
    });

    it('decodes candidate years for code X (1999 or 2029)', () => {
      expect(decodeModelYear('X')).toEqual([1999, 2029]);
    });

    it('returns null for invalid model year codes (0, U, Z, invalid chars)', () => {
      expect(decodeModelYear('0')).toBeNull();
      expect(decodeModelYear('U')).toBeNull();
      expect(decodeModelYear('Z')).toBeNull();
      expect(decodeModelYear('I')).toBeNull();
    });
  });

  describe('resolveModelYear', () => {
    it('resolves the pre-2010 cycle for a North American VIN with a digit at position 7', () => {
      const normalized = '1G1YY26E8A5100001';
      const wmiInfo = decodeWmi(normalized.slice(0, 3));
      const result = resolveModelYear(normalized, wmiInfo);

      expect(result.candidateModelYears).toEqual([1980, 2010]);
      expect(result.heuristicApplied).toBe(true);
      expect(result.resolvedModelYear).toBe(1980);
      expect(result.explanation).toContain("Position 7 ('6') is a digit");
    });

    it('resolves the 2010+ cycle for a North American VIN with a letter at position 7', () => {
      const normalized = '1G1YY2CE9L5100001';
      const wmiInfo = decodeWmi(normalized.slice(0, 3));
      const result = resolveModelYear(normalized, wmiInfo);

      expect(result.candidateModelYears).toEqual([1990, 2020]);
      expect(result.heuristicApplied).toBe(true);
      expect(result.resolvedModelYear).toBe(2020);
      expect(result.explanation).toContain("Position 7 ('C') is a letter");
    });

    it('preserves both candidates for non-North-American VINs without resolving a year', () => {
      const normalized = 'WVWZZZ3CZWE000000';
      const wmiInfo = decodeWmi(normalized.slice(0, 3));
      const result = resolveModelYear(normalized, wmiInfo);

      expect(result.candidateModelYears).toEqual([1998, 2028]);
      expect(result.heuristicApplied).toBe(false);
      expect(result.resolvedModelYear).toBeNull();
      expect(result.explanation).toContain('only applies to North American VINs');
    });

    it('returns no candidates for an unknown model year code', () => {
      const normalized = '1G1YY26E805100001';
      const wmiInfo = decodeWmi(normalized.slice(0, 3));
      const result = resolveModelYear(normalized, wmiInfo);

      expect(result.candidateModelYears).toBeNull();
      expect(result.heuristicApplied).toBe(false);
      expect(result.resolvedModelYear).toBeNull();
      expect(result.explanation).toContain('not a recognized model-year code');
    });

    it('never resolves a single year without a full 17-character VIN (no false resolution)', () => {
      const wmiInfo = { isNorthAmerica: true };
      expect(resolveModelYear('1G1YY26E8A', wmiInfo)).toEqual({
        candidateModelYears: null,
        resolvedModelYear: null,
        heuristicApplied: false,
        explanation: 'A normalized 17-character VIN is required to resolve a model year.',
      });
      expect(resolveModelYear(null, wmiInfo).resolvedModelYear).toBeNull();
    });
  });

  describe('validateVin', () => {
    it('validates a valid North American VIN with numeric check digit', () => {
      const res = validateVin('1HG CR2F8 5 HA000000');
      expect(res.isValid).toBe(true);
      expect(res.isFormatValid).toBe(true);
      expect(res.isCheckDigitValid).toBe(true);
      expect(res.isNorthAmerican).toBe(true);
      expect(res.error).toBeNull();
      expect(res.decoded.wmi).toBe('1HG');
      expect(res.decoded.candidateModelYears).toEqual([1987, 2017]);
      expect(res.decoded.modelYearResolution.heuristicApplied).toBe(true);
      expect(res.decoded.modelYearResolution.resolvedModelYear).toBe(2017);
    });

    it('resolves the pre-2010 cycle within validateVin for a digit-position-7 NA VIN', () => {
      const res = validateVin('1G1YY26E8A5100001');
      expect(res.isValid).toBe(true);
      expect(res.decoded.candidateModelYears).toEqual([1980, 2010]);
      expect(res.decoded.modelYearResolution.heuristicApplied).toBe(true);
      expect(res.decoded.modelYearResolution.resolvedModelYear).toBe(1980);
    });

    it('preserves ambiguous candidates within validateVin for non-North-American VINs', () => {
      const res = validateVin('WVWZZZ3CZWE000000');
      expect(res.decoded.candidateModelYears).toEqual([1998, 2028]);
      expect(res.decoded.modelYearResolution.heuristicApplied).toBe(false);
      expect(res.decoded.modelYearResolution.resolvedModelYear).toBeNull();
    });

    it('validates a valid North American VIN with X check digit', () => {
      const res = validateVin('1FA6P8CFXH5123457');
      expect(res.isValid).toBe(true);
      expect(res.isCheckDigitValid).toBe(true);
      expect(res.checkDigitInfo.expected).toBe('X');
    });

    it('rejects North American VIN with invalid check digit', () => {
      const res = validateVin('1HGCR2F83HA000000');
      expect(res.isValid).toBe(false);
      expect(res.isCheckDigitValid).toBe(false);
      expect(res.error).toContain("Check digit mismatch: position 9 is '3'");
    });

    it('rejects VINs containing disallowed letters I, O, Q', () => {
      const resI = validateVin('1HGCR2F85HI000000');
      expect(resI.isValid).toBe(false);
      expect(resI.error).toContain("Disallowed letter 'I' found");

      const resO = validateVin('1HGCR2F85HO000000');
      expect(resO.isValid).toBe(false);
      expect(resO.error).toContain("Disallowed letter 'O' found");

      const resQ = validateVin('1HGCR2F85HQ000000');
      expect(resQ.isValid).toBe(false);
      expect(resQ.error).toContain("Disallowed letter 'Q' found");
    });

    it('rejects VINs with length other than 17 characters', () => {
      const resShort = validateVin('1HGCR2F85HA');
      expect(resShort.isValid).toBe(false);
      expect(resShort.error).toContain('Invalid length (11 characters)');

      const resLong = validateVin('1HGCR2F85HA000000000');
      expect(resLong.isValid).toBe(false);
      expect(resLong.error).toContain('Invalid length (20 characters)');
    });

    it('handles non-North American VINs with informative check digit status', () => {
      const res = validateVin('WVWZZZ3CZWE000000');
      expect(res.isFormatValid).toBe(true);
      expect(res.isNorthAmerican).toBe(false);
      expect(res.isValid).toBe(true);
      expect(res.checkDigitInfo.note).toContain('informative for non-North American region');
    });
  });
});
