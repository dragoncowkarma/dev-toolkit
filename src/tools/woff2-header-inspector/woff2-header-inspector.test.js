import { describe, expect, it, vi } from 'vitest';
import {
  base64ToBytes,
  ByteReader,
  createSampleWoff2Header,
  fileToBytes,
  formatBytes,
  formatFlavor,
  hexToBytes,
  parseWoff2Header,
  SAMPLE_WOFF2_BASE64,
  SAMPLE_WOFF2_HEX,
  WOFF2_HEADER_SIZE,
  WOFF2_SIGNATURE,
} from './woff2-header-inspector.utils.js';

describe('ByteReader', () => {
  it('throws TypeError if initialized with a non-Uint8Array', () => {
    expect(() => new ByteReader([1, 2, 3])).toThrow(TypeError);
    expect(() => new ByteReader(null)).toThrow(TypeError);
  });

  it('reads Uint8, Uint16, and Uint32 values in big-endian order', () => {
    const data = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde]);
    const reader = new ByteReader(data);

    expect(reader.length).toBe(7);
    expect(reader.remaining).toBe(7);

    expect(reader.readUint8()).toBe(0x12);
    expect(reader.remaining).toBe(6);

    expect(reader.readUint16()).toBe(0x3456);
    expect(reader.remaining).toBe(4);

    expect(reader.readUint32()).toBe(0x789abcde);
    expect(reader.remaining).toBe(0);
  });

  it('reads a slice of bytes and an ASCII tag', () => {
    const data = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x01, 0x02]);
    const reader = new ByteReader(data);

    expect(reader.readTag()).toBe('wOF2');
    expect(reader.remaining).toBe(2);

    const slice = reader.readBytes(2);
    expect(Array.from(slice)).toEqual([1, 2]);
    expect(reader.remaining).toBe(0);
  });

  it('throws descriptive error on out-of-bounds read via ensure()', () => {
    const data = new Uint8Array([1, 2]);
    const reader = new ByteReader(data);
    reader.readUint8();

    expect(() => reader.readUint16()).toThrow(
      /needed 2 byte\(s\) at offset 1, but only 1 byte\(s\) available/,
    );
  });
});

describe('formatFlavor', () => {
  it('formats TrueType flavor (0x00010000)', () => {
    const info = formatFlavor(0x00010000);
    expect(info.tag).toBe('0x00010000');
    expect(info.description).toContain('TrueType outlines');
  });

  it('formats OTTO flavor (0x4F54544F)', () => {
    const info = formatFlavor(0x4f54544f);
    expect(info.tag).toBe('OTTO');
    expect(info.description).toContain('CFF outlines');
  });

  it('formats Apple TrueType flavor (0x74727565)', () => {
    const info = formatFlavor(0x74727565);
    expect(info.tag).toBe('true');
    expect(info.description).toContain('Apple TrueType');
  });

  it('formats PostScript Type 1 flavor (0x74797031)', () => {
    const info = formatFlavor(0x74797031);
    expect(info.tag).toBe('typ1');
    expect(info.description).toContain('PostScript Type 1');
  });

  it('formats custom 4-character ASCII tags', () => {
    // 0x74657374 -> 'test'
    const info = formatFlavor(0x74657374);
    expect(info.tag).toBe('test');
    expect(info.description).toContain('Custom flavor (test)');
  });

  it('formats unprintable non-ASCII tags as hex', () => {
    const info = formatFlavor(0x00000005);
    expect(info.tag).toBe('0x00000005');
    expect(info.description).toContain('Unknown flavor');
  });
});

describe('formatBytes', () => {
  it('handles null, NaN, and negative values safely', () => {
    expect(formatBytes(null)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });

  it('formats byte counts accurately', () => {
    expect(formatBytes(48)).toBe('48 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(2560)).toBe('2.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });
});

describe('hexToBytes', () => {
  it('converts clean hex string to Uint8Array', () => {
    const bytes = hexToBytes('774F4632');
    expect(Array.from(bytes)).toEqual([0x77, 0x4f, 0x46, 0x32]);
  });

  it('ignores spaces, colons, commas, and 0x prefixes', () => {
    const bytes = hexToBytes('0x77, 0x4F: 46 32');
    expect(Array.from(bytes)).toEqual([0x77, 0x4f, 0x46, 0x32]);
  });

  it('throws on non-string input', () => {
    expect(() => hexToBytes(123)).toThrow(TypeError);
  });

  it('throws on empty string', () => {
    expect(() => hexToBytes('')).toThrow(/Hex input is empty/);
    expect(() => hexToBytes('   ')).toThrow(/Hex input is empty/);
  });

  it('throws on odd-length hex strings', () => {
    expect(() => hexToBytes('774F4')).toThrow(/odd number of characters/);
  });

  it('throws on invalid characters', () => {
    expect(() => hexToBytes('774F4G')).toThrow(/invalid characters/);
  });
});

describe('base64ToBytes', () => {
  it('converts valid base64 string to Uint8Array', () => {
    const bytes = base64ToBytes('d09GMg==');
    expect(Array.from(bytes)).toEqual([0x77, 0x4f, 0x46, 0x32]);
  });

  it('handles base64 with surrounding whitespace', () => {
    const bytes = base64ToBytes('  d09GMg== \n');
    expect(Array.from(bytes)).toEqual([0x77, 0x4f, 0x46, 0x32]);
  });

  it('throws on non-string input', () => {
    expect(() => base64ToBytes(123)).toThrow(TypeError);
  });

  it('throws on empty string', () => {
    expect(() => base64ToBytes('')).toThrow(/Base64 input is empty/);
    expect(() => base64ToBytes('  ')).toThrow(/Base64 input is empty/);
  });

  it('throws on invalid base64 characters or padding', () => {
    expect(() => base64ToBytes('abc')).toThrow(/Invalid Base64 input/);
    expect(() => base64ToBytes('!!!@#$')).toThrow(/Invalid Base64 input/);
  });
});

describe('fileToBytes', () => {
  it('reads a File/Blob into a Uint8Array', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])]);
    const bytes = await fileToBytes(blob);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it('rejects when reading fails', async () => {
    const failingReader = {
      readAsArrayBuffer: vi.fn(function () {
        this.onerror(new Error('Read failed'));
      }),
    };
    const OriginalFileReader = global.FileReader;
    global.FileReader = vi.fn(function () {
      return failingReader;
    });

    await expect(fileToBytes(new Blob(['hello']))).rejects.toThrow(
      'Failed to read the selected file.',
    );
    global.FileReader = OriginalFileReader;
  });
});

describe('createSampleWoff2Header', () => {
  it('creates a 48-byte Uint8Array with valid WOFF2 signature and default fields', () => {
    const bytes = createSampleWoff2Header();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(WOFF2_HEADER_SIZE);

    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0)).toBe(WOFF2_SIGNATURE);
    expect(view.getUint32(4)).toBe(0x00010000); // TrueType
    expect(view.getUint32(8)).toBe(48); // length
    expect(view.getUint16(12)).toBe(1); // numTables
    expect(view.getUint16(14)).toBe(0); // reserved
  });

  it('respects custom overrides', () => {
    const bytes = createSampleWoff2Header({
      flavor: 0x4f54544f,
      numTables: 12,
      majorVersion: 2,
      minorVersion: 5,
    });
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(4)).toBe(0x4f54544f);
    expect(view.getUint16(12)).toBe(12);
    expect(view.getUint16(24)).toBe(2);
    expect(view.getUint16(26)).toBe(5);
  });
});

describe('parseWoff2Header', () => {
  it('throws TypeError if input is not a Uint8Array', () => {
    expect(() => parseWoff2Header('not bytes')).toThrow(TypeError);
    expect(() => parseWoff2Header([1, 2, 3])).toThrow(TypeError);
  });

  it('rejects truncated input (< 48 bytes) with clear non-crashing error', () => {
    const short = new Uint8Array(40);
    expect(() => parseWoff2Header(short)).toThrow(
      /Truncated header: expected at least 48 bytes/,
    );
  });

  it('rejects files with invalid magic signature', () => {
    const bytes = new Uint8Array(48);
    // Fill with random bytes
    bytes.set([0x12, 0x34, 0x56, 0x78], 0);

    expect(() => parseWoff2Header(bytes)).toThrow(
      /Invalid WOFF2 signature: expected "wOF2" \(0x774F4632\)/,
    );
  });

  it('gives special helpful error when a WOFF 1.0 font ("wOFF") is supplied', () => {
    const bytes = new Uint8Array(48);
    // 0x774F4646 = 'wOFF'
    bytes.set([0x77, 0x4f, 0x46, 0x46], 0);

    expect(() => parseWoff2Header(bytes)).toThrow(
      /This is a WOFF 1\.0 font, not WOFF2/,
    );
  });

  it('parses valid minimal WOFF2 header correctly', () => {
    const sample = createSampleWoff2Header({
      flavor: 0x00010000,
      length: 48,
      numTables: 5,
      reserved: 0,
      totalSfntSize: 512,
      totalCompressedSize: 128,
      majorVersion: 1,
      minorVersion: 2,
      metaOffset: 0,
      metaLength: 0,
      metaOrigLength: 0,
      privOffset: 0,
      privLength: 0,
    });

    const result = parseWoff2Header(sample);

    expect(result.signature.value).toBe(WOFF2_SIGNATURE);
    expect(result.signature.tag).toBe('wOF2');
    expect(result.signature.valid).toBe(true);

    expect(result.flavor.tag).toBe('0x00010000');
    expect(result.flavor.description).toContain('TrueType');

    expect(result.length).toBe(48);
    expect(result.numTables).toBe(5);
    expect(result.reserved.value).toBe(0);
    expect(result.reserved.valid).toBe(true);

    expect(result.totalSfntSize).toBe(512);
    expect(result.totalCompressedSize).toBe(128);

    expect(result.version.major).toBe(1);
    expect(result.version.minor).toBe(2);
    expect(result.version.formatted).toBe('1.2');

    expect(result.metadata.present).toBe(false);
    expect(result.privateData.present).toBe(false);

    expect(result.compression.savingsPercent).toBe('90.6');
    expect(result.compression.ratio).toBe('10.67');

    expect(result.warnings).toEqual([]);
    expect(result.fields).toHaveLength(14);
  });

  it('parses WOFF2 header with OTTO flavor and optional blocks', () => {
    const sample = createSampleWoff2Header({
      flavor: 0x4f54544f, // 'OTTO'
      length: 120,
      numTables: 8,
      metaOffset: 60,
      metaLength: 30,
      metaOrigLength: 80,
      privOffset: 90,
      privLength: 30,
    });
    // Ensure actual size matches declared length so no warning is emitted
    const padded = new Uint8Array(120);
    padded.set(sample, 0);

    const result = parseWoff2Header(padded);

    expect(result.flavor.tag).toBe('OTTO');
    expect(result.flavor.description).toContain('CFF outlines');

    expect(result.metadata.present).toBe(true);
    expect(result.metadata.offset).toBe(60);
    expect(result.metadata.length).toBe(30);
    expect(result.metadata.origLength).toBe(80);

    expect(result.privateData.present).toBe(true);
    expect(result.privateData.offset).toBe(90);
    expect(result.privateData.length).toBe(30);

    expect(result.warnings).toEqual([]);
  });

  it('records warnings when header specifications are violated', () => {
    const sample = createSampleWoff2Header({
      reserved: 12, // reserved violation
      length: 100, // declared 100, but buffer is only 48
      metaLength: 20, // metaLength > 0 but metaOffset is 0
      privLength: 10, // privLength > 0 but privOffset is 0
    });

    const result = parseWoff2Header(sample);

    expect(result.reserved.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes('Reserved field must be 0'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('File appears truncated'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('metaOffset is 0'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('privOffset is 0'))).toBe(true);
  });

  it('correctly parses SAMPLE_WOFF2_HEX and SAMPLE_WOFF2_BASE64', () => {
    const fromHex = hexToBytes(SAMPLE_WOFF2_HEX);
    const fromB64 = base64ToBytes(SAMPLE_WOFF2_BASE64);

    const resHex = parseWoff2Header(fromHex);
    const resB64 = parseWoff2Header(fromB64);

    expect(resHex.signature.tag).toBe('wOF2');
    expect(resB64.signature.tag).toBe('wOF2');
    expect(resHex.length).toBe(48);
    expect(resB64.length).toBe(48);
  });
});
