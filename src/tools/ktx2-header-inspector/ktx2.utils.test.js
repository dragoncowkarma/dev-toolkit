import { describe, expect, it } from 'vitest';
import {
  createKtx2Buffer,
  formatFileSize,
  getSupercompressionSchemeName,
  getVkFormatName,
  parseKtx2Header,
  readFileAsArrayBuffer,
} from './ktx2.utils.js';

describe('ktx2.utils', () => {
  describe('getVkFormatName', () => {
    it('returns expected names for common Vulkan formats', () => {
      expect(getVkFormatName(0)).toBe('VK_FORMAT_UNDEFINED/Basis');
      expect(getVkFormatName(37)).toBe('R8G8B8A8_UNORM');
      expect(getVkFormatName(43)).toBe('R8G8B8A8_SRGB');
    });

    it('returns formatted fallback for unknown format IDs', () => {
      expect(getVkFormatName(9999)).toBe('Unknown (9999)');
    });
  });

  describe('getSupercompressionSchemeName', () => {
    it('returns correct names for each standard scheme', () => {
      expect(getSupercompressionSchemeName(0)).toBe('None');
      expect(getSupercompressionSchemeName(1)).toBe('BasisLZ');
      expect(getSupercompressionSchemeName(2)).toBe('Zstandard');
      expect(getSupercompressionSchemeName(3)).toBe('ZLIB');
    });

    it('returns formatted fallback for unknown scheme IDs', () => {
      expect(getSupercompressionSchemeName(42)).toBe('Unknown (42)');
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes, kilobytes, megabytes correctly', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(2048)).toBe('2.0 KB');
      expect(formatFileSize(1024 * 1024 * 5)).toBe('5.0 MB');
      expect(formatFileSize(1024n)).toBe('1.0 KB');
    });
  });

  describe('readFileAsArrayBuffer', () => {
    it('returns ArrayBuffer as-is if already an ArrayBuffer', async () => {
      const buffer = new ArrayBuffer(16);
      const result = await readFileAsArrayBuffer(buffer);
      expect(result).toBe(buffer);
    });

    it('returns underlying buffer for Uint8Array view', async () => {
      const view = new Uint8Array([1, 2, 3, 4]);
      const result = await readFileAsArrayBuffer(view);
      expect(result).toBe(view.buffer);
    });

    it('reads a File or Blob via FileReader or arrayBuffer', async () => {
      const file = new File([new Uint8Array([10, 20, 30])], 'data.bin');
      const result = await readFileAsArrayBuffer(file);
      expect(result.byteLength).toBe(3);
    });

    it('rejects for null or missing file', async () => {
      await expect(readFileAsArrayBuffer(null)).rejects.toThrow(/Missing file/i);
    });
  });

  describe('parseKtx2Header', () => {
    it('parses a valid 2D texture header', () => {
      const buffer = createKtx2Buffer({
        vkFormat: 37,
        pixelWidth: 512,
        pixelHeight: 256,
        pixelDepth: 0,
        layerCount: 0,
        faceCount: 1,
        levelCount: 1,
        supercompressionScheme: 0,
      });

      const result = parseKtx2Header(buffer);
      expect(result.vkFormat).toBe(37);
      expect(result.vkFormatName).toBe('R8G8B8A8_UNORM');
      expect(result.pixelWidth).toBe(512);
      expect(result.pixelHeight).toBe(256);
      expect(result.pixelDepth).toBe(0);
      expect(result.dimensionality).toBe('2D');
      expect(result.isCubeMap).toBe(false);
      expect(result.isArray).toBe(false);
      expect(result.levels.length).toBe(1);
      expect(result.levels[0].isOutOfBounds).toBe(false);
    });

    it('parses a cube map texture when faceCount is 6', () => {
      const buffer = createKtx2Buffer({
        pixelWidth: 256,
        pixelHeight: 256,
        faceCount: 6,
        layerCount: 0,
      });

      const result = parseKtx2Header(buffer);
      expect(result.faceCount).toBe(6);
      expect(result.isCubeMap).toBe(true);
      expect(result.dimensionality).toBe('2D');
    });

    it('parses an array texture when layerCount > 0', () => {
      const buffer = createKtx2Buffer({
        pixelWidth: 128,
        pixelHeight: 128,
        layerCount: 4,
        faceCount: 1,
      });

      const result = parseKtx2Header(buffer);
      expect(result.layerCount).toBe(4);
      expect(result.isArray).toBe(true);
    });

    it('parses 1D and 3D dimensionalities properly', () => {
      const buffer1D = createKtx2Buffer({
        pixelWidth: 256,
        pixelHeight: 0,
        pixelDepth: 0,
      });
      expect(parseKtx2Header(buffer1D).dimensionality).toBe('1D');

      const buffer3D = createKtx2Buffer({
        pixelWidth: 64,
        pixelHeight: 64,
        pixelDepth: 16,
      });
      expect(parseKtx2Header(buffer3D).dimensionality).toBe('3D');
    });

    it('handles each supercompression scheme plus an unknown scheme ID', () => {
      const schemes = [
        { id: 0, expected: 'None' },
        { id: 1, expected: 'BasisLZ' },
        { id: 2, expected: 'Zstandard' },
        { id: 3, expected: 'ZLIB' },
        { id: 99, expected: 'Unknown (99)' },
      ];

      for (const { id, expected } of schemes) {
        const buffer = createKtx2Buffer({ supercompressionScheme: id });
        const result = parseKtx2Header(buffer);
        expect(result.supercompressionScheme).toBe(id);
        expect(result.supercompressionSchemeName).toBe(expected);
      }
    });

    it('reads and preserves 64-bit SGD fields without precision loss', () => {
      const largeOffset = 0x100000000n; // 4294967296
      const largeLength = 0x200000000n; // 8589934592

      const buffer = createKtx2Buffer({
        sgdByteOffset: largeOffset,
        sgdByteLength: largeLength,
      });

      const result = parseKtx2Header(buffer);
      expect(result.sgdByteOffset).toBe(largeOffset);
      expect(result.sgdByteLength).toBe(largeLength);
      expect(result.sgdByteOffset.toString()).toBe('4294967296');
      expect(result.sgdByteLength.toString()).toBe('8589934592');
    });

    it('flags level index entries that extend past file size as out-of-bounds', () => {
      const buffer = createKtx2Buffer({
        levelCount: 2,
        extraBytes: 100,
        levels: [
          { byteOffset: 128n, byteLength: 50n, uncompressedByteLength: 50n },
          { byteOffset: 500n, byteLength: 100n, uncompressedByteLength: 100n },
        ],
      });

      const result = parseKtx2Header(buffer);
      expect(result.levels.length).toBe(2);
      expect(result.levels[0].isOutOfBounds).toBe(false);
      expect(result.levels[0].outOfBounds).toBe(false);
      expect(result.levels[1].isOutOfBounds).toBe(true);
      expect(result.levels[1].outOfBounds).toBe(true);
    });

    it('handles levelCount 0 by parsing max(levelCount, 1) entries', () => {
      const buffer = createKtx2Buffer({
        levelCount: 0,
        extraBytes: 64,
      });

      const result = parseKtx2Header(buffer);
      expect(result.levelCount).toBe(0);
      expect(result.levels.length).toBe(1);
    });

    it('throws explicit error for missing file or empty input', () => {
      expect(() => parseKtx2Header(null)).toThrow(/Missing file/i);
      expect(() => parseKtx2Header(undefined)).toThrow(/Missing file/i);
      expect(() => parseKtx2Header('invalid string')).toThrow(/Missing file/i);
    });

    it('throws explicit error for input shorter than 80 bytes', () => {
      const smallBuffer = new ArrayBuffer(50);
      expect(() => parseKtx2Header(smallBuffer)).toThrow(/shorter than 80 bytes/i);
    });

    it('throws explicit error for bad identifier', () => {
      const buffer = createKtx2Buffer({ corruptIdentifier: true });
      expect(() => parseKtx2Header(buffer)).toThrow(/Bad identifier/i);
    });

    it('throws explicit error for truncated level index', () => {
      // 80 bytes header + 24 bytes for level 0, but specifies levelCount: 4 (requires 80+96=176)
      const buffer = createKtx2Buffer({ levelCount: 1, extraBytes: 0 });
      const view = new DataView(buffer);
      view.setUint32(40, 4, true); // Overwrite levelCount to 4 without expanding buffer

      expect(() => parseKtx2Header(buffer)).toThrow(/Truncated level index/i);
    });
  });
});
