import { describe, expect, it } from 'vitest';
import { isValidBic, normalizeBic, parseBic } from './bic.utils.js';

describe('parseBic', () => {
  it('parses a valid 8-character primary-office BIC', () => {
    expect(parseBic('DEUTDEFF')).toEqual({
      valid: true,
      value: 'DEUTDEFF',
      bankCode: 'DEUT',
      countryCode: 'DE',
      locationCode: 'FF',
      branchCode: 'XXX',
    });
  });

  it('parses a valid 11-character BIC with a branch code', () => {
    expect(parseBic('DEUTDEFF500')).toMatchObject({
      valid: true,
      branchCode: '500',
    });
  });

  it('rejects invalid lengths', () => {
    expect(parseBic('DEUTDE')).toMatchObject({ valid: false, error: expect.stringMatching(/8 or 11/) });
  });

  it('rejects invalid ISO country codes', () => {
    expect(parseBic('DEUTZZFF')).toMatchObject({ valid: false, error: expect.stringMatching(/ISO/) });
  });

  it('rejects invalid character classes', () => {
    expect(parseBic('DEU1DEFF')).toMatchObject({ valid: false });
    expect(parseBic('DEUTDE!F')).toMatchObject({ valid: false });
    expect(parseBic('DEUTDEFF5-0')).toMatchObject({ valid: false });
  });
});

describe('BIC helpers', () => {
  it('normalizes surrounding whitespace and letter case', () => {
    expect(normalizeBic(' deutdeff500 ')).toBe('DEUTDEFF500');
  });

  it('reports validity as a boolean', () => {
    expect(isValidBic('DEUTDEFF')).toBe(true);
    expect(isValidBic('DEUTZZFF')).toBe(false);
  });
});
