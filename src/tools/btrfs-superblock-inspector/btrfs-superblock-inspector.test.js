import { describe, expect, it } from 'vitest';
import {
  BTRFS_MAGIC,
  COMPAT_RO_FLAG_DEFINITIONS,
  INCOMPAT_FLAG_DEFINITIONS,
  SUPERBLOCK_OFFSET,
  SUPERBLOCK_SIZE,
  createSampleBtrfsSuperblock,
  decodeFlags,
  formatBytes,
  formatFileSize,
  formatUuid,
  parseBtrfsSuperblock,
  readSuperblockFromImage,
} from './btrfs-superblock-inspector.utils.js';

describe('createSampleBtrfsSuperblock', () => {
  it('creates a 4096-byte buffer with default valid Btrfs superblock fields', () => {
    const buffer = createSampleBtrfsSuperblock();
    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.byteLength).toBe(SUPERBLOCK_SIZE);

    const parsed = parseBtrfsSuperblock(buffer);
    expect(parsed.magic).toBe(BTRFS_MAGIC);
    expect(parsed.bytenr).toBe(0x10000n);
    expect(parsed.generation).toBe(1024n);
    expect(parsed.label).toBe('btrfs-data-volume');
  });

  it('allows overriding specific fields', () => {
    const buffer = createSampleBtrfsSuperblock({
      label: 'custom-pool',
      generation: 9999n,
      csumType: 1, // XXHASH64
      csum: [0xaa, 0xbb, 0xcc, 0xdd, 0x11, 0x22, 0x33, 0x44],
    });
    const parsed = parseBtrfsSuperblock(buffer);
    expect(parsed.label).toBe('custom-pool');
    expect(parsed.generation).toBe(9999n);
    expect(parsed.csumType.name).toBe('XXHASH64');
    expect(parsed.csumHex).toBe('aabbccdd11223344');
  });
});

describe('parseBtrfsSuperblock - valid superblocks', () => {
  it('parses all core fields from a valid Btrfs superblock', () => {
    const buffer = createSampleBtrfsSuperblock({
      fsid: [
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
      ],
      bytenr: 65536n,
      flags: 0n,
      generation: 42n,
      root: 0x104000n,
      chunkRoot: 0x108000n,
      logRoot: 0x10c000n,
      totalBytes: 10737418240n,
      bytesUsed: 1048576n,
      rootDirObjectId: 6n,
      numDevices: 1n,
      sectorsize: 4096,
      nodesize: 16384,
      stripesize: 4096,
      compatFlags: 0n,
      compatRoFlags: 1n, // FREE_SPACE_TREE
      incompatFlags: 0x300n, // SKINNY_METADATA | NO_HOLES
      csumType: 0,
      csum: [0x12, 0x34, 0x56, 0x78],
      label: 'production-system',
    });

    const result = parseBtrfsSuperblock(buffer);

    expect(result.magic).toBe('_BHRfS_M');
    expect(result.fsid).toBe('01020304-0506-0708-090a-0b0c0d0e0f10');
    expect(result.bytenr).toBe(65536n);
    expect(result.generation).toBe(42n);
    expect(result.root).toBe(0x104000n);
    expect(result.chunkRoot).toBe(0x108000n);
    expect(result.logRoot).toBe(0x10c000n);
    expect(result.totalBytes).toBe(10737418240n);
    expect(result.bytesUsed).toBe(1048576n);
    expect(result.rootDirObjectId).toBe(6n);
    expect(result.numDevices).toBe(1n);
    expect(result.sectorsize).toBe(4096);
    expect(result.nodesize).toBe(16384);
    expect(result.stripesize).toBe(4096);
    expect(result.csumType.name).toBe('CRC32c');
    expect(result.csumHex).toBe('12345678');
    expect(result.label).toBe('production-system');

    expect(result.decodedIncompatFlags.map((f) => f.name)).toEqual([
      'SKINNY_METADATA',
      'NO_HOLES',
    ]);
    expect(result.decodedCompatRoFlags.map((f) => f.name)).toEqual(['FREE_SPACE_TREE']);
  });

  it('supports extracting superblock from a larger buffer if slice starts before 0x10000', () => {
    const fullImage = new Uint8Array(SUPERBLOCK_OFFSET + SUPERBLOCK_SIZE);
    const sb = createSampleBtrfsSuperblock({ label: 'full-disk-image' });
    fullImage.set(sb, SUPERBLOCK_OFFSET);

    const parsed = parseBtrfsSuperblock(fullImage);
    expect(parsed.magic).toBe(BTRFS_MAGIC);
    expect(parsed.label).toBe('full-disk-image');
  });
});

describe('parseBtrfsSuperblock - error handling', () => {
  it('throws clear error when magic does not match', () => {
    const buffer = createSampleBtrfsSuperblock({ magic: '_INVALID' });
    expect(() => parseBtrfsSuperblock(buffer)).toThrow(
      /Invalid Btrfs superblock: magic '_BHRfS_M' not found/
    );
  });

  it('throws clear error when input buffer is truncated before magic offset', () => {
    const truncated = new Uint8Array(48);
    expect(() => parseBtrfsSuperblock(truncated)).toThrow(
      /Truncated superblock: received 48 bytes/
    );
  });

  it('throws clear error when input buffer is truncated after magic but before 4096 bytes', () => {
    const truncated = new Uint8Array(256);
    const valid = createSampleBtrfsSuperblock();
    truncated.set(valid.subarray(0, 256));

    expect(() => parseBtrfsSuperblock(truncated)).toThrow(
      /Truncated superblock: received 256 bytes, expected full 4096 bytes/
    );
  });
});

describe('parseBtrfsSuperblock - label decoding', () => {
  it('decodes an empty label correctly', () => {
    const buffer = createSampleBtrfsSuperblock({ label: '' });
    const parsed = parseBtrfsSuperblock(buffer);
    expect(parsed.label).toBe('');
  });

  it('decodes a UTF-8 multibyte label correctly', () => {
    const buffer = createSampleBtrfsSuperblock({ label: '저장소-볼륨-🚀' });
    const parsed = parseBtrfsSuperblock(buffer);
    expect(parsed.label).toBe('저장소-볼륨-🚀');
  });

  it('decodes a full 256-byte label without null terminator', () => {
    const buffer = createSampleBtrfsSuperblock();
    const fullLabelBytes = new Uint8Array(256).fill('A'.charCodeAt(0));
    buffer.set(fullLabelBytes, 0x12b);

    const parsed = parseBtrfsSuperblock(buffer);
    expect(parsed.label).toBe('A'.repeat(256));
  });
});

describe('decodeFlags', () => {
  it('decodes multiple incompat flags properly', () => {
    // SKINNY_METADATA (1<<8), NO_HOLES (1<<9), COMPRESS_ZSTD (1<<4)
    const flags = (1n << 8n) | (1n << 9n) | (1n << 4n);
    const decoded = decodeFlags(flags, INCOMPAT_FLAG_DEFINITIONS);

    expect(decoded.map((d) => d.name)).toEqual([
      'COMPRESS_ZSTD',
      'SKINNY_METADATA',
      'NO_HOLES',
    ]);
  });

  it('returns empty array when flags value is 0n', () => {
    const decoded = decodeFlags(0n, INCOMPAT_FLAG_DEFINITIONS);
    expect(decoded).toEqual([]);
  });

  it('handles unknown/unrecognized flag bits gracefully', () => {
    const flags = (1n << 0n) | (1n << 50n); // MIXED_BACKREF + bit 50 unknown
    const decoded = decodeFlags(flags, INCOMPAT_FLAG_DEFINITIONS);

    expect(decoded[0].name).toBe('MIXED_BACKREF');
    expect(decoded[1].name).toMatch(/^UNKNOWN_0x/);
    expect(decoded[1].bit).toBe(-1);
  });

  it('decodes compat_ro flags properly', () => {
    // FREE_SPACE_TREE (1<<0) | FREE_SPACE_TREE_VALID (1<<1) | BLOCK_GROUP_TREE (1<<3)
    const flags = (1n << 0n) | (1n << 1n) | (1n << 3n);
    const decoded = decodeFlags(flags, COMPAT_RO_FLAG_DEFINITIONS);

    expect(decoded.map((d) => d.name)).toEqual([
      'FREE_SPACE_TREE',
      'FREE_SPACE_TREE_VALID',
      'BLOCK_GROUP_TREE',
    ]);
  });
});

describe('readSuperblockFromImage', () => {
  it('reads only the 4 KiB slice at offset 0x10000 and reports actual file size', async () => {
    const totalImageSize = 1048576; // 1 MiB image
    const imageBytes = new Uint8Array(totalImageSize);
    const validSb = createSampleBtrfsSuperblock({ label: 'disk-test' });
    imageBytes.set(validSb, SUPERBLOCK_OFFSET);

    const file = new File([imageBytes], 'test-disk.raw', { type: 'application/octet-stream' });
    const result = await readSuperblockFromImage(file);

    expect(result.magic).toBe(BTRFS_MAGIC);
    expect(result.label).toBe('disk-test');
    expect(result.fileInfo).toEqual({
      name: 'test-disk.raw',
      size: 1048576,
      sliceOffset: 65536,
      sliceSize: 4096,
    });
  });

  it('throws clear error when image file is smaller than required superblock offset', async () => {
    const smallFile = new File([new Uint8Array(1024)], 'truncated.img');
    await expect(readSuperblockFromImage(smallFile)).rejects.toThrow(
      /Truncated image: file size/
    );
  });

  it('throws TypeError when file parameter is invalid', async () => {
    await expect(readSuperblockFromImage(null)).rejects.toThrow(TypeError);
    await expect(readSuperblockFromImage({})).rejects.toThrow(TypeError);
  });
});

describe('formatBytes & formatFileSize', () => {
  it('formats small byte amounts', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes and megabytes', () => {
    expect(formatBytes(2048)).toBe('2.00 KB (2,048 bytes)');
    expect(formatFileSize(2048)).toBe('2.0 KB');

    expect(formatBytes(10485760)).toBe('10.00 MB (10,485,760 bytes)');
    expect(formatFileSize(10485760)).toBe('10.0 MB');
  });

  it('formats gigabytes and handles BigInt inputs', () => {
    expect(formatBytes(10737418240n)).toBe('10.00 GB (10,737,418,240 bytes)');
    expect(formatFileSize(10737418240n)).toBe('10.0 GB');
  });
});

describe('formatUuid', () => {
  it('formats 16 bytes into canonical UUID format', () => {
    const bytes = new Uint8Array([
      0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
      0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
    ]);
    expect(formatUuid(bytes)).toBe('12345678-9abc-def0-fedc-ba9876543210');
  });
});
