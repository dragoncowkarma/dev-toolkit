import { describe, expect, it } from 'vitest';
import { calculateSedolChecksum, validateSedol } from './sedol.utils.js';

describe('calculateSedolChecksum', () => {
  it('calculates standard checksum digits', () => {
    expect(calculateSedolChecksum('026349')).toBe(4);
    expect(calculateSedolChecksum('B0YBKJ')).toBe(7);
  });
});

describe('validateSedol', () => {
  it.each(['0263494', 'B0YBKJ7', '4065663'])('accepts valid SEDOL %s', (sedol) => {
    expect(validateSedol(sedol)).toEqual({ isValid: true, errorCode: null, errorMessage: '' });
  });

  it('classifies wrong-length values', () => {
    expect(validateSedol('026349')).toMatchObject({ isValid: false, errorCode: 'length' });
    expect(validateSedol('02634944')).toMatchObject({ isValid: false, errorCode: 'length' });
  });

  it('classifies invalid characters, including vowels', () => {
    expect(validateSedol('A263494')).toMatchObject({ isValid: false, errorCode: 'character' });
    expect(validateSedol('026349X')).toMatchObject({ isValid: false, errorCode: 'character' });
  });

  it('classifies checksum mismatches after character validation', () => {
    expect(validateSedol('0263495')).toMatchObject({ isValid: false, errorCode: 'checksum' });
  });
});
