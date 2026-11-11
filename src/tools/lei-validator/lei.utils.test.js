import { describe, expect, it } from 'vitest';
import { calculateMod97, validateLei } from './lei.utils.js';

describe('validateLei', () => {
  it('accepts a known valid real-world LEI', () => {
    expect(validateLei('529900T8BM49AURSDO55')).toEqual({ isValid: true, error: '' });
  });

  it('rejects an LEI with an invalid checksum', () => {
    expect(validateLei('529900T8BM49AURSDO56')).toMatchObject({
      isValid: false,
      error: expect.stringMatching(/check digit/i),
    });
  });

  it('rejects an LEI with an invalid length', () => {
    expect(validateLei('529900T8BM49AURSDO5')).toMatchObject({
      isValid: false,
      error: expect.stringMatching(/exactly 20/i),
    });
  });

  it('rejects an LEI containing non-alphanumeric characters', () => {
    expect(validateLei('529900T8BM49AURSDO5!')).toMatchObject({
      isValid: false,
      error: expect.stringMatching(/uppercase letters or digits/i),
    });
  });

  it('rejects letters in the terminal check digit positions', () => {
    expect(validateLei('529900T8BM49AURSDO5A')).toMatchObject({
      isValid: false,
      error: expect.stringMatching(/two check digits/i),
    });
  });
});

describe('calculateMod97', () => {
  it('returns one for a valid LEI with its terminal check digits', () => {
    expect(calculateMod97('529900T8BM49AURSDO55')).toBe(1);
  });
});
