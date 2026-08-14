import { describe, expect, it } from 'vitest';
import {
  MAX_INPUT_BYTES,
  decodeProtobuf,
  parseBase64Payload,
  parseHexPayload,
  parsePayload,
} from './protobufDecoder.utils.js';

const REFERENCE_HEX =
  '089601120774657374696e671a0308960120ffffffffffffffffff012d0000803f31000000000000f83f';
const REFERENCE_BASE64 = 'CJYBEgd0ZXN0aW5nGgMIlgEg////////////AS0AAIA/MQAAAAAAAPg/';

function hexBytes(hex) {
  return parseHexPayload(hex).bytes;
}

function nestedMessage(levels) {
  let value = new Uint8Array();
  for (let index = 0; index < levels; index += 1) {
    value = Uint8Array.from([0x0a, value.length, ...value]);
  }
  return value;
}

describe('payload transport parsing', () => {
  it('accepts separated, prefixed hexadecimal input', () => {
    expect(parseHexPayload('0x08:96-01').bytes).toEqual(Uint8Array.from([8, 150, 1]));
  });

  it('reports distinct hexadecimal failures', () => {
    expect(parseHexPayload('abc').error).toMatch(/odd number/i);
    expect(parseHexPayload('zz').error).toMatch(/non-hexadecimal/i);
    expect(parseHexPayload('   ').error).toMatch(/empty/i);
  });

  it('accepts unpadded Base64url and reports Base64 failures', () => {
    expect(parseBase64Payload('CJYB').bytes).toEqual(Uint8Array.from([8, 150, 1]));
    expect(parseBase64Payload('not*base64').error).toMatch(/invalid characters/i);
    expect(parseBase64Payload('a').error).toMatch(/invalid length/i);
  });

  it('deterministically resolves auto mode and returns the choice', () => {
    expect(parsePayload('deadbeef', 'auto').format).toBe('hex');
    expect(parsePayload(REFERENCE_BASE64, 'auto').format).toBe('base64');
    expect(parsePayload('', 'auto').error).toMatch(/empty/i);
  });
});

describe('decodeProtobuf', () => {
  it('decodes every reference field exactly from hexadecimal', () => {
    const decoded = decodeProtobuf(hexBytes(REFERENCE_HEX));
    expect(decoded).not.toHaveProperty('error');
    expect(decoded.fields).toHaveLength(6);
    expect(decoded.fields[0].interpretations).toEqual({
      uint64: '150',
      int64: '150',
      sint64: '75',
    });
    expect(decoded.fields[1].interpretations.string).toBe('testing');
    expect(decoded.fields[1].interpretations.rawHex).toBe('74657374696e67');
    expect(decoded.fields[2].interpretations.rawHex).toBe('089601');
    expect(decoded.fields[2].interpretations.submessage[0].interpretations.uint64).toBe('150');
    expect(decoded.fields[3].interpretations).toEqual({
      uint64: '18446744073709551615',
      int64: '-1',
      sint64: '-9223372036854775808',
    });
    expect(decoded.fields[4].interpretations).toEqual({
      fixed32: '1065353216',
      sfixed32: '1065353216',
      float: '1',
    });
    expect(decoded.fields[5].interpretations).toEqual({
      fixed64: '4609434218613702656',
      sfixed64: '4609434218613702656',
      double: '1.5',
    });
  });

  it('decodes the same reference payload from Base64', () => {
    const parsed = parseBase64Payload(REFERENCE_BASE64);
    const decoded = decodeProtobuf(parsed.bytes);
    expect(decoded).not.toHaveProperty('error');
    expect(decoded.fields).toHaveLength(6);
    expect(decoded.fields[3].interpretations.uint64).toBe('18446744073709551615');
  });

  it.each([
    ['truncated value', Uint8Array.from([0x08, 0x80])],
    ['overlong varint', Uint8Array.from([0x08, ...Array(11).fill(0x80)])],
    ['deprecated group', Uint8Array.from([0x0b])],
    ['invalid wire type', Uint8Array.from([0x0e])],
    ['field number zero', Uint8Array.from([0x00])],
  ])('returns an offset error without throwing for %s', (_name, bytes) => {
    expect(() => decodeProtobuf(bytes)).not.toThrow();
    const decoded = decodeProtobuf(bytes);
    expect(decoded.error).toMatch(/byte offset/i);
    expect(decoded).toHaveProperty('offset');
  });

  it('enforces recursion and input-size bounds without throwing', () => {
    const deep = decodeProtobuf(nestedMessage(34), { maxDepth: 4 });
    expect(deep.error).toMatch(/Maximum recursion depth/);
    const oversized = decodeProtobuf(new Uint8Array(MAX_INPUT_BYTES + 1));
    expect(oversized.error).toMatch(/Payload too large/);
  });
});
