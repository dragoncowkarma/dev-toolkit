import { describe, expect, it, vi } from 'vitest';
import {
  ALGORITHMS,
  FORMATS,
  formatFileSize,
  formatHash,
  hashBytes,
  hashFile,
  hashText,
} from './hash.utils.js';

describe('hashText MD5', () => {
  it('matches the known digest for an empty string', async () => {
    expect(await hashText('MD5', '')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('matches the known digest for "hello"', async () => {
    expect(await hashText('MD5', 'hello')).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('matches the known digest for a pangram', async () => {
    expect(await hashText('MD5', 'The quick brown fox jumps over the lazy dog')).toBe(
      '9e107d9d372bb6826bd81d3542a419d6'
    );
  });

  it('handles multi-byte UTF-8 text', async () => {
    expect(await hashText('MD5', '안녕하세요 🚀')).toMatch(/^[0-9a-f]{32}$/);
  });

  it('throws for non-string input', async () => {
    await expect(hashText('MD5', 123)).rejects.toThrow(TypeError);
  });
});

describe('hashText SHA variants', () => {
  it('matches the known SHA-1 digest for "hello"', async () => {
    expect(await hashText('SHA-1', 'hello')).toBe(
      'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d'
    );
  });

  it('matches the known SHA-256 digest for "hello"', async () => {
    expect(await hashText('SHA-256', 'hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('matches the known SHA-512 digest for "hello"', async () => {
    expect(await hashText('SHA-512', 'hello')).toBe(
      '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7' +
        'acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043'
    );
  });

  it('produces different digests per algorithm for the same input', async () => {
    const results = await Promise.all(ALGORITHMS.map((algo) => hashText(algo, 'consistency')));
    expect(new Set(results).size).toBe(ALGORITHMS.length);
  });
});

describe('hashBytes', () => {
  it('throws for an unsupported algorithm', async () => {
    await expect(hashBytes('SHA-3', new Uint8Array())).rejects.toThrow(/Unsupported algorithm/);
  });
});

describe('hashFile', () => {
  it('computes the digest of a file', async () => {
    const file = new File(['hello'], 'greeting.txt', { type: 'text/plain' });
    expect(await hashFile('MD5', file)).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('rejects when the file cannot be read', async () => {
    const failingReader = {
      readAsArrayBuffer: vi.fn(function readAsArrayBuffer() {
        this.onerror(new Error('boom'));
      }),
    };
    const OriginalFileReader = global.FileReader;
    global.FileReader = vi.fn(function FileReader() {
      return failingReader;
    });

    await expect(hashFile('MD5', new File(['x'], 'x.txt'))).rejects.toThrow(
      'Failed to read the selected file.'
    );

    global.FileReader = OriginalFileReader;
  });
});

describe('formatHash', () => {
  it('lowercases by default', () => {
    expect(formatHash('ABC123', FORMATS.LOWER)).toBe('abc123');
  });

  it('uppercases when requested', () => {
    expect(formatHash('abc123', FORMATS.UPPER)).toBe('ABC123');
  });
});

describe('formatFileSize', () => {
  it('formats bytes below 1KB', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });
});
