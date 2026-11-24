import { describe, expect, it } from 'vitest';
import {
  createSampleMinixSuperblock,
  formatFileSize,
  formatStateFlags,
  MINIX_MAGIC,
  MINIX_STATE_FLAGS,
  parseMinixSuperblock,
} from './minix-superblock-inspector.utils.js';

describe('formatFileSize', () => {
  it('formats various byte sizes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
    expect(formatFileSize(-5)).toBe('0 B');
  });
});

describe('formatStateFlags', () => {
  it('formats null/undefined state for Minix v3', () => {
    const formatted = formatStateFlags(null);
    expect(formatted.rawHex).toBe('N/A');
    expect(formatted.summary).toContain('v3');
  });

  it('formats valid/clean flag (0x0001)', () => {
    const formatted = formatStateFlags(MINIX_STATE_FLAGS.VALID_FS);
    expect(formatted.rawHex).toBe('0x0001');
    expect(formatted.summary).toBe('Clean/Valid (0x0001)');
    expect(formatted.unknownBits).toBe(0);
  });

  it('formats error flag (0x0002)', () => {
    const formatted = formatStateFlags(MINIX_STATE_FLAGS.ERROR_FS);
    expect(formatted.rawHex).toBe('0x0002');
    expect(formatted.summary).toBe('Errors (0x0002)');
    expect(formatted.unknownBits).toBe(0);
  });

  it('formats high-bit unsigned flags as unsigned values', () => {
    // 0x8001: high bit 15 set + valid flag
    const highBit = formatStateFlags(0x8001);
    expect(highBit.rawHex).toBe('0x8001');
    expect(highBit.summary).toContain('Clean/Valid (0x0001)');
    expect(highBit.summary).toContain('Unknown bits: 0x8000');
    expect(highBit.unknownBits).toBe(32768);

    // 0xFFFF: all bits set
    const allBits = formatStateFlags(0xFFFF);
    expect(allBits.rawHex).toBe('0xFFFF');
    expect(allBits.summary).toContain('Clean/Valid (0x0001)');
    expect(allBits.summary).toContain('Errors (0x0002)');
    expect(allBits.summary).toContain('Unknown bits: 0xFFFC');
    expect(allBits.unknownBits).toBe(65532);
  });
});

describe('parseMinixSuperblock', () => {
  it('correctly parses Minix v1 (0x137F, 14-byte names)', () => {
    const buffer = createSampleMinixSuperblock(MINIX_MAGIC.V1_14, {
      inodeCount: 512,
      zoneCount: 1440,
      imapBlocks: 1,
      zmapBlocks: 1,
      firstDataZone: 18,
      logZoneSize: 0,
      maxFileSize: 268966912,
      state: 0x0001,
    });
    const parsed = parseMinixSuperblock(buffer);
    expect(parsed.variant).toBe('Minix v1 (14-byte names)');
    expect(parsed.version).toBe(1);
    expect(parsed.magic).toBe(0x137F);
    expect(parsed.magicHex).toBe('0x137F');
    expect(parsed.inodeCount).toBe(512);
    expect(parsed.zoneCount).toBe(1440);
    expect(parsed.imapBlocks).toBe(1);
    expect(parsed.zmapBlocks).toBe(1);
    expect(parsed.firstDataZone).toBe(18);
    expect(parsed.logZoneSize).toBe(0);
    expect(parsed.maxFileSize).toBe(268966912);
    expect(parsed.state).toBe(1);
    expect(parsed.stateHex).toBe('0x0001');
    expect(parsed.stateDescription).toContain('Clean/Valid');
    expect(parsed.v3BlockSize).toBeNull();
  });

  it('correctly parses Minix v1 (0x138F, 30-byte names)', () => {
    const buffer = createSampleMinixSuperblock(MINIX_MAGIC.V1_30, {
      inodeCount: 640,
      zoneCount: 2880,
    });
    const parsed = parseMinixSuperblock(buffer);
    expect(parsed.variant).toBe('Minix v1 (30-byte names)');
    expect(parsed.version).toBe(1);
    expect(parsed.magic).toBe(0x138F);
    expect(parsed.magicHex).toBe('0x138F');
    expect(parsed.inodeCount).toBe(640);
    expect(parsed.zoneCount).toBe(2880);
  });

  it('correctly parses Minix v2 (0x2468, 14-byte names)', () => {
    const buffer = createSampleMinixSuperblock(MINIX_MAGIC.V2_14, {
      inodeCount: 1024,
      zoneCount: 50000,
      imapBlocks: 2,
      zmapBlocks: 2,
      firstDataZone: 34,
      logZoneSize: 1,
      maxFileSize: 1073741824,
      state: 0x0002,
    });
    const parsed = parseMinixSuperblock(buffer);
    expect(parsed.variant).toBe('Minix v2 (14-byte names)');
    expect(parsed.version).toBe(2);
    expect(parsed.magic).toBe(0x2468);
    expect(parsed.magicHex).toBe('0x2468');
    expect(parsed.inodeCount).toBe(1024);
    expect(parsed.zoneCount).toBe(50000);
    expect(parsed.logZoneSize).toBe(1);
    expect(parsed.maxFileSize).toBe(1073741824);
    expect(parsed.stateHex).toBe('0x0002');
    expect(parsed.stateDescription).toContain('Errors');
  });

  it('correctly parses Minix v2 (0x2478, 30-byte names)', () => {
    const buffer = createSampleMinixSuperblock(MINIX_MAGIC.V2_30, {
      inodeCount: 2048,
      zoneCount: 60000,
    });
    const parsed = parseMinixSuperblock(buffer);
    expect(parsed.variant).toBe('Minix v2 (30-byte names)');
    expect(parsed.version).toBe(2);
    expect(parsed.magic).toBe(0x2478);
    expect(parsed.magicHex).toBe('0x2478');
    expect(parsed.inodeCount).toBe(2048);
    expect(parsed.zoneCount).toBe(60000);
  });

  it('correctly parses Minix v3 (0x4D5A)', () => {
    const buffer = createSampleMinixSuperblock(MINIX_MAGIC.V3, {
      inodeCount: 8192,
      zoneCount: 131072,
      imapBlocks: 4,
      zmapBlocks: 8,
      firstDataZone: 256,
      logZoneSize: 2,
      maxFileSize: 2147483647,
      blockSize: 2048,
      diskVersion: 1,
    });
    const parsed = parseMinixSuperblock(buffer);
    expect(parsed.variant).toBe('Minix v3');
    expect(parsed.version).toBe(3);
    expect(parsed.magic).toBe(0x4D5A);
    expect(parsed.magicHex).toBe('0x4D5A');
    expect(parsed.inodeCount).toBe(8192);
    expect(parsed.zoneCount).toBe(131072);
    expect(parsed.imapBlocks).toBe(4);
    expect(parsed.zmapBlocks).toBe(8);
    expect(parsed.firstDataZone).toBe(256);
    expect(parsed.logZoneSize).toBe(2);
    expect(parsed.maxFileSize).toBe(2147483647);
    expect(parsed.v3BlockSize).toBe(2048);
    expect(parsed.blockSize).toBe(2048);
    expect(parsed.diskVersion).toBe(1);
    expect(parsed.state).toBeNull();
  });

  it('reports error on empty input (0 bytes)', () => {
    expect(() => parseMinixSuperblock(new Uint8Array(0))).toThrow(/empty/i);
    expect(() => parseMinixSuperblock(null)).toThrow(/empty/i);
  });

  it('reports error on truncated input (< 1056 bytes)', () => {
    expect(() => parseMinixSuperblock(new Uint8Array(1000))).toThrow(/truncated/i);
    expect(() => parseMinixSuperblock(new Uint8Array(1055))).toThrow(/truncated/i);
  });

  it('reports error on unknown magic without returning partial results', () => {
    const buffer = new Uint8Array(1056);
    const view = new DataView(buffer.buffer);
    // Put random unknown magic at offset 1024 + 16
    view.setUint16(1024 + 16, 0x9999, true);
    expect(() => parseMinixSuperblock(buffer)).toThrow(/Unknown magic: 0x9999/);
  });

  it('formats high-bit unsigned flags properly', () => {
    const buffer = createSampleMinixSuperblock(MINIX_MAGIC.V1_14, {
      state: 0x8001,
    });
    const parsed = parseMinixSuperblock(buffer);
    expect(parsed.state).toBe(0x8001);
    expect(parsed.stateHex).toBe('0x8001');
    expect(parsed.stateDescription).toContain('Unknown bits: 0x8000');
  });

  describe('regression tests: magic collision resolution and v2 zone count', () => {
    it('resolves magic collision to v3 when v3 s_max_size matches v1 magic (0x137F)', () => {
      // Offset 24 has 0x4D5A (v3), while low 16 bits of s_max_size at offset 16
      // have 0x137F (v1 magic)
      const buffer = createSampleMinixSuperblock(MINIX_MAGIC.V3, {
        inodeCount: 4096,
        zoneCount: 65536,
        maxFileSize: 0x137F,
        blockSize: 1024,
      });

      // Verify that offset 16 holds 0x137F and offset 24 holds 0x4D5A
      const view = new DataView(buffer.buffer);
      expect(view.getUint16(1024 + 16, true)).toBe(MINIX_MAGIC.V1_14);
      expect(view.getUint16(1024 + 24, true)).toBe(MINIX_MAGIC.V3);

      const parsed = parseMinixSuperblock(buffer);
      expect(parsed.version).toBe(3);
      expect(parsed.variant).toBe('Minix v3');
      expect(parsed.magic).toBe(MINIX_MAGIC.V3);
      expect(parsed.magicHex).toBe('0x4D5A');
      expect(parsed.inodeCount).toBe(4096);
      expect(parsed.zoneCount).toBe(65536);
      expect(parsed.maxFileSize).toBe(0x137F);
      expect(parsed.blockSize).toBe(1024);
    });

    it('resolves magic collision to v1 when v1 buffer has v3 magic bytes at offset 24', () => {
      // Offset 16 has 0x137F (v1 magic), while offset 24 has 0x4D5A (v3 magic)
      const buffer = createSampleMinixSuperblock(MINIX_MAGIC.V1_14, {
        inodeCount: 512,
        zoneCount: 1440,
        magic24: MINIX_MAGIC.V3,
      });

      const view = new DataView(buffer.buffer);
      expect(view.getUint16(1024 + 16, true)).toBe(MINIX_MAGIC.V1_14);
      expect(view.getUint16(1024 + 24, true)).toBe(MINIX_MAGIC.V3);

      const parsed = parseMinixSuperblock(buffer);
      expect(parsed.version).toBe(1);
      expect(parsed.variant).toBe('Minix v1 (14-byte names)');
      expect(parsed.magic).toBe(MINIX_MAGIC.V1_14);
      expect(parsed.magicHex).toBe('0x137F');
      expect(parsed.inodeCount).toBe(512);
      expect(parsed.zoneCount).toBe(1440);
    });

    it('reports error on ambiguous superblock matching both v1 and v3 magics', () => {
      // Create a buffer with both magic bytes set, but zeroes elsewhere so neither layout is valid
      const buffer = new Uint8Array(1056);
      const view = new DataView(buffer.buffer);
      view.setUint16(1024 + 16, MINIX_MAGIC.V1_14, true);
      view.setUint16(1024 + 24, MINIX_MAGIC.V3, true);

      expect(() => parseMinixSuperblock(buffer)).toThrow(/Ambiguous superblock format/i);
    });

    it('resolves magic collision to v1 when logZoneSize > 0 and firstDataZone < bitmap blocks in numeric value', () => {
      // 1024 inodes, 1 imap block, 10 zmap blocks, firstDataZone=4, logZoneSize=4
      // Metadata in blocks: 2 + 1 + 10 + ceil(1024/32) = 13 + 32 = 45 blocks.
      // firstDataBlock = 4 * (2^4) = 64 blocks >= 45.
      // But firstDataZone (4) < 2 + 1 + 10 = 13.
      // Buffer also has 0x4D5A at offset 24 (v3 magic), but v3 layout fails (e.g. invalid blockSize or pads).
      const buffer = createSampleMinixSuperblock(MINIX_MAGIC.V1_14, {
        inodeCount: 1024,
        imapBlocks: 1,
        zmapBlocks: 10,
        firstDataZone: 4,
        logZoneSize: 4,
        magic24: MINIX_MAGIC.V3,
      });

      const parsed = parseMinixSuperblock(buffer);
      expect(parsed.version).toBe(1);
      expect(parsed.variant).toBe('Minix v1 (14-byte names)');
      expect(parsed.firstDataZone).toBe(4);
      expect(parsed.logZoneSize).toBe(4);
    });

    it('resolves magic collision to v3 when logZoneSize > 0 and firstDataZone < bitmap blocks in numeric value', () => {
      // v3 layout with 2048 inodes, 1 imap block, 10 zmap blocks, firstDataZone=8, logZoneSize=3 (blockSize=1024)
      // Inodes per block: 1024 / 64 = 16. Inode blocks: 2048 / 16 = 128.
      // Metadata in blocks: 2 + 1 + 10 + 128 = 141 blocks.
      // firstDataBlock = 8 * (2^3) = 64 blocks, so with logZoneSize=5:
      // firstDataBlock = 8 * (2^5) = 256 blocks >= 141.
      // But firstDataZone (8) < 2 + 1 + 10 = 13.
      // Buffer also has 0x137F at offset 16 (v1 magic in maxFileSize low word).
      const buffer = createSampleMinixSuperblock(MINIX_MAGIC.V3, {
        inodeCount: 2048,
        imapBlocks: 1,
        zmapBlocks: 10,
        firstDataZone: 8,
        logZoneSize: 5,
        blockSize: 1024,
        maxFileSize: MINIX_MAGIC.V1_14,
      });

      const parsed = parseMinixSuperblock(buffer);
      expect(parsed.version).toBe(3);
      expect(parsed.variant).toBe('Minix v3');
      expect(parsed.firstDataZone).toBe(8);
      expect(parsed.logZoneSize).toBe(5);
    });

    it('preserves 32-bit v2 s_zones count when zero and differing from legacy s_nzones', () => {
      const buffer = createSampleMinixSuperblock(MINIX_MAGIC.V2_14, {
        inodeCount: 1024,
        zoneCount: 0,
        nzones: 42,
      });

      const view = new DataView(buffer.buffer);
      // Legacy 16-bit nzones at offset 2 is 42
      expect(view.getUint16(1024 + 2, true)).toBe(42);
      // 32-bit zones at offset 20 is 0
      expect(view.getUint32(1024 + 20, true)).toBe(0);

      const parsed = parseMinixSuperblock(buffer);
      expect(parsed.version).toBe(2);
      expect(parsed.magic).toBe(MINIX_MAGIC.V2_14);
      // Must report the 32-bit s_zones value (0), not substitute legacy s_nzones (42)
      expect(parsed.zoneCount).toBe(0);
    });
  });
});
