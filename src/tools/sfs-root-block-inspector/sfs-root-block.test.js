import { describe, expect, it, vi } from 'vitest';
import {
  calculateBlockChecksum,
  createSfsRootBlockBuffer,
  formatAmigaDate,
  formatBytes,
  isPowerOfTwo,
  parseSfsRootBlock,
  readRootBlockFromBlob,
  SFS_MAGIC,
  SFS_MAGIC_STRING,
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
  it('produces a checksum whose longword sum equals 0', () => {
    const buffer = new ArrayBuffer(512);
    const view = new DataView(buffer);
    view.setUint32(0, SFS_MAGIC, false);
    view.setUint32(52, 512, false);

    const checksum = calculateBlockChecksum(buffer, 512);
    view.setUint32(4, checksum, false);

    let sum = 0;
    for (let i = 0; i < 512; i += 4) {
      sum = (sum + view.getUint32(i, false)) >>> 0;
    }
    expect(sum).toBe(0);
  });
});

describe('parseSfsRootBlock', () => {
  it('successfully parses a valid SFS root block', () => {
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
    expect(result.id).toBe(SFS_MAGIC_STRING);
    expect(result.idHex).toBe('0x53465300');
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
    expect(result.id).toBe(SFS_MAGIC_STRING);
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
    expect(result.errorMessage).toMatch(/Unknown magic identifier/i);
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
