import { describe, expect, it } from 'vitest';
import {
  formatCompression,
  formatTableOffset,
  parseSquashfsSuperblock,
} from './squashfsSuperblock.js';

function makeSuperblock({
  blockLog = 17,
  compressionId = 1,
  flags = 0,
  majorVersion = 4,
  offsets = {},
} = {}) {
  const buffer = new ArrayBuffer(96);
  const view = new DataView(buffer);
  view.setUint32(0, 0x73717368, true);
  view.setUint32(4, 42, true);
  view.setUint32(8, 1_700_000_000, true);
  view.setUint32(12, 131_072, true);
  view.setUint32(16, 7, true);
  view.setUint16(20, compressionId, true);
  view.setUint16(22, blockLog, true);
  view.setUint16(24, flags, true);
  view.setUint16(26, 3, true);
  view.setUint16(28, majorVersion, true);
  view.setUint16(30, 0, true);
  view.setBigUint64(32, 9_007_199_254_740_993n, true);
  view.setBigUint64(40, 9_007_199_254_740_995n, true);
  const positions = { id: 48, xattr: 56, inode: 64, directory: 72, fragment: 80, export: 88 };
  Object.entries(positions).forEach(([name, position]) => {
    view.setBigUint64(position, offsets[name] ?? BigInt(position * 100), true);
  });
  return buffer;
}

describe('parseSquashfsSuperblock', () => {
  it('parses every superblock field, flags, and lossless 64-bit values', () => {
    const details = parseSquashfsSuperblock(makeSuperblock({ flags: 0x0ffb }));

    expect(details).toMatchObject({
      magic: 'hsqs',
      inodeCount: 42,
      modificationTime: 1_700_000_000,
      modificationTimeIso: '2023-11-14T22:13:20.000Z',
      blockSize: 131_072,
      fragmentCount: 7,
      compression: 'gzip',
      blockLog: 17,
      blockLogMatches: true,
      idCount: 3,
      majorVersion: 4,
      minorVersion: 0,
    });
    expect(details.rootInodeReference).toBe(9_007_199_254_740_993n);
    expect(details.bytesUsed).toBe(9_007_199_254_740_995n);
    expect(details.flags).toHaveLength(11);
    expect(details.flags.every((flag) => flag.enabled)).toBe(true);
    expect(details.tableOffsets.inode).toBe(6400n);
  });

  it('decodes every known compression ID and preserves unknown IDs', () => {
    ['gzip', 'lzma', 'lzo', 'xz', 'lz4', 'zstd'].forEach((name, index) => {
      expect(formatCompression(index + 1)).toBe(name);
    });
    expect(formatCompression(99)).toBe('Unknown (99)');
    expect(parseSquashfsSuperblock(makeSuperblock({ compressionId: 99 })).compression).toBe(
      'Unknown (99)'
    );
  });

  it('flags a block-size and block-log mismatch', () => {
    const details = parseSquashfsSuperblock(makeSuperblock({ blockLog: 16 }));
    expect(details.blockLogMatches).toBe(false);
    expect(details.expectedBlockLog).toBe(17);
  });

  it('renders the all-ones table offset sentinel as none', () => {
    const details = parseSquashfsSuperblock(makeSuperblock({
      offsets: { id: 0xffffffffffffffffn, export: 0xffffffffffffffffn },
    }));
    expect(formatTableOffset(details.tableOffsets.id)).toBe('none');
    expect(formatTableOffset(details.tableOffsets.export)).toBe('none');
    expect(formatTableOffset(details.tableOffsets.inode)).toBe('6400');
  });

  it('rejects missing and truncated input', () => {
    expect(() => parseSquashfsSuperblock()).toThrow(/No file selected/);
    expect(() => parseSquashfsSuperblock(new ArrayBuffer(95))).toThrow(/shorter than/);
  });

  it('rejects an invalid magic and an unsupported major version', () => {
    const badMagic = makeSuperblock();
    new DataView(badMagic).setUint32(0, 0, true);
    expect(() => parseSquashfsSuperblock(badMagic)).toThrow(/Invalid SquashFS magic/);
    expect(() => parseSquashfsSuperblock(makeSuperblock({ majorVersion: 3 }))).toThrow(
      /Unsupported SquashFS major version 3/
    );
  });
});
