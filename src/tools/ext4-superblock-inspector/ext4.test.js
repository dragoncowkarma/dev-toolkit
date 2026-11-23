import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  combineExt4Timestamp,
  createSampleSuperblock,
  decodeFeatureFlags,
  decodeNullTerminatedString,
  decodeStateFlags,
  FEATURE_COMPAT,
  formatHexDump,
  formatUuid,
  hexToBytes,
  parseExt4Superblock,
  STATE_FLAGS,
} from './ext4.utils.js';

describe('ext4.utils - helper functions', () => {
  it('converts hex string to Uint8Array and back', () => {
    const hex = '53ef01020304';
    const bytes = hexToBytes(hex);
    expect(bytes).toEqual(new Uint8Array([0x53, 0xef, 0x01, 0x02, 0x03, 0x04]));
    expect(bytesToHex(bytes)).toBe(hex);
  });

  it('handles hex strings with 0x prefixes and spacing', () => {
    const bytes = hexToBytes('0x53 0xEF : 0x01, 0x02\n0x03 0x04');
    expect(bytes).toEqual(new Uint8Array([0x53, 0xef, 0x01, 0x02, 0x03, 0x04]));
  });

  it('throws on invalid hex string length or type', () => {
    expect(() => hexToBytes(123)).toThrow(TypeError);
    expect(() => hexToBytes('abc')).toThrow(/even number/);
  });

  it('formats UUID in standard 8-4-4-4-12 pattern', () => {
    const raw = new Uint8Array([
      0xc1, 0xb9, 0xd5, 0xa4, 0xf1, 0x7d, 0x47, 0xdf, 0x93, 0x46, 0xbf, 0xac, 0x80, 0xf4, 0x3b,
      0x82,
    ]);
    expect(formatUuid(raw)).toBe('c1b9d5a4-f17d-47df-9346-bfac80f43b82');
    expect(formatUuid(new Uint8Array(8))).toBe('');
  });

  it('decodes null-terminated strings correctly', () => {
    const bytes = new Uint8Array([0x68, 0x6f, 0x6d, 0x65, 0x00, 0x78, 0x79]);
    expect(decodeNullTerminatedString(bytes)).toBe('home');
    expect(decodeNullTerminatedString(new Uint8Array(0))).toBe('');
  });

  it('formats raw hex dumps with offsets and ASCII display', () => {
    const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64]);
    const dump = formatHexDump(data, 16, 0x400);
    expect(dump).toContain('00000400');
    expect(dump).toContain('48 65 6c 6c 6f 20 57 6f');
    expect(dump).toContain('|Hello World|');
  });
});

describe('ext4.utils - parseExt4Superblock', () => {
  it('successfully parses a valid ext4 superblock', () => {
    const sample = createSampleSuperblock('ext4');
    const result = parseExt4Superblock(sample);

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();

    const { data } = result;
    expect(data.variant).toBe('ext4');
    expect(data.magic).toBe(0xef53);
    expect(data.magicHex).toBe('0xEF53');
    expect(data.blockSize).toBe(4096);
    expect(data.inodesCount).toBe(65536);
    expect(data.blocksCount).toBe('262144');
    expect(data.freeBlocksCount).toBe('240000');
    expect(data.freeInodesCount).toBe(65525);
    expect(data.firstDataBlock).toBe(0);
    expect(data.blocksPerGroup).toBe(32768);
    expect(data.inodesPerGroup).toBe(8192);
    expect(data.mountCount).toBe(5);
    expect(data.maxMountCount).toBe(30);
    expect(data.state).toContain('Clean');
    expect(data.errorsBehavior).toContain('Continue');
    expect(data.creatorOs).toBe('Linux');
    expect(data.revLevel).toBe(1);
    expect(data.inodeSize).toBe(256);
    expect(data.uuid).toBe('deadbeef-cafe-4000-8000-123456789abc');
    expect(data.volumeName).toBe('rootfs-ext4');
    expect(data.lastMountedPath).toBe('/');
    expect(data.hexDump).toContain('00000400');

    // Check features
    expect(data.compatFeatures).toContain('has_journal');
    expect(data.compatFeatures).toContain('ext_attr');
    expect(data.compatFeatures).toContain('dir_index');
    expect(data.incompatFeatures).toContain('extents');
    expect(data.incompatFeatures).toContain('64bit');
    expect(data.incompatFeatures).toContain('flex_bg');
    expect(data.roCompatFeatures).toContain('sparse_super');
    expect(data.roCompatFeatures).toContain('large_file');
    expect(data.roCompatFeatures).toContain('huge_file');
  });

  it('successfully parses a valid ext2 superblock', () => {
    const sample = createSampleSuperblock('ext2');
    const result = parseExt4Superblock(sample);

    expect(result.ok).toBe(true);
    expect(result.data.variant).toBe('ext2');
    expect(result.data.volumeName).toBe('boot-ext2');
    expect(result.data.lastMountedPath).toBe('/boot');
    expect(result.data.compatFeatures).not.toContain('has_journal');
    expect(result.data.incompatFeatures).not.toContain('extents');
    expect(result.data.incompatFeatures).not.toContain('64bit');
  });

  it('successfully parses an ext3 superblock with has_journal and no ext4 features', () => {
    const sample = createSampleSuperblock('ext3');
    const result = parseExt4Superblock(sample);

    expect(result.ok).toBe(true);
    expect(result.data.variant).toBe('ext3');
    expect(result.data.volumeName).toBe('data-ext3');
    expect(result.data.compatFeatures).toContain('has_journal');
    expect(result.data.incompatFeatures).not.toContain('extents');
    expect(result.data.incompatFeatures).not.toContain('64bit');
    expect(result.data.incompatFeatures).not.toContain('flex_bg');
  });

  it('returns { ok: false, error } when magic is wrong', () => {
    const sample = createSampleSuperblock('ext4', { magic: 0x1234 });
    const result = parseExt4Superblock(sample);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid magic number 0x1234.*0xEF53/i);
    expect(result.data).toBeUndefined();
  });

  it('returns { ok: false, error } when buffer is truncated / shorter than 2048 bytes', () => {
    // 0 bytes
    const emptyResult = parseExt4Superblock(new ArrayBuffer(0));
    expect(emptyResult.ok).toBe(false);
    expect(emptyResult.error).toMatch(/too short|at least 2048/i);

    // 1024 bytes (missing boot area + superblock)
    const shortResult = parseExt4Superblock(new ArrayBuffer(1024));
    expect(shortResult.ok).toBe(false);
    expect(shortResult.error).toMatch(/too short|at least 2048/i);

    // 2047 bytes
    const almostResult = parseExt4Superblock(new Uint8Array(2047));
    expect(almostResult.ok).toBe(false);
    expect(almostResult.error).toMatch(/too short|at least 2048/i);
  });

  it('preserves unknown feature bits with UNKNOWN_0x<hex>', () => {
    const unknownCompatBit = 0x80000000;
    const unknownIncompatBit = 0x00080000;
    const unknownRoCompatBit = 0x00010000;

    const sample = createSampleSuperblock('ext4', {
      featureCompat: 0x0004 | unknownCompatBit,
      featureIncompat: 0x0040 | unknownIncompatBit,
      featureRoCompat: 0x0001 | unknownRoCompatBit,
    });

    const result = parseExt4Superblock(sample);
    expect(result.ok).toBe(true);

    expect(result.data.compatFeatures).toContain('has_journal');
    expect(result.data.compatFeatures).toContain('UNKNOWN_0x80000000');

    expect(result.data.incompatFeatures).toContain('extents');
    expect(result.data.incompatFeatures).toContain('UNKNOWN_0x80000');

    expect(result.data.roCompatFeatures).toContain('sparse_super');
    expect(result.data.roCompatFeatures).toContain('UNKNOWN_0x10000');
  });

  it('decodes unknown feature flags standalone', () => {
    const flags = decodeFeatureFlags(0x80000004, FEATURE_COMPAT);
    expect(flags).toEqual(['has_journal', 'UNKNOWN_0x80000000']);
  });

  it('accepts hex string input', () => {
    const sample = createSampleSuperblock('ext4');
    const hex = bytesToHex(sample);
    const result = parseExt4Superblock(hex);

    expect(result.ok).toBe(true);
    expect(result.data.variant).toBe('ext4');
    expect(result.data.magicHex).toBe('0xEF53');
  });

  it('never throws into the caller for invalid inputs', () => {
    expect(parseExt4Superblock(null).ok).toBe(false);
    expect(parseExt4Superblock(undefined).ok).toBe(false);
    expect(parseExt4Superblock({ invalid: true }).ok).toBe(false);
    expect(parseExt4Superblock('not a valid hex string!').ok).toBe(false);
  });

  it('correctly decodes upper 8 bits for ext4 timestamps', () => {
    // Low word 1, high byte 1 -> 40-bit timestamp: (1 << 32) + 1 = 4294967297
    const sample = createSampleSuperblock('ext4', {
      writeTime: 1,
      writeTimeHi: 1,
      mountTime: 100,
      mountTimeHi: 2,
      lastCheckTime: 50,
      lastCheckTimeHi: 1,
    });

    const result = parseExt4Superblock(sample);
    expect(result.ok).toBe(true);

    // write time: (1 << 32) + 1 = 4,294,967,297 seconds (year 2106, not 1970)
    expect(result.data.writeTime).toBe(4294967297);
    expect(result.data.writeTimeHi).toBe(1);
    expect(result.data.writeTimeFormatted).toBe('2106-02-07T06:28:17.000Z');
    expect(result.data.writeTimeFormatted).not.toContain('1970');

    // mount time: (2 << 32) + 100 = 8,589,934,692
    expect(result.data.mountTime).toBe(8589934692);
    expect(result.data.mountTimeHi).toBe(2);
    expect(result.data.mountTimeFormatted).toBe(new Date(8589934692 * 1000).toISOString());

    // last check time: (1 << 32) + 50 = 4,294,967,346
    expect(result.data.lastCheckTime).toBe(4294967346);
    expect(result.data.lastCheckTimeHi).toBe(1);
    expect(result.data.lastCheckTimeFormatted).toBe('2106-02-07T06:29:06.000Z');
  });

  it('correctly decodes raw byte offsets 0x274 (s_wtime_hi) and 0x275 (s_mtime_hi)', () => {
    // Construct a raw 2048-byte buffer without createSampleSuperblock
    const buffer = new Uint8Array(2048);
    const view = new DataView(buffer.buffer, 1024, 1024);

    // Set magic 0xEF53 at 0x38
    view.setUint16(0x38, 0xef53, true);
    // Set rev level 1 at 0x4C
    view.setUint32(0x4C, 1, true);
    // Set extents feature (0x0040) at 0x60
    view.setUint32(0x60, 0x0040, true);

    // Set mount time low word 100 at 0x2C
    view.setUint32(0x2C, 100, true);
    // Set write time low word 1 at 0x30
    view.setUint32(0x30, 1, true);

    // Raw byte offsets in superblock (0x274 = s_wtime_hi, 0x275 = s_mtime_hi):
    // 0x274 set to 1 (write time high byte), 0x275 set to 0 (mount time high byte)
    buffer[1024 + 0x274] = 1;
    buffer[1024 + 0x275] = 0;

    const result = parseExt4Superblock(buffer);
    expect(result.ok).toBe(true);

    // Mount time: low word 100, high byte 0 -> 100
    expect(result.data.mountTime).toBe(100);
    expect(result.data.mountTimeHi).toBe(0);

    // Write time: low word 1, high byte 1 -> (1 << 32) + 1 = 4294967297
    expect(result.data.writeTime).toBe(4294967297);
    expect(result.data.writeTimeHi).toBe(1);
  });

  it('combines ext4 timestamp helper with lo and hi fields', () => {
    expect(combineExt4Timestamp(0, 0)).toBe(0);
    expect(combineExt4Timestamp(1, 1)).toBe(4294967297);
    expect(combineExt4Timestamp(12345, 0)).toBe(12345);
    expect(combineExt4Timestamp(0, 1)).toBe(4294967296);
  });

  it('decodes filesystem state as bitmask flags, including combinations and orphans', () => {
    // 0x0003: EXT4_VALID_FS (0x0001) | EXT4_ERROR_FS (0x0002)
    const sampleCombo = createSampleSuperblock('ext4', { state: 0x0003 });
    const resultCombo = parseExt4Superblock(sampleCombo);
    expect(resultCombo.ok).toBe(true);
    expect(resultCombo.data.stateFlags).toEqual([
      'Clean (EXT4_VALID_FS)',
      'Errors detected (EXT4_ERROR_FS)',
    ]);
    expect(resultCombo.data.state).toBe(
      'Clean (EXT4_VALID_FS), Errors detected (EXT4_ERROR_FS)',
    );
    expect(resultCombo.data.isClean).toBe(false);

    // 0x0005: EXT4_VALID_FS (0x0001) | EXT4_ORPHAN_FS (0x0004)
    const sampleOrphan = createSampleSuperblock('ext4', { state: 0x0005 });
    const resultOrphan = parseExt4Superblock(sampleOrphan);
    expect(resultOrphan.ok).toBe(true);
    expect(resultOrphan.data.stateFlags).toEqual([
      'Clean (EXT4_VALID_FS)',
      'Orphans being recovered (EXT4_ORPHAN_FS)',
    ]);
    expect(resultOrphan.data.isClean).toBe(false);

    // 0x0007: EXT4_VALID_FS (0x0001) | EXT4_ERROR_FS (0x0002) | EXT4_ORPHAN_FS (0x0004)
    const sampleAll = createSampleSuperblock('ext4', { state: 0x0007 });
    const resultAll = parseExt4Superblock(sampleAll);
    expect(resultAll.ok).toBe(true);
    expect(resultAll.data.stateFlags).toEqual([
      'Clean (EXT4_VALID_FS)',
      'Errors detected (EXT4_ERROR_FS)',
      'Orphans being recovered (EXT4_ORPHAN_FS)',
    ]);
    expect(resultAll.data.isClean).toBe(false);

    // Unknown bits retained: 0x0009 (0x0001 | 0x0008)
    const sampleUnknown = createSampleSuperblock('ext4', { state: 0x0009 });
    const resultUnknown = parseExt4Superblock(sampleUnknown);
    expect(resultUnknown.ok).toBe(true);
    expect(resultUnknown.data.stateFlags).toEqual([
      'Clean (EXT4_VALID_FS)',
      'UNKNOWN_0x8',
    ]);
    expect(resultUnknown.data.state).toContain('UNKNOWN_0x8');
  });

  it('decodes state flags standalone', () => {
    expect(STATE_FLAGS[0x0001]).toContain('Clean');
    expect(decodeStateFlags(0x0001)).toEqual(['Clean (EXT4_VALID_FS)']);
    expect(decodeStateFlags(0x0002)).toEqual(['Errors detected (EXT4_ERROR_FS)']);
    expect(decodeStateFlags(0x0004)).toEqual(['Orphans being recovered (EXT4_ORPHAN_FS)']);
    expect(decodeStateFlags(0x0003)).toEqual([
      'Clean (EXT4_VALID_FS)',
      'Errors detected (EXT4_ERROR_FS)',
    ]);
    expect(decodeStateFlags(0)).toEqual([]);
  });
});
