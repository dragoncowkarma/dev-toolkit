import { describe, expect, it } from 'vitest';
import {
  convertBase,
  getBinaryRepresentation,
  validateBaseInput,
} from './baseConverter.utils.js';

describe('convertBase', () => {
  it('converts among binary, octal, decimal, and hexadecimal', () => {
    expect(convertBase('11111111', 2, 16)).toBe('FF');
    expect(convertBase('377', 8, 10)).toBe('255');
    expect(convertBase('FF', 16, 2)).toBe('11111111');
  });

  it('supports negative values and custom bases without precision loss', () => {
    expect(convertBase('-FF', 16, 10)).toBe('-255');
    expect(convertBase('ZZ', 36, 10)).toBe('1295');
    expect(convertBase('9007199254740993', 10, 16)).toBe('20000000000001');
  });

  it('rejects invalid values and bases', () => {
    expect(() => convertBase('2', 2, 10)).toThrow('Invalid base-2');
    expect(() => convertBase('1', 1, 10)).toThrow(RangeError);
  });
});

describe('validateBaseInput', () => {
  it('validates signs and case-insensitive digits for each base', () => {
    expect(validateBaseInput('-1010', 2)).toBe(true);
    expect(validateBaseInput('ff', 16)).toBe(true);
    expect(validateBaseInput('Z', 36)).toBe(true);
  });

  it('rejects empty strings, invalid digits, and invalid bases', () => {
    expect(validateBaseInput('', 10)).toBe(false);
    expect(validateBaseInput('19', 8)).toBe(false);
    expect(validateBaseInput('10', 37)).toBe(false);
  });
});

describe('getBinaryRepresentation', () => {
  it('returns padded unsigned and signed two’s-complement values', () => {
    const representation = getBinaryRepresentation(-1);
    expect(representation.bit8).toEqual({ binary: '11111111', unsigned: 255, signed: -1 });
    expect(representation.bit16).toEqual({
      binary: '1111111111111111',
      unsigned: 65535,
      signed: -1,
    });
  });

  it('wraps wider values at each fixed-width boundary', () => {
    const representation = getBinaryRepresentation(256);
    expect(representation.bit8).toEqual({ binary: '00000000', unsigned: 0, signed: 0 });
    expect(representation.bit32.signed).toBe(256);
  });
});
