import { describe, expect, it, vi } from 'vitest';
import {
  createBadChecksumSample,
  createCyclicSample,
  createNoRdskSample,
  createTruncatedSample,
  createValidSample,
  formatDosType,
  formatPartitionFlags,
  formatRdskFlags,
  parseRdb,
  readRdbSlice,
} from './amigaRdb.utils.js';

describe('formatDosType', () => {
  it('formats standard Amiga FastFileSystem DOS\\3', () => {
    expect(formatDosType(0x444f5303)).toBe('DOS\\3 (0x444F5303)');
  });

  it('formats standard Amiga DOS\\1', () => {
    expect(formatDosType(0x444f5301)).toBe('DOS\\1 (0x444F5301)');
  });

  it('formats SmartFileSystem SFS\\0', () => {
    expect(formatDosType(0x53465300)).toBe('SFS\\0 (0x53465300)');
  });

  it('handles invalid numbers safely', () => {
    expect(formatDosType(NaN)).toBe('Unknown');
    expect(formatDosType(undefined)).toBe('Unknown');
  });
});

describe('formatPartitionFlags and formatRdskFlags', () => {
  it('formats partition bootable and nomount flags', () => {
    expect(formatPartitionFlags(0x01)).toBe('0x00000001 (Bootable)');
    expect(formatPartitionFlags(0x02)).toBe('0x00000002 (NoMount)');
    expect(formatPartitionFlags(0x03)).toBe('0x00000003 (Bootable, NoMount)');
    expect(formatPartitionFlags(0x00)).toBe('0x00000000');
  });

  it('formats RDSK flags', () => {
    expect(formatRdskFlags(0x12)).toBe('0x00000012 (LASTLUN, DISKID)');
    expect(formatRdskFlags(0x00)).toBe('0x00000000');
  });
});

describe('readRdbSlice', () => {
  it('slices only the first 16 blocks (8192 bytes) of a file', async () => {
    const hugeBuffer = new Uint8Array(65536);
    hugeBuffer[0] = 0x52; // 'R'
    hugeBuffer[8191] = 0x77;
    hugeBuffer[8192] = 0x88; // Should be excluded by slice

    const mockFile = new File([hugeBuffer], 'amiga.hdf');
    const sliceSpy = vi.spyOn(mockFile, 'slice');

    const result = await readRdbSlice(mockFile);

    expect(sliceSpy).toHaveBeenCalledWith(0, 8192);
    expect(result.byteLength).toBe(8192);
    expect(result[0]).toBe(0x52);
    expect(result[8191]).toBe(0x77);
  });

  it('throws TypeError for invalid file objects', async () => {
    await expect(readRdbSlice(null)).rejects.toThrow(TypeError);
    await expect(readRdbSlice({})).rejects.toThrow(TypeError);
  });
});

describe('parseRdb with hand-calculated fixtures', () => {
  it('parses a valid RDB with two partitions and verified checksums', () => {
    // Valid fixture hand-calculated values:
    // RDSK sum without chksum = 0xF1F91570 -> ChkSum = 0x0E06EA90
    // PART 1 (DH0) sum without chksum = 0x18D4EF72 -> ChkSum = 0xE72B108E
    // PART 2 (DH1) sum without chksum = 0x18D4F34E -> ChkSum = 0xE72B0CB2
    const sample = createValidSample();
    const result = parseRdb(sample);

    expect(result.status).toBe('Valid');
    expect(result.checksumStatus).toBe('Valid');
    expect(result.diagnostic).toBeNull();

    // Check RDSK details
    expect(result.rdsk).not.toBeNull();
    expect(result.rdsk.blockIndex).toBe(0);
    expect(result.rdsk.blockSize).toBe(512);
    expect(result.rdsk.cylinders).toBe(1000);
    expect(result.rdsk.sectors).toBe(32);
    expect(result.rdsk.heads).toBe(4);
    expect(result.rdsk.vendor).toBe('QUANTUM');
    expect(result.rdsk.product).toBe('FIREBALL 1.0');
    expect(result.rdsk.revision).toBe('1.00');
    expect(result.rdsk.chkSum).toBe(0x0e06ea90);
    expect(result.rdsk.checksumStatus).toBe('Valid');

    // Check pointers
    expect(result.rdsk.partitionList).toBe(1);
    expect(result.rdsk.fileSysHeaderList).toBe(0xffffffff);
    expect(result.rdsk.badBlockList).toBe(0xffffffff);

    // Check partitions
    expect(result.partitions).toHaveLength(2);

    const part1 = result.partitions[0];
    expect(part1.blockNumber).toBe(1);
    expect(part1.driveName).toBe('DH0');
    expect(part1.dosType).toBe('DOS\\3 (0x444F5303)');
    expect(part1.lowCyl).toBe(2);
    expect(part1.highCyl).toBe(199);
    expect(part1.flags).toBe(1);
    expect(part1.flagsFormatted).toBe('0x00000001 (Bootable)');
    expect(part1.checksumStatus).toBe('Valid');

    const part2 = result.partitions[1];
    expect(part2.blockNumber).toBe(2);
    expect(part2.driveName).toBe('DH1');
    expect(part2.dosType).toBe('DOS\\1 (0x444F5301)');
    expect(part2.lowCyl).toBe(200);
    expect(part2.highCyl).toBe(999);
    expect(part2.flags).toBe(0);
    expect(part2.flagsFormatted).toBe('0x00000000');
    expect(part2.checksumStatus).toBe('Valid');
  });

  it('detects a bad checksum in the RDSK block', () => {
    const sample = createBadChecksumSample();
    const result = parseRdb(sample);

    expect(result.status).toBe('Invalid');
    expect(result.checksumStatus).toBe('Invalid');
    expect(result.diagnostic).toMatch(/Checksum mismatch/i);
    expect(result.rdsk.checksumStatus).toBe('Invalid');
  });

  it('handles wrong magic / absence of RDSK block in the first 16 blocks', () => {
    const sample = createNoRdskSample();
    const result = parseRdb(sample);

    expect(result.status).toBe('Unknown');
    expect(result.checksumStatus).toBe('Unknown');
    expect(result.diagnostic).toBe('RDSK magic (0x5244534B) not found in the first 16 blocks.');
    expect(result.rdsk).toBeNull();
    expect(result.partitions).toHaveLength(0);
  });

  it('handles a truncated buffer (< 512 bytes) safely without throwing', () => {
    const sample = createTruncatedSample();
    const result = parseRdb(sample);

    expect(result.status).toBe('Unknown');
    expect(result.checksumStatus).toBe('Unknown');
    expect(result.diagnostic).toBe('Truncated buffer: expected at least 512 bytes, got 128.');
    expect(result.rdsk).toBeNull();
    expect(result.partitions).toHaveLength(0);
  });

  it('detects cyclic PART chain and reports Unknown status with diagnostic', () => {
    const sample = createCyclicSample();
    const result = parseRdb(sample);

    expect(result.status).toBe('Unknown');
    expect(result.diagnostic).toBe('Cyclic PART chain detected: block 1 was already visited.');
    // Visited partition blocks 1 and 2 before detecting cycle back to block 1
    expect(result.partitions).toHaveLength(2);
  });

  it('handles out-of-range partition pointers gracefully', () => {
    const sample = createValidSample();
    const view = new DataView(sample.buffer);
    // Point partition list to block 25 (out of range since sample has only 16 blocks)
    view.setUint32(28, 25);
    // Recalculate RDSK checksum: diff = 25 - 1 = 24 -> ChkSum decreases by 24
    view.setUint32(8, 0x0e06ea90 - 24);

    const result = parseRdb(sample);
    expect(result.status).toBe('Unknown');
    expect(result.diagnostic).toMatch(/pointer 25 is out of range or truncated/i);
    expect(result.partitions).toHaveLength(0);
  });

  it('never throws when passed null or invalid input', () => {
    expect(() => parseRdb(null)).not.toThrow();
    expect(() => parseRdb(new Uint8Array(0))).not.toThrow();
    expect(() => parseRdb(new Uint8Array(100))).not.toThrow();
    const result = parseRdb(null);
    expect(result.status).toBe('Unknown');
    expect(result.diagnostic).toBe('No disk image data provided.');
  });
});
