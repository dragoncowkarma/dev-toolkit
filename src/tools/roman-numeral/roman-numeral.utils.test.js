import { describe, expect, it } from 'vitest';
import { fromRoman, toRoman } from './roman-numeral.utils.js';

describe('toRoman', () => {
  it('converts standard subtractive edge values', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(9)).toBe('IX');
    expect(toRoman(40)).toBe('XL');
    expect(toRoman(90)).toBe('XC');
    expect(toRoman(400)).toBe('CD');
    expect(toRoman(900)).toBe('CM');
    expect(toRoman(3999)).toBe('MMMCMXCIX');
  });

  it('returns null for non-integers and values outside the supported range', () => {
    expect(toRoman(0)).toBeNull();
    expect(toRoman(4000)).toBeNull();
    expect(toRoman(1.5)).toBeNull();
    expect(toRoman('1')).toBeNull();
  });
});

describe('fromRoman', () => {
  it('round-trips standard subtractive edge values', () => {
    [1, 4, 9, 40, 90, 400, 900, 3999].forEach((value) => {
      expect(fromRoman(toRoman(value))).toBe(value);
    });
  });

  it('accepts lowercase input and ignores surrounding whitespace', () => {
    expect(fromRoman(' mcmxciv ')).toBe(1994);
  });

  it('rejects malformed Roman numerals without producing a number', () => {
    ['', 'IIII', 'IIV', 'VX', 'IL', 'IC', 'MMMM', 'ABC'].forEach((value) => {
      expect(fromRoman(value)).toBeNull();
    });
  });
});
