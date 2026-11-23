import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  createSampleSuperblock,
  decodeFeatureFlags,
  decodeNullTerminatedString,
  FEATURE_COMPAT,
  formatHexDump,
  formatUuid,
  hexToBytes,
  parseExt4Superblock,
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
});
