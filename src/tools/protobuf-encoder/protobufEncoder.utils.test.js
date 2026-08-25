import { describe, expect, it } from 'vitest';
import * as protobufDecoderUtils from '../protobuf-decoder/protobufDecoder.utils.js';
import {
  encodeProtobufJson,
  encodeVarint,
  formatProtobufBytes,
  parseProtobufFields,
} from './protobufEncoder.utils.js';

describe('encodeProtobufJson', () => {
  it('encodes all supported wire types in field order', () => {
    const result = encodeProtobufJson(JSON.stringify([
      { field: 1, wireType: 'varint', value: 150 },
      { field: 2, wireType: '64-bit', value: '72623859790382856' },
      { field: 3, wireType: 'length-delimited', value: 'Hi' },
      { field: 4, wireType: '32-bit', value: 16909060 },
    ]));

    expect(result).toMatchObject({
      hex: '08 96 01 11 08 07 06 05 04 03 02 01 1a 02 48 69 25 04 03 02 01',
      base64: 'CJYBEQgHBgUEAwIBGgJIaSUEAwIB',
    });
  });

  it('encodes nested and repeated fields', () => {
    const result = encodeProtobufJson(JSON.stringify({ fields: [
      { fieldNumber: 1, wireType: 'varint', value: 1 },
      { fieldNumber: 1, wireType: 'varint', value: 2 },
      {
        fieldNumber: 2,
        wireType: 'length-delimited',
        value: { fields: [{ field: 3, wireType: 'length-delimited', value: 'ok' }] },
      },
    ] }));

    expect(result).toMatchObject({ hex: '08 01 08 02 12 04 1a 02 6f 6b' });
  });

  it('re-encodes the schema-less protobuf decoder output byte-for-byte', () => {
    const encoded = encodeProtobufJson(JSON.stringify([
      { field: 1, wireType: 'varint', value: 150 },
      { field: 2, wireType: '64-bit', value: '72623859790382856' },
      { field: 3, wireType: 'length-delimited', value: 'Hi' },
      { field: 4, wireType: '32-bit', value: 16909060 },
    ]));
    expect(encoded).not.toHaveProperty('error');

    const decodeProtobuf = Object.entries(protobufDecoderUtils).find(
      ([name]) => name.toLowerCase() === 'decodeprotobuf',
    )?.[1];
    expect(decodeProtobuf).toBeTypeOf('function');

    const decoded = decodeProtobuf(encoded.bytes);
    const reencoded = encodeProtobufJson(JSON.stringify(decoded));
    expect(reencoded).not.toHaveProperty('error');
    expect(reencoded.bytes).toEqual(encoded.bytes);
  });

  it('supports raw hex and Base64 length-delimited byte values', () => {
    const result = encodeProtobufJson(JSON.stringify([
      { field: 1, wireType: 'length-delimited', value: { hex: 'deadbeef' } },
      { field: 2, wireType: 'length-delimited', value: { base64: 'AAE=' } },
      { field: 3, wireType: 'length-delimited', value: { hex: '' } },
    ]));

    expect(result).toMatchObject({ hex: '0a 04 de ad be ef 12 02 00 01 1a 00' });
  });

  it('returns a clear error for malformed or unsupported fields', () => {
    expect(encodeProtobufJson('{')).toMatchObject({ error: expect.stringMatching(/Invalid JSON/) });
    expect(encodeProtobufJson('[{"field":0,"wireType":"varint","value":1}]')).toMatchObject({
      error: expect.stringMatching(/between 1/),
    });
    expect(encodeProtobufJson('[{"field":1,"wireType":"group","value":1}]')).toMatchObject({
      error: expect.stringMatching(/wireType/),
    });
  });
});

describe('protobuf encoder helpers', () => {
  it('uses the canonical varint and display encodings', () => {
    expect(encodeVarint(300n)).toEqual([0xac, 0x02]);
    expect(formatProtobufBytes(Uint8Array.from([0xff]))).toEqual({
      hex: 'ff', base64: '/w==', base64url: '_w',
    });
  });

  it('does not throw for a non-array JSON document', () => {
    expect(parseProtobufFields('{"field":1}')).toMatchObject({ error: expect.any(String) });
  });
});
