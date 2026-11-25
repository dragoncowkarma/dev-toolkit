import { describe, expect, it } from 'vitest';
import {
  KNOWN_BIOS_MUSIC,
  buildVectrexHeader,
  formatFileSize,
  formatHex,
  formatHexDump,
  isPowerOfTwo,
  parseVectrexHeader,
  readRomHeaderPrefix,
  toSignedInt8,
} from './vectrex-rom-header-inspector.utils.js';

describe('Vectrex Header Inspector - Utilities', () => {
  describe('isPowerOfTwo', () => {
    it('returns true for positive powers of two', () => {
      expect(isPowerOfTwo(1)).toBe(true);
      expect(isPowerOfTwo(2)).toBe(true);
      expect(isPowerOfTwo(1024)).toBe(true);
      expect(isPowerOfTwo(8192)).toBe(true);
      expect(isPowerOfTwo(32768)).toBe(true);
    });

    it('returns false for numbers that are not powers of two', () => {
      expect(isPowerOfTwo(0)).toBe(false);
      expect(isPowerOfTwo(-8)).toBe(false);
      expect(isPowerOfTwo(3)).toBe(false);
      expect(isPowerOfTwo(10000)).toBe(false);
      expect(isPowerOfTwo(32769)).toBe(false);
      expect(isPowerOfTwo(NaN)).toBe(false);
      expect(isPowerOfTwo('8192')).toBe(false);
    });
  });

  describe('toSignedInt8', () => {
    it('converts unsigned bytes to signed 8-bit integers', () => {
      expect(toSignedInt8(0)).toBe(0);
      expect(toSignedInt8(80)).toBe(80);
      expect(toSignedInt8(127)).toBe(127);
      expect(toSignedInt8(0xf8)).toBe(-8);
      expect(toSignedInt8(0xab)).toBe(-85);
      expect(toSignedInt8(0x80)).toBe(-128);
      expect(toSignedInt8(0xff)).toBe(-1);
    });
  });

  describe('formatHex', () => {
    it('formats numbers as hex with leading dollar sign', () => {
      expect(formatHex(0x50, 2)).toBe('$50');
      expect(formatHex(0xfd0d, 4)).toBe('$FD0D');
      expect(formatHex(0, 2)).toBe('$00');
      expect(formatHex(null)).toBe('');
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes into readable units', () => {
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(8192)).toBe('8.0 KB');
      expect(formatFileSize(32768)).toBe('32.0 KB');
      expect(formatFileSize(-5)).toBe('0 B');
    });
  });

  describe('formatHexDump', () => {
    it('formats byte buffer as offset, hex pairs, and ASCII representation', () => {
      const bytes = new Uint8Array([0x67, 0x20, 0x47, 0x43, 0x45, 0x20]);
      const dump = formatHexDump(bytes);
      expect(dump).toContain('0000:');
      expect(dump).toContain('67 20 47 43 45 20');
      expect(dump).toContain('g GCE ');
    });

    it('returns empty string for null or empty input', () => {
      expect(formatHexDump(null)).toBe('');
      expect(formatHexDump([])).toBe('');
    });
  });

  describe('readRomHeaderPrefix', () => {
    it('reads only a bounded prefix of a file', async () => {
      const fullContent = new Uint8Array(2048);
      fullContent[0] = 0x67;
      fullContent[1] = 0x20;
      const file = new File([fullContent], 'test.vec');

      const prefix = await readRomHeaderPrefix(file, 256);
      expect(prefix.length).toBe(256);
      expect(prefix[0]).toBe(0x67);
      expect(prefix[1]).toBe(0x20);
    });

    it('throws error when file is missing', async () => {
      await expect(readRomHeaderPrefix(null)).rejects.toThrow(TypeError);
    });
  });

  describe('parseVectrexHeader - Valid Headers', () => {
    it('parses a standard valid Vectrex cartridge header', () => {
      const romBytes = buildVectrexHeader({
        copyright: 'g GCE 1982',
        musicPointer: 0xfd0d,
        titleHeight: -8,
        titleWidth: 80,
        titleRelY: 32,
        titleRelX: -85,
        title: 'MINE STORM',
        totalRomSize: 8192,
      });

      const result = parseVectrexHeader(romBytes, 8192);

      expect(result.valid).toBe(true);
      expect(result.copyright).toBe('g GCE 1982');
      expect(result.copyrightNotice).toBe('1982');
      expect(result.musicPointer).toBe(0xfd0d);
      expect(result.musicPointerHex).toBe('$FD0D');
      expect(result.musicName).toBe(KNOWN_BIOS_MUSIC[0xfd0d]);
      expect(result.titleHeight).toBe(-8);
      expect(result.titleWidth).toBe(80);
      expect(result.titleRelY).toBe(32);
      expect(result.titleRelX).toBe(-85);
      expect(result.title).toBe('MINE STORM');
      expect(result.flags.tooSmall).toBe(false);
      expect(result.flags.missingSignature).toBe(false);
      expect(result.flags.missingTerminator).toBe(false);
      expect(result.flags.notPowerOfTwo).toBe(false);
      expect(result.flags.exceeds32KiB).toBe(false);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('parseVectrexHeader - Bad Signature', () => {
    it('flags missing or invalid signature when prefix does not match "g GCE "', () => {
      const romBytes = buildVectrexHeader({
        copyright: 'x BAD 1982',
        totalRomSize: 8192,
      });

      const result = parseVectrexHeader(romBytes, 8192);

      expect(result.valid).toBe(false);
      expect(result.flags.missingSignature).toBe(true);
      expect(result.errors.some((e) => e.includes('Missing signature'))).toBe(true);
    });
  });

  describe('parseVectrexHeader - Truncation and Too Small', () => {
    it('flags files smaller than minimum header size', () => {
      const tinyBytes = new Uint8Array([0x67, 0x20, 0x47]);
      const result = parseVectrexHeader(tinyBytes, 3);

      expect(result.valid).toBe(false);
      expect(result.flags.tooSmall).toBe(true);
      expect(result.errors.some((e) => e.includes('too small'))).toBe(true);
    });

    it('flags truncated header when file cuts off before music pointer', () => {
      // Exactly 11 bytes: "g GCE 1982" + 0x80 terminator, then nothing
      const bytes = new Uint8Array([
        0x67, 0x20, 0x47, 0x43, 0x45, 0x20, 0x31, 0x39, 0x38, 0x32, 0x80,
      ]);

      const result = parseVectrexHeader(bytes, bytes.length);

      expect(result.valid).toBe(false);
      expect(result.flags.tooSmall).toBe(true);
      expect(result.errors.some((e) => e.includes('Truncated header'))).toBe(true);
    });

    it('flags truncated header when file cuts off before text display parameters', () => {
      // Exactly 13 bytes: "g GCE 1982" + 0x80 + 2-byte music pointer, then nothing
      const bytes = new Uint8Array([
        0x67, 0x20, 0x47, 0x43, 0x45, 0x20, 0x31, 0x39, 0x38, 0x32, 0x80,
        0xfd, 0x0d,
      ]);

      const result = parseVectrexHeader(bytes, bytes.length);

      expect(result.valid).toBe(false);
      expect(result.flags.tooSmall).toBe(true);
      expect(result.errors.some((e) => e.includes('text display parameters'))).toBe(true);
    });
  });

  describe('parseVectrexHeader - Missing Terminator', () => {
    it('flags missing 0x80 terminator on copyright string', () => {
      const bytes = buildVectrexHeader({
        omitCopyrightTerminator: true,
      });

      const result = parseVectrexHeader(bytes, 8192);

      expect(result.valid).toBe(false);
      expect(result.flags.missingTerminator).toBe(true);
      expect(
        result.errors.some((e) => e.includes('Copyright string is not terminated by 0x80'))
      ).toBe(true);
    });

    it('flags missing 0x80 terminator on title string', () => {
      const bytes = buildVectrexHeader({
        omitTitleTerminator: true,
      });

      const result = parseVectrexHeader(bytes, 8192);

      expect(result.valid).toBe(false);
      expect(result.flags.missingTerminator).toBe(true);
      expect(
        result.errors.some((e) => e.includes('Title string is not terminated by 0x80'))
      ).toBe(true);
    });

    it('flags missing 0x00 header terminator after title string', () => {
      const bytes = buildVectrexHeader({
        omitHeaderTerminator: true,
      });

      const result = parseVectrexHeader(bytes, bytes.length);

      expect(result.valid).toBe(false);
      expect(result.flags.missingTerminator).toBe(true);
      expect(result.errors.some((e) => e.includes('Header terminator 0x00 missing'))).toBe(true);
    });

    it('flags non-zero byte instead of 0x00 header terminator', () => {
      const bytes = buildVectrexHeader({
        corruptHeaderTerminator: true,
      });

      const result = parseVectrexHeader(bytes, 8192);

      expect(result.valid).toBe(false);
      expect(result.flags.missingTerminator).toBe(true);
      expect(result.errors.some((e) => e.includes('Expected 0x00 after title string'))).toBe(true);
    });
  });

  describe('parseVectrexHeader - Size Flags', () => {
    it('flags file size that is not a power of two', () => {
      const bytes = buildVectrexHeader({ totalRomSize: 8192 });
      const nonPowerOfTwoSize = 10000;

      const result = parseVectrexHeader(bytes, nonPowerOfTwoSize);

      expect(result.flags.notPowerOfTwo).toBe(true);
      expect(result.warnings.some((w) => w.includes('not a power of two'))).toBe(true);
    });

    it('flags file size that exceeds 32 KiB', () => {
      const bytes = buildVectrexHeader({ totalRomSize: 8192 });
      const oversized = 65536; // 64 KiB

      const result = parseVectrexHeader(bytes, oversized);

      expect(result.flags.exceeds32KiB).toBe(true);
      expect(
        result.warnings.some((w) => w.includes('exceeds standard Vectrex cartridge limit'))
      ).toBe(true);
    });

    it('does not flag valid power of two sizes up to 32 KiB', () => {
      const bytes = buildVectrexHeader();
      [2048, 4096, 8192, 16384, 32768].forEach((size) => {
        const result = parseVectrexHeader(bytes, size);
        expect(result.flags.notPowerOfTwo).toBe(false);
        expect(result.flags.exceeds32KiB).toBe(false);
      });
    });
  });
});
