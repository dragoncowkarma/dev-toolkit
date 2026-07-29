import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  HASH_ALGORITHMS,
  HASH_FORMATS,
  hashData,
  hashFile,
  hashText,
} from './hash.utils.js';

const EXPECTED_HEX = {
  'SHA-1': 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d',
  'SHA-256': '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  'SHA-384': [
    '59e1748777448c69de6b800d7a33bbfb9ff1b463e44354c3553bcdb9c666fa90',
    '125a3c79f90397bdf5f6a13de828684f',
  ].join(''),
  'SHA-512': [
    '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca7',
    '2323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043',
  ].join(''),
};

beforeAll(() => {
  vi.stubGlobal('crypto', webcrypto);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('hashText', () => {
  it.each(HASH_ALGORITHMS)('creates the expected %s Hex digest', async (algorithm) => {
    await expect(hashText('hello', algorithm)).resolves.toBe(EXPECTED_HEX[algorithm]);
  });

  it('creates a Base64 digest', async () => {
    await expect(
      hashText('hello', 'SHA-256', HASH_FORMATS.BASE64)
    ).resolves.toBe('LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=');
  });

  it('hashes text as UTF-8 bytes', async () => {
    const encoded = new TextEncoder().encode('안녕 🚀');
    const expected = await hashData(encoded, 'SHA-256');
    await expect(hashText('안녕 🚀', 'SHA-256')).resolves.toBe(expected);
  });

  it('rejects unsupported algorithms and formats', async () => {
    await expect(hashText('hello', 'MD5')).rejects.toThrow('Unsupported hash algorithm');
    await expect(hashText('hello', 'SHA-256', 'binary')).rejects.toThrow(
      'Unsupported hash format'
    );
  });

  it('rejects non-string input', () => {
    expect(() => hashText(123, 'SHA-256')).toThrow(TypeError);
  });
});

describe('hashData', () => {
  it('accepts an ArrayBuffer view', async () => {
    const bytes = new Uint8Array([104, 101, 108, 108, 111]);
    await expect(hashData(bytes, 'SHA-1')).resolves.toBe(EXPECTED_HEX['SHA-1']);
  });

  it('rejects unsupported input types', async () => {
    await expect(hashData('hello', 'SHA-256')).rejects.toThrow(TypeError);
  });
});

describe('hashFile', () => {
  it('hashes the exact file bytes', async () => {
    const file = {
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('hello').buffer),
    };

    await expect(hashFile(file, 'SHA-256')).resolves.toBe(EXPECTED_HEX['SHA-256']);
    expect(file.arrayBuffer).toHaveBeenCalledOnce();
  });

  it('rejects unreadable file-like values', async () => {
    await expect(hashFile({}, 'SHA-256')).rejects.toThrow('A readable file is required');
  });
});
