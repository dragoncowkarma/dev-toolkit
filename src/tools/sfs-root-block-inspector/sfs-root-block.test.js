import { describe, expect, it, vi } from 'vitest';
import {
  calculateBlockChecksum,
  createSfsRootBlockBuffer,
  formatAmigaDate,
  formatBytes,
  isPowerOfTwo,
  parseSfsRootBlock,
  readRootBlockFromBlob,
  SFS_CHECKSUM_TARGET,
  SFS_ROOT_MAGIC,
  SFS_ROOT_MAGIC_STRING,
} from './sfs-root-block.utils.js';

describe('isPowerOfTwo', () => {
  it('identifies valid powers of two', () => {
    expect(isPowerOfTwo(1)).toBe(true);
    expect(isPowerOfTwo(2)).toBe(true);
    expect(isPowerOfTwo(512)).toBe(true);
    expect(isPowerOfTwo(1024)).toBe(true);
    expect(isPowerOfTwo(4096)).toBe(true);
  });

  it('rejects non-powers of two and invalid numbers', () => {
    expect(isPowerOfTwo(0)).toBe(false);
    expect(isPowerOfTwo(-512)).toBe(false);
    expect(isPowerOfTwo(500)).toBe(false);
    expect(isPowerOfTwo(1023)).toBe(false);
    expect(isPowerOfTwo(null)).toBe(false);
    expect(isPowerOfTwo('512')).toBe(false);
  });
});

describe('formatAmigaDate', () => {
  it('formats valid Amiga timestamps', () => {
    // 0 seconds after Amiga epoch (1978-01-01)
    expect(formatAmigaDate(0)).toBe('1978-01-01T00:00:00 UTC');
    // 100,000,000 seconds after Amiga epoch
    expect(formatAmigaDate(100000000)).toContain('1981-03-03');
  });

  it('returns Unknown for invalid inputs', () => {
    expect(formatAmigaDate(-1)).toBe('Unknown');
    expect(formatAmigaDate(null)).toBe('Unknown');
    expect(formatAmigaDate(NaN)).toBe('Unknown');
    expect(formatAmigaDate('not-a-number')).toBe('Unknown');
  });
});

describe('formatBytes', () => {
  it('formats byte quantities correctly', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1048576)).toBe('1.00 MB');
    expect(formatBytes(1073741824n)).toBe('1.00 GB');
    expect(formatBytes(-1)).toBe('Unknown');
  });
});

describe('calculateBlockChecksum', () => {
  it('produces a checksum whose longword sum equals 0xffffffff modulo 2^32', () => {
    const buffer = new ArrayBuffer(512);
    const view = new DataView(buffer);
    view.setUint32(0, SFS_ROOT_MAGIC, false);
    view.setUint32(52, 512, false);

    const checksum = calculateBlockChecksum(buffer, 512);
    view.setUint32(4, checksum, false);

    let sum = 0;
    for (let i = 0; i < 512; i += 4) {
      sum = (sum + view.getUint32(i, false)) >>> 0;
    }
    expect(sum).toBe(SFS_CHECKSUM_TARGET);
  });

  it('correctly derives the expected checksum for an independently specified layout', () => {
    // 512-byte root block layout with independent field values
    const buffer = new ArrayBuffer(512);
    const view = new DataView(buffer);
    view.setUint32(0, 0x524f4f54, false); // 'ROOT'
    view.setUint32(4, 0, false);          // checksum cleared during calculation
    view.setUint32(8, 2, false);          // ownblock
    view.setUint16(12, 1, false);         // version
    view.setUint16(14, 1, false);         // sequencenumber
    view.setUint32(16, 100, false);       // datecreated
    view.setUint8(20, 1);                 // flags
    view.setUint32(44, 1048576, false);   // lastbyte
    view.setUint32(48, 2048, false);      // totalblocks
    view.setUint32(52, 512, false);       // blocksize
    view.setUint32(96, 4, false);         // bitmapbase
    view.setUint32(100, 8, false);        // adminspacecontainer
    view.setUint32(104, 12, false);       // rootobjectcontainer
    view.setUint32(108, 16, false);       // extentbnoderoot

    // Hand-calculated sum starting at 1:
    // 1 + 0x524f4f54 + 2 + 0x00010001 + 100 (0x64) + 0x01000000 + 0x00100000 + 2048 (0x800)
    // + 512 (0x200) + 4 + 8 + 12 (0xc) + 16 (0x10) = 0x536059e4
    // Negated: (0x100000000 - 0x536059e4) = 0xac9fa61c
    const checksum = calculateBlockChecksum(buffer, 512);
    expect(checksum).toBe(0xac9fa61c);
  });
});

describe('parseSfsRootBlock', () => {
  it('successfully parses a valid SFS root block generated with helper', () => {
    const buffer = createSfsRootBlockBuffer({
      blockSize: 512,
      totalBlocks: 4000,
      version: 1,
      sequenceNumber: 2,
      dateCreated: 50000000,
      flags: 0x01,
      bitmapBase: 10,
      adminSpaceContainer: 20,
      rootObjectContainer: 30,
      extentBnodeRoot: 40,
      ownBlock: 0,
      firstByte: 0n,
      lastByte: 2048000n,
    });

    const result = parseSfsRootBlock(buffer);

    expect(result.status).toBe('Valid');
    expect(result.checksumStatus).toBe('Valid');
    expect(result.isValid).toBe(true);
    expect(result.id).toBe(SFS_ROOT_MAGIC_STRING);
    expect(result.idHex).toBe('0x524f4f54');
    expect(result.isKnownMagic).toBe(true);
    expect(result.blockSize).toBe(512);
    expect(result.totalBlocks).toBe(4000);
    expect(result.version).toBe(1);
    expect(result.sequenceNumber).toBe(2);
    expect(result.dateCreatedRaw).toBe(50000000);
    expect(result.flags).toBe(0x01);
    expect(result.flagsHex).toBe('0x01');
    expect(result.flagsBinary).toBe('0b00000001');
    expect(result.bitmapBase).toBe(10);
    expect(result.adminSpaceContainer).toBe(20);
    expect(result.rootObjectContainer).toBe(30);
    expect(result.extentBnodeRoot).toBe(40);
    expect(result.ownBlock).toBe(0);
    expect(result.firstByte).toBe(0n);
    expect(result.lastByte).toBe(2048000n);
    expect(result.volumeSizeBytes).toBe(2048000n);
    expect(result.errorMessage).toBeNull();
  });

  it('parses and validates an independently specified on-disk SFS root block fixture', () => {
    // Construct independent binary fixture without using createSfsRootBlockBuffer
    const fixture = new Uint8Array(512);
    const view = new DataView(fixture.buffer);

    // 0x00: 'ROOT' (0x524f4f54)
    view.setUint32(0, 0x524f4f54, false);
    // 0x04: Independently derived checksum (0xac9fa61c)
    view.setUint32(4, 0xac9fa61c, false);
    // 0x08: ownblock = 2
    view.setUint32(8, 2, false);
    // 0x0C: version = 1, sequencenumber = 1
    view.setUint16(12, 1, false);
    view.setUint16(14, 1, false);
    // 0x10: datecreated = 100
    view.setUint32(16, 100, false);
    // 0x14: flags = 0x01
    view.setUint8(20, 0x01);
    // 0x24: firstbyte = 0
    view.setUint32(36, 0, false);
    // 0x2C: lastbyte = 1048576 (1 MB)
    view.setUint32(44, 1048576, false);
    // 0x30: totalblocks = 2048
    view.setUint32(48, 2048, false);
    // 0x34: blocksize = 512
    view.setUint32(52, 512, false);
    // 0x60: bitmapbase = 4
    view.setUint32(96, 4, false);
    // 0x64: adminspacecontainer = 8
    view.setUint32(100, 8, false);
    // 0x68: rootobjectcontainer = 12
    view.setUint32(104, 12, false);
    // 0x6C: extentbnoderoot = 16
    view.setUint32(108, 16, false);

    const result = parseSfsRootBlock(fixture.buffer);

    expect(result.status).toBe('Valid');
    expect(result.checksumStatus).toBe('Valid');
    expect(result.isValid).toBe(true);
    expect(result.id).toBe('ROOT');
    expect(result.idHex).toBe('0x524f4f54');
    expect(result.checksum).toBe(0xac9fa61c);
    expect(result.checksumHex).toBe('0xac9fa61c');
    expect(result.calculatedSum).toBe(0xffffffff);
    expect(result.ownBlock).toBe(2);
    expect(result.version).toBe(1);
    expect(result.sequenceNumber).toBe(1);
    expect(result.dateCreatedRaw).toBe(100);
    expect(result.flags).toBe(1);
    expect(result.totalBlocks).toBe(2048);
    expect(result.blockSize).toBe(512);
    expect(result.bitmapBase).toBe(4);
    expect(result.adminSpaceContainer).toBe(8);
    expect(result.rootObjectContainer).toBe(12);
    expect(result.extentBnodeRoot).toBe(16);
    expect(result.errorMessage).toBeNull();
  });

  it('detects checksum corruption in an independently specified on-disk fixture', () => {
    const fixture = new Uint8Array(512);
    const view = new DataView(fixture.buffer);
    view.setUint32(0, 0x524f4f54, false);
    view.setUint32(4, 0xac9fa61c, false);
    view.setUint32(48, 2048, false);
    view.setUint32(52, 512, false);

    // Corrupt one byte (e.g. at offset 8)
    view.setUint32(8, 0xdeadbeef, false);

    const result = parseSfsRootBlock(fixture.buffer);
    expect(result.checksumStatus).toBe('Invalid');
    expect(result.status).toBe('Invalid');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toMatch(/Checksum mismatch.*expected 0xffffffff/i);
  });

  it('rejects Amiga filesystem/DOS type (SFS\\0) as unknown root-block identifier', () => {
    // 0x53465300 is 'SFS\0' which is the Amiga partition DOS-type, NOT the root block ID 'ROOT'
    const buffer = createSfsRootBlockBuffer({
      magic: 0x53465300,
    });

    const result = parseSfsRootBlock(buffer);

    expect(result.status).toBe('Unknown');
    expect(result.checksumStatus).toBe('Unknown');
    expect(result.isValid).toBe(false);
    expect(result.isKnownMagic).toBe(false);
    expect(result.id).toBe('SFS\\0');
    expect(result.errorMessage).toMatch(
      /Unknown root block identifier: 0x53465300 \("SFS\\0"\)\. Expected ROOT \(0x524f4f54\)/i,
    );
  });

  it('detects a bad/corrupted checksum and reports Invalid', () => {
    const buffer = createSfsRootBlockBuffer({
      blockSize: 512,
      corruptChecksum: true,
    });

    const result = parseSfsRootBlock(buffer);

    expect(result.checksumStatus).toBe('Invalid');
    expect(result.status).toBe('Invalid');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toMatch(/Checksum mismatch/i);
    expect(result.id).toBe(SFS_ROOT_MAGIC_STRING);
  });

  it('treats wrong magic as Unknown', () => {
    const buffer = createSfsRootBlockBuffer({
      magic: 0x444f5300, // 'DOS\0'
    });

    const result = parseSfsRootBlock(buffer);

    expect(result.status).toBe('Unknown');
    expect(result.checksumStatus).toBe('Unknown');
    expect(result.isValid).toBe(false);
    expect(result.isKnownMagic).toBe(false);
    expect(result.errorMessage).toMatch(/Unknown root block identifier/i);
  });

  it('treats truncated input as Unknown', () => {
    // Only 64 bytes (less than MIN_ROOT_BLOCK_SIZE 128)
    const truncatedBuffer = new ArrayBuffer(64);
    const result = parseSfsRootBlock(truncatedBuffer);

    expect(result.status).toBe('Unknown');
    expect(result.checksumStatus).toBe('Unknown');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toMatch(/Truncated input/i);
  });

  it('treats non-power-of-two block size as Unknown', () => {
    const buffer = createSfsRootBlockBuffer({ blockSize: 512 });
    const view = new DataView(buffer);
    view.setUint32(52, 500, false); // Implausible non-power-of-two block size

    const result = parseSfsRootBlock(buffer);

    expect(result.status).toBe('Unknown');
    expect(result.checksumStatus).toBe('Unknown');
    expect(result.errorMessage).toMatch(/Implausible block size/i);
  });

  it('treats zero total blocks as Unknown', () => {
    const buffer = createSfsRootBlockBuffer({ blockSize: 512, totalBlocks: 0 });
    const view = new DataView(buffer);
    view.setUint32(48, 0, false); // Zero block count

    const result = parseSfsRootBlock(buffer);

    expect(result.status).toBe('Unknown');
    expect(result.checksumStatus).toBe('Unknown');
    expect(result.errorMessage).toMatch(/Implausible block count/i);
  });

  it('treats buffer smaller than declared block size as Unknown', () => {
    // Declared block size 1024, but buffer is only 512 bytes
    const buffer = createSfsRootBlockBuffer({ blockSize: 512 });
    const view = new DataView(buffer);
    view.setUint32(52, 1024, false); // Block size says 1024, but buffer is only 512

    const result = parseSfsRootBlock(buffer);

    expect(result.status).toBe('Unknown');
    expect(result.checksumStatus).toBe('Unknown');
    expect(result.errorMessage).toMatch(/Truncated block/i);
  });

  it('handles null or undefined input gracefully without throwing', () => {
    expect(() => parseSfsRootBlock(null)).not.toThrow();
    expect(parseSfsRootBlock(null).status).toBe('Unknown');
    expect(() => parseSfsRootBlock(undefined)).not.toThrow();
    expect(parseSfsRootBlock(undefined).status).toBe('Unknown');
    expect(() => parseSfsRootBlock('invalid-type')).not.toThrow();
    expect(parseSfsRootBlock('invalid-type').status).toBe('Unknown');
  });
});

describe('readRootBlockFromBlob', () => {
  it('reads only the first 4096 bytes via File.slice', async () => {
    const fullSize = 100000; // 100 KB mock file
    const rootBlock = createSfsRootBlockBuffer({ blockSize: 512, totalBlocks: 1000 });
    const fullData = new Uint8Array(fullSize);
    fullData.set(new Uint8Array(rootBlock), 0);

    const mockSlice = vi.fn().mockImplementation((start, end) => {
      const sliceBytes = fullData.slice(start, end);
      return new Blob([sliceBytes]);
    });

    const mockFile = {
      size: fullSize,
      slice: mockSlice,
    };

    const result = await readRootBlockFromBlob(mockFile);

    expect(mockSlice).toHaveBeenCalledWith(0, 4096);
    expect(result.status).toBe('Valid');
    expect(result.checksumStatus).toBe('Valid');
    expect(result.blockSize).toBe(512);
  });

  it('throws TypeError if argument is not a Blob/File', async () => {
    await expect(readRootBlockFromBlob(null)).rejects.toThrow(TypeError);
    await expect(readRootBlockFromBlob({})).rejects.toThrow(TypeError);
  });
});
