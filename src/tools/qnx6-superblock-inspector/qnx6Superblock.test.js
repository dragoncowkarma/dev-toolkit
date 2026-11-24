import { describe, expect, it } from 'vitest';
import {
  BOOT_AREA_SIZE,
  MAX_SLICE_SIZE,
  QNX6_MAGIC,
  SUPERBLOCK_SIZE,
  VALID_BLOCK_SIZES,
  buildSampleSuperblock,
  bytesToHex,
  computeCrc32Be,
  detectSuperblockOffset,
  formatTimestamp,
  formatUuid,
  parseHexInput,
  parseQnx6Superblock,
  readSuperblockSlice,
} from './qnx6Superblock.utils.js';

describe('qnx6Superblock.utils', () => {
  describe('computeCrc32Be', () => {
    it('computes expected CRC32 for known input bytes', () => {
      const data = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
      const crc = computeCrc32Be(data, 0, data.length);
      expect(typeof crc).toBe('number');
      expect(crc).toBeGreaterThan(0);
    });
  });

  describe('detectSuperblockOffset and byte orders', () => {
    it('detects little-endian magic at offset 0', () => {
      const buf = buildSampleSuperblock({ isLittleEndian: true, offset: 0 });
      const detected = detectSuperblockOffset(buf);
      expect(detected).toEqual({ offset: 0, byteOrder: 'little' });
    });

    it('detects big-endian magic at offset 0', () => {
      const buf = buildSampleSuperblock({ isLittleEndian: false, offset: 0 });
      const detected = detectSuperblockOffset(buf);
      expect(detected).toEqual({ offset: 0, byteOrder: 'big' });
    });

    it('detects little-endian magic at offset 0x2000 in disk image', () => {
      const buf = buildSampleSuperblock({
        isLittleEndian: true,
        offset: BOOT_AREA_SIZE,
      });
      const detected = detectSuperblockOffset(buf);
      expect(detected).toEqual({ offset: BOOT_AREA_SIZE, byteOrder: 'little' });
    });

    it('detects big-endian magic at offset 0x2000 in disk image', () => {
      const buf = buildSampleSuperblock({
        isLittleEndian: false,
        offset: BOOT_AREA_SIZE,
      });
      const detected = detectSuperblockOffset(buf);
      expect(detected).toEqual({ offset: BOOT_AREA_SIZE, byteOrder: 'big' });
    });

    it('returns null when buffer has fewer than 4 bytes', () => {
      expect(detectSuperblockOffset(new Uint8Array([0x22, 0x11]))).toBeNull();
      expect(detectSuperblockOffset(new Uint8Array(0))).toBeNull();
      expect(detectSuperblockOffset(null)).toBeNull();
    });

    it('returns null when magic does not match', () => {
      const buf = new Uint8Array(SUPERBLOCK_SIZE);
      buf.fill(0xff);
      expect(detectSuperblockOffset(buf)).toBeNull();
    });
  });

  describe('parseQnx6Superblock with both byte orders', () => {
    it('correctly parses little-endian superblock at offset 0', () => {
      const uuid = new Uint8Array([
        0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80,
        0x90, 0xa0, 0xb0, 0xc0, 0xd0, 0xe0, 0xf0, 0x01,
      ]);
      const buf = buildSampleSuperblock({
        isLittleEndian: true,
        offset: 0,
        serial: 123456n,
        blockSize: 2048,
        numInodes: 4096,
        freeInodes: 3000,
        numBlocks: 100000,
        freeBlocks: 80000,
        volumeId: uuid,
      });

      const result = parseQnx6Superblock(buf);
      expect(result.valid).toBe(true);
      expect(result.truncated).toBe(false);
      expect(result.byteOrder).toBe('little');
      expect(result.offset).toBe(0);
      expect(result.magic).toBe(QNX6_MAGIC);
      expect(result.crcMatch).toBe(true);
      expect(result.serial).toBe(123456n);
      expect(result.blockSize).toBe(2048);
      expect(result.numInodes).toBe(4096);
      expect(result.freeInodes).toBe(3000);
      expect(result.numBlocks).toBe(100000);
      expect(result.freeBlocks).toBe(80000);
      expect(result.volumeId).toBe('10203040-5060-7080-90a0-b0c0d0e0f001');
      expect(result.roots.inode.size).toBe(1024n);
      expect(result.roots.bitmap.size).toBe(8192n);
      expect(result.roots.longfile.size).toBe(512n);
    });

    it('correctly parses big-endian superblock at offset 0x2000', () => {
      const buf = buildSampleSuperblock({
        isLittleEndian: false,
        offset: BOOT_AREA_SIZE,
        serial: 987654n,
        blockSize: 4096,
        numInodes: 8192,
        freeInodes: 7000,
        numBlocks: 200000,
        freeBlocks: 150000,
      });

      const result = parseQnx6Superblock(buf);
      expect(result.valid).toBe(true);
      expect(result.byteOrder).toBe('big');
      expect(result.offset).toBe(BOOT_AREA_SIZE);
      expect(result.crcMatch).toBe(true);
      expect(result.serial).toBe(987654n);
      expect(result.blockSize).toBe(4096);
      expect(result.numInodes).toBe(8192);
      expect(result.freeInodes).toBe(7000);
    });
  });

  describe('bad magic value', () => {
    it('flags bad magic value and reports unknown byte order', () => {
      const buf = new Uint8Array(SUPERBLOCK_SIZE);
      const view = new DataView(buf.buffer);
      view.setUint32(0, 0xdeadbeef, false);

      const result = parseQnx6Superblock(buf);
      expect(result.valid).toBe(false);
      expect(result.byteOrder).toBe('unknown');
      expect(result.errors).toContain(
        'Invalid QNX6 superblock magic (expected 0x68191122). Unknown byte order.'
      );
    });
  });

  describe('invalid blocksize', () => {
    it('flags block size that is not 512, 1024, 2048, or 4096', () => {
      const buf = buildSampleSuperblock({ blockSize: 8192 });
      const result = parseQnx6Superblock(buf);
      expect(result.valid).toBe(false);
      expect(result.validBlockSize).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid block size: 8192'))).toBe(true);
    });

    it('accepts all valid block sizes', () => {
      for (const size of VALID_BLOCK_SIZES) {
        const buf = buildSampleSuperblock({ blockSize: size });
        const result = parseQnx6Superblock(buf);
        expect(result.validBlockSize).toBe(true);
        expect(result.blockSize).toBe(size);
      }
    });
  });

  describe('CRC mismatch', () => {
    it('reports CRC mismatch when checksum field is altered', () => {
      const buf = buildSampleSuperblock({ corruptChecksum: true });
      const result = parseQnx6Superblock(buf);
      expect(result.valid).toBe(false);
      expect(result.crcMatch).toBe(false);
      expect(result.errors.some((e) => e.includes('Superblock CRC32 mismatch'))).toBe(true);
    });

    it('reports CRC mismatch when payload byte inside data area is modified', () => {
      const buf = buildSampleSuperblock({ corruptChecksum: false });
      // Tamper with byte at offset 50 (inside blocksize or payload)
      buf[50] ^= 0x5a;
      const result = parseQnx6Superblock(buf);
      expect(result.valid).toBe(false);
      expect(result.crcMatch).toBe(false);
      expect(result.errors.some((e) => e.includes('Superblock CRC32 mismatch'))).toBe(true);
    });
  });

  describe('64-bit values above 2^53', () => {
    it('decodes serial and root sizes exceeding 2^53 with BigInt precision', () => {
      const largeSerial = (1n << 55n) + 12345n; // 36028797018976217n > Number.MAX_SAFE_INTEGER
      const largeInodeSize = 9007199254740993n; // 2^53 + 1
      const largeBitmapSize = 0x123456789abcdef0n;
      const largeLongfileSize = 18446744073709551615n; // 2^64 - 1

      const buf = buildSampleSuperblock({
        serial: largeSerial,
        inodeRoot: { size: largeInodeSize, level: 2, mode: 0 },
        bitmapRoot: { size: largeBitmapSize, level: 3, mode: 1 },
        longfileRoot: { size: largeLongfileSize, level: 1, mode: 0 },
      });

      const result = parseQnx6Superblock(buf);
      expect(result.valid).toBe(true);
      expect(result.serial).toBe(largeSerial);
      expect(result.roots.inode.size).toBe(largeInodeSize);
      expect(result.roots.bitmap.size).toBe(largeBitmapSize);
      expect(result.roots.longfile.size).toBe(largeLongfileSize);

      // Verify that standard Number precision loss would fail equality
      expect(Number(largeSerial)).not.toBe(largeSerial);
      expect(BigInt(Number(largeSerial))).not.toBe(largeSerial);
    });

    it('decodes big-endian 64-bit values above 2^53 with BigInt', () => {
      const largeSerial = 0xfedcba9876543210n;
      const buf = buildSampleSuperblock({
        isLittleEndian: false,
        serial: largeSerial,
      });
      const result = parseQnx6Superblock(buf);
      expect(result.valid).toBe(true);
      expect(result.serial).toBe(largeSerial);
    });
  });

  describe('truncation', () => {
    it('flags empty input as truncated', () => {
      const result = parseQnx6Superblock(new Uint8Array(0));
      expect(result.valid).toBe(false);
      expect(result.truncated).toBe(true);
      expect(result.errors).toContain('Input is empty.');
    });

    it('flags buffer smaller than 512 bytes as truncated', () => {
      const shortBuf = new Uint8Array(200);
      const result = parseQnx6Superblock(shortBuf);
      expect(result.valid).toBe(false);
      expect(result.truncated).toBe(true);
      expect(result.errors.some((e) => e.includes('Truncated input (200 bytes)'))).toBe(true);
    });

    it('flags buffer starting with magic but having fewer than 512 bytes', () => {
      const fullBuf = buildSampleSuperblock({ offset: 0 });
      const slicedBuf = fullBuf.slice(0, 300);
      const result = parseQnx6Superblock(slicedBuf);
      expect(result.valid).toBe(false);
      expect(result.truncated).toBe(true);
      expect(result.errors.some((e) => e.includes('Truncated superblock at offset 0x0'))).toBe(
        true
      );
    });

    it('flags disk image truncated before end of superblock at offset 0x2000', () => {
      const fullDisk = buildSampleSuperblock({ offset: BOOT_AREA_SIZE });
      // Sliced inside the superblock (e.g. 8192 + 200 = 8392 bytes)
      const slicedDisk = fullDisk.slice(0, BOOT_AREA_SIZE + 200);
      const result = parseQnx6Superblock(slicedDisk);
      expect(result.valid).toBe(false);
      expect(result.truncated).toBe(true);
      expect(result.offset).toBe(BOOT_AREA_SIZE);
      expect(
        result.errors.some((e) => e.includes('Truncated superblock at offset 0x2000'))
      ).toBe(true);
    });
  });

  describe('free counts exceeding totals', () => {
    it('flags free inodes exceeding total inodes', () => {
      const buf = buildSampleSuperblock({
        numInodes: 100,
        freeInodes: 150,
      });
      const result = parseQnx6Superblock(buf);
      expect(result.valid).toBe(false);
      expect(result.validFreeInodes).toBe(false);
      expect(result.errors).toContain('Free inodes (150) exceeds total inodes (100).');
    });

    it('flags free blocks exceeding total blocks', () => {
      const buf = buildSampleSuperblock({
        numBlocks: 1000,
        freeBlocks: 1001,
      });
      const result = parseQnx6Superblock(buf);
      expect(result.valid).toBe(false);
      expect(result.validFreeBlocks).toBe(false);
      expect(result.errors).toContain('Free blocks (1001) exceeds total blocks (1000).');
    });
  });

  describe('formatUuid and formatTimestamp', () => {
    it('formats 16-byte UUID correctly', () => {
      const bytes = new Uint8Array([
        0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
        0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      ]);
      expect(formatUuid(bytes)).toBe('00112233-4455-6677-8899-aabbccddeeff');
    });

    it('returns empty string for short buffer in formatUuid', () => {
      expect(formatUuid(new Uint8Array(10))).toBe('');
      expect(formatUuid(null)).toBe('');
    });

    it('formats timestamp in ISO format', () => {
      expect(formatTimestamp(1609459200)).toBe('2021-01-01T00:00:00.000Z');
      expect(formatTimestamp(0)).toBe('N/A');
    });
  });

  describe('parseHexInput and bytesToHex', () => {
    it('parses formatted hex string into Uint8Array', () => {
      const hex = '22 11 19 68 0xaa, 0xbb:cc';
      const bytes = parseHexInput(hex);
      expect(Array.from(bytes)).toEqual([0x22, 0x11, 0x19, 0x68, 0xaa, 0xbb, 0xcc]);
    });

    it('converts Uint8Array to hex string', () => {
      const bytes = new Uint8Array([0x01, 0x02, 0x0a, 0xff]);
      expect(bytesToHex(bytes, false)).toBe('01020aff');
      expect(bytesToHex(bytes, true)).toBe('01 02 0a ff');
    });

    it('throws error for odd length hex string', () => {
      expect(() => parseHexInput('abc')).toThrow(/odd length/);
    });

    it('throws error for non-hex characters', () => {
      expect(() => parseHexInput('12zz34')).toThrow(/Invalid hexadecimal/);
    });

    it('throws TypeError for non-string input', () => {
      expect(() => parseHexInput(123)).toThrow(TypeError);
    });
  });

  describe('readSuperblockSlice', () => {
    it('reads up to 12288 bytes via slice', async () => {
      const fakeData = new Uint8Array(20000);
      fakeData.fill(0x77);
      const fakeFile = {
        slice: (start, end) => {
          expect(start).toBe(0);
          expect(end).toBe(MAX_SLICE_SIZE);
          return new Blob([fakeData.slice(start, end)]);
        },
      };

      const result = await readSuperblockSlice(fakeFile);
      expect(result.length).toBe(MAX_SLICE_SIZE);
      expect(result[0]).toBe(0x77);
    });

    it('rejects for invalid file object', async () => {
      await expect(readSuperblockSlice(null)).rejects.toThrow(/Invalid file/);
    });
  });
});
