import { describe, expect, it } from 'vitest';
import {
  CBOR_SAMPLES,
  decodeCbor,
  formatDecodedJson,
  parseBase64Payload,
  parseCborInput,
  parseHexPayload,
} from './cborDecoder.utils.js';

function bytes(hex) {
  return parseHexPayload(hex).bytes;
}

describe('CBOR transport parsing', () => {
  it('parses separated hexadecimal and Base64URL payloads', () => {
    expect(parseHexPayload('0xa1:65-68 65 6c 6c 6f 65 77 6f 72 6c 64').bytes).toEqual(
      bytes('a16568656c6c6f65776f726c64'),
    );
    expect(parseBase64Payload('oWVoZWxsb2V3b3JsZA', 'base64url').bytes).toEqual(
      bytes('a16568656c6c6f65776f726c64'),
    );
  });

  it('reports actionable transport parsing failures', () => {
    expect(parseHexPayload('abc').error).toMatch(/odd number/i);
    expect(parseHexPayload('zz').error).toMatch(/non-hexadecimal/i);
    expect(parseBase64Payload('a', 'base64').error).toMatch(/invalid length/i);
    expect(parseBase64Payload('ab+', 'base64url').error).toMatch(/invalid characters/i);
  });

  it('detects Hex, Base64, and Base64URL deterministically', () => {
    expect(parseCborInput('a16568656c6c6f65776f726c64').format).toBe('hex');
    expect(parseCborInput('oWVoZWxsb2V3b3JsZA==').format).toBe('base64');
    expect(parseCborInput('oWVoZWxsb2V3b3JsZA').format).toBe('base64');
  });
});

describe('decodeCbor', () => {
  it('decodes the RFC 8949 simple map in JSON and diagnostic notation', () => {
    const decoded = decodeCbor(bytes('a16568656c6c6f65776f726c64'));
    expect(decoded.json).toEqual({ hello: 'world' });
    expect(decoded.diagnostic).toBe('{"hello": "world"}');
    expect(decoded.byteLength).toBe(13);
    expect(decoded.majorTypes.filter((item) => item.count)).toEqual([
      { type: 3, name: 'Text string', count: 2 },
      { type: 5, name: 'Map', count: 1 },
    ]);
  });

  it('decodes integer, byte/text string, array, and map major types', () => {
    const decoded = decodeCbor(bytes('861a000100002442010262686982616101a1616b6176'));
    expect(decoded.json).toEqual([65536, -5, "h'0102'", 'hi', ['a', 1], { k: 'v' }]);
    expect(decoded.majorTypes.map((item) => item.count)).toEqual([2, 1, 1, 4, 2, 1, 0, 0]);
  });

  it('decodes semantic tags, bignum byte strings, simple values, and floats safely', () => {
    const decoded = decodeCbor(bytes('86c11a6553f100c249010000000000000000f4f6f818f93e00'));
    expect(decoded.json).toEqual([
      { tag: 1, value: 1700000000 },
      { tag: 2, value: "h'010000000000000000'" },
      false,
      null,
      'simple(24)',
      1.5,
    ]);
    expect(decoded.diagnostic).toContain("2(h'010000000000000000')");
  });

  it('keeps map keys that cannot become JSON object keys as entry records', () => {
    const decoded = decodeCbor(bytes('a1016178'));
    expect(decoded.json).toEqual([{ key: 1, value: 'x' }]);
  });

  it('represents float values that JSON cannot safely encode as strings', () => {
    expect(decodeCbor(bytes('f97e00')).json).toBe('NaN');
    expect(decodeCbor(bytes('f97c00')).json).toBe('Infinity');
  });

  it('returns controlled errors for truncated, indefinite, and trailing data', () => {
    expect(decodeCbor(bytes('43ff')).error).toMatch(/Truncated byte string.*byte offset 1/i);
    expect(decodeCbor(bytes('9f')).error).toMatch(/Indefinite-length.*byte offset 0/i);
    expect(decodeCbor(bytes('00ff')).error).toMatch(/Unexpected trailing.*byte offset 1/i);
  });

  it('formats byte-string-containing values as ordinary JSON', () => {
    expect(formatDecodedJson(decodeCbor(bytes('420102')).json)).toBe('"h\'0102\'"');
  });
});

describe('CBOR examples', () => {
  it('ships valid quick-test payloads', () => {
    CBOR_SAMPLES.forEach((sample) => {
      const parsed = parseCborInput(sample.value, sample.format);
      expect(parsed).not.toHaveProperty('error');
      expect(decodeCbor(parsed.bytes)).not.toHaveProperty('error');
    });
  });
});
