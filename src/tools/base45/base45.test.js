import { describe, expect, it } from 'vitest';
import {
  decodeBase45ToBytes,
  decodeFromBase45,
  encodeBytesToBase45,
  encodeToBase45,
  isValidBase45,
} from './base45.utils.js';

describe('Base45 RFC 9285 conversion', () => {
  it.each([
    ['AB', 'BB8'],
    ['Hello!!', '%69 VD92EX0'],
    ['base-45', 'UJCLQE7W581'],
  ])('encodes the RFC 9285 vector %s', (plainText, encoded) => {
    expect(encodeToBase45(plainText)).toBe(encoded);
  });

  it('decodes the RFC 9285 decoding vector', () => {
    expect(decodeFromBase45('QED8WEX0')).toBe('ietf!');
  });

  it('round-trips multi-byte UTF-8 text', () => {
    const original = '안녕하세요 🚀';
    expect(decodeFromBase45(encodeToBase45(original))).toBe(original);
  });

  it('round-trips arbitrary bytes', () => {
    const bytes = Uint8Array.from([0, 1, 127, 128, 255]);
    expect(decodeBase45ToBytes(encodeBytesToBase45(bytes))).toEqual(bytes);
  });
});

describe('Base45 validation', () => {
  it('rejects characters outside the RFC 9285 alphabet', () => {
    expect(() => decodeBase45ToBytes('BBa')).toThrow(/character "a"/);
  });

  it('rejects an impossible one-character group', () => {
    expect(() => decodeBase45ToBytes('A')).toThrow(/three-character groups/);
  });

  it('rejects a three-character group above 65535', () => {
    expect(() => decodeBase45ToBytes('GGW')).toThrow(/byte range/);
  });

  it('rejects a final two-character group above 255', () => {
    expect(() => decodeBase45ToBytes('::')).toThrow(/byte range/);
  });

  it('reports binary payloads that are not UTF-8 text', () => {
    expect(() => decodeFromBase45('U5')).toThrow(/valid UTF-8 text/);
  });

  it('returns false for invalid values', () => {
    expect(isValidBase45('BB8')).toBe(true);
    expect(isValidBase45('GGW')).toBe(false);
    expect(isValidBase45('A')).toBe(false);
    expect(isValidBase45('')).toBe(true);
  });
});
