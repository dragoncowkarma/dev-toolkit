import { describe, expect, it, vi } from 'vitest';
import {
  buildSampleSuperblock,
  bytesToHex,
  formatBytes,
  hexToBytes,
  parseReiserfsSuperblock,
  readFileSlice,
  REISERFS_DEFAULT_OFFSET,
  SAMPLE_CORRUPT_HEX,
  SAMPLE_RELOCATED_35_HEX,
  SAMPLE_RELOCATED_36_HEX,
  SAMPLE_RELOCATED_HEX,
  SAMPLE_RELOCATED_UNKNOWN_HEX,
  SAMPLE_VALID_35_HEX,
  SAMPLE_VALID_36_HEX,
} from './reiserfs-superblock-inspector.utils.js';

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats byte counts under 1 KiB', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats KiB and MiB sizes', () => {
    expect(formatBytes(2048)).toBe('2.00 KiB');
    expect(formatBytes(1048576)).toBe('1.00 MiB');
  });

  it('formats GiB sizes with BigInt input', () => {
    expect(formatBytes(1073741824n)).toBe('1.00 GiB');
  });
});

describe('hexToBytes', () => {
  it('parses valid spaced and continuous hex strings', () => {
    const bytes1 = hexToBytes('01 02 0a ff');
    expect([...bytes1]).toEqual([1, 2, 10, 255]);

    const bytes2 = hexToBytes('01020AFF');
    expect([...bytes2]).toEqual([1, 2, 10, 255]);
  });

  it('handles 0x prefixes and colons or hyphens', () => {
    const bytes = hexToBytes('0x01:0x02-0x03');
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it('returns empty array for empty or whitespace-only string', () => {
    expect(hexToBytes('')).toHaveLength(0);
    expect(hexToBytes('   \n\t ')).toHaveLength(0);
  });

  it('throws for non-string input', () => {
    expect(() => hexToBytes(123)).toThrow(TypeError);
  });

  it('throws on non-hexadecimal characters', () => {
    expect(() => hexToBytes('01020g')).toThrow(/non-hexadecimal character/);
    expect(() => hexToBytes('hello world')).toThrow(/non-hexadecimal character/);
  });

  it('throws on odd number of hex digits', () => {
    expect(() => hexToBytes('123')).toThrow(/odd number of digits/);
  });
});

describe('bytesToHex', () => {
  it('converts Uint8Array to space-separated hex string', () => {
    const bytes = new Uint8Array([0, 15, 16, 255]);
    expect(bytesToHex(bytes)).toBe('00 0f 10 ff');
  });

  it('returns empty string for non-Uint8Array inputs', () => {
    expect(bytesToHex(null)).toBe('');
    expect(bytesToHex(undefined)).toBe('');
    expect(bytesToHex([1, 2])).toBe('');
  });
});

describe('parseReiserfsSuperblock', () => {
  it('parses a valid ReiserFS 3.6 superblock without diagnostics', () => {
    const buffer = buildSampleSuperblock({
      magic: 'ReIsEr2Fs',
      hashFunctionCode: 3,
      version: 2,
      blockCount: 262144,
      freeBlocks: 196608,
      blockSize: 4096,
      rootBlock: 8211,
      journal1stBlock: 18,
      journalDev: 0,
      journalSize: 8193,
      journalTransMax: 1024,
      maxTransAge: 30,
    });

    const result = parseReiserfsSuperblock(buffer, 0);

    expect(result.success).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.superblock).not.toBeNull();
    expect(result.superblock.magic).toBe('ReIsEr2Fs');
    expect(result.superblock.formatDescription).toBe('3.6 format');
    expect(result.superblock.hashFunctionCode).toBe(3);
    expect(result.superblock.hashFunctionName).toBe('R5');
    expect(result.superblock.version).toBe(2);
    expect(result.superblock.versionDescription).toBe('ReiserFS 3.6 (version 2)');
    expect(result.superblock.blockCount).toBe(262144);
    expect(result.superblock.freeBlocks).toBe(196608);
    expect(result.superblock.rootBlock).toBe(8211);
    expect(result.superblock.journal1stBlock).toBe(18);
    expect(result.superblock.journalSize).toBe(8193);
    expect(result.superblock.journalTransMax).toBe(1024);
    expect(result.superblock.maxTransAge).toBe(30);

    expect(result.derived.volumeSizeFormatted).toBe('1.00 GiB');
    expect(result.derived.freeSpaceFormatted).toBe('768.00 MiB');
    expect(result.derived.usedSpaceFormatted).toBe('256.00 MiB');
    expect(result.derived.usagePercentage).toBe(25);
    expect(result.derived.usagePercentageFormatted).toBe('25.00%');
  });

  it('parses a valid ReiserFS 3.5 superblock with Yura hash', () => {
    const buffer = buildSampleSuperblock({
      magic: 'ReIsErFs',
      hashFunctionCode: 2,
      version: 1,
      blockCount: 131072,
      freeBlocks: 98304,
      blockSize: 4096,
    });

    const result = parseReiserfsSuperblock(buffer, 0);

    expect(result.success).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.superblock.magic).toBe('ReIsErFs');
    expect(result.superblock.formatDescription).toBe('3.5 format');
    expect(result.superblock.hashFunctionName).toBe('Yura');
    expect(result.superblock.versionDescription).toBe('ReiserFS 3.5 (version 1)');
  });

  it('parses a ReiserFS superblock with journal-relocated magic (ReIsEr3Fs) version 2 as 3.6', () => {
    const buffer = buildSampleSuperblock({
      magic: 'ReIsEr3Fs',
      hashFunctionCode: 3,
      version: 2,
    });

    const result = parseReiserfsSuperblock(buffer, 0);

    expect(result.success).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.superblock.magic).toBe('ReIsEr3Fs');
    expect(result.superblock.formatDescription).toBe('ReiserFS 3.6 (journal relocated)');
    expect(result.superblock.versionDescription).toBe('ReiserFS 3.6 (version 2)');
  });

  it('parses a ReiserFS superblock with journal-relocated magic (ReIsEr3Fs) version 1 as 3.5', () => {
    const buffer = buildSampleSuperblock({
      magic: 'ReIsEr3Fs',
      hashFunctionCode: 2,
      version: 1,
    });

    const result = parseReiserfsSuperblock(buffer, 0);

    expect(result.success).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.superblock.magic).toBe('ReIsEr3Fs');
    expect(result.superblock.formatDescription).toBe('ReiserFS 3.5 (journal relocated)');
    expect(result.superblock.versionDescription).toBe('ReiserFS 3.5 (version 1)');
  });

  it('parses a ReiserFS superblock with journal-relocated magic (ReIsEr3Fs) and unknown version', () => {
    const buffer = buildSampleSuperblock({
      magic: 'ReIsEr3Fs',
      hashFunctionCode: 3,
      version: 0,
    });

    const result = parseReiserfsSuperblock(buffer, 0);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContain(
      'Unknown ReiserFS version 0 for relocated journal magic "ReIsEr3Fs". Expected 1 (3.5) or 2 (3.6).'
    );
    expect(result.superblock.magic).toBe('ReIsEr3Fs');
    expect(result.superblock.formatDescription).toBe('ReiserFS unknown version 0 (journal relocated)');
    expect(result.superblock.versionDescription).toBe('Version 0');
  });

  it('maps Unset and Tea hash function codes properly', () => {
    const unsetBuf = buildSampleSuperblock({ hashFunctionCode: 0 });
    const unsetResult = parseReiserfsSuperblock(unsetBuf, 0);
    expect(unsetResult.superblock.hashFunctionName).toBe('Unset');

    const teaBuf = buildSampleSuperblock({ hashFunctionCode: 1 });
    const teaResult = parseReiserfsSuperblock(teaBuf, 0);
    expect(teaResult.superblock.hashFunctionName).toBe('Tea');
  });

  it('emits diagnostic for bad magic string without crashing', () => {
    const buffer = buildSampleSuperblock({ magic: 'BADMAGIC!' });
    const result = parseReiserfsSuperblock(buffer, 0);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContain(
      'Invalid magic string "BADMAGIC!". Expected "ReIsErFs", "ReIsEr2Fs", or "ReIsEr3Fs".'
    );
    expect(result.superblock.magic).toBe('BADMAGIC!');
  });

  it('emits diagnostic for invalid block size (not power of two in [512, 8192])', () => {
    const notPowerOfTwo = buildSampleSuperblock({ blockSize: 3000 });
    const res1 = parseReiserfsSuperblock(notPowerOfTwo, 0);
    expect(res1.diagnostics.some((d) => d.includes('Invalid block size: 3000 bytes'))).toBe(true);

    const tooSmall = buildSampleSuperblock({ blockSize: 256 });
    const res2 = parseReiserfsSuperblock(tooSmall, 0);
    expect(res2.diagnostics.some((d) => d.includes('Invalid block size: 256 bytes'))).toBe(true);

    const tooLarge = buildSampleSuperblock({ blockSize: 16384 });
    const res3 = parseReiserfsSuperblock(tooLarge, 0);
    expect(res3.diagnostics.some((d) => d.includes('Invalid block size: 16384 bytes'))).toBe(true);
  });

  it('emits diagnostic when free blocks exceed total block count', () => {
    const buffer = buildSampleSuperblock({ blockCount: 1000, freeBlocks: 5000 });
    const result = parseReiserfsSuperblock(buffer, 0);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContain(
      'Free blocks (5000) cannot exceed total block count (1000).'
    );
  });

  it('emits diagnostic for unknown hash function code', () => {
    const buffer = buildSampleSuperblock({ hashFunctionCode: 99 });
    const result = parseReiserfsSuperblock(buffer, 0);

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.includes('Unknown hash function code: 99'))).toBe(true);
    expect(result.superblock.hashFunctionName).toBe('Unknown (99)');
  });

  it('emits diagnostic for truncated input without crashing', () => {
    const truncated = new Uint8Array(50);
    const result = parseReiserfsSuperblock(truncated, 0);

    expect(result.success).toBe(false);
    expect(result.superblock).toBeNull();
    expect(result.derived).toBeNull();
    expect(result.diagnostics[0]).toContain('Truncated input: expected at least 76 bytes');
  });

  it('parses superblock at the default 64 KiB offset (65536)', () => {
    const fullDiskBuffer = new Uint8Array(REISERFS_DEFAULT_OFFSET + 128);
    const sbBytes = buildSampleSuperblock({
      magic: 'ReIsEr2Fs',
      blockCount: 50000,
      freeBlocks: 20000,
    });
    fullDiskBuffer.set(sbBytes, REISERFS_DEFAULT_OFFSET);

    const result = parseReiserfsSuperblock(fullDiskBuffer, REISERFS_DEFAULT_OFFSET);
    expect(result.success).toBe(true);
    expect(result.superblock.blockCount).toBe(50000);
    expect(result.superblock.freeBlocks).toBe(20000);
    expect(result.superblock.magic).toBe('ReIsEr2Fs');
  });

  it('returns diagnostic for non-buffer input', () => {
    const result = parseReiserfsSuperblock('not-a-buffer', 0);
    expect(result.success).toBe(false);
    expect(result.diagnostics[0]).toContain('expected a Uint8Array or ArrayBuffer');
  });

  it('parses sample hex exports correctly', () => {
    const res36 = parseReiserfsSuperblock(hexToBytes(SAMPLE_VALID_36_HEX), 0);
    expect(res36.success).toBe(true);
    expect(res36.superblock.magic).toBe('ReIsEr2Fs');

    const res35 = parseReiserfsSuperblock(hexToBytes(SAMPLE_VALID_35_HEX), 0);
    expect(res35.success).toBe(true);
    expect(res35.superblock.magic).toBe('ReIsErFs');

    const resReloc = parseReiserfsSuperblock(hexToBytes(SAMPLE_RELOCATED_HEX), 0);
    expect(resReloc.success).toBe(true);
    expect(resReloc.superblock.magic).toBe('ReIsEr3Fs');
    expect(resReloc.superblock.formatDescription).toBe('ReiserFS 3.6 (journal relocated)');

    const resReloc35 = parseReiserfsSuperblock(hexToBytes(SAMPLE_RELOCATED_35_HEX), 0);
    expect(resReloc35.success).toBe(true);
    expect(resReloc35.superblock.magic).toBe('ReIsEr3Fs');
    expect(resReloc35.superblock.formatDescription).toBe('ReiserFS 3.5 (journal relocated)');

    const resRelocUnk = parseReiserfsSuperblock(hexToBytes(SAMPLE_RELOCATED_UNKNOWN_HEX), 0);
    expect(resRelocUnk.success).toBe(false);
    expect(resRelocUnk.superblock.magic).toBe('ReIsEr3Fs');
    expect(resRelocUnk.superblock.formatDescription).toBe('ReiserFS unknown version 3 (journal relocated)');
    expect(resRelocUnk.diagnostics[0]).toContain('Unknown ReiserFS version 3 for relocated journal magic');

    const resCorrupt = parseReiserfsSuperblock(hexToBytes(SAMPLE_CORRUPT_HEX), 0);
    expect(resCorrupt.success).toBe(false);
    expect(resCorrupt.diagnostics.length).toBeGreaterThanOrEqual(4);
  });
});

describe('readFileSlice', () => {
  it('reads a bounded slice of a file', async () => {
    const fullData = new Uint8Array(1024);
    fullData[100] = 42;
    fullData[101] = 99;
    const file = new File([fullData], 'test.img');

    const slice = await readFileSlice(file, 100, 10);
    expect(slice).toHaveLength(10);
    expect(slice[0]).toBe(42);
    expect(slice[1]).toBe(99);
  });

  it('rejects for invalid file object', async () => {
    await expect(readFileSlice(null, 0)).rejects.toThrow('Invalid file object');
  });

  it('rejects when FileReader triggers an error', async () => {
    const failingReader = {
      readAsArrayBuffer: vi.fn(function () {
        this.onerror(new Error('Read failed'));
      }),
    };
    const OriginalFileReader = global.FileReader;
    global.FileReader = vi.fn(function () {
      return failingReader;
    });

    const file = new File(['data'], 'test.bin');
    await expect(readFileSlice(file, 0)).rejects.toThrow('Failed to read file slice.');

    global.FileReader = OriginalFileReader;
  });
});
