import { describe, expect, it } from 'vitest';
import {
  ByteReader,
  VMDK_GD_AT_END,
  VMDK_HEADER_SIZE,
  VMDK_MAGIC_ASCII,
  VMDK_MAGIC_NUMBER,
  buildSampleVmdkHeader,
  bytesToBase64,
  bytesToHex,
  decodeBase64ToBytes,
  decodeHexToBytes,
  formatByteSize,
  formatHeaderSummary,
  formatHex,
  inspectVmdkText,
  parseVmdkHeader,
  readHeaderBytesFromFile,
} from './vmdkHeaderInspector.utils.js';

describe('ByteReader', () => {
  it('reads little-endian primitives sequentially and advances offset', () => {
    const bytes = new Uint8Array([
      0x2a,
      0x34, 0x12,
      0x4b, 0x44, 0x4d, 0x56,
      0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,
      0xaa, 0xbb,
    ]);
    const reader = new ByteReader(bytes);

    expect(reader.readUint8()).toBe(0x2a);
    expect(reader.readUint16LE()).toBe(0x1234);
    expect(reader.readUint32LE()).toBe(VMDK_MAGIC_NUMBER);
    expect(reader.readUint64LE()).toBe(0x0000000200000001n);
    expect(Array.from(reader.readBytes(2))).toEqual([0xaa, 0xbb]);
    expect(reader.offset).toBe(bytes.length);
  });

  it('throws RangeError when ensure() exceeds available bytes', () => {
    const reader = new ByteReader(new Uint8Array(4));
    expect(() => reader.ensure(5)).toThrow(RangeError);
    expect(() => reader.ensure(-1)).toThrow(RangeError);
    expect(() => reader.readUint64LE()).toThrow(RangeError);
  });

  it('throws TypeError for non-Uint8Array constructor input', () => {
    expect(() => new ByteReader('not bytes')).toThrow(TypeError);
  });
});

describe('parseVmdkHeader', () => {
  it('parses a valid minimal 512-byte sparse extent header with all required fields', () => {
    const bytes = buildSampleVmdkHeader({
      version: 1,
      flags: 0x00000003,
      capacity: 4194304n,
      grainSize: 128n,
      descriptorOffset: 1n,
      descriptorSize: 20n,
      numGTEsPerGT: 512,
      rgdOffset: 21n,
      gdOffset: 128n,
      overHead: 256n,
      uncleanShutdown: 0,
      compressAlgorithm: 0,
    });

    const result = parseVmdkHeader(bytes);
    expect(result.ok).toBe(true);

    const { header } = result;
    expect(header.magicNumber).toBe(VMDK_MAGIC_NUMBER);
    expect(header.magicHex).toBe('0x564D444B');
    expect(header.magicAscii).toBe(VMDK_MAGIC_ASCII);
    expect(header.version).toBe(1);
    expect(header.flags).toBe(0x00000003);
    expect(header.flagsHex).toBe('0x00000003');
    expect(header.unknownFlagBits).toBe(0);
    expect(header.decodedFlags.filter((f) => f.enabled).map((f) => f.bit)).toEqual([0, 1]);
    expect(header.capacity).toBe(4194304n);
    expect(header.capacityBytes).toBe(4194304n * 512n);
    expect(header.grainSize).toBe(128n);
    expect(header.grainSizeBytes).toBe(65536n);
    expect(header.descriptorOffset).toBe(1n);
    expect(header.descriptorSize).toBe(20n);
    expect(header.numGTEsPerGT).toBe(512);
    expect(header.rgdOffset).toBe(21n);
    expect(header.gdOffset).toBe(128n);
    expect(header.isGdAtEnd).toBe(false);
    expect(header.overHead).toBe(256n);
    expect(header.uncleanShutdown).toBe(false);
    expect(header.uncleanShutdownRaw).toBe(0);
    expect(header.lineEndingsValid).toBe(true);
    expect(header.compressAlgorithm).toBe(0);
    expect(header.compressAlgorithmName).toBe('None');
    expect(header.nonZeroPaddingBytes).toBe(0);
  });

  it('parses streamOptimized fields (GD_AT_END, DEFLATE, unclean shutdown, extra flags)', () => {
    const bytes = buildSampleVmdkHeader({
      version: 3,
      flags: 0x00030005 | 0x00000080,
      gdOffset: VMDK_GD_AT_END,
      uncleanShutdown: 1,
      compressAlgorithm: 1,
    });
    bytes[511] = 0xff;

    const result = parseVmdkHeader(bytes);
    expect(result.ok).toBe(true);
    expect(result.header.version).toBe(3);
    expect(result.header.isGdAtEnd).toBe(true);
    expect(result.header.gdOffsetBytes).toBeNull();
    expect(result.header.gdOffsetHex).toBe('0xFFFFFFFFFFFFFFFF');
    expect(result.header.uncleanShutdown).toBe(true);
    expect(result.header.compressAlgorithm).toBe(1);
    expect(result.header.compressAlgorithmName).toBe('DEFLATE');
    expect(result.header.unknownFlagBits).toBe(0x00000080);
    expect(result.header.nonZeroPaddingBytes).toBe(1);
  });

  it('labels unrecognized compression algorithms gracefully', () => {
    const bytes = buildSampleVmdkHeader({ compressAlgorithm: 99 });
    const result = parseVmdkHeader(bytes);
    expect(result.ok).toBe(true);
    expect(result.header.compressAlgorithmName).toBe('Unknown (99)');
  });

  it('accepts ArrayBuffer and inputs larger than 512 bytes without reading grain data', () => {
    const oversized = new Uint8Array(2048);
    oversized.set(buildSampleVmdkHeader(), 0);
    oversized.fill(0xab, VMDK_HEADER_SIZE);

    const result = parseVmdkHeader(oversized.buffer);
    expect(result.ok).toBe(true);
    expect(result.header.headerSize).toBe(VMDK_HEADER_SIZE);
    expect(result.header.inspectedBytes).toBe(2048);
    expect(result.header.nonZeroPaddingBytes).toBe(0);
  });

  it('returns a clear error for truncated input (<512 bytes) without throwing', () => {
    const shortHeader = buildSampleVmdkHeader().subarray(0, 511);
    const result = parseVmdkHeader(shortHeader);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/512 bytes/i);
    expect(result.error).toMatch(/511 bytes/i);
  });

  it('returns a clear error for wrong magic number without throwing', () => {
    const badMagic = buildSampleVmdkHeader({ magicNumber: 0xdeadbeef });
    const result = parseVmdkHeader(badMagic);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/0x564D444B/);
    expect(result.error).toMatch(/KDMV/);
    expect(result.error).toMatch(/0xDEADBEEF/);
  });

  it('returns a readable error for invalid non-binary input without throwing', () => {
    expect(parseVmdkHeader(null).ok).toBe(false);
    expect(parseVmdkHeader(undefined).ok).toBe(false);
    expect(parseVmdkHeader('KDMV').ok).toBe(false);
  });
});

describe('Hex and Base64 decoding & text inspection', () => {
  it('inspects valid raw hex with whitespace, 0x prefixes, and separators', () => {
    const sample = buildSampleVmdkHeader({ version: 2 });
    const formattedHex = `0x4B, 0x44, 0x4D, 0x56 ${bytesToHex(sample.subarray(4))}`;

    const result = inspectVmdkText(formattedHex, 'hex');
    expect(result.ok).toBe(true);
    expect(result.header.version).toBe(2);
  });

  it('rejects malformed hex inputs cleanly', () => {
    expect(decodeHexToBytes('').ok).toBe(false);
    expect(decodeHexToBytes('4B 44 ZZ').ok).toBe(false);
    expect(decodeHexToBytes('4B4').ok).toBe(false);
  });

  it('inspects valid Base64 including whitespace-wrapped and URL-safe variants', () => {
    const sample = buildSampleVmdkHeader({ version: 3, compressAlgorithm: 1 });
    const base64 = bytesToBase64(sample);
    const wrappedUrlSafe = base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
      .match(/.{1,64}/g)
      .join('\n');

    const result = inspectVmdkText(wrappedUrlSafe, 'base64');
    expect(result.ok).toBe(true);
    expect(result.header.version).toBe(3);
    expect(result.header.compressAlgorithm).toBe(1);
  });

  it('rejects malformed Base64 inputs cleanly', () => {
    expect(decodeBase64ToBytes('').ok).toBe(false);
    expect(decodeBase64ToBytes('A').ok).toBe(false);
    expect(decodeBase64ToBytes('@@@@').ok).toBe(false);
  });
});

describe('readHeaderBytesFromFile', () => {
  it('reads only the first 512 bytes of a larger file', async () => {
    const bigPayload = new Uint8Array(2048);
    bigPayload.set(buildSampleVmdkHeader({ version: 2 }), 0);
    const file = new File([bigPayload], 'disk.vmdk', { type: 'application/octet-stream' });

    const readResult = await readHeaderBytesFromFile(file);
    expect(readResult.ok).toBe(true);
    expect(readResult.bytes.byteLength).toBe(VMDK_HEADER_SIZE);
    expect(readResult.totalFileSize).toBe(2048);

    const parsed = parseVmdkHeader(readResult.bytes);
    expect(parsed.ok).toBe(true);
    expect(parsed.header.version).toBe(2);
  });

  it('returns an error when given an invalid file object', async () => {
    const readResult = await readHeaderBytesFromFile(null);
    expect(readResult.ok).toBe(false);
  });
});

describe('Formatting helpers', () => {
  it('formats byte sizes and hex values accurately', () => {
    expect(formatByteSize(512n)).toBe('512 B');
    expect(formatByteSize(65536n)).toBe('64.00 KiB');
    expect(formatByteSize(10737418240n)).toBe('10.00 GiB');
    expect(formatHex(VMDK_MAGIC_NUMBER, 8)).toBe('0x564D444B');
    expect(formatHex(VMDK_GD_AT_END, 16)).toBe('0xFFFFFFFFFFFFFFFF');
  });

  it('formats a valid JSON summary for parsed headers', () => {
    const parsed = parseVmdkHeader(buildSampleVmdkHeader({ gdOffset: VMDK_GD_AT_END }));
    expect(parsed.ok).toBe(true);
    const summary = JSON.parse(formatHeaderSummary(parsed.header));
    expect(summary.magicNumber).toBe('0x564D444B (KDMV)');
    expect(summary.gdOffsetSectors).toBe('GD_AT_END (0xFFFFFFFFFFFFFFFF)');
  });
});
