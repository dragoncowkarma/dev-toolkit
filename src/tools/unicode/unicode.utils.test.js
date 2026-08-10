import { describe, expect, it } from 'vitest';
import {
  compareNormalizations,
  detectInvisibles,
  encodeUtf16,
  encodeUtf8,
  inspectText,
  normalizeText,
  parseCodePointInput,
  toEscapes,
} from './unicode.utils.js';

describe('inspectText', () => {
  it('inspects ASCII with padded code point and UTF-8 bytes', () => {
    expect(inspectText('A')[0]).toMatchObject({ hex: 'U+0041', utf8Bytes: [0x41] });
  });

  it('encodes Latin-1 text as UTF-8', () => {
    expect(inspectText('é')[0].utf8Bytes).toEqual([0xc3, 0xa9]);
  });

  it('keeps an astral character in one record with surrogate-pair UTF-16', () => {
    const record = inspectText('😀')[0];
    expect(inspectText('😀')).toHaveLength(1);
    expect(record).toMatchObject({ isAstral: true, utf8Bytes: [0xf0, 0x9f, 0x98, 0x80] });
    expect(record.utf16Units).toEqual([0xd83d, 0xde00]);
  });

  it('keeps a combining sequence as two code-point records', () => {
    expect(inspectText('e\u0301')).toHaveLength(2);
  });

  it('returns no records for empty text and preserves lone-surrogate records', () => {
    expect(inspectText('')).toEqual([]);
    expect(inspectText('\ud800')[0]).toMatchObject({ hex: 'U+D800', utf8Bytes: null });
  });
});

describe('scalar encodings and escapes', () => {
  it('rejects out-of-range values and lone surrogates', () => {
    expect(encodeUtf8(0x110000)).toBeNull();
    expect(encodeUtf16(0x110000)).toBeNull();
    expect(encodeUtf8(0xd800)).toBeNull();
    expect(encodeUtf16(0xd800)).toBeNull();
  });

  it('returns JavaScript, HTML hex, and URL escapes for astral values', () => {
    expect(toEscapes(0x1f600)).toMatchObject({
      js: '\\u{1F600}',
      htmlHex: '&#x1F600;',
      url: '%F0%9F%98%80',
    });
  });
});

describe('invisibles and normalization', () => {
  it('finds zero-width, no-break, and high-risk bidi controls by code-point index', () => {
    const hits = detectInvisibles(`A\u200B\u00A0\u202EB`);
    expect(hits.map((hit) => hit.index)).toEqual([1, 2, 3]);
    expect(hits[2].risk).toBe('high');
  });

  it('finds no invisible characters in clean ASCII', () => {
    expect(detectInvisibles('plain ASCII')).toEqual([]);
  });

  it('normalizes NFC and NFD with change and UTF-16 length details', () => {
    expect(normalizeText('e\u0301', 'NFC')).toMatchObject({
      text: 'é', changed: true, lengthBefore: 2, lengthAfter: 1,
    });
    expect(normalizeText('é', 'NFD')).toMatchObject({
      text: 'e\u0301', changed: true, lengthBefore: 1, lengthAfter: 2,
    });
  });

  it('returns null for unknown normalization forms and flags NFKC compatibility changes', () => {
    expect(normalizeText('é', 'NFA')).toBeNull();
    expect(compareNormalizations('ﬁ').NFKC).toMatchObject({ text: 'fi', changed: true });
  });
});

describe('parseCodePointInput', () => {
  it('accepts supported decimal, hexadecimal, and HTML code-point formats', () => {
    ['U+1F600', '1F600', '0x1F600', '128512', '&#x1F600;', '&#128512;'].forEach((input) => {
      expect(parseCodePointInput(input)).toBe(0x1f600);
    });
  });

  it('rejects empty, malformed, out-of-range, and surrogate inputs', () => {
    ['', 'ZZZZ', 'U+110000', 'U+D800'].forEach((input) => {
      expect(parseCodePointInput(input)).toBeNull();
    });
  });
});
