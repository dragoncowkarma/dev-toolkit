import { describe, expect, it } from 'vitest';
import {
  decodeAscii85ToBytes,
  decodeFromBase85,
  decodeZ85ToBytes,
  encodeBytesToAscii85,
  encodeBytesToZ85,
  encodeToBase85,
} from './base85.utils.js';

describe('Ascii85', () => {
  it('round-trips UTF-8 text and partial byte groups', () => {
    const original = 'Hello, 안녕!';
    const encoded = encodeToBase85(original);

    expect(encoded).toMatch(/^<~.+~>$/);
    expect(decodeFromBase85(encoded)).toBe(original);
    const partialGroup = encodeBytesToAscii85(Uint8Array.of(1, 2, 3));
    expect(decodeAscii85ToBytes(partialGroup)).toEqual(
      Uint8Array.of(1, 2, 3)
    );
  });

  it('round-trips every partial final byte group without delimiters', () => {
    for (const bytes of [
      Uint8Array.of(1),
      Uint8Array.of(1, 2),
      Uint8Array.of(1, 2, 3),
    ]) {
      const encoded = encodeBytesToAscii85(bytes, { delimiters: false });
      expect(decodeAscii85ToBytes(encoded)).toEqual(bytes);
    }
  });

  it('supports empty values and optional delimiters', () => {
    expect(encodeToBase85('')).toBe('<~~>');
    expect(decodeFromBase85('<~~>')).toBe('');
    expect(encodeToBase85('', { delimiters: false })).toBe('');
    expect(decodeFromBase85('BOu!rDZ')).toBe('hello');
    expect(decodeFromBase85('<~BOu!rDZ~>')).toBe('hello');
  });

  it('encodes and decodes z zero-block shorthand', () => {
    expect(
      encodeBytesToAscii85(Uint8Array.of(0, 0, 0, 0), { delimiters: false })
    ).toBe('z');
    expect(decodeAscii85ToBytes('z')).toEqual(Uint8Array.of(0, 0, 0, 0));
  });

  it('rejects malformed delimiters, groups, shorthand, and alphabet characters', () => {
    expect(() => decodeFromBase85('<~z')).toThrow('Ascii85 delimiters');
    expect(() => decodeFromBase85('!')).toThrow('incomplete final group');
    expect(() => decodeFromBase85('!z')).toThrow('shorthand must appear');
    expect(() => decodeFromBase85('v')).toThrow('invalid character');
    expect(() => decodeFromBase85('uuuuu')).toThrow('larger than four bytes');
  });
});

describe('Z85', () => {
  it('round-trips complete four-byte groups', () => {
    const bytes = Uint8Array.of(0x86, 0x4f, 0xd2, 0x6f);
    const encoded = encodeBytesToZ85(bytes);

    expect(encoded).toBe('Hello');
    expect(decodeZ85ToBytes(encoded)).toEqual(bytes);
    const text = encodeToBase85('test', { variant: 'z85' });
    expect(decodeFromBase85(text, { variant: 'z85' })).toBe('test');
  });

  it('rejects invalid alphabet characters and malformed group lengths', () => {
    expect(() => decodeZ85ToBytes('Hell~')).toThrow('invalid character');
    expect(() => decodeZ85ToBytes('Hell')).toThrow('multiple of 5');
    expect(() => decodeZ85ToBytes('Hell ')).toThrow('invalid character');
    expect(() => encodeBytesToZ85(Uint8Array.of(1, 2, 3))).toThrow('multiple of 4');
    expect(() => encodeToBase85('abc', { variant: 'z85' })).toThrow('multiple of 4');
  });
});
