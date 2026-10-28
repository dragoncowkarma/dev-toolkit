import { describe, expect, it, vi } from 'vitest';
import {
  decodeBase62ToBytes,
  decodeFromBase62,
  encodeBytesToBase62,
  encodeToBase62,
  fileToBytes,
} from './base62.utils.js';

describe('Base62 byte conversion', () => {
  it('uses the standard Base62 alphabet', () => {
    expect(encodeBytesToBase62(new Uint8Array([0, 1, 2, 255]))).toMatch(/^[0-9A-Za-z]+$/);
    expect(encodeBytesToBase62(new Uint8Array([0, 0, 0, 61, 62]))).toBe('00044s');
  });

  it('round-trips binary data and leading zeroes', () => {
    const bytes = new Uint8Array([0, 0, 1, 2, 3, 127, 128, 255]);
    expect(decodeBase62ToBytes(encodeBytesToBase62(bytes))).toEqual(bytes);
  });

  it('round-trips UTF-8 text', () => {
    const text = '안녕하세요 🚀';
    expect(decodeFromBase62(encodeToBase62(text))).toBe(text);
  });

  it('rejects characters outside the Base62 alphabet', () => {
    expect(() => decodeBase62ToBytes('abc+def')).toThrow(/Invalid Base62 character/);
    expect(() => decodeBase62ToBytes('a b')).toThrow(/Invalid Base62 character/);
  });

  it('reports binary data when decoding as UTF-8 text', () => {
    expect(() => decodeFromBase62(encodeBytesToBase62(new Uint8Array([255])))).toThrow(/binary/);
  });
});

describe('fileToBytes', () => {
  it('reads file bytes through FileReader', async () => {
    const file = new File([new Uint8Array([0, 255, 3])], 'data.bin');
    await expect(fileToBytes(file)).resolves.toEqual(new Uint8Array([0, 255, 3]));
  });

  it('rejects when FileReader fails', async () => {
    const original = global.FileReader;
    global.FileReader = vi.fn(function FileReader() {
      return { readAsArrayBuffer() { this.onerror(); } };
    });
    await expect(fileToBytes(new File(['x'], 'x.bin'))).rejects.toThrow('Failed to read');
    global.FileReader = original;
  });
});
