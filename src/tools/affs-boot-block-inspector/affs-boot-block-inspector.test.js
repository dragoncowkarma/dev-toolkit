import { describe, expect, it } from 'vitest';
import {
  calculateBootBlockChecksum,
  calculateRootBlockChecksum,
  formatAmigaDate,
  inspectAffsBuffer,
  inspectAffsFile,
  parseAffsBootBlock,
  parseAffsRootBlock,
  verifyBootBlockChecksum,
  verifyRootBlockChecksum,
} from './affs-boot-block-inspector.utils.js';

/**
 * INDEPENDENT TEST FIXTURE BUILDER
 * Laid out independently from the parser routines.
 *
 * @param {object} params
 * @returns {Uint8Array}
 */
function buildIndependentBootBlock({
  magicBytes = [0x44, 0x4f, 0x53, 0x00], // 'DOS\0'
  rootblockPtr = 880,
  corruptChecksum = false,
  length = 1024,
} = {}) {
  const buf = new Uint8Array(length);
  if (length >= 4) {
    buf[0] = magicBytes[0];
    buf[1] = magicBytes[1];
    buf[2] = magicBytes[2];
    buf[3] = magicBytes[3];
  }
  if (length >= 12) {
    buf[8] = (rootblockPtr >> 24) & 0xff;
    buf[9] = (rootblockPtr >> 16) & 0xff;
    buf[10] = (rootblockPtr >> 8) & 0xff;
    buf[11] = rootblockPtr & 0xff;
  }

  if (length >= 1024) {
    // Independent carry-wraparound algorithm implementation
    let independentSum = 0;
    for (let offset = 0; offset < 1024; offset += 4) {
      if (offset === 4) continue;
      const word =
        ((buf[offset] << 24) |
          (buf[offset + 1] << 16) |
          (buf[offset + 2] << 8) |
          buf[offset + 3]) >>>
        0;
      const prev = independentSum;
      independentSum = (independentSum + word) >>> 0;
      if (independentSum < prev) {
        independentSum = (independentSum + 1) >>> 0;
      }
    }
    const finalChecksum = (~independentSum) >>> 0;

    if (corruptChecksum) {
      buf[4] = 0xba;
      buf[5] = 0xad;
      buf[6] = 0xf0;
      buf[7] = 0x0d;
    } else {
      buf[4] = (finalChecksum >> 24) & 0xff;
      buf[5] = (finalChecksum >> 16) & 0xff;
      buf[6] = (finalChecksum >> 8) & 0xff;
      buf[7] = finalChecksum & 0xff;
    }
  }

  return buf;
}

/**
 * INDEPENDENT ROOT BLOCK FIXTURE BUILDER
 *
 * @param {object} params
 * @returns {Uint8Array}
 */
function buildIndependentRootBlock({
  primaryType = 2,
  secondaryType = 1,
  bmFlag = 0xffffffff,
  volumeName = 'AmigaDisk',
  days = 10000,
  mins = 360,
  ticks = 100,
  corruptChecksum = false,
  length = 512,
} = {}) {
  const buf = new Uint8Array(length);
  if (length < 512) return buf;

  // Primary type at offset 0
  buf[0] = (primaryType >> 24) & 0xff;
  buf[1] = (primaryType >> 16) & 0xff;
  buf[2] = (primaryType >> 8) & 0xff;
  buf[3] = primaryType & 0xff;

  // Bitmap flag at offset 312
  buf[312] = (bmFlag >> 24) & 0xff;
  buf[313] = (bmFlag >> 16) & 0xff;
  buf[314] = (bmFlag >> 8) & 0xff;
  buf[315] = bmFlag & 0xff;

  // Volume name Pascal string at offset 432
  const nameLen = Math.min(volumeName.length, 30);
  buf[432] = nameLen;
  for (let i = 0; i < nameLen; i += 1) {
    buf[433 + i] = volumeName.charCodeAt(i);
  }

  // Creation date at offset 484
  buf[484] = (days >> 24) & 0xff;
  buf[485] = (days >> 16) & 0xff;
  buf[486] = (days >> 8) & 0xff;
  buf[487] = days & 0xff;

  buf[488] = (mins >> 24) & 0xff;
  buf[489] = (mins >> 16) & 0xff;
  buf[490] = (mins >> 8) & 0xff;
  buf[491] = mins & 0xff;

  buf[492] = (ticks >> 24) & 0xff;
  buf[493] = (ticks >> 16) & 0xff;
  buf[494] = (ticks >> 8) & 0xff;
  buf[495] = ticks & 0xff;

  // Secondary type at offset 508
  buf[508] = (secondaryType >> 24) & 0xff;
  buf[509] = (secondaryType >> 16) & 0xff;
  buf[510] = (secondaryType >> 8) & 0xff;
  buf[511] = secondaryType & 0xff;

  // Calculate standard 32-bit root checksum: -sum mod 2^32
  let sum = 0;
  for (let offset = 0; offset < 512; offset += 4) {
    if (offset === 20) continue;
    const word =
      ((buf[offset] << 24) |
        (buf[offset + 1] << 16) |
        (buf[offset + 2] << 8) |
        buf[offset + 3]) >>>
      0;
    sum = (sum + word) >>> 0;
  }
  const checksum = (-sum) >>> 0;

  if (corruptChecksum) {
    buf[20] = 0xde;
    buf[21] = 0xad;
    buf[22] = 0xbe;
    buf[23] = 0xef;
  } else {
    buf[20] = (checksum >> 24) & 0xff;
    buf[21] = (checksum >> 16) & 0xff;
    buf[22] = (checksum >> 8) & 0xff;
    buf[23] = checksum & 0xff;
  }

  return buf;
}

describe('affs-boot-block-inspector.utils', () => {
  describe('OFS and FFS Boot Block Parsing', () => {
    it('correctly parses an OFS (DOS0) boot block', () => {
      const ofsBlock = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x00], // DOS0
        rootblockPtr: 880,
      });

      const parsed = parseAffsBootBlock(ofsBlock);
      expect(parsed.magic).toBe('DOS0');
      expect(parsed.filesystem).toBe('OFS');
      expect(parsed.international).toBe(false);
      expect(parsed.dircache).toBe(false);
      expect(parsed.rootblockPtr).toBe(880);
      expect(parsed.checksumValid).toBe(true);
      expect(verifyBootBlockChecksum(ofsBlock)).toBe(true);
    });

    it('correctly parses an OFS International (DOS2) boot block', () => {
      const ofsIntl = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x02], // DOS2
        rootblockPtr: 880,
      });

      const parsed = parseAffsBootBlock(ofsIntl);
      expect(parsed.magic).toBe('DOS2');
      expect(parsed.filesystem).toBe('OFS');
      expect(parsed.international).toBe(true);
      expect(parsed.dircache).toBe(false);
      expect(parsed.longFilenames).toBe(false);
      expect(parsed.checksumValid).toBe(true);
    });

    it('correctly parses an FFS International (DOS3) boot block', () => {
      const ffsIntl = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x03], // DOS3
        rootblockPtr: 880,
      });

      const parsed = parseAffsBootBlock(ffsIntl);
      expect(parsed.magic).toBe('DOS3');
      expect(parsed.filesystem).toBe('FFS');
      expect(parsed.international).toBe(true);
      expect(parsed.dircache).toBe(false);
      expect(parsed.longFilenames).toBe(false);
      expect(parsed.checksumValid).toBe(true);
    });

    it('correctly parses an FFS (DOS1) boot block', () => {
      const ffsBlock = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x01], // DOS1
        rootblockPtr: 880,
      });

      const parsed = parseAffsBootBlock(ffsBlock);
      expect(parsed.magic).toBe('DOS1');
      expect(parsed.filesystem).toBe('FFS');
      expect(parsed.international).toBe(false);
      expect(parsed.dircache).toBe(false);
      expect(parsed.longFilenames).toBe(false);
      expect(parsed.rootblockPtr).toBe(880);
      expect(parsed.checksumValid).toBe(true);
    });

    it('correctly parses an OFS Directory Cache (DOS4) boot block', () => {
      const ofsDc = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x04], // DOS4 (OFS + dircache)
        rootblockPtr: 880,
      });

      const parsed = parseAffsBootBlock(ofsDc);
      expect(parsed.magic).toBe('DOS4');
      expect(parsed.filesystem).toBe('OFS');
      expect(parsed.international).toBe(true);
      expect(parsed.dircache).toBe(true);
      expect(parsed.longFilenames).toBe(false);
      expect(parsed.checksumValid).toBe(true);
    });

    it('correctly parses an FFS Directory Cache + International (DOS5) boot block', () => {
      const ffsDc = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x05], // DOS5 (FFS + dircache)
        rootblockPtr: 880,
      });

      const parsed = parseAffsBootBlock(ffsDc);
      expect(parsed.magic).toBe('DOS5');
      expect(parsed.filesystem).toBe('FFS');
      expect(parsed.international).toBe(true);
      expect(parsed.dircache).toBe(true);
      expect(parsed.longFilenames).toBe(false);
      expect(parsed.checksumValid).toBe(true);
    });

    it('correctly parses an OFS Long Filenames (DOS6) boot block', () => {
      const dos6 = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x06], // DOS6 (OFS + long filenames)
        rootblockPtr: 880,
      });

      const parsed = parseAffsBootBlock(dos6);
      expect(parsed.magic).toBe('DOS6');
      expect(parsed.filesystem).toBe('OFS');
      expect(parsed.international).toBe(true);
      expect(parsed.dircache).toBe(false);
      expect(parsed.longFilenames).toBe(true);
      expect(parsed.checksumValid).toBe(true);
    });

    it('correctly parses an FFS Long Filenames (DOS7) boot block', () => {
      const dos7 = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x07], // DOS7 (FFS + long filenames)
        rootblockPtr: 880,
      });

      const parsed = parseAffsBootBlock(dos7);
      expect(parsed.magic).toBe('DOS7');
      expect(parsed.filesystem).toBe('FFS');
      expect(parsed.international).toBe(true);
      expect(parsed.dircache).toBe(false);
      expect(parsed.longFilenames).toBe(true);
      expect(parsed.checksumValid).toBe(true);
    });
  });

  describe('Boot Checksum Verification and Carry Wraparound', () => {
    it('detects a corrupted boot block checksum', () => {
      const corrupted = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x00],
        corruptChecksum: true,
      });

      const parsed = parseAffsBootBlock(corrupted);
      expect(parsed.checksumValid).toBe(false);
      expect(parsed.storedChecksumHex).toBe('0xBAADF00D');
      expect(parsed.storedChecksum).not.toBe(parsed.calculatedChecksum);
      expect(verifyBootBlockChecksum(corrupted)).toBe(false);
    });

    it('correctly wraps carry when calculating bootblock checksum', () => {
      const block = new Uint8Array(1024);
      block[0] = 0x44;
      block[1] = 0x4f;
      block[2] = 0x53;
      block[3] = 0x01;
      // Put large numbers that guarantee arithmetic carry overflow
      block[8] = 0xff;
      block[9] = 0xff;
      block[10] = 0xff;
      block[11] = 0xff;
      block[12] = 0xff;
      block[13] = 0xff;
      block[14] = 0xff;
      block[15] = 0xff;

      const cs = calculateBootBlockChecksum(block);
      block[4] = (cs >> 24) & 0xff;
      block[5] = (cs >> 16) & 0xff;
      block[6] = (cs >> 8) & 0xff;
      block[7] = cs & 0xff;

      expect(verifyBootBlockChecksum(block)).toBe(true);
    });
  });

  describe('Error Handling: Empty, Truncated, and Unknown Magic', () => {
    it('rejects an empty file or buffer', () => {
      expect(() => parseAffsBootBlock(new Uint8Array(0))).toThrow(/File is empty/);
      expect(() => parseAffsBootBlock(null)).toThrow(/File is empty/);
    });

    it('rejects a truncated boot block (< 1024 bytes)', () => {
      const truncated = new Uint8Array(500);
      truncated[0] = 0x44;
      truncated[1] = 0x4f;
      truncated[2] = 0x53;
      truncated[3] = 0x00;

      expect(() => parseAffsBootBlock(truncated)).toThrow(/Truncated boot block/);
    });

    it('rejects unknown or invalid DOS magic', () => {
      // Non-DOS ASCII string
      const nonDos = buildIndependentBootBlock({
        magicBytes: [0x4e, 0x44, 0x4f, 0x53], // 'NDOS'
      });
      expect(() => parseAffsBootBlock(nonDos)).toThrow(/Invalid DOS magic/);

      // DOS followed by out-of-range flag byte (e.g. 0x08)
      const dos8 = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x08],
      });
      expect(() => parseAffsBootBlock(dos8)).toThrow(/Invalid DOS magic/);
    });
  });

  describe('Root Block Parsing and Validation', () => {
    it('calculates root block checksum correctly', () => {
      const rootBlock = buildIndependentRootBlock();
      const calculated = calculateRootBlockChecksum(rootBlock);
      const stored =
        ((rootBlock[20] << 24) |
          (rootBlock[21] << 16) |
          (rootBlock[22] << 8) |
          rootBlock[23]) >>>
        0;
      expect(calculated).toBe(stored);
    });

    it('validates root block and extracts volume name, date, bitmap flag', () => {
      const rootBlock = buildIndependentRootBlock({
        primaryType: 2,
        secondaryType: 1,
        bmFlag: 0xffffffff,
        volumeName: 'Workbench3.1',
        days: 5678,
        mins: 720,
        ticks: 25,
      });

      const parsed = parseAffsRootBlock(rootBlock);
      expect(parsed.valid).toBe(true);
      expect(parsed.primaryType).toBe(2);
      expect(parsed.secondaryType).toBe(1);
      expect(parsed.volumeName).toBe('Workbench3.1');
      expect(parsed.bitmapFlagSigned).toBe(-1);
      expect(parsed.bitmapFlagStatus).toBe('Valid (-1 / 0xFFFFFFFF)');
      expect(parsed.creationDate.days).toBe(5678);
      expect(parsed.creationDate.mins).toBe(720);
      expect(parsed.creationDate.ticks).toBe(25);
      expect(parsed.checksumValid).toBe(true);
    });

    it('correctly handles unvalidated bitmap flag (0)', () => {
      const rootBlock = buildIndependentRootBlock({
        bmFlag: 0x00000000,
        volumeName: 'DiskWithBadBitmap',
      });

      const parsed = parseAffsRootBlock(rootBlock);
      expect(parsed.bitmapFlag).toBe(0);
      expect(parsed.bitmapFlagStatus).toContain('Invalid (0x00000000) - needs validation');
    });

    it('rejects root block with invalid primary type and does not present fields', () => {
      const badPtype = buildIndependentRootBlock({
        primaryType: 1, // should be 2
      });

      expect(() => parseAffsRootBlock(badPtype)).toThrow(/Invalid root block primary type/);
    });

    it('rejects root block with invalid secondary type and does not present fields', () => {
      const badStype = buildIndependentRootBlock({
        secondaryType: 2, // should be 1
      });

      expect(() => parseAffsRootBlock(badStype)).toThrow(/Invalid root block secondary type/);
    });

    it('rejects root block with corrupt checksum and does not present fields', () => {
      const badChecksum = buildIndependentRootBlock({
        corruptChecksum: true,
      });

      expect(() => parseAffsRootBlock(badChecksum)).toThrow(/Invalid root block checksum/);
      expect(verifyRootBlockChecksum(badChecksum)).toBe(false);
    });

    it('rejects truncated root block (< 512 bytes)', () => {
      const truncated = new Uint8Array(256);
      expect(() => parseAffsRootBlock(truncated)).toThrow(/Truncated root block/);
    });
  });

  describe('Full Floppy & File Slicing Integration', () => {
    it('inspects an 880 KB floppy image reading root block at pointer', async () => {
      // 1760 sectors of 512 bytes = 901,120 bytes
      const floppy = new Uint8Array(1760 * 512);
      const boot = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x01], // FFS
        rootblockPtr: 880,
      });
      floppy.set(boot, 0);

      const root = buildIndependentRootBlock({
        volumeName: 'AmigaOS',
        days: 1000,
        mins: 500,
        ticks: 0,
      });
      floppy.set(root, 880 * 512);

      const file = new File([floppy], 'test_floppy.adf', {
        type: 'application/octet-stream',
      });
      const result = await inspectAffsFile(file, {
        readRootBlock: true,
        rootBlockSource: 'pointer',
      });

      expect(result.isFloppyOrLarger).toBe(true);
      expect(result.bootBlock.magic).toBe('DOS1');
      expect(result.bootBlock.filesystem).toBe('FFS');
      expect(result.targetSector).toBe(880);
      expect(result.rootBlock).not.toBeNull();
      expect(result.rootBlock.volumeName).toBe('AmigaOS');
      expect(result.rootBlockError).toBeNull();
    });

    it('inspects file under 1760 sectors without inspecting root block', async () => {
      // Small file: 1024 bytes (2 sectors)
      const boot = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x00],
      });
      const file = new File([boot], 'boot_only.bin');

      const result = await inspectAffsFile(file);
      expect(result.isFloppyOrLarger).toBe(false);
      expect(result.bootBlock.magic).toBe('DOS0');
      expect(result.rootBlock).toBeNull();
      expect(result.rootBlockError).toBeNull();
    });

    it('does not present root fields as valid when root block is corrupt', async () => {
      const floppy = new Uint8Array(1760 * 512);
      const boot = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x00],
        rootblockPtr: 880,
      });
      floppy.set(boot, 0);

      const badRoot = buildIndependentRootBlock({
        corruptChecksum: true,
      });
      floppy.set(badRoot, 880 * 512);

      const file = new File([floppy], 'corrupt_root_floppy.adf');
      const result = await inspectAffsFile(file);

      expect(result.rootBlock).toBeNull();
      expect(result.rootBlockError).toContain('Invalid root block checksum');
    });

    it('reports an error for an out-of-range pointer without silently validating midpoint', async () => {
      const floppy = new Uint8Array(1760 * 512);
      // Boot block with out-of-range rootblockPtr (e.g. 5000)
      const boot = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x01],
        rootblockPtr: 5000,
      });
      floppy.set(boot, 0);

      // Midpoint at sector 880 contains a valid root block
      const root = buildIndependentRootBlock({
        volumeName: 'ValidMidpoint',
      });
      floppy.set(root, 880 * 512);

      const file = new File([floppy], 'out_of_range_ptr.adf');

      // 1. In pointer mode: must NOT silently validate midpoint
      const pointerResult = await inspectAffsFile(file, {
        readRootBlock: true,
        rootBlockSource: 'pointer',
      });
      expect(pointerResult.targetSector).toBe(5000);
      expect(pointerResult.rootBlock).toBeNull();
      expect(pointerResult.rootBlockError).toContain('Root block pointer sector 5000 is out of range');

      // 2. In explicit midpoint mode: validates sector 880
      const midpointResult = await inspectAffsFile(file, {
        readRootBlock: true,
        rootBlockSource: 'midpoint',
      });
      expect(midpointResult.targetSector).toBe(880);
      expect(midpointResult.rootBlock).not.toBeNull();
      expect(midpointResult.rootBlock.volumeName).toBe('ValidMidpoint');
      expect(midpointResult.rootBlockError).toBeNull();
    });

    it('reports an error for out-of-range pointer with inspectAffsBuffer', () => {
      const floppy = new Uint8Array(1760 * 512);
      const boot = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x01],
        rootblockPtr: 2500,
      });
      floppy.set(boot, 0);

      const root = buildIndependentRootBlock({
        volumeName: 'BufferMidpoint',
      });
      floppy.set(root, 880 * 512);

      // Pointer mode
      const pointerResult = inspectAffsBuffer(floppy, { rootBlockSource: 'pointer' });
      expect(pointerResult.targetSector).toBe(2500);
      expect(pointerResult.rootBlock).toBeNull();
      expect(pointerResult.rootBlockError).toContain('Root block pointer sector 2500 is out of range');

      // Midpoint mode
      const midpointResult = inspectAffsBuffer(floppy, { rootBlockSource: 'midpoint' });
      expect(midpointResult.targetSector).toBe(880);
      expect(midpointResult.rootBlock).not.toBeNull();
      expect(midpointResult.rootBlock.volumeName).toBe('BufferMidpoint');
      expect(midpointResult.rootBlockError).toBeNull();
    });

    it('works with inspectAffsBuffer', () => {
      const floppy = new Uint8Array(1760 * 512);
      const boot = buildIndependentBootBlock({
        magicBytes: [0x44, 0x4f, 0x53, 0x01],
        rootblockPtr: 880,
      });
      floppy.set(boot, 0);
      const root = buildIndependentRootBlock({
        volumeName: 'BufferDisk',
      });
      floppy.set(root, 880 * 512);

      const result = inspectAffsBuffer(floppy, { rootBlockSource: 'midpoint' });
      expect(result.isFloppyOrLarger).toBe(true);
      expect(result.rootBlock.volumeName).toBe('BufferDisk');
    });
  });

  describe('formatAmigaDate', () => {
    it('formats Amiga epoch correctly for zero timestamp', () => {
      const formatted = formatAmigaDate(0, 0, 0);
      expect(formatted).toBe('1978-01-01T00:00:00.000Z');
    });

    it('formats a date with days, minutes and ticks', () => {
      // 1 day = 1978-01-02, 60 mins = 01:00, 50 ticks = 1 second
      const formatted = formatAmigaDate(1, 60, 50);
      expect(formatted).toBe('1978-01-02T01:00:01.000Z');
    });
  });
});
