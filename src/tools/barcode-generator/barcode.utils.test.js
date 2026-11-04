import { describe, expect, it } from 'vitest';
import {
  calculateCheckDigit,
  encodeCode128,
  encodeEan13,
  encodeUpcA,
  normalizeEan13,
} from './barcode.utils.js';

describe('encodeCode128', () => {
  it('encodes ASCII text into Code 128 modules', () => {
    const barcode = encodeCode128('Hello 128');

    expect(barcode.text).toBe('Hello 128');
    expect(barcode.modules).toMatch(/^[01]+$/);
    expect(barcode.modules.length).toBeGreaterThan(50);
  });

  it('rejects non-ASCII text', () => {
    expect(() => encodeCode128('hello 😀')).toThrow('ASCII');
  });
});

describe('EAN and UPC encoding', () => {
  it('calculates an EAN-13 check digit and creates 95 modules', () => {
    expect(calculateCheckDigit('400638133393')).toBe('1');
    expect(normalizeEan13('400638133393')).toBe('4006381333931');
    expect(encodeEan13('400638133393').modules).toHaveLength(95);
  });

  it('rejects invalid EAN-13 lengths, characters, and check digits', () => {
    expect(() => encodeEan13('123')).toThrow('12 or 13 digits');
    expect(() => encodeEan13('40063813339AB')).toThrow('12 or 13 digits');
    expect(() => encodeEan13('4006381333932')).toThrow('check digit');
  });

  it('calculates a UPC-A check digit and creates EAN-compatible modules', () => {
    const barcode = encodeUpcA('03600029145');

    expect(barcode.text).toBe('036000291452');
    expect(barcode.modules).toHaveLength(95);
  });
});
