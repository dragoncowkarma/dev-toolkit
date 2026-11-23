import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  createSampleHfsHeader,
  dateToHfsTimestamp,
  decodeAttributes,
  formatBytes,
  formatHfsDate,
  formatHfsLocalDate,
  HFS_EPOCH_DIFF_SECONDS,
  HFS_PLUS_SIGNATURE,
  HFSX_SIGNATURE,
  hfsDateToDate,
  hexToBytes,
  parseHfsVolumeHeader,
} from './hfs-volume-header-inspector.utils.js';

describe('hfs-volume-header-inspector.utils', () => {
  describe('hex conversion', () => {
    it('converts valid hex string with spaces and delimiters', () => {
      const bytes = hexToBytes('48 2B : 00-04');
      expect(bytes).toEqual(new Uint8Array([0x48, 0x2b, 0x00, 0x04]));
    });

    it('handles empty hex string', () => {
      expect(hexToBytes('')).toEqual(new Uint8Array(0));
    });

    it('throws on non-string input', () => {
      expect(() => hexToBytes(123)).toThrow(TypeError);
    });

    it('throws on odd-length hex string', () => {
      expect(() => hexToBytes('abc')).toThrow(/even number of characters/);
    });

    it('throws on invalid hex characters', () => {
      expect(() => hexToBytes('482Z')).toThrow(/invalid characters/);
    });

    it('converts bytes back to hex string', () => {
      const bytes = new Uint8Array([0x48, 0x58]);
      expect(bytesToHex(bytes)).toBe('4858');
    });
  });

  describe('date conversion (HFS epoch 1904)', () => {
    it('converts 1970-01-01 correctly', () => {
      // Unix epoch corresponds to HFS_EPOCH_DIFF_SECONDS
      const date = hfsDateToDate(HFS_EPOCH_DIFF_SECONDS);
      expect(date?.toISOString()).toBe('1970-01-01T00:00:00.000Z');
      expect(dateToHfsTimestamp(date)).toBe(HFS_EPOCH_DIFF_SECONDS);
    });

    it('converts 2020-01-01 correctly', () => {
      const targetDate = new Date('2020-01-01T00:00:00.000Z');
      const hfsTimestamp = dateToHfsTimestamp(targetDate);
      expect(hfsDateToDate(hfsTimestamp)?.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    });

    it('returns null and "None (0)" for unset timestamp 0', () => {
      expect(hfsDateToDate(0)).toBeNull();
      expect(formatHfsDate(0)).toBe('None (0)');
      expect(formatHfsLocalDate(0)).toBe('None (0)');
    });

    it('formats valid date with UTC suffix', () => {
      const formatted = formatHfsDate(HFS_EPOCH_DIFF_SECONDS);
      expect(formatted).toBe('1970-01-01T00:00:00 UTC');
    });

    it('formats local date without asserting UTC', () => {
      const formatted = formatHfsLocalDate(HFS_EPOCH_DIFF_SECONDS);
      expect(formatted).toBe('1970-01-01T00:00:00 (Local / Unknown Zone)');
      expect(formatted).not.toContain('UTC');
    });
  });

  describe('formatBytes', () => {
    it('formats bytes and large BigInt values', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1048576)).toBe('1.00 MB');
      expect(formatBytes(1073741824n)).toBe('1.00 GB');
    });
  });

  describe('decodeAttributes', () => {
    it('decodes all specified attribute flags', () => {
      // unmounted (bit 8, 0x100) + journaled (bit 13, 0x2000)
      const flags = decodeAttributes(0x00002100);
      expect(flags.unmounted).toBe(true);
      expect(flags.journaled).toBe(true);
      expect(flags.spareBlocks).toBe(false);
      expect(flags.noCacheRequired).toBe(false);
      expect(flags.bootVolumeInconsistent).toBe(false);
      expect(flags.catalogNodeIDsReused).toBe(false);
      expect(flags.softwareLock).toBe(false);
    });

    it('decodes software lock and spared blocks flags', () => {
      const flags = decodeAttributes(0x00008200);
      expect(flags.softwareLock).toBe(true);
      expect(flags.spareBlocks).toBe(true);
      expect(flags.journaled).toBe(false);
    });
  });

  describe('parseHfsVolumeHeader', () => {
    it('parses a valid HFS+ volume header at offset 1024', () => {
      const buffer = createSampleHfsHeader({
        signature: HFS_PLUS_SIGNATURE,
        version: 4,
        blockSize: 4096,
        totalBlocks: 262144, // 1 GB
        freeBlocks: 180000,
      });

      const result = parseHfsVolumeHeader(buffer);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.header.signatureType).toBe('HFS+');
      expect(result.header.signatureString).toBe('H+');
      expect(result.header.version).toBe(4);
      expect(result.header.blockSize).toBe(4096);
      expect(result.header.totalBlocks).toBe(262144);
      expect(result.header.freeBlocks).toBe(180000);
      expect(result.header.attributeFlags.unmounted).toBe(true);
      expect(result.header.attributeFlags.journaled).toBe(true);

      // Verify derived calculations
      expect(result.derived.volumeSizeBytes).toBe(1073741824n);
      expect(result.derived.volumeSizeFormatted).toBe('1.00 GB');
      expect(result.derived.usedBlocks).toBe(82144);

      // Verify fork data parsed
      expect(result.header.catalogFile.logicalSize).toBe(10485760n);
      expect(result.header.catalogFile.extents[0].startBlock).toBe(1000);
      expect(result.header.catalogFile.extents[0].blockCount).toBe(2560);
    });

    it('parses a valid HFSX volume header', () => {
      const buffer = createSampleHfsHeader({
        signature: HFSX_SIGNATURE,
        version: 5,
        offset: 1024,
      });

      const result = parseHfsVolumeHeader(buffer);
      expect(result.isValid).toBe(true);
      expect(result.header.signatureType).toBe('HFSX');
      expect(result.header.signatureString).toBe('HX');
      expect(result.header.version).toBe(5);
    });

    it('diagnoses a bad signature', () => {
      const buffer = createSampleHfsHeader({
        signature: 0x1234,
      });

      const result = parseHfsVolumeHeader(buffer);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes('Bad signature'))).toBe(true);
      expect(result.header.signatureType).toBe('Unknown');
    });

    it('diagnoses truncated input', () => {
      // Default offset 1024 requires 1536 bytes
      const shortBuffer = new Uint8Array(1000);
      const result = parseHfsVolumeHeader(shortBuffer);

      expect(result.isValid).toBe(false);
      expect(result.header).toBeNull();
      expect(result.errors.some((err) => err.includes('Truncated input'))).toBe(true);

      // Test strict mode throwing
      expect(() => parseHfsVolumeHeader(shortBuffer, { strict: true })).toThrow(/Truncated input/);
    });

    it('diagnoses an invalid block size (not a power of two)', () => {
      const buffer = createSampleHfsHeader({
        blockSize: 3000,
      });

      const result = parseHfsVolumeHeader(buffer);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes('Invalid block size'))).toBe(true);
    });

    it('diagnoses freeBlocks > totalBlocks', () => {
      const buffer = createSampleHfsHeader({
        totalBlocks: 100,
        freeBlocks: 200,
      });

      const result = parseHfsVolumeHeader(buffer);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((err) => err.includes('freeBlocks (200) cannot exceed'))
      ).toBe(true);
    });

    it('supports custom offset 0 for raw headers', () => {
      const buffer = createSampleHfsHeader({
        offset: 0,
        totalLength: 512,
      });

      const result = parseHfsVolumeHeader(buffer, { offset: 0 });
      expect(result.isValid).toBe(true);
      expect(result.header.signatureType).toBe('HFS+');
      expect(result.header.offset).toBe(0);
    });

    it('distinguishes local createDate from UTC timestamps', () => {
      const buffer = createSampleHfsHeader({
        createDate: 3660681600,
        modifyDate: 3700000000,
        checkedDate: 3700000000,
        backupDate: 3700000000,
      });

      const result = parseHfsVolumeHeader(buffer);
      expect(result.isValid).toBe(true);
      expect(result.header.createDateFormatted).not.toContain('UTC');
      expect(result.header.createDateFormatted).toContain('Local / Unknown Zone');
      expect(result.header.modifyDateFormatted).toContain('UTC');
      expect(result.header.checkedDateFormatted).toContain('UTC');
      expect(result.header.backupDateFormatted).toContain('UTC');
    });

    it('supports pre-sliced buffer with isSlice option and preserves truncated diagnostics', () => {
      const fullBuffer = createSampleHfsHeader({ offset: 1024 });
      const slice = fullBuffer.subarray(1024, 1536);

      const result = parseHfsVolumeHeader(slice, {
        offset: 1024,
        isSlice: true,
        fileSize: fullBuffer.length,
      });

      expect(result.isValid).toBe(true);
      expect(result.header.signatureType).toBe('HFS+');
      expect(result.header.offset).toBe(1024);

      // Truncated slice / file diagnostics
      const truncatedResult = parseHfsVolumeHeader(new Uint8Array(200), {
        offset: 1024,
        isSlice: true,
        fileSize: 800,
      });
      expect(truncatedResult.isValid).toBe(false);
      expect(truncatedResult.errors[0]).toContain('Truncated input: expected at least 1536 bytes');
      expect(truncatedResult.errors[0]).toContain('received 800 bytes');
    });
  });
});
