import { describe, expect, it, vi } from 'vitest';
import {
  HPFS_BOOT_MAGIC,
  HPFS_SB_MAGIC,
  HPFS_SB_MAGIC1,
  HPFS_SECTOR_SIZE,
  HPFS_SPAREBLOCK_OFFSET,
  HPFS_SP_MAGIC,
  HPFS_SP_MAGIC1,
  HPFS_SUPERBLOCK_OFFSET,
  bytesToHex,
  createHpfsBootBlockBuffer,
  createHpfsPartitionImageBuffer,
  createHpfsSpareBlockBuffer,
  createHpfsSuperblockBuffer,
  createSampleHpfsSuperblockHex,
  formatFileSize,
  hexToBytes,
  parseByteOffset,
  parseHpfsBootBlock,
  parseHpfsSpareBlock,
  parseHpfsSuperblock,
  readSlice,
} from './hpfs-superblock-inspector.utils.js';

describe('hexToBytes and bytesToHex', () => {
  it('converts valid hex string to Uint8Array', () => {
    const bytes = hexToBytes('49 E8 95 F9');
    expect(bytes).toEqual(new Uint8Array([0x49, 0xe8, 0x95, 0xf9]));
  });

  it('strips 0x prefixes and common delimiters', () => {
    const bytes = hexToBytes('0x49, 0xe8: 0x95-0xf9');
    expect(bytes).toEqual(new Uint8Array([0x49, 0xe8, 0x95, 0xf9]));
  });

  it('returns empty Uint8Array for empty input', () => {
    expect(hexToBytes('')).toEqual(new Uint8Array(0));
    expect(hexToBytes('   ')).toEqual(new Uint8Array(0));
  });

  it('throws on non-string input', () => {
    expect(() => hexToBytes(123)).toThrow(TypeError);
    expect(() => hexToBytes(null)).toThrow(TypeError);
  });

  it('throws on invalid hexadecimal characters', () => {
    expect(() => hexToBytes('49 ZZ 95')).toThrow(/Invalid hexadecimal characters/);
  });

  it('throws on odd number of hex digits', () => {
    expect(() => hexToBytes('49E89')).toThrow(/Odd number of hexadecimal digits/);
  });

  it('round-trips with bytesToHex', () => {
    const original = new Uint8Array([0x12, 0x34, 0xab, 0xcd]);
    const hex = bytesToHex(original);
    expect(hex).toBe('12 34 AB CD');
    expect(hexToBytes(hex)).toEqual(original);
  });

  it('throws in bytesToHex for invalid input', () => {
    expect(() => bytesToHex([1, 2, 3])).toThrow(TypeError);
  });
});

describe('parseByteOffset', () => {
  it('returns 0 for empty, null, or undefined', () => {
    expect(parseByteOffset(null)).toBe(0);
    expect(parseByteOffset(undefined)).toBe(0);
    expect(parseByteOffset('')).toBe(0);
    expect(parseByteOffset('   ')).toBe(0);
  });

  it('parses valid decimal strings', () => {
    expect(parseByteOffset('8192')).toBe(8192);
    expect(parseByteOffset('0')).toBe(0);
    expect(parseByteOffset('  1024  ')).toBe(1024);
  });

  it('parses valid hexadecimal strings with 0x prefix or h suffix', () => {
    expect(parseByteOffset('0x2000')).toBe(8192);
    expect(parseByteOffset('0X2000')).toBe(8192);
    expect(parseByteOffset('2000h')).toBe(8192);
    expect(parseByteOffset('2000H')).toBe(8192);
    expect(parseByteOffset('  0x100  ')).toBe(256);
  });

  it('accepts safe non-negative integer numbers', () => {
    expect(parseByteOffset(8192)).toBe(8192);
    expect(parseByteOffset(0)).toBe(0);
  });

  it('rejects malformed strings with trailing junk or invalid characters', () => {
    expect(() => parseByteOffset('12junk')).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset('0x2000zz')).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset('1.5')).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset('0x')).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset('h')).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset('invalid')).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset('0x12g4')).toThrow(/Invalid byte offset/);
  });

  it('rejects non-integer, negative, or unsafe numeric offsets', () => {
    expect(() => parseByteOffset(-10)).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset('-100')).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset(12.34)).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset(NaN)).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset(Infinity)).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset(Number.MAX_SAFE_INTEGER + 100)).toThrow(/Invalid byte offset/);
  });

  it('throws TypeError for non-string, non-numeric values', () => {
    expect(() => parseByteOffset({})).toThrow(TypeError);
    expect(() => parseByteOffset([])).toThrow(TypeError);
  });
});

describe('formatFileSize', () => {
  it('formats bytes under 1KB', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes, megabytes, and gigabytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(104857600)).toBe('100.0 MB');
    expect(formatFileSize(1073741824 * 2.5)).toBe('2.5 GB');
  });

  it('handles negative or invalid values gracefully', () => {
    expect(formatFileSize(-5)).toBe('0 B');
    expect(formatFileSize(NaN)).toBe('0 B');
  });
});

describe('readSlice', () => {
  it('reads a slice from a Blob asynchronously', async () => {
    const data = new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x50]);
    const blob = new Blob([data]);
    const slice = await readSlice(blob, 1, 3);
    expect(slice).toEqual(new Uint8Array([0x20, 0x30, 0x40]));
  });

  it('rejects on invalid file object', async () => {
    await expect(readSlice(null)).rejects.toThrow(TypeError);
  });

  it('rejects on FileReader error', async () => {
    const failingReader = {
      readAsArrayBuffer: vi.fn(function readAsArrayBuffer() {
        this.onerror(new Error('Read failure'));
      }),
    };
    const OriginalFileReader = global.FileReader;
    global.FileReader = vi.fn(function FileReader() {
      return failingReader;
    });

    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    await expect(readSlice(blob)).rejects.toThrow('Failed to read the selected file slice.');

    global.FileReader = OriginalFileReader;
  });
});

describe('parseHpfsSuperblock - Acceptance Criteria & Layouts', () => {
  it('correctly parses an independently encoded HPFS superblock fixture with accurate directory-band offsets', () => {
    // Independently encoded 512-byte buffer according to Linux kernel fs/hpfs/hpfs.h
    const rawBuffer = new Uint8Array(HPFS_SECTOR_SIZE);
    const view = new DataView(rawBuffer.buffer);

    // 0: magic
    view.setUint32(0, HPFS_SB_MAGIC, true);
    // 4: magic1
    view.setUint32(4, HPFS_SB_MAGIC1, true);
    // 8: version
    rawBuffer[8] = 2;
    // 9: funcversion
    rawBuffer[9] = 2;
    // 10: zero (u16)
    view.setUint16(10, 0, true);
    // 12: root directory fnode sector
    view.setUint32(12, 1200, true);
    // 16: total sectors
    view.setUint32(16, 204800, true);
    // 20: bad blocks count
    view.setUint32(20, 3, true);
    // 24: bitmap pointers sector
    view.setUint32(24, 18, true);
    // 28: zero1
    view.setUint32(28, 0, true);
    // 32: bad block list sector
    view.setUint32(32, 22, true);
    // 36: zero3
    view.setUint32(36, 0, true);
    // 40: last chkdsk timestamp
    view.setUint32(40, 1500000000, true);
    // 44: last optimize timestamp
    view.setUint32(44, 1500005000, true);
    // 48: directory band count (1600)
    view.setUint32(48, 1600, true);
    // 52: directory band start (102400)
    view.setUint32(52, 102400, true);
    // 56: directory band end (103999)
    view.setUint32(56, 103999, true);
    // 60: directory band bitmap (120)
    view.setUint32(60, 120, true);

    // 64..95: volume name (32 bytes)
    const volName = 'MY_OS2_VOL';
    for (let i = 0; i < volName.length; i += 1) {
      rawBuffer[64 + i] = volName.charCodeAt(i);
    }

    // 96: user ID table sector
    view.setUint32(96, 48, true);

    const result = parseHpfsSuperblock(rawBuffer);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.data).toBeDefined();

    const { superblock } = result.data;
    expect(superblock.magicHex).toBe('0xF995E849');
    expect(superblock.magic1Hex).toBe('0xFA53E9C5');
    expect(superblock.version).toBe(2);
    expect(superblock.functionalVersion).toBe(2);
    expect(superblock.rootFnodeSector).toBe(1200);
    expect(superblock.totalSectors).toBe(204800);
    expect(superblock.badBlockCount).toBe(3);
    expect(superblock.bitmapPointerSector).toBe(18);
    expect(superblock.badBlockListSector).toBe(22);
    expect(superblock.lastChkdsk).toBe(1500000000);
    expect(superblock.lastOptimize).toBe(1500005000);
    expect(superblock.volumeName).toBe('MY_OS2_VOL');
    expect(superblock.userIdTableSector).toBe(48);

    // Verify directory band fields at offsets 48, 52, 56, 60
    expect(superblock.dirBand).toEqual({
      sectorCount: 1600,
      startSector: 102400,
      endSector: 103999,
      bitmapSector: 120,
      sizeFormatted: '800.0 KB',
    });
  });

  it('correctly decodes the spare block at its actual on-disk offsets with distinct values', () => {
    // Independently encoded 512-byte spare block fixture
    const rawSpare = new Uint8Array(HPFS_SECTOR_SIZE);
    const view = new DataView(rawSpare.buffer);

    view.setUint32(0, HPFS_SP_MAGIC, true); // 0xf9911849
    view.setUint32(4, HPFS_SP_MAGIC1, true); // 0xfa5229c5
    rawSpare[8] = 0x01 | 0x04; // dirty: 1, hotfixes_used: 1

    view.setUint32(12, 16, true); // hotfix_map sector
    view.setUint32(16, 5, true); // used hotfixes = 5
    view.setUint32(20, 99, true); // total hotfix spares = 99
    view.setUint32(24, 12, true); // free dnode spares = 12
    view.setUint32(28, 40, true); // total dnode spares = 40
    view.setUint32(32, 777, true); // code page directory = 777
    view.setUint32(36, 3, true); // nCodePages = 3
    view.setUint32(40, 0x11223344, true); // super CRC = 0x11223344
    view.setUint32(44, 0x55667788, true); // spare CRC = 0x55667788

    const spare = parseHpfsSpareBlock(rawSpare, 0);
    expect(spare).toBeDefined();
    expect(spare.magicHex).toBe('0xF9911849');
    expect(spare.magic1Hex).toBe('0xFA5229C5');
    expect(spare.dirty).toBe(true);
    expect(spare.hotfixesUsed).toBe(true);
    expect(spare.spareDirUsed).toBe(false);

    expect(spare.hotfixMap).toBe(16);
    expect(spare.usedHotfixes).toBe(5);
    expect(spare.totalHotfixes).toBe(99);
    expect(spare.freeDnodeSpares).toBe(12);
    expect(spare.totalDnodeSpares).toBe(40);
    expect(spare.codePageDir).toBe(777);
    expect(spare.nCodePages).toBe(3);
    expect(spare.superCrcHex).toBe('0x11223344');
    expect(spare.spareCrcHex).toBe('0x55667788');
  });

  it('rejects truncated input as a diagnostic and not as a valid result', () => {
    const truncatedBuffer = new Uint8Array(256); // HPFS sector requires 512 bytes
    const result = parseHpfsSuperblock(truncatedBuffer);

    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]).toMatch(/Truncated input: buffer length/);
    expect(result.error).toMatch(/Truncated input/);
  });

  it('rejects bad signature as a diagnostic and not as a valid result', () => {
    const badSigBuffer = createHpfsSuperblockBuffer({ magic: 0x11223344 });
    const result = parseHpfsSuperblock(badSigBuffer);

    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]).toMatch(/Invalid HPFS superblock signature/);
    expect(result.error).toMatch(/Invalid HPFS superblock signature/);
  });

  it('rejects secondary magic mismatch as bad signature diagnostic', () => {
    const badSig1Buffer = createHpfsSuperblockBuffer({ magic1: 0x99887766 });
    const result = parseHpfsSuperblock(badSig1Buffer);

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatch(/Invalid HPFS superblock signature/);
  });

  it('rejects unknown version as a diagnostic and not as a valid result', () => {
    const unknownVerBuffer = createHpfsSuperblockBuffer({ version: 99 });
    const result = parseHpfsSuperblock(unknownVerBuffer);

    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]).toMatch(/Unknown HPFS version: 99/);
    expect(result.error).toMatch(/Unknown HPFS version: 99/);
  });

  it('accepts version 3 (HPFS386)', () => {
    const hpfs386Buffer = createHpfsSuperblockBuffer({ version: 3 });
    const result = parseHpfsSuperblock(hpfs386Buffer);

    expect(result.ok).toBe(true);
    expect(result.data.superblock.version).toBe(3);
  });

  it('reports diagnostic for empty input', () => {
    const result = parseHpfsSuperblock(new Uint8Array(0));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty/);
  });

  it('reports diagnostic for null input', () => {
    const result = parseHpfsSuperblock(null);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No input/);
  });
});

describe('HPFS Partition Image with Boot Block and Spare Block', () => {
  it('parses superblock, boot block, and spare block when full image slice is provided', () => {
    const image = createHpfsPartitionImageBuffer({
      bootBlock: {
        oemId: 'IBM 20.0',
        systemId: 'HPFS',
      },
      superblock: {
        volumeName: 'IMAGE_VOL',
        rootdir: 500,
        nDirBand: 1600,
        dirBandStart: 102400,
        dirBandEnd: 103999,
        dirBandBitmap: 120,
      },
      spareBlock: {
        dirty: false,
        usedHotfixes: 5,
        totalHotfixes: 99,
        codePageDir: 777,
      },
    });

    // Auto-detect offset 0x2000
    const result = parseHpfsSuperblock(image);
    expect(result.ok).toBe(true);
    expect(result.data.superblock.volumeName).toBe('IMAGE_VOL');
    expect(result.data.superblock.offset).toBe(0x2000);
    expect(result.data.superblock.sector).toBe(16);
    expect(result.data.superblock.dirBand.sectorCount).toBe(1600);
    expect(result.data.superblock.dirBand.bitmapSector).toBe(120);

    // Boot block verified
    expect(result.data.bootBlock).toBeDefined();
    expect(result.data.bootBlock.bootMagicHex).toBe('0xAA55');
    expect(result.data.bootBlock.oemId).toBe('IBM 20.0');
    expect(result.data.bootBlock.systemId).toBe('HPFS');

    // Spare block verified
    expect(result.data.spareBlock).toBeDefined();
    expect(result.data.spareBlock.magicHex).toBe('0xF9911849');
    expect(result.data.spareBlock.dirty).toBe(false);
    expect(result.data.spareBlock.usedHotfixes).toBe(5);
    expect(result.data.spareBlock.totalHotfixes).toBe(99);
    expect(result.data.spareBlock.codePageDir).toBe(777);
  });

  it('respects explicit byte offset and base offset', () => {
    const offset = 4096;
    const buffer = new Uint8Array(offset + HPFS_SECTOR_SIZE);
    const sb = createHpfsSuperblockBuffer({ volumeName: 'CUSTOM_OFFSET' });
    buffer.set(sb, offset);

    const result = parseHpfsSuperblock(buffer, { offset: '0x1000' }); // 4096 in hex
    expect(result.ok).toBe(true);
    expect(result.data.superblock.volumeName).toBe('CUSTOM_OFFSET');
    expect(result.data.superblock.offset).toBe(4096);
    expect(result.data.superblock.sector).toBe(8);
  });

  it('carries slice base offset into reported location', () => {
    const sb = createHpfsSuperblockBuffer({ volumeName: 'SLICED_SB' });
    const result = parseHpfsSuperblock(sb, { offset: 0, baseOffset: 8192 });
    expect(result.ok).toBe(true);
    expect(result.data.superblock.offset).toBe(8192);
    expect(result.data.superblock.sector).toBe(16);
  });

  it('createSampleHpfsSuperblockHex generates valid parsable hex', () => {
    const hex = createSampleHpfsSuperblockHex();
    expect(hex.length).toBeGreaterThan(100);
    const bytes = hexToBytes(hex);
    const result = parseHpfsSuperblock(bytes);
    expect(result.ok).toBe(true);
    expect(result.data.superblock.magicHex).toBe('0xF995E849');
  });
});
