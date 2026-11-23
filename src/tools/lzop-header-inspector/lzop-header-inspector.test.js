import { describe, expect, it } from 'vitest';
import {
  buildLzopHeader,
  bytesToHex,
  computeAdler32,
  computeCrc32,
  formatFileSize,
  formatMode,
  formatTimestamp,
  formatVersion,
  hexToBytes,
  LZOP_MAGIC,
  parseFlags,
  parseLzopHeader,
  readHeaderSlice,
} from './lzop-header-inspector.utils.js';

describe('computeAdler32 and computeCrc32', () => {
  it('computes known Adler-32 and CRC-32 checksums', () => {
    const data = new TextEncoder().encode('hello world');
    expect(computeAdler32(data)).toBe(0x1a0b045d);
    expect(computeCrc32(data)).toBe(0x0d4a1185);
  });
});

describe('format helpers', () => {
  it('formats versions properly', () => {
    expect(formatVersion(0x1030)).toBe('1.03 (0x1030)');
    expect(formatVersion(0x0940)).toBe('0.94 (0x0940)');
    expect(formatVersion(0x2080)).toBe('2.08 (0x2080)');
    expect(formatVersion('invalid')).toBe('0.00');
  });

  it('formats file sizes in B, KB, MB, GB', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatFileSize(-1)).toBe('0 B');
  });

  it('formats POSIX file mode', () => {
    expect(formatMode(0)).toBe('0 (None / STDIN)');
    expect(formatMode(0o100644)).toContain('-rw-r--r--');
    expect(formatMode(0o040755)).toContain('drwxr-xr-x');
    expect(formatMode('not-a-number')).toBe('Unknown');
  });

  it('formats timestamps', () => {
    expect(formatTimestamp(0)).toBe('Not set (0)');
    expect(formatTimestamp(1700000000)).toBe(new Date(1700000000 * 1000).toISOString());
    expect(formatTimestamp(1700000000n)).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('converts between hex and bytes', () => {
    const hex = '89 4C 5A 4F';
    const bytes = hexToBytes(hex);
    expect(bytes).toEqual(new Uint8Array([0x89, 0x4c, 0x5a, 0x4f]));
    expect(bytesToHex(bytes)).toBe('89 4C 5A 4F');
    expect(hexToBytes('')).toEqual(new Uint8Array(0));
    expect(() => hexToBytes(123)).toThrow(TypeError);
    expect(() => hexToBytes('abc')).toThrow(/odd number of nibbles/);
  });
});

describe('parseFlags', () => {
  it('identifies OS and Charset from flags', () => {
    // OS Unix = 0x03000000, Charset UTF-8 = 0x00500000, F_H_CRC32 = 0x00001000
    const flags = 0x03501000;
    const parsed = parseFlags(flags);
    expect(parsed.osName).toBe('Unix');
    expect(parsed.charsetName).toBe('UTF-8');
    expect(parsed.booleanFlags.headerCrc32).toBe(true);
    expect(parsed.activeFlagsList).toContain('F_H_CRC32 (CRC-32 header checksum)');
  });

  it('handles unknown OS and charsets', () => {
    const flags = 0xfe000000;
    const parsed = parseFlags(flags);
    expect(parsed.osName).toBe('Unknown OS (254)');
  });
});

describe('parseLzopHeader valid cases', () => {
  it('parses a standard valid LZOP header with Adler-32 checksum', () => {
    const sample = buildLzopHeader({
      version: 0x1030,
      libVersion: 0x2080,
      extractVersion: 0x0940,
      method: 1,
      level: 3,
      flags: 0x03000000, // Unix
      mode: 0o100644,
      mtimeLow: 1700000000,
      mtimeHigh: 0,
      fileName: 'test.txt',
      useCrc32: false,
    });

    const parsed = parseLzopHeader(sample);
    expect(parsed.magic.valid).toBe(true);
    expect(parsed.version.raw).toBe(0x1030);
    expect(parsed.version.formatted).toBe('1.03 (0x1030)');
    expect(parsed.libVersion.raw).toBe(0x2080);
    expect(parsed.versionNeededToExtract.raw).toBe(0x0940);
    expect(parsed.method.name).toBe('LZO1X-1');
    expect(parsed.level.raw).toBe(3);
    expect(parsed.fileName.name).toBe('test.txt');
    expect(parsed.checksum.type).toBe('Adler32');
    expect(parsed.checksum.valid).toBe(true);
    expect(parsed.filter).toBeNull();
    expect(parsed.extraField).toBeNull();
  });

  it('parses a valid LZOP header with CRC-32 checksum (F_H_CRC32)', () => {
    const sample = buildLzopHeader({
      version: 0x1030,
      useCrc32: true,
      fileName: 'crc32_file.bin',
    });

    const parsed = parseLzopHeader(sample);
    expect(parsed.checksum.type).toBe('CRC32');
    expect(parsed.checksum.valid).toBe(true);
    expect(parsed.flags.booleanFlags.headerCrc32).toBe(true);
  });

  it('parses a header with filter (F_H_FILTER)', () => {
    const sample = buildLzopHeader({
      filter: 0x12345678,
      fileName: 'filtered.dat',
    });

    const parsed = parseLzopHeader(sample);
    expect(parsed.flags.booleanFlags.hasFilter).toBe(true);
    expect(parsed.filter).toEqual({
      raw: 0x12345678,
      hex: '0x12345678',
    });
  });

  it('parses a header with extra field (F_H_EXTRA_FIELD)', () => {
    const extraData = new TextEncoder().encode('custom-extra-data');
    const sample = buildLzopHeader({
      extraFieldData: extraData,
      fileName: 'with_extra.txt',
    });

    const parsed = parseLzopHeader(sample);
    expect(parsed.flags.booleanFlags.extraField).toBe(true);
    expect(parsed.extraField).not.toBeNull();
    expect(parsed.extraField.length).toBe(extraData.length);
    expect(parsed.extraField.valid).toBe(true);
  });

  it('parses an older LZOP header (version < 0x0940)', () => {
    const sample = buildLzopHeader({
      version: 0x0930,
      libVersion: 0x1080,
      method: 1,
      fileName: 'old.log',
    });

    const parsed = parseLzopHeader(sample);
    expect(parsed.version.raw).toBe(0x0930);
    expect(parsed.versionNeededToExtract.raw).toBe(0x0900);
    expect(parsed.level.raw).toBe(3); // default for method 1
    expect(parsed.fileName.name).toBe('old.log');
    expect(parsed.checksum.valid).toBe(true);
  });

  it('accepts hex string and ArrayBuffer input', () => {
    const sample = buildLzopHeader({ fileName: 'input_variants.txt' });
    const hex = bytesToHex(sample);
    const parsedFromHex = parseLzopHeader(hex);
    expect(parsedFromHex.fileName.name).toBe('input_variants.txt');

    const parsedFromBuffer = parseLzopHeader(sample.buffer);
    expect(parsedFromBuffer.fileName.name).toBe('input_variants.txt');
  });

  it('handles Latin-1 charset encoding for filename', () => {
    // Charset Latin-1 is 0x00100000
    const sample = buildLzopHeader({
      flags: 0x03100000,
      fileName: 'café.txt',
    });
    const parsed = parseLzopHeader(sample);
    expect(parsed.flags.charsetId).toBe(1);
    expect(parsed.fileName.name).toBe('café.txt');
  });
});

describe('parseLzopHeader error cases', () => {
  it('throws for bad magic sequence', () => {
    const badMagic = new Uint8Array([
      0x89, 0x4c, 0x5a, 0x00, 0x00, 0x0d, 0x0a, 0x1a, 0x0a, 0x10, 0x30,
    ]);
    expect(() => parseLzopHeader(badMagic)).toThrow(/Invalid LZOP magic signature/);
  });

  it('throws when input is less than 9 bytes', () => {
    const truncated = new Uint8Array([0x89, 0x4c, 0x5a]);
    expect(() => parseLzopHeader(truncated)).toThrow(/Truncated LZOP header/);
  });

  it('throws on truncated header at various field boundaries', () => {
    const valid = buildLzopHeader({ fileName: 'test.txt' });

    // Truncated at version
    expect(() => parseLzopHeader(valid.slice(0, 10))).toThrow(/Truncated LZOP header/);
    // Truncated at flags
    expect(() => parseLzopHeader(valid.slice(0, 16))).toThrow(/Truncated LZOP header/);
    // Truncated at filename
    expect(() => parseLzopHeader(valid.slice(0, 36))).toThrow(/Truncated LZOP header/);
    // Truncated at header checksum
    const cutBeforeChecksum = valid.slice(0, valid.length - 2);
    expect(() => parseLzopHeader(cutBeforeChecksum)).toThrow(/Truncated LZOP header/);
  });

  it('throws for unsupported versions older than 0.90', () => {
    const oldHeader = buildLzopHeader({ version: 0x0890 });
    expect(() => parseLzopHeader(oldHeader)).toThrow(
      /Unsupported LZOP version: 0x0890/
    );
  });

  it('throws for unsupported extract version older than 0.90', () => {
    const badExtract = buildLzopHeader({ extractVersion: 0x0850 });
    expect(() => parseLzopHeader(badExtract)).toThrow(/Unsupported extract version: 0x0850/);
  });

  it('throws for invalid compression method 0', () => {
    const badMethod = buildLzopHeader({ method: 0 });
    expect(() => parseLzopHeader(badMethod)).toThrow(/Invalid compression method: 0/);
  });

  it('throws on header checksum mismatch when data is corrupted', () => {
    const valid = buildLzopHeader({ fileName: 'test.txt' });
    const corrupted = new Uint8Array(valid);
    // Tamper with the mode byte
    corrupted[22] ^= 0xff;
    expect(() => parseLzopHeader(corrupted)).toThrow(/Header checksum mismatch/);
  });

  it('throws on extra field checksum mismatch when corrupted', () => {
    const valid = buildLzopHeader({ extraFieldData: new Uint8Array([1, 2, 3, 4]) });
    const corrupted = new Uint8Array(valid);
    // Tamper with extra field data byte
    corrupted[corrupted.length - 5] ^= 0xff;
    expect(() => parseLzopHeader(corrupted)).toThrow(/Extra field checksum mismatch/);
  });

  it('throws TypeError for invalid input type', () => {
    expect(() => parseLzopHeader(12345)).toThrow(TypeError);
    expect(() => parseLzopHeader(null)).toThrow(TypeError);
  });
});

describe('readHeaderSlice', () => {
  it('reads only the specified header slice from a File', async () => {
    const fullContent = new Uint8Array(1000);
    fullContent.set(LZOP_MAGIC, 0);
    const file = new File([fullContent], 'test.lzo', { type: 'application/octet-stream' });

    const slice = await readHeaderSlice(file, 64);
    expect(slice.length).toBe(64);
    expect(slice.slice(0, 9)).toEqual(LZOP_MAGIC);
  });

  it('rejects if no file is provided', async () => {
    await expect(readHeaderSlice(null)).rejects.toThrow('No file provided.');
  });
});
