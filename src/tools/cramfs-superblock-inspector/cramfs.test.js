import { describe, expect, it } from 'vitest';
import {
  CRAMFS_FLAGS,
  CRAMFS_MAGIC,
  CRAMFS_SIGNATURE,
  CRAMFS_SUPERBLOCK_SIZE,
  createSampleSuperblock,
  decodeCramfsFlags,
  decodeNullTerminatedAscii,
  formatFileSize,
  getCramfsFlagDetails,
  parseCramfsSuperblock,
  readCramfsSuperblockFile,
} from './cramfs.utils.js';

describe('cramfs.utils', () => {
  describe('parseCramfsSuperblock', () => {
    it('parses a valid Little-Endian (LE) superblock', () => {
      const buffer = createSampleSuperblock({
        endianness: 'little',
        size: 131072,
        flags: 0x00000003,
        future: 0,
        signature: 'Compressed ROMFS',
        fsid: { crc: 0xabcdef12, edition: 2, blocks: 32, files: 8 },
        name: 'rootfs-le',
      });

      const parsed = parseCramfsSuperblock(buffer);

      expect(parsed.magic).toBe(CRAMFS_MAGIC);
      expect(parsed.magicHex).toBe('0x28cd3d45');
      expect(parsed.endianness).toBe('little');
      expect(parsed.size).toBe(131072);
      expect(parsed.flags).toBe(3);
      expect(parsed.flagsHex).toBe('0x00000003');
      expect(parsed.flagNames).toEqual(['FSID Version 2', 'Sorted Directories']);
      expect(parsed.future).toBe(0);
      expect(parsed.futureHex).toBe('0x00000000');
      expect(parsed.signature).toBe('Compressed ROMFS');
      expect(parsed.fsid.crc).toBe(0xabcdef12);
      expect(parsed.fsid.crcHex).toBe('0xabcdef12');
      expect(parsed.fsid.edition).toBe(2);
      expect(parsed.fsid.blocks).toBe(32);
      expect(parsed.fsid.files).toBe(8);
      expect(parsed.name).toBe('rootfs-le');
    });

    it('parses a valid Big-Endian (BE) superblock', () => {
      const buffer = createSampleSuperblock({
        endianness: 'big',
        size: 262144,
        flags: 0x00000102,
        future: 0,
        signature: 'Compressed ROMFS',
        fsid: { crc: 0x98765432, edition: 5, blocks: 64, files: 12 },
        name: 'rootfs-be',
      });

      const parsed = parseCramfsSuperblock(buffer);

      expect(parsed.magic).toBe(CRAMFS_MAGIC);
      expect(parsed.magicHex).toBe('0x28cd3d45');
      expect(parsed.endianness).toBe('big');
      expect(parsed.size).toBe(262144);
      expect(parsed.flags).toBe(0x00000102);
      expect(parsed.flagsHex).toBe('0x00000102');
      expect(parsed.flagNames).toEqual(['Sorted Directories', 'Holes Support']);
      expect(parsed.signature).toBe('Compressed ROMFS');
      expect(parsed.fsid.crc).toBe(0x98765432);
      expect(parsed.fsid.edition).toBe(5);
      expect(parsed.fsid.blocks).toBe(64);
      expect(parsed.fsid.files).toBe(12);
      expect(parsed.name).toBe('rootfs-be');
    });

    it('throws clear error for bad magic number', () => {
      const badBuffer = new Uint8Array(CRAMFS_SUPERBLOCK_SIZE);
      badBuffer[0] = 0x11;
      badBuffer[1] = 0x22;
      badBuffer[2] = 0x33;
      badBuffer[3] = 0x44;

      expect(() => parseCramfsSuperblock(badBuffer)).toThrow(
        /Invalid CramFS magic: expected 0x28cd3d45/i
      );
    });

    it('throws clear error for truncated input (< 76 bytes)', () => {
      const truncated = new Uint8Array(50);
      expect(() => parseCramfsSuperblock(truncated)).toThrow(
        /Truncated CramFS image: expected at least 76 bytes, received 50 byte\(s\)/i
      );
    });

    it('throws TypeError for non-buffer input', () => {
      expect(() => parseCramfsSuperblock('invalid')).toThrow(TypeError);
    });
  });

  describe('decodeCramfsFlags', () => {
    it('returns empty array when no flags are set', () => {
      expect(decodeCramfsFlags(0)).toEqual([]);
    });

    it('decodes single flags correctly', () => {
      expect(decodeCramfsFlags(0x00000001)).toEqual(['FSID Version 2']);
      expect(decodeCramfsFlags(0x00000002)).toEqual(['Sorted Directories']);
      expect(decodeCramfsFlags(0x00000100)).toEqual(['Holes Support']);
      expect(decodeCramfsFlags(0x00000200)).toEqual(['Wrong Signature']);
      expect(decodeCramfsFlags(0x00000400)).toEqual(['Shifted Root Offset']);
      expect(decodeCramfsFlags(0x00000800)).toEqual(['Extended Block Pointers']);
    });

    it('decodes multiple combined flags', () => {
      const flags = 0x00000001 | 0x00000100 | 0x00000400;
      expect(decodeCramfsFlags(flags)).toEqual([
        'FSID Version 2',
        'Holes Support',
        'Shifted Root Offset',
      ]);
    });

    it('reports unknown flag bits clearly', () => {
      const flags = 0x00000001 | 0x00000010;
      expect(decodeCramfsFlags(flags)).toEqual([
        'FSID Version 2',
        'Unknown (0x00000010)',
      ]);
    });
  });

  describe('getCramfsFlagDetails', () => {
    it('reports enabled and disabled status for all known flags', () => {
      const details = getCramfsFlagDetails(0x00000002);
      expect(details).toHaveLength(CRAMFS_FLAGS.length);
      const sorted = details.find((f) => f.id === 'CRAMFS_FLAG_SORTED_DIRS');
      const holes = details.find((f) => f.id === 'CRAMFS_FLAG_HOLES');
      expect(sorted?.active).toBe(true);
      expect(holes?.active).toBe(false);
    });
  });

  describe('decodeNullTerminatedAscii', () => {
    it('decodes strings up to first null byte', () => {
      const bytes = new Uint8Array([104, 101, 108, 108, 111, 0, 119, 111, 114, 108, 100]);
      expect(decodeNullTerminatedAscii(bytes)).toBe('hello');
    });

    it('decodes full byte array when no null byte is present', () => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(CRAMFS_SIGNATURE);
      expect(decodeNullTerminatedAscii(bytes)).toBe(CRAMFS_SIGNATURE);
    });
  });

  describe('formatFileSize', () => {
    it('formats 0 and negative bytes safely', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(-10)).toBe('0 B');
      expect(formatFileSize(NaN)).toBe('0 B');
    });

    it('formats bytes below 1KB', () => {
      expect(formatFileSize(512)).toBe('512 B');
    });

    it('formats kilobytes', () => {
      expect(formatFileSize(2048)).toBe('2.0 KB');
    });

    it('formats megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.0 MB');
    });
  });

  describe('readCramfsSuperblockFile', () => {
    it('reads only first 76 bytes and reports actual file size', async () => {
      const fullFileSize = 1048576; // 1 MB
      const bigFileBytes = new Uint8Array(fullFileSize);
      const sample = createSampleSuperblock({
        endianness: 'little',
        size: 524288,
        name: 'large_image',
      });
      bigFileBytes.set(sample, 0);

      const file = new File([bigFileBytes], 'large_image.cramfs');
      const result = await readCramfsSuperblockFile(file);

      expect(result.actualSize).toBe(fullFileSize);
      expect(result.size).toBe(524288);
      expect(result.name).toBe('large_image');
      expect(result.endianness).toBe('little');
    });

    it('throws when file is smaller than 76 bytes', async () => {
      const smallFile = new File([new Uint8Array(20)], 'tiny.cramfs');
      await expect(readCramfsSuperblockFile(smallFile)).rejects.toThrow(
        /Truncated CramFS image: expected at least 76 bytes, received 20 byte\(s\)/i
      );
    });

    it('throws when file argument is missing', async () => {
      await expect(readCramfsSuperblockFile(null)).rejects.toThrow(TypeError);
    });
  });
});
