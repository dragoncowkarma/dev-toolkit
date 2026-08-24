import { describe, expect, it } from 'vitest';
import {
  MAX_INPUT_BYTES,
  MAX_RECURSION_DEPTH,
  bytesToBase64,
  bytesToBase64Url,
  bytesToHex,
  decodeBson,
  encodeJsonToBson,
  parseBsonInput,
} from './bson.utils.js';

function makeNestedObject(depth) {
  let value = {};
  for (let index = 0; index < depth; index += 1) value = { nested: value };
  return value;
}

describe('BSON JSON round trips', () => {
  it('round-trips nested standard JSON values with BSON numeric types', () => {
    const original = {
      title: 'BSON ✓',
      ratio: 1.25,
      small: 42,
      large: 2147483648,
      nested: { enabled: true, empty: null },
      list: ['a', false, { value: 9 }],
    };
    const decoded = decodeBson(encodeJsonToBson(JSON.stringify(original)));

    expect(decoded).toEqual(original);
  });

  it('encodes an empty document', () => {
    const bytes = encodeJsonToBson('{}');
    expect(bytesToHex(bytes)).toBe('0500000000');
    expect(decodeBson(bytes)).toEqual({});
  });

  it('provides Hex, Base64, and Base64URL byte representations', () => {
    const bytes = encodeJsonToBson('{"ok":true}');
    expect(parseBsonInput(bytesToHex(bytes), 'hex')).toEqual(bytes);
    expect(parseBsonInput(bytesToBase64(bytes), 'base64')).toEqual(bytes);
    expect(parseBsonInput(bytesToBase64Url(bytes), 'base64')).toEqual(bytes);
  });
});

describe('BSON safety checks', () => {
  it('rejects JSON text larger than 1 MiB', () => {
    const oversized = `{"text":"${'x'.repeat(MAX_INPUT_BYTES)}"}`;
    expect(() => encodeJsonToBson(oversized)).toThrow(/1 MiB limit/);
  });

  it('rejects documents deeper than 32 levels while encoding and decoding', () => {
    const deepJson = JSON.stringify(makeNestedObject(MAX_RECURSION_DEPTH + 1));
    expect(() => encodeJsonToBson(deepJson)).toThrow(/maximum depth of 32/);

    const encoded = encodeJsonToBson(JSON.stringify(makeNestedObject(MAX_RECURSION_DEPTH)));
    expect(() => decodeBson(encoded)).not.toThrow();
  });

  it('rejects BSON input larger than 1 MiB', () => {
    expect(() => decodeBson(new Uint8Array(MAX_INPUT_BYTES + 1))).toThrow(/1 MiB limit/);
  });
});

describe('BSON malformed input errors', () => {
  it('rejects malformed byte text and BSON documents', () => {
    expect(() => parseBsonInput('abc', 'hex')).toThrow(/Invalid hexadecimal/);
    expect(() => parseBsonInput('!', 'base64')).toThrow(/Invalid Base64/);
    expect(() => decodeBson(Uint8Array.of(5, 0, 0, 0, 1))).toThrow(/document is missing/);
  });

  it('rejects a non-object JSON root', () => {
    expect(() => encodeJsonToBson('[1,2]')).toThrow(/JSON object at the root/);
  });
});
