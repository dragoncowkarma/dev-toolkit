import { describe, expect, it, vi } from 'vitest';
import {
  EROFS_MAGIC,
  EROFS_MIN_IMAGE_SIZE,
  createSampleImage,
  createSampleSuperblock,
  decodeCompressionAlgorithms,
  decodeFeatureCompat,
  decodeFeatureIncompat,
  formatBuildTime,
  formatFileSize,
  formatUuid,
  parseErofsSuperblock,
  parseVolumeName,
  readErofsSuperblockSlice,
} from './erofs-superblock-inspector.utils.js';

describe('parseErofsSuperblock - valid superblock', () => {
  it('parses all required superblock fields correctly', () => {
    const raw = createSampleSuperblock({
      magic: EROFS_MAGIC,
      checksum: 0x12345678,
      feature_compat: 0x00000001,
      blkszbits: 12,
      sb_extslots: 0,
      root_nid: 42,
      inos: 987654321n,
      build_time: 1700000000n,
      build_time_nsec: 500000000,
      blocks: 131072,
      meta_blkaddr: 10,
      xattr_blkaddr: 20,
      uuid: [
        0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
        0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      ],
      volume_name: 'test_volume',
      feature_incompat: 0x00000007, // ZERO_PADDING | COMPR_CFGS | CHUNKED_FILE
      available_compr_algs: 0x0009, // LZ4 | ZSTD
    });

    const parsed = parseErofsSuperblock(raw);

    expect(parsed.magic).toBe('0xE0F5E1E2');
    expect(parsed.magicRaw).toBe(0xE0F5E1E2);
    expect(parsed.checksum).toBe('0x12345678');
    expect(parsed.feature_compat).toBe(0x00000001);
    expect(parsed.featureCompatDecoded).toEqual(['SB_CHKSUM']);
    expect(parsed.blkszbits).toBe(12);
    expect(parsed.blockSize).toBe(4096);
    expect(parsed.sb_extslots).toBe(0);
    expect(parsed.root_nid).toBe(42);
    expect(parsed.inos).toBe(987654321n);
    expect(parsed.inosFormatted).toBe('987654321');
    expect(parsed.build_time).toBe(1700000000n);
    expect(parsed.build_time_nsec).toBe(500000000);
    expect(parsed.blocks).toBe(131072);
    expect(parsed.meta_blkaddr).toBe(10);
    expect(parsed.xattr_blkaddr).toBe(20);
    expect(parsed.uuid).toBe('00112233-4455-6677-8899-aabbccddeeff');
    expect(parsed.volume_name).toBe('test_volume');
    expect(parsed.feature_incompat).toBe(0x00000007);
    expect(parsed.featureIncompatDecoded).toEqual(['ZERO_PADDING', 'COMPR_CFGS', 'CHUNKED_FILE']);
    expect(parsed.availableComprAlgsDecoded).toEqual(['LZ4', 'ZSTD']);
  });

  it('preserves full 64-bit precision for inos and build_time', () => {
    // 2^64 - 1
    const maxUint64 = 18446744073709551615n;
    const largeTime = 0x7FFFFFFFFFFFFFFFn;

    const raw = createSampleSuperblock({
      inos: maxUint64,
      build_time: largeTime,
    });

    const parsed = parseErofsSuperblock(raw);

    expect(parsed.inos).toBe(maxUint64);
    expect(parsed.inosFormatted).toBe('18446744073709551615');
    expect(parsed.build_time).toBe(largeTime);
  });

  it('supports ArrayBuffer input directly', () => {
    const raw = createSampleSuperblock();
    const parsed = parseErofsSuperblock(raw.buffer);
    expect(parsed.magic).toBe('0xE0F5E1E2');
  });

  it('supports offset parameter for reading embedded superblock', () => {
    const fullImage = createSampleImage({ volume_name: 'offset_test' });
    const parsed = parseErofsSuperblock(fullImage, { offset: 1024 });
    expect(parsed.magic).toBe('0xE0F5E1E2');
    expect(parsed.volume_name).toBe('offset_test');
  });
});

describe('parseErofsSuperblock - error handling', () => {
  it('throws descriptive error on invalid magic number', () => {
    const raw = createSampleSuperblock({ magic: 0x12345678 });
    expect(() => parseErofsSuperblock(raw)).toThrow(
      'Invalid EROFS magic: 0x12345678 (expected 0xE0F5E1E2).'
    );
  });

  it('throws error when input is truncated (less than 128 bytes)', () => {
    const shortBuffer = new Uint8Array(64);
    expect(() => parseErofsSuperblock(shortBuffer)).toThrow(
      'Truncated EROFS superblock: expected at least 128 bytes, got 64 byte(s).'
    );
  });

  it('throws TypeError when input is not an ArrayBuffer or TypedArray', () => {
    expect(() => parseErofsSuperblock('not-a-buffer')).toThrow(TypeError);
    expect(() => parseErofsSuperblock(null)).toThrow(TypeError);
  });
});

describe('feature flag decoding', () => {
  it('decodes known feature_incompat flags individually and combined', () => {
    expect(decodeFeatureIncompat(0)).toEqual([]);
    expect(decodeFeatureIncompat(0x0001)).toEqual(['ZERO_PADDING']);
    expect(decodeFeatureIncompat(0x0002)).toEqual(['COMPR_CFGS']);
    expect(decodeFeatureIncompat(0x0004)).toEqual(['CHUNKED_FILE']);
    expect(decodeFeatureIncompat(0x0008)).toEqual(['DEVICE_TABLE']);
    expect(decodeFeatureIncompat(0x0010)).toEqual(['ZTAILPACKING']);
    expect(decodeFeatureIncompat(0x0020)).toEqual(['FRAGMENTS']);
    expect(decodeFeatureIncompat(0x0040)).toEqual(['XATTR_PREFIXES']);
    expect(decodeFeatureIncompat(0x0080)).toEqual(['48BIT']);
    expect(decodeFeatureIncompat(0x0100)).toEqual(['METABOX']);

    // Multiple flags combined
    const combined = 0x0001 | 0x0002 | 0x0010 | 0x0100;
    expect(decodeFeatureIncompat(combined)).toEqual([
      'ZERO_PADDING',
      'COMPR_CFGS',
      'ZTAILPACKING',
      'METABOX',
    ]);
  });

  it('identifies unknown incompatible feature bits gracefully', () => {
    const unknownBits = 0x0800; // Bit 11 is undefined
    expect(decodeFeatureIncompat(unknownBits)).toEqual(['UNKNOWN_0x800']);

    const mixed = 0x0001 | 0x0800;
    expect(decodeFeatureIncompat(mixed)).toEqual(['ZERO_PADDING', 'UNKNOWN_0x800']);
  });

  it('decodes feature_compat flags correctly', () => {
    expect(decodeFeatureCompat(0)).toEqual([]);
    expect(decodeFeatureCompat(0x0001)).toEqual(['SB_CHKSUM']);
    expect(decodeFeatureCompat(0x0002)).toEqual(['MTIME']);
    expect(decodeFeatureCompat(0x0004)).toEqual(['XATTR_FILTER']);
    expect(decodeFeatureCompat(0x0008)).toEqual(['SHARED_EA_IN_METABOX']);
    expect(decodeFeatureCompat(0x0010)).toEqual(['PLAIN_XATTR_PFX']);

    const combined = 0x0001 | 0x0002;
    expect(decodeFeatureCompat(combined)).toEqual(['SB_CHKSUM', 'MTIME']);
  });

  it('decodes compression algorithms correctly', () => {
    expect(decodeCompressionAlgorithms(0)).toEqual([]);
    expect(decodeCompressionAlgorithms(0x0001)).toEqual(['LZ4']);
    expect(decodeCompressionAlgorithms(0x0002)).toEqual(['LZMA']);
    expect(decodeCompressionAlgorithms(0x0004)).toEqual(['DEFLATE']);
    expect(decodeCompressionAlgorithms(0x0008)).toEqual(['ZSTD']);
  });
});

describe('volume name decoding', () => {
  it('parses null-terminated volume name', () => {
    const bytes = new Uint8Array(16);
    const text = new TextEncoder().encode('my_root_fs');
    bytes.set(text);
    expect(parseVolumeName(bytes)).toBe('my_root_fs');
  });

  it('parses 16-byte volume name without null terminator', () => {
    const bytes = new TextEncoder().encode('1234567890123456');
    expect(parseVolumeName(bytes)).toBe('1234567890123456');
  });

  it('returns empty string for all-zero bytes or empty input', () => {
    expect(parseVolumeName(new Uint8Array(16))).toBe('');
    expect(parseVolumeName(new Uint8Array(0))).toBe('');
    expect(parseVolumeName(null)).toBe('');
  });
});

describe('formatUuid', () => {
  it('formats 16-byte array to canonical UUID string', () => {
    const bytes = new Uint8Array([
      0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x07, 0x18,
      0x29, 0x3a, 0x4b, 0x5c, 0x6d, 0x7e, 0x8f, 0x90,
    ]);
    expect(formatUuid(bytes)).toBe('a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90');
  });

  it('returns empty string for short or invalid input', () => {
    expect(formatUuid(new Uint8Array(10))).toBe('');
    expect(formatUuid(null)).toBe('');
  });
});

describe('formatBuildTime', () => {
  it('formats unix timestamp into ISO string', () => {
    // 2023-11-15T00:00:00.000Z = 1700006400
    const str = formatBuildTime(1700006400n, 0);
    expect(str).toBe('2023-11-15T00:00:00.000Z');
  });

  it('handles zero timestamp', () => {
    expect(formatBuildTime(0n, 0)).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('formatFileSize', () => {
  it('formats byte sizes accurately', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
    expect(formatFileSize(2048n)).toBe('2.0 KB');
  });

  it('handles negative or invalid values', () => {
    expect(formatFileSize(-1)).toBe('0 B');
    expect(formatFileSize(NaN)).toBe('0 B');
  });
});

describe('readErofsSuperblockSlice', () => {
  it('reads exactly 128 bytes from offset 0x400 of the file', async () => {
    const fullImage = createSampleImage({ volume_name: 'slice_test' });
    const file = new File([fullImage], 'image.erofs', { type: 'application/octet-stream' });

    const sliceBytes = await readErofsSuperblockSlice(file);
    expect(sliceBytes).toBeInstanceOf(Uint8Array);
    expect(sliceBytes.byteLength).toBe(128);

    const parsed = parseErofsSuperblock(sliceBytes);
    expect(parsed.magic).toBe('0xE0F5E1E2');
    expect(parsed.volume_name).toBe('slice_test');
  });

  it('rejects with truncated error when file size is less than 1152 bytes', async () => {
    const shortFile = new File([new Uint8Array(500)], 'short.img');
    await expect(readErofsSuperblockSlice(shortFile)).rejects.toThrow(
      `Truncated EROFS image: file size (500 bytes) is smaller ` +
      `than the minimum ${EROFS_MIN_IMAGE_SIZE} bytes required for superblock at 0x400.`
    );
  });

  it('rejects on invalid file object', async () => {
    await expect(readErofsSuperblockSlice(null)).rejects.toThrow(TypeError);
    await expect(readErofsSuperblockSlice({})).rejects.toThrow(TypeError);
  });

  it('rejects when FileReader encounters an error', async () => {
    const failingReader = {
      readAsArrayBuffer: vi.fn(function readAsArrayBuffer() {
        this.onerror(new Error('simulated disk error'));
      }),
    };
    const OriginalFileReader = global.FileReader;
    global.FileReader = vi.fn(function MockFileReader() {
      return failingReader;
    });

    const file = new File([new Uint8Array(2048)], 'test.img');
    await expect(readErofsSuperblockSlice(file)).rejects.toThrow(
      'Failed to read the selected file.'
    );

    global.FileReader = OriginalFileReader;
  });
});

describe('48-bit layout decoding', () => {
  it('decodes 48-bit layout with blocks_hi, blocks_lo, and 64-bit root NID', () => {
    // Reviewer example: high bits 2, low bits 3, root NID 999
    // blocks = (2 << 32) + 3 = 8,589,934,595
    const raw = createSampleSuperblock({
      feature_incompat: 0x00000080, // 48BIT
      blocks_hi: 2,
      blocks_lo: 3,
      rootnid_8b: 999n,
    });

    const parsed = parseErofsSuperblock(raw);

    expect(parsed.is_48bit).toBe(true);
    expect(parsed.blocks_hi).toBe(2);
    expect(parsed.blocks_lo).toBe(3);
    expect(parsed.blocks).toBe(8589934595n);
    expect(parsed.root_nid).toBe(999n);
    expect(parsed.totalFsBytes).toBe(8589934595n * 4096n);
    expect(parsed.totalFsSizeFormatted).toBe('32.0 TB');
  });

  it('supports large 64-bit root NID in 48-bit layout without precision loss', () => {
    const largeNid = 0x123456789ABCDEFn;
    const raw = createSampleSuperblock({
      feature_incompat: 0x00000080, // 48BIT
      blocks_hi: 10,
      blocks_lo: 20,
      rootnid_8b: largeNid,
    });

    const parsed = parseErofsSuperblock(raw);

    expect(parsed.root_nid).toBe(largeNid);
    expect(parsed.blocks).toBe((10n << 32n) | 20n);
  });

  it('falls back to 16-bit root_nid and 32-bit blocks when rootnid_8b is 0 with 48BIT', () => {
    const raw = createSampleSuperblock({
      feature_incompat: 0x00000080, // 48BIT
      root_nid: 45,
      blocks: 2048,
      rootnid_8b: 0n,
    });

    const parsed = parseErofsSuperblock(raw);

    expect(parsed.is_48bit).toBe(false);
    expect(parsed.root_nid).toBe(45);
    expect(parsed.blocks).toBe(2048);
  });
});

describe('build-time offset and signed epoch calculation', () => {
  it('computes total build time by adding signed epoch and 32-bit build-time offset', () => {
    // Reviewer example: epoch 100, offset 60 => 160 seconds
    const raw = createSampleSuperblock({
      epoch: 100n,
      build_time_offset: 60,
      build_time_nsec: 0,
    });

    const parsed = parseErofsSuperblock(raw);

    expect(parsed.epoch).toBe(100n);
    expect(parsed.build_time_offset).toBe(60);
    expect(parsed.build_time).toBe(160n);
    expect(parsed.buildTimeFormatted).toBe(new Date(160 * 1000).toISOString());
  });

  it('handles legacy zero-offset images correctly', () => {
    const raw = createSampleSuperblock({
      epoch: 1700000000n,
      build_time_offset: 0,
    });

    const parsed = parseErofsSuperblock(raw);

    expect(parsed.epoch).toBe(1700000000n);
    expect(parsed.build_time_offset).toBe(0);
    expect(parsed.build_time).toBe(1700000000n);
  });

  it('handles signed negative epoch timestamps before Unix epoch', () => {
    const raw = createSampleSuperblock({
      epoch: -100n,
      build_time_offset: 60,
      build_time_nsec: 0,
    });

    const parsed = parseErofsSuperblock(raw);

    expect(parsed.epoch).toBe(-100n);
    expect(parsed.build_time_offset).toBe(60);
    expect(parsed.build_time).toBe(-40n);
    expect(parsed.buildTimeFormatted).toBe(new Date(-40 * 1000).toISOString());
  });
});

describe('compression field union (COMPR_CFGS vs LZ4 max distance)', () => {
  it('decodes compression algorithm bitmap when COMPR_CFGS feature is enabled', () => {
    const raw = createSampleSuperblock({
      feature_incompat: 0x00000002, // COMPR_CFGS
      available_compr_algs: 0x0008, // ZSTD
    });

    const parsed = parseErofsSuperblock(raw);

    expect(parsed.has_compr_cfgs).toBe(true);
    expect(parsed.available_compr_algs).toBe(0x0008);
    expect(parsed.availableComprAlgsDecoded).toEqual(['ZSTD']);
    expect(parsed.lz4_max_distance).toBeNull();
  });

  it('decodes lz4_max_distance instead of algorithm bitmap when COMPR_CFGS is absent', () => {
    // Distance 8 should NOT be decoded as ZSTD!
    const raw = createSampleSuperblock({
      feature_incompat: 0x00000001, // ZERO_PADDING only (no COMPR_CFGS)
      lz4_max_distance: 8,
    });

    const parsed = parseErofsSuperblock(raw);

    expect(parsed.has_compr_cfgs).toBe(false);
    expect(parsed.lz4_max_distance).toBe(8);
    expect(parsed.availableComprAlgsDecoded).toEqual(['LZ4']);
    expect(parsed.availableComprAlgsDecoded).not.toContain('ZSTD');
  });
});
