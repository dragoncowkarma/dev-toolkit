import { describe, expect, it } from 'vitest';
import {
  CBOR_ENCODER_SAMPLES,
  MAX_INPUT_BYTES,
  encodeCbor,
  formatCborOutputs,
  parseCborEncoderInput,
} from './cborEncoder.utils.js';

function hex(value, options) {
  const encoded = encodeCbor(value, options);
  if ('error' in encoded) return encoded;
  return formatCborOutputs(encoded.bytes).hex;
}

describe('encodeCbor RFC 8949 major types', () => {
  it('uses shortest integer encoding for unsigned and negative values', () => {
    expect(hex([0, 23, 24, 255, 256, 65536, -1, -24, -25])).toBe(
      '890017181818ff1901001a0001000020373818',
    );
  });

  it('encodes explicit byte strings, UTF-8 text, arrays, and insertion-ordered maps', () => {
    expect(hex(new Uint8Array([1, 2]))).toBe('420102');
    expect(hex('hi')).toBe('626869');
    expect(hex(['a', 1])).toBe('82616101');
    expect(hex({ hello: 'world' })).toBe('a16568656c6c6f65776f726c64');
  });

  it('encodes booleans, null, and shortest exactly round-trippable floats', () => {
    expect(hex([false, true, null])).toBe('83f4f5f6');
    expect(hex(1.5)).toBe('f93e00');
    expect(hex(1.1)).toBe('fb3ff199999999999a');
  });

  it('keeps diagnostic byte strings distinct from ordinary JSON text', () => {
    const diagnostic = parseCborEncoderInput("h'0102'", 'diagnostic');
    expect(diagnostic).not.toHaveProperty('error');
    expect(hex(diagnostic.value)).toBe('420102');
    expect(hex("h'0102'")).toBe('6768273031303227');
  });

  it('encodes decoder-compatible tags for the round-trip sample', () => {
    const parsed = parseCborEncoderInput(CBOR_ENCODER_SAMPLES[2].value, 'diagnostic');
    expect(parsed).not.toHaveProperty('error');
    expect(hex(parsed.value)).toBe('82c11a6553f100c249010000000000000000');
  });
});

describe('CBOR encoder parsing and safety failures', () => {
  it('reports malformed JSON and diagnostic notation without throwing', () => {
    expect(() => parseCborEncoderInput('{hello}', 'json')).not.toThrow();
    expect(parseCborEncoderInput('{hello}', 'json').error).toMatch(/Malformed JSON/i);
    expect(() => parseCborEncoderInput("h'0'", 'diagnostic')).not.toThrow();
    expect(parseCborEncoderInput("h'0'", 'diagnostic').error).toMatch(/Malformed diagnostic/i);
  });

  it('reports input-size, depth, map-key, and non-finite failures without throwing', () => {
    const tooLarge = parseCborEncoderInput('x'.repeat(MAX_INPUT_BYTES + 1), 'json');
    expect(tooLarge.error).toMatch(/too large/i);
    expect(() => encodeCbor([[[1]]], { maxDepth: 2 })).not.toThrow();
    expect(encodeCbor([[[1]]], { maxDepth: 2 }).error).toMatch(/nesting depth/i);
    expect(encodeCbor(new Map([[true, 1]])).error).toMatch(/Map keys/i);
    expect(encodeCbor(Infinity).error).toMatch(/NaN and Infinity/i);
  });
});

describe('CBOR encoder output formats and samples', () => {
  it('formats correct Hex, Base64, and Base64URL results', () => {
    const encoded = encodeCbor({ hello: 'world' });
    expect(formatCborOutputs(encoded.bytes)).toEqual({
      hex: 'a16568656c6c6f65776f726c64',
      base64: 'oWVoZWxsb2V3b3JsZA==',
      base64url: 'oWVoZWxsb2V3b3JsZA',
    });
  });

  it('ships encoder inputs matching every decoder sample', () => {
    const expected = [
      'a16568656c6c6f65776f726c64',
      'a363666d74646e6f6e6568617574684461746144deadbeef6661747453746da0',
      '82c11a6553f100c249010000000000000000',
    ];
    CBOR_ENCODER_SAMPLES.forEach((sample, index) => {
      const parsed = parseCborEncoderInput(sample.value, sample.format);
      expect(parsed).not.toHaveProperty('error');
      expect(hex(parsed.value)).toBe(expected[index]);
    });
  });
});
