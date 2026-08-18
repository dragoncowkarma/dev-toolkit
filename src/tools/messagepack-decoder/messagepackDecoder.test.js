import { describe, expect, it } from 'vitest';
import {
  MAX_INPUT_BYTES,
  decodeMessagePack,
  parseBase64Payload,
  parseHexPayload,
  parsePayload,
} from './messagepackDecoder.utils.js';

const VECTOR_A_HEX = '82a7636f6d70616374c3a6736368656d6100';
const VECTOR_A_BASE64 = 'gqdjb21wYWN0w6ZzY2hlbWEA';
const VECTOR_B_HEX = '82a3753634cfffffffffffffffffa3693634d3ffffffffffffffff';

function bytes(hex) {
  return parseHexPayload(hex).bytes;
}

function nestedArray(levels) {
  return Uint8Array.from([...Array(levels).fill(0x91), 0xc0]);
}

describe('payload transport parsing', () => {
  it('accepts separated hexadecimal and standard or URL-safe unpadded Base64', () => {
    expect(parseHexPayload('0x82:a7-63').bytes).toEqual(Uint8Array.from([130, 167, 99]));
    expect(parseBase64Payload('-_8').bytes).toEqual(Uint8Array.from([251, 255]));
  });

  it('reports specific input failures and deterministic auto detection', () => {
    expect(parseHexPayload('a').error).toMatch(/odd number/i);
    expect(parseHexPayload('zz').error).toMatch(/non-hexadecimal/i);
    expect(parseHexPayload(' ').error).toMatch(/empty/i);
    expect(parseBase64Payload('not*base64').error).toMatch(/invalid characters/i);
    expect(parseBase64Payload('a').error).toMatch(/invalid length/i);
    expect(parsePayload('deadbeef', 'auto').format).toBe('hex');
    expect(parsePayload(VECTOR_A_BASE64, 'auto').format).toBe('base64');
  });
});

describe('decodeMessagePack', () => {
  it('decodes the canonical map vector from hexadecimal and Base64', () => {
    const fromHex = decodeMessagePack(bytes(VECTOR_A_HEX));
    const fromBase64 = decodeMessagePack(parseBase64Payload(VECTOR_A_BASE64).bytes);
    expect(fromHex).not.toHaveProperty('error');
    expect(fromBase64).toEqual(fromHex);
    expect(fromHex.node).toMatchObject({ type: 'map', format: 'fixmap', value: '2 entries' });
    expect(fromHex.node.entries[0].key).toMatchObject({ type: 'str', value: 'compact' });
    expect(fromHex.node.entries[0].value).toMatchObject({ type: 'bool', value: 'true' });
    expect(fromHex.node.entries[1].key).toMatchObject({ type: 'str', value: 'schema' });
    expect(fromHex.node.entries[1].value).toMatchObject({ type: 'uint', value: '0' });
  });

  it('preserves uint64 and int64 values with BigInt precision', () => {
    const decoded = decodeMessagePack(bytes(VECTOR_B_HEX));
    expect(decoded).not.toHaveProperty('error');
    expect(decoded.node.entries[0].value).toMatchObject({
      type: 'uint', formatName: 'uint64', value: '18446744073709551615',
    });
    expect(decoded.node.entries[1].value).toMatchObject({
      type: 'int', formatName: 'int64', value: '-1',
    });
  });

  it('reports binary bytes, invalid UTF-8, and registered or raw extensions', () => {
    expect(decodeMessagePack(bytes('c403deadbe')).node).toMatchObject({
      type: 'bin', value: 'deadbe', rawHex: 'deadbe',
    });
    expect(decodeMessagePack(bytes('d901ff')).node).toMatchObject({
      type: 'str', invalidUtf8: true, rawHex: 'ff',
    });
    expect(decodeMessagePack(bytes('d6ff00000000')).node).toMatchObject({
      type: 'ext', extensionType: -1, timestamp: '1970-01-01T00:00:00.000Z',
    });
    expect(decodeMessagePack(bytes('d403aa')).node).toMatchObject({
      type: 'ext', extensionType: 3, rawHex: 'aa',
    });
  });

  it.each([
    ['truncated string', Uint8Array.from([0xd9, 2, 0x61])],
    ['reserved byte', Uint8Array.from([0xc1])],
    ['array count overrun', Uint8Array.from([0xdc, 0, 2, 0xc0])],
    ['trailing bytes', Uint8Array.from([0xc0, 0xc0])],
  ])('returns an offset error without throwing for %s', (_name, input) => {
    expect(() => decodeMessagePack(input)).not.toThrow();
    const decoded = decodeMessagePack(input);
    expect(decoded.error).toMatch(/byte offset/i);
    expect(decoded).toHaveProperty('offset');
  });

  it('enforces depth and decoded-size caps without throwing', () => {
    const deep = decodeMessagePack(nestedArray(34), { maxDepth: 4 });
    expect(deep.error).toMatch(/Maximum recursion depth/);
    const oversized = decodeMessagePack(new Uint8Array(MAX_INPUT_BYTES + 1));
    expect(oversized.error).toMatch(/Payload too large/);
  });
});
