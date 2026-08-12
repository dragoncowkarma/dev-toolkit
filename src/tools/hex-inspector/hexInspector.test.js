import { describe, expect, it } from 'vitest';
import {
  buildByteRows,
  bytesToHexString,
  decodeBytesToText,
  getByteDisplay,
  hexToText,
  parseHexBytes,
  SAMPLE_HEX,
  SAMPLE_TEXT,
  textToBytes,
  textToHex,
} from './hexInspector.utils.js';

describe('textToBytes', () => {
  it('encodes plain ASCII text into its UTF-8 byte values', () => {
    expect(Array.from(textToBytes('Hi'))).toEqual([0x48, 0x69]);
  });

  it('encodes an empty string to an empty byte array', () => {
    expect(textToBytes('').length).toBe(0);
  });

  it('throws for non-string input', () => {
    expect(() => textToBytes(123)).toThrow(TypeError);
  });
});

describe('bytesToHexString', () => {
  it('formats bytes as uppercase, space-separated, two-digit hex pairs', () => {
    expect(bytesToHexString(new Uint8Array([0, 15, 16, 255]))).toBe('00 0F 10 FF');
  });

  it('formats an empty byte array as an empty string', () => {
    expect(bytesToHexString(new Uint8Array(0))).toBe('');
  });
});

describe('textToHex', () => {
  it('encodes ASCII text to hex', () => {
    expect(textToHex('Hi')).toBe('48 69');
  });

  it('round-trips ASCII, Korean, and emoji text through hex and back', () => {
    const original = 'Hello 안녕 🚀';
    const bytes = textToBytes(original);

    // Assert the actual UTF-8 bytes, not only the final round-tripped text.
    expect(Array.from(bytes)).toEqual(Array.from(new TextEncoder().encode(original)));

    const hex = textToHex(original);
    expect(hexToText(hex)).toBe(original);
  });
});

describe('parseHexBytes', () => {
  it('parses hex pairs into bytes in original order', () => {
    expect(Array.from(parseHexBytes('48656C6C6F'))).toEqual([
      0x48, 0x65, 0x6c, 0x6c, 0x6f,
    ]);
  });

  it('accepts spaces, tabs, and newlines between bytes', () => {
    expect(Array.from(parseHexBytes('48 65\t6C\n6C  6F'))).toEqual([
      0x48, 0x65, 0x6c, 0x6c, 0x6f,
    ]);
  });

  it('is case-insensitive', () => {
    expect(Array.from(parseHexBytes('ff aB'))).toEqual([0xff, 0xab]);
  });

  it('returns an empty array for empty or all-whitespace input', () => {
    expect(parseHexBytes('').length).toBe(0);
    expect(parseHexBytes('  \n\t').length).toBe(0);
  });

  it('rejects an odd number of hex digits without throwing an unrelated error', () => {
    expect(() => parseHexBytes('ABC')).toThrow(/odd number of digits/);
  });

  it('rejects non-hex characters with a precise, user-facing message', () => {
    expect(() => parseHexBytes('4Z')).toThrow(/Invalid character "Z"/);
  });

  it('throws for non-string input', () => {
    expect(() => parseHexBytes(42)).toThrow(TypeError);
  });
});

describe('decodeBytesToText', () => {
  it('decodes well-formed UTF-8 bytes', () => {
    expect(decodeBytesToText(new TextEncoder().encode('안녕'))).toBe('안녕');
  });

  it('rejects a truncated multibyte sequence instead of substituting it', () => {
    // 0xEC is the leading byte of a 3-byte sequence ('안' starts with EC 95 88);
    // truncating it mid-sequence must be reported as an error.
    expect(() => decodeBytesToText(new Uint8Array([0xec]))).toThrow(/not valid UTF-8/);
  });

  it('rejects an invalid continuation byte', () => {
    expect(() => decodeBytesToText(new Uint8Array([0xc0, 0x00]))).toThrow(/not valid UTF-8/);
  });
});

describe('hexToText', () => {
  it('parses and decodes hex bytes into text', () => {
    expect(hexToText('48 69')).toBe('Hi');
  });

  it('surfaces a controlled error for invalid UTF-8, never a replacement character', () => {
    expect(() => hexToText('EC')).toThrow(/not valid UTF-8/);
  });

  it('surfaces the parse error for malformed hex before attempting to decode', () => {
    expect(() => hexToText('4G')).toThrow(/Invalid character "G"/);
  });
});

describe('getByteDisplay', () => {
  it('returns the printable ASCII character as-is', () => {
    expect(getByteDisplay(0x41)).toBe('A');
    expect(getByteDisplay(0x20)).toBe(' ');
    expect(getByteDisplay(0x7e)).toBe('~');
  });

  it('returns a deterministic safe glyph for control bytes', () => {
    const nul = getByteDisplay(0x00);
    const tab = getByteDisplay(0x09);
    expect(nul).toBe(tab);
    expect(nul).not.toBe('');
  });

  it('returns the same deterministic safe glyph for DEL and non-ASCII bytes', () => {
    expect(getByteDisplay(0x7f)).toBe(getByteDisplay(0x00));
    expect(getByteDisplay(0xff)).toBe(getByteDisplay(0x00));
  });
});

describe('buildByteRows', () => {
  it('builds rows with zero-based offset, hex, decimal, binary, and display', () => {
    const rows = buildByteRows(new Uint8Array([0x00, 0x41, 0xff]));
    expect(rows).toEqual([
      { offset: 0, hex: '0x00', decimal: 0, binary: '00000000', display: getByteDisplay(0) },
      { offset: 1, hex: '0x41', decimal: 65, binary: '01000001', display: 'A' },
      { offset: 2, hex: '0xFF', decimal: 255, binary: '11111111', display: getByteDisplay(255) },
    ]);
  });

  it('preserves original byte order for multibyte UTF-8 sequences', () => {
    const bytes = new TextEncoder().encode('안');
    const rows = buildByteRows(bytes);
    expect(rows.map((row) => row.hex)).toEqual(
      Array.from(bytes, (byte) => `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`)
    );
    expect(rows.map((row) => row.offset)).toEqual(Array.from(bytes, (_, index) => index));
  });

  it('returns an empty array for an empty byte sequence', () => {
    expect(buildByteRows(new Uint8Array(0))).toEqual([]);
  });
});

describe('sample constants', () => {
  it('provides a sample text and matching hex that round-trip', () => {
    expect(typeof SAMPLE_TEXT).toBe('string');
    expect(SAMPLE_TEXT.length).toBeGreaterThan(0);
    expect(hexToText(SAMPLE_HEX)).toBe(SAMPLE_TEXT);
  });
});
