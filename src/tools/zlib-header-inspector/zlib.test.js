import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  formatHexDump,
  hexToBytes,
  parseZlibFromHex,
  parseZlibHeader,
} from './zlib.utils.js';

describe('zlib utils', () => {
  describe('hexToBytes', () => {
    it('converts continuous hex string', () => {
      const bytes = hexToBytes('789c');
      expect(Array.from(bytes)).toEqual([0x78, 0x9c]);
    });

    it('converts spaced and comma-delimited hex bytes with 0x prefixes', () => {
      const bytes = hexToBytes('0x78, 0x9C, 0x01, 0x02');
      expect(Array.from(bytes)).toEqual([0x78, 0x9c, 0x01, 0x02]);
    });

    it('returns empty array for empty or whitespace string', () => {
      expect(Array.from(hexToBytes(''))).toEqual([]);
      expect(Array.from(hexToBytes('   \n  '))).toEqual([]);
    });

    it('throws TypeError for non-string input', () => {
      expect(() => hexToBytes(null)).toThrow(TypeError);
      expect(() => hexToBytes(123)).toThrow(TypeError);
    });

    it('throws Error on odd number of hex digits', () => {
      expect(() => hexToBytes('789')).toThrow(/even number of digits/i);
    });

    it('throws Error on invalid hex characters', () => {
      expect(() => hexToBytes('78 9G')).toThrow(/invalid hexadecimal/i);
    });
  });

  describe('bytesToHex and formatHexDump', () => {
    it('formats bytes to uppercase spaced hex string', () => {
      expect(bytesToHex(new Uint8Array([0x78, 0x9c]))).toBe('78 9C');
      expect(bytesToHex(null)).toBe('');
    });

    it('formats a classic hex dump with offset and ascii', () => {
      const dump = formatHexDump(new Uint8Array([0x78, 0x9c, 0x61, 0x62]));
      expect(dump).toContain('00000000');
      expect(dump).toContain('78 9C 61 62');
      expect(dump).toContain('|x.ab|');
    });

    it('returns empty string for empty input', () => {
      expect(formatHexDump([])).toBe('');
      expect(formatHexDump(null)).toBe('');
    });
  });

  describe('parseZlibHeader', () => {
    it('decodes default-level header (78 9C)', () => {
      const result = parseZlibHeader(new Uint8Array([0x78, 0x9c]));
      expect(result.ok).toBe(true);
      expect(result.error).toBeNull();
      expect(result.cmf).toBe(0x78);
      expect(result.flg).toBe(0x9c);
      expect(result.compressionMethod).toBe('deflate');
      expect(result.compressionMethodId).toBe(8);
      expect(result.cinfo).toBe(7);
      expect(result.windowSize).toBe(32768);
      expect(result.windowBits).toBe(15);
      expect(result.fcheck).toBe(28);
      expect(result.fcheckValid).toBe(true);
      expect(result.fdict).toBe(false);
      expect(result.dictId).toBeNull();
      expect(result.flevel).toBe('default');
      expect(result.flevelValue).toBe(2);
      expect(result.adler32).toBeNull();
      expect(result.headerLength).toBe(2);
      expect(result.totalBytes).toBe(2);
    });

    it('decodes max-compression header (78 DA)', () => {
      const result = parseZlibHeader(new Uint8Array([0x78, 0xda]));
      expect(result.ok).toBe(true);
      expect(result.error).toBeNull();
      expect(result.cmf).toBe(0x78);
      expect(result.flg).toBe(0xda);
      expect(result.compressionMethod).toBe('deflate');
      expect(result.cinfo).toBe(7);
      expect(result.windowSize).toBe(32768);
      expect(result.fcheckValid).toBe(true);
      expect(result.fdict).toBe(false);
      expect(result.flevel).toBe('maximum');
      expect(result.flevelValue).toBe(3);
    });

    it('decodes fastest-level header (78 01)', () => {
      const result = parseZlibHeader(new Uint8Array([0x78, 0x01]));
      expect(result.ok).toBe(true);
      expect(result.flevel).toBe('fastest');
      expect(result.flevelValue).toBe(0);
      expect(result.fcheckValid).toBe(true);
    });

    it('decodes fast-level header (78 5E)', () => {
      // 0x78 = 120, 120*256 = 30720. 30720 % 31 = 30.
      // FLG: level 1 (fast, 0x40 = 64). 30720 + 64 = 30784. 30784 % 31 = 1.
      // Need (1 + FCHECK) % 31 == 0 => FCHECK = 30 (0x1E).
      // FLG = 0x40 | 0x1E = 0x5E (94). (30720 + 94) = 30814. 30814 / 31 = 994.
      const result = parseZlibHeader(new Uint8Array([0x78, 0x5e]));
      expect(result.ok).toBe(true);
      expect(result.flevel).toBe('fast');
      expect(result.flevelValue).toBe(1);
      expect(result.fcheckValid).toBe(true);
    });

    it('decodes FDICT header with DICTID', () => {
      // CMF: 0x78 (deflate, 32KB window)
      // FLG: 0xBB (FLEVEL = default, FDICT = true, FCHECK = 27)
      // DICTID: 0x12 0x34 0x56 0x78
      const bytes = new Uint8Array([0x78, 0xbb, 0x12, 0x34, 0x56, 0x78]);
      const result = parseZlibHeader(bytes);
      expect(result.ok).toBe(true);
      expect(result.fdict).toBe(true);
      expect(result.dictId).toBe('0x12345678');
      expect(result.dictIdNumber).toBe(0x12345678);
      expect(result.headerLength).toBe(6);
      expect(result.fcheckValid).toBe(true);
      expect(result.flevel).toBe('default');
    });

    it('returns error on bad FCHECK', () => {
      // 78 9D is corrupt check bits ((120*256 + 157) % 31 !== 0)
      const result = parseZlibHeader(new Uint8Array([0x78, 0x9d]));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/invalid fcheck/i);
      expect(result.fcheckValid).toBe(false);
      expect(result.cmf).toBe(0x78);
      expect(result.flg).toBe(0x9d);
    });

    it('returns error on truncated buffer (fewer than 2 bytes)', () => {
      const result1 = parseZlibHeader(new Uint8Array([]));
      expect(result1.ok).toBe(false);
      expect(result1.error).toMatch(/truncated/i);

      const result2 = parseZlibHeader(new Uint8Array([0x78]));
      expect(result2.ok).toBe(false);
      expect(result2.error).toMatch(/truncated/i);
    });

    it('returns error on truncated FDICT header (missing DICTID bytes)', () => {
      // FDICT set (0x78, 0xBB), but only 4 bytes total instead of at least 6
      const result = parseZlibHeader(new Uint8Array([0x78, 0xbb, 0x12, 0x34]));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/truncated buffer.*dictid/i);
      expect(result.fdict).toBe(true);
    });

    it('decodes trailing Adler-32 when buffer is long enough', () => {
      // 78 9C (2 bytes header) + 00 (compressed payload) + 01 02 03 04 (Adler-32) = 7 bytes
      const bytes = new Uint8Array([0x78, 0x9c, 0x00, 0x01, 0x02, 0x03, 0x04]);
      const result = parseZlibHeader(bytes);
      expect(result.ok).toBe(true);
      expect(result.adler32).toBe('0x01020304');
      expect(result.adler32Number).toBe(0x01020304);
    });

    it('decodes trailing Adler-32 with FDICT when buffer is long enough', () => {
      // 6 bytes header (with FDICT) + 4 bytes Adler-32
      const bytes = new Uint8Array([
        0x78, 0xbb, 0x12, 0x34, 0x56, 0x78, 0xde, 0xad, 0xbe, 0xef,
      ]);
      const result = parseZlibHeader(bytes);
      expect(result.ok).toBe(true);
      expect(result.adler32).toBe('0xDEADBEEF');
      expect(result.adler32Number).toBe(0xdeadbeef);
    });

    it('preserves unknown compression method raw value', () => {
      // CM = 5, CINFO = 3. CMF = (3 << 4) | 5 = 0x35 (53).
      // 53 * 256 = 13568. 13568 % 31 = 21.
      // Need (21 + FLG) % 31 == 0 => FLG check = 10 (0x0A).
      // FLG = 0x0A. (13568 + 10) = 13578. 13578 / 31 = 438.
      const result = parseZlibHeader(new Uint8Array([0x35, 0x0a]));
      expect(result.ok).toBe(true);
      expect(result.compressionMethod).toBe('unknown (5)');
      expect(result.compressionMethodId).toBe(5);
      expect(result.windowSize).toBeNull();
      expect(result.fcheckValid).toBe(true);
    });

    it('flags CINFO > 7 as error for Deflate', () => {
      // CM = 8, CINFO = 8. CMF = (8 << 4) | 8 = 0x88 (136).
      // 136 * 256 = 34816. 34816 % 31 = 2.
      // Need (2 + FLG) % 31 == 0 => FLG = 29 (0x1D).
      const result = parseZlibHeader(new Uint8Array([0x88, 0x1d]));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/cinfo cannot exceed 7/i);
    });

    it('handles ArrayBuffer and regular Array input', () => {
      const arrResult = parseZlibHeader([0x78, 0x9c]);
      expect(arrResult.ok).toBe(true);

      const ab = new Uint8Array([0x78, 0x9c]).buffer;
      const abResult = parseZlibHeader(ab);
      expect(abResult.ok).toBe(true);
    });

    it('handles invalid inputs gracefully without throwing', () => {
      expect(parseZlibHeader(null).ok).toBe(false);
      expect(parseZlibHeader(undefined).ok).toBe(false);
      expect(parseZlibHeader('not a buffer').ok).toBe(false);
    });
  });

  describe('parseZlibFromHex', () => {
    it('parses valid hex string correctly', () => {
      const result = parseZlibFromHex('78 9C');
      expect(result.ok).toBe(true);
      expect(result.compressionMethod).toBe('deflate');
    });

    it('returns error on empty hex string', () => {
      const result = parseZlibFromHex('');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/please enter hex/i);
    });

    it('returns error on malformed hex string', () => {
      const result = parseZlibFromHex('78 9Z');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/invalid hexadecimal/i);
    });
  });
});
