import { describe, expect, it } from 'vitest';
import {
  ERROR_CORRECTION_LEVELS,
  QrCapacityError,
  generateQrCode,
  getMaxByteCapacity,
} from './qrCode.utils.js';

function isSquareBooleanMatrix(matrix, size) {
  return matrix.length === size && matrix.every((row) => row.length === size);
}

describe('generateQrCode version/module-count selection', () => {
  it('picks version 1 (21x21) for a short string at level L', () => {
    const result = generateQrCode('HELLO WORLD', { errorCorrectionLevel: 'L' });
    expect(result.version).toBe(1);
    expect(result.size).toBe(21);
    expect(isSquareBooleanMatrix(result.matrix, 21)).toBe(true);
  });

  it('grows the version as the input text grows', () => {
    const short = generateQrCode('short text', { errorCorrectionLevel: 'M' });
    const long = generateQrCode('x'.repeat(500), { errorCorrectionLevel: 'M' });
    expect(long.version).toBeGreaterThan(short.version);
    expect(long.size).toBe(17 + 4 * long.version);
    expect(long.size).toBeGreaterThan(short.size);
  });

  it('reports a version consistent with the 17 + 4*version module formula', () => {
    for (const text of ['a', 'a'.repeat(50), 'a'.repeat(300)]) {
      const result = generateQrCode(text, { errorCorrectionLevel: 'Q' });
      expect(result.size).toBe(17 + 4 * result.version);
    }
  });
});

describe('generateQrCode error correction levels', () => {
  it.each(ERROR_CORRECTION_LEVELS)('produces a valid matrix at level %s', (level) => {
    const result = generateQrCode('https://example.com/test', { errorCorrectionLevel: level });
    expect(result.errorCorrectionLevel).toBe(level);
    expect(isSquareBooleanMatrix(result.matrix, result.size)).toBe(true);
    expect(result.maskPattern).toBeGreaterThanOrEqual(0);
    expect(result.maskPattern).toBeLessThanOrEqual(7);
    // Finder pattern center and outer corner are always dark.
    expect(result.matrix[3][3]).toBe(true);
    expect(result.matrix[0][0]).toBe(true);
  });

  it('requires a larger version for the same text as the EC level gets stronger', () => {
    // 10 bytes fits version-1 L (cap 17) but exceeds version-1 H (cap 7).
    const text = '0123456789';
    const low = generateQrCode(text, { errorCorrectionLevel: 'L' });
    const high = generateQrCode(text, { errorCorrectionLevel: 'H' });
    expect(low.version).toBe(1);
    expect(high.version).toBeGreaterThan(low.version);
  });

  it('rejects an unsupported error correction level', () => {
    expect(() => generateQrCode('hi', { errorCorrectionLevel: 'X' })).toThrow(
      /Unsupported error correction level/,
    );
  });
});

describe('generateQrCode capacity limits', () => {
  it('rejects input beyond the level-H capacity without throwing an unrelated error', () => {
    const overCapacity = 'a'.repeat(getMaxByteCapacity('H') + 1);
    let caught = null;
    try {
      generateQrCode(overCapacity, { errorCorrectionLevel: 'H' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(QrCapacityError);
    expect(caught.message).toMatch(/too long/i);
  });

  it('accepts input exactly at the level-H capacity boundary', () => {
    const atCapacity = 'a'.repeat(getMaxByteCapacity('H'));
    expect(() => generateQrCode(atCapacity, { errorCorrectionLevel: 'H' })).not.toThrow();
  });

  it('exposes a larger max capacity for weaker error correction levels', () => {
    expect(getMaxByteCapacity('L')).toBeGreaterThan(getMaxByteCapacity('H'));
    expect(getMaxByteCapacity('M')).toBeGreaterThan(getMaxByteCapacity('Q'));
  });
});

describe('generateQrCode Unicode support', () => {
  it('encodes multi-byte UTF-8 text without throwing', () => {
    const result = generateQrCode('한글 QR 코드 🎉', { errorCorrectionLevel: 'M' });
    expect(isSquareBooleanMatrix(result.matrix, result.size)).toBe(true);
  });
});
