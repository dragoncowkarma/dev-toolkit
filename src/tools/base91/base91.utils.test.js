import { describe, expect, it } from 'vitest';
import {
  decodeBase91ToBytes,
  decodeFromBase91,
  encodeBytesToBase91,
  encodeToBase91,
} from './base91.utils.js';

describe('Base91 utilities', () => {
  it('encodes the standard basE91 hello vector', () => {
    expect(encodeToBase91('Hello World!')).toBe('>OwJh>Io0Tv!8PE');
  });

  it('round-trips ASCII, UTF-8 text, and an empty string', () => {
    for (const text of ['hello', '안녕하세요 🚀', '']) {
      expect(decodeFromBase91(encodeToBase91(text))).toBe(text);
    }
  });

  it('round-trips arbitrary binary bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    expect(decodeBase91ToBytes(encodeBytesToBase91(bytes))).toEqual(bytes);
  });

  it('rejects unsupported characters and non-canonical truncated data', () => {
    expect(() => decodeFromBase91('abc space')).toThrow(/Invalid Base91/);
    expect(() => decodeFromBase91('A')).toThrow(/truncated or malformed/);
  });
});
