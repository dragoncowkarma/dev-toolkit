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
  createHpfsSuperblockBuffer,
  createSampleHpfsSuperblockHex,
  formatFileSize,
  hexToBytes,
  parseByteOffset,
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

  it('parses decimal strings', () => {
    expect(parseByteOffset('8192')).toBe(8192);
    expect(parseByteOffset('0')).toBe(0);
  });

  it('parses hexadecimal strings with 0x prefix or h suffix', () => {
    expect(parseByteOffset('0x2000')).toBe(8192);
    expect(parseByteOffset('0X2000')).toBe(8192);
    expect(parseByteOffset('2000h')).toBe(8192);
  });

  it('accepts integer numbers', () => {
    expect(parseByteOffset(8192)).toBe(8192);
    expect(parseByteOffset(0)).toBe(0);
  });

  it('throws on invalid or negative offsets', () => {
    expect(() => parseByteOffset(-10)).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset('-100')).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset('invalid')).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset(12.34)).toThrow(/Invalid byte offset/);
    expect(() => parseByteOffset({})).toThrow(TypeError);
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

describe('parseHpfsSuperblock - Acceptance Criteria Fixtures', () => {
  it('correctly parses a valid HPFS superblock fixture', () => {
    const buffer = createHpfsSuperblockBuffer({
      magic: HPFS_SB_MAGIC,
      magic1: HPFS_SB_MAGIC1,
      version: 2,
      funcversion: 2,
      rootdir: 1200,
      nSectors: 204800,
      nBadblocks: 3,
      bitmaps: 18,
      nDirBand: 1600,
      dirBandStart: 102400,
      dirBandEnd: 103999,
      dirMap: 102400,
      volumeName: 'MY_OS2_VOL',
    });

    const result = parseHpfsSuperblock(buffer);
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
    expect(superblock.spareBlockSector).toBe(17);
    expect(superblock.volumeName).toBe('MY_OS2_VOL');
    expect(superblock.dirBand).toEqual({
      sectorCount: 1600,
      startSector: 102400,
      endSector: 103999,
      bitmapSector: 102400,
      sizeFormatted: '800.0 KB',
    });
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
    // Slice with Sector 0 (Boot block), Sector 16 (Superblock), and Sector 17 (Spare block)
    const imageSize = HPFS_SPAREBLOCK_OFFSET + HPFS_SECTOR_SIZE;
    const image = new Uint8Array(imageSize);
    const view = new DataView(image.buffer);

    // 1. Sector 0: Boot Block
    view.setUint16(510, HPFS_BOOT_MAGIC, true); // 0xAA55
    view.setUint16(11, 512, true); // bytes per sector
    view.setUint8(13, 1); // sectors per cluster
    view.setUint32(32, 204800, true); // total sectors
    // Write OEM ID "IBM 20.0"
    const oem = 'IBM 20.0';
    for (let i = 0; i < oem.length; i += 1) image[3 + i] = oem.charCodeAt(i);
    // Write System ID "HPFS    "
    const sysId = 'HPFS    ';
    for (let i = 0; i < sysId.length; i += 1) image[54 + i] = sysId.charCodeAt(i);

    // 2. Sector 16: Super Block (offset 0x2000 = 8192)
    const sbBuffer = createHpfsSuperblockBuffer({
      volumeName: 'IMAGE_VOL',
      rootdir: 500,
    });
    image.set(sbBuffer, HPFS_SUPERBLOCK_OFFSET);

    // 3. Sector 17: Spare Block (offset 0x2200 = 8704)
    view.setUint32(HPFS_SPAREBLOCK_OFFSET, HPFS_SP_MAGIC, true);
    view.setUint32(HPFS_SPAREBLOCK_OFFSET + 4, HPFS_SP_MAGIC1, true);
    view.setUint8(HPFS_SPAREBLOCK_OFFSET + 8, 0x00); // dirty: 0 (clean)
    view.setUint32(HPFS_SPAREBLOCK_OFFSET + 16, 20, true); // nSpareSectors

    // Auto-detect offset 0x2000
    const result = parseHpfsSuperblock(image);
    expect(result.ok).toBe(true);
    expect(result.data.superblock.volumeName).toBe('IMAGE_VOL');
    expect(result.data.superblock.offset).toBe(0x2000);

    // Boot block verified
    expect(result.data.bootBlock).toBeDefined();
    expect(result.data.bootBlock.bootMagicHex).toBe('0xAA55');
    expect(result.data.bootBlock.oemId).toBe('IBM 20.0');
    expect(result.data.bootBlock.systemId).toBe('HPFS');

    // Spare block verified
    expect(result.data.spareBlock).toBeDefined();
    expect(result.data.spareBlock.magicHex).toBe('0xF9911849');
    expect(result.data.spareBlock.dirty).toBe(false);
    expect(result.data.spareBlock.nSpareSectors).toBe(20);
  });

  it('respects explicit byte offset', () => {
    const offset = 4096;
    const buffer = new Uint8Array(offset + HPFS_SECTOR_SIZE);
    const sb = createHpfsSuperblockBuffer({ volumeName: 'CUSTOM_OFFSET' });
    buffer.set(sb, offset);

    const result = parseHpfsSuperblock(buffer, { offset: '0x1000' }); // 4096 in hex
    expect(result.ok).toBe(true);
    expect(result.data.superblock.volumeName).toBe('CUSTOM_OFFSET');
    expect(result.data.superblock.offset).toBe(4096);
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
