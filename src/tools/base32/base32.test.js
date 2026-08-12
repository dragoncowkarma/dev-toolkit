import { describe, expect, it } from 'vitest';
import {
  decodeBase32Details,
  decodeFromBase32,
  encodeToBase32,
  fileToBase32,
  formatFileSize,
  isValidBase32,
} from './base32.utils.js';

describe('base32.utils', () => {
  const rfcVectors = [
    { text: '', padded: '', unpadded: '' },
    { text: 'f', padded: 'MY======', unpadded: 'MY' },
    { text: 'fo', padded: 'MZXQ====', unpadded: 'MZXQ' },
    { text: 'foo', padded: 'MZXW6===', unpadded: 'MZXW6' },
    { text: 'foob', padded: 'MZXW6YQ=', unpadded: 'MZXW6YQ' },
    { text: 'fooba', padded: 'MZXW6YTB', unpadded: 'MZXW6YTB' },
    { text: 'foobar', padded: 'MZXW6YTBOI======', unpadded: 'MZXW6YTBOI' },
  ];

  describe('RFC 4648 §10 Test Vectors - Encode', () => {
    rfcVectors.forEach(({ text, padded, unpadded }) => {
      it(`encodes "${text}" to padded Base32 "${padded}"`, () => {
        expect(encodeToBase32(text, { padded: true })).toBe(padded);
      });

      it(`encodes "${text}" to unpadded Base32 "${unpadded}"`, () => {
        expect(encodeToBase32(text, { padded: false })).toBe(unpadded);
      });
    });
  });

  describe('RFC 4648 §10 Test Vectors - Decode', () => {
    rfcVectors.forEach(({ text, padded, unpadded }) => {
      it(`decodes padded "${padded}" to "${text}"`, () => {
        expect(decodeFromBase32(padded)).toBe(text);
      });

      it(`decodes unpadded "${unpadded}" to "${text}"`, () => {
        expect(decodeFromBase32(unpadded)).toBe(text);
      });
    });
  });

  describe('Round-trip UTF-8 & Emoji support', () => {
    const unicodeStrings = [
      '',
      'A',
      'Hello World',
      '한국어 테스트 🇰🇷',
      '⚡ Rocket 🚀 & Star ⭐',
    ];

    unicodeStrings.forEach((text) => {
      it(`losslessly roundtrips "${text}"`, () => {
        const encoded = encodeToBase32(text);
        expect(decodeFromBase32(encoded)).toBe(text);
      });

      it(`losslessly roundtrips "${text}" (unpadded)`, () => {
        const encoded = encodeToBase32(text, { padded: false });
        expect(decodeFromBase32(encoded)).toBe(text);
      });
    });
  });

  describe('Hex encoding & decoding', () => {
    it('encodes hex bytes to Base32', () => {
      expect(
        encodeToBase32('66 6f 6f 62 61 72', { inputType: 'hex' })
      ).toBe('MZXW6YTBOI======');
    });

    it('decodes Base32 to hex string', () => {
      expect(
        decodeFromBase32('MZXW6YTBOI======', { outputType: 'hex' })
      ).toBe('66 6f 6f 62 61 72');
    });

    it('throws error for invalid hex characters', () => {
      expect(() =>
        encodeToBase32('666Z', { inputType: 'hex' })
      ).toThrow('Hex input contains invalid characters.');
    });

    it('throws error for odd hex digit count', () => {
      expect(() =>
        encodeToBase32('666', { inputType: 'hex' })
      ).toThrow('Hex input must have an even number of digits.');
    });
  });

  describe('Whitespace & Case Insensitivity', () => {
    it('handles lowercase input and internal whitespace', () => {
      expect(decodeFromBase32('  mzxw 6ytb oi======  ')).toBe('foobar');
    });
  });

  describe('Validation & Error Handling', () => {
    it('validates correct Base32 strings', () => {
      expect(isValidBase32('MZXW6===')).toBe(true);
      expect(isValidBase32('MZXW6')).toBe(true);
      expect(isValidBase32('')).toBe(true);
    });

    it('rejects invalid characters', () => {
      expect(isValidBase32('MZXW6YTB!')).toBe(false);
      expect(() => decodeFromBase32('MZXW6YTB!')).toThrow(
        'Base32 input contains invalid characters.'
      );
    });

    it('rejects incomplete byte groups', () => {
      expect(isValidBase32('M')).toBe(false);
      expect(() => decodeFromBase32('M')).toThrow(
        'Base32 input has an incomplete final byte group.'
      );
    });

    it('rejects malformed padding', () => {
      expect(isValidBase32('MY=')).toBe(false);
      expect(() => decodeFromBase32('MY=')).toThrow(
        'Base32 padding is malformed.'
      );
    });

    it('handles non-string arguments gracefully', () => {
      expect(isValidBase32(123)).toBe(false);
      expect(() => encodeToBase32(123)).toThrow('Input must be a string.');
      expect(() => decodeFromBase32(123)).toThrow('Input must be a string.');
    });
  });

  describe('Binary / Non-UTF-8 Decode Details', () => {
    it('identifies non-UTF-8 bytes and provides details', () => {
      const base32 = '777A====';
      const details = decodeBase32Details(base32);
      expect(details.isUtf8).toBe(false);
      expect(details.text).toBe(null);
      expect(details.hex).toBe('ff fe');
    });
  });

  describe('File & Format Helpers', () => {
    it('converts a File blob to Base32', async () => {
      const blob = new Blob(['foobar'], { type: 'text/plain' });
      const result = await fileToBase32(blob);
      expect(result).toBe('MZXW6YTBOI======');
    });

    it('formats file sizes accurately', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1500)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1.0 MB');
    });
  });
});
