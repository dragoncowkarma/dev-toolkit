import { describe, expect, it } from 'vitest';
import { decodeMessagePack } from '../messagepack-decoder/messagepackDecoder.utils.js';
import {
  MAX_INPUT_BYTES,
  MESSAGEPACK_ENCODER_SAMPLES,
  encodeMessagePack,
  formatMessagePackOutputs,
  parseMessagePackEncoderInput,
} from './messagepackEncoder.utils.js';

function hex(value, options) {
  const encoded = encodeMessagePack(value, options);
  if ('error' in encoded) return encoded;
  return formatMessagePackOutputs(encoded.bytes).hex;
}

describe('encodeMessagePack primitives', () => {
  it('uses the shortest positive integer format through uint64', () => {
    expect(hex(0)).toBe('00');
    expect(hex(127)).toBe('7f');
    expect(hex(128)).toBe('cc80');
    expect(hex(255)).toBe('ccff');
    expect(hex(256)).toBe('cd0100');
    expect(hex(65535)).toBe('cdffff');
    expect(hex(65536)).toBe('ce00010000');
    expect(hex(4294967295)).toBe('ceffffffff');
    expect(hex(4294967296n)).toBe('cf0000000100000000');
  });

  it('uses negative fixint through int64 without widening', () => {
    expect(hex(-1)).toBe('ff');
    expect(hex(-32)).toBe('e0');
    expect(hex(-33)).toBe('d0df');
    expect(hex(-128)).toBe('d080');
    expect(hex(-129)).toBe('d1ff7f');
    expect(hex(-32768)).toBe('d18000');
    expect(hex(-32769)).toBe('d2ffff7fff');
    expect(hex(-2147483648)).toBe('d280000000');
    expect(hex(-2147483649n)).toBe('d3ffffffff7fffffff');
  });

  it('encodes booleans, nil, and all JSON floats as IEEE 754 float64', () => {
    expect(hex([false, true, null])).toBe('93c2c3c0');
    expect(hex(1.5)).toBe('cb3ff8000000000000');
    expect(hex(-0)).toBe('cb8000000000000000');
  });
});

describe('encodeMessagePack strings and containers', () => {
  it('encodes UTF-8 strings using fixstr, str8, and str16', () => {
    expect(hex('é')).toBe('a2c3a9');
    expect(hex('x'.repeat(32))).toBe(`d920${'78'.repeat(32)}`);
    expect(hex('x'.repeat(256))).toBe(`da0100${'78'.repeat(256)}`);
  });

  it('encodes arrays and maps with definite lengths and insertion order', () => {
    expect(hex(['a', 1])).toBe('92a16101');
    expect(hex(Array(16).fill(0))).toBe(`dc0010${'00'.repeat(16)}`);
    expect(hex({ hello: 'world' })).toBe('81a568656c6c6fa5776f726c64');
    expect(hex(new Map([[1, 'one'], ['two', 2]]))).toBe('8201a36f6e65a374776f02');
  });
});

describe('MessagePack encoder input safety and errors', () => {
  it('reports malformed JSON and input-size violations without throwing', () => {
    expect(() => parseMessagePackEncoderInput('{hello}')).not.toThrow();
    expect(parseMessagePackEncoderInput('{hello}').error).toMatch(/Malformed JSON/i);
    const oversized = parseMessagePackEncoderInput('x'.repeat(MAX_INPUT_BYTES + 1));
    expect(oversized.error).toMatch(/too large/i);
  });

  it('reports invalid map keys, non-finite values, and depth limits without throwing', () => {
    expect(() => encodeMessagePack(new Map([[true, 1]]))).not.toThrow();
    expect(encodeMessagePack(new Map([[true, 1]])).error).toMatch(/Map keys/i);
    expect(encodeMessagePack(Infinity).error).toMatch(/NaN and Infinity/i);
    expect(() => encodeMessagePack([[[1]]], { maxDepth: 2 })).not.toThrow();
    expect(encodeMessagePack([[[1]]], { maxDepth: 2 }).error).toMatch(/nesting depth/i);
  });
});

describe('MessagePack encoder outputs and samples', () => {
  it('formats selectable Hex, Base64, and Base64URL output', () => {
    const encoded = encodeMessagePack({ hello: 'world' });
    expect(formatMessagePackOutputs(encoded.bytes)).toEqual({
      hex: '81a568656c6c6fa5776f726c64',
      base64: 'gaVoZWxsb6V3b3JsZA==',
      base64url: 'gaVoZWxsb6V3b3JsZA',
    });
  });

  it('ships JSON samples that the MessagePack Decoder accepts', () => {
    MESSAGEPACK_ENCODER_SAMPLES.forEach((sample) => {
      const parsed = parseMessagePackEncoderInput(sample.value);
      expect(parsed).not.toHaveProperty('error');
      const encoded = encodeMessagePack(parsed.value);
      expect(encoded).not.toHaveProperty('error');
      expect(decodeMessagePack(encoded.bytes)).not.toHaveProperty('error');
    });
  });
});
