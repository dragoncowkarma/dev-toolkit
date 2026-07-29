import { describe, expect, it, vi } from 'vitest';
import {
  decodeFromBase64,
  encodeToBase64,
  fileToBase64,
  formatFileSize,
  isValidBase64,
} from './base64.utils.js';

describe('encodeToBase64', () => {
  it('encodes plain ASCII text', () => {
    expect(encodeToBase64('hello')).toBe('aGVsbG8=');
  });

  it('encodes an empty string', () => {
    expect(encodeToBase64('')).toBe('');
  });

  it('round-trips multi-byte UTF-8 text', () => {
    const original = '안녕하세요 🚀';
    expect(decodeFromBase64(encodeToBase64(original))).toBe(original);
  });

  it('throws for non-string input', () => {
    expect(() => encodeToBase64(123)).toThrow(TypeError);
  });
});

describe('decodeFromBase64', () => {
  it('decodes a valid Base64 string', () => {
    expect(decodeFromBase64('aGVsbG8=')).toBe('hello');
  });

  it('decodes an empty string', () => {
    expect(decodeFromBase64('')).toBe('');
  });

  it('ignores surrounding whitespace and newlines', () => {
    expect(decodeFromBase64('  aGVsbG8=\n')).toBe('hello');
  });

  it('throws a descriptive error for invalid Base64', () => {
    expect(() => decodeFromBase64('not-valid-base64!')).toThrow(/Invalid Base64/);
  });

  it('throws for malformed padding', () => {
    expect(() => decodeFromBase64('abc')).toThrow(/Invalid Base64/);
  });
});

describe('isValidBase64', () => {
  it('returns true for valid Base64 strings', () => {
    expect(isValidBase64('aGVsbG8=')).toBe(true);
    expect(isValidBase64('')).toBe(true);
  });

  it('returns false for invalid Base64 strings', () => {
    expect(isValidBase64('not-valid-base64!')).toBe(false);
    expect(isValidBase64('abc')).toBe(false);
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

describe('fileToBase64', () => {
  it('converts a file to a Base64 string', async () => {
    const file = new File(['hello'], 'greeting.txt', { type: 'text/plain' });
    const result = await fileToBase64(file);
    expect(result).toBe('aGVsbG8=');
  });

  it('rejects when the file cannot be read', async () => {
    const failingReader = {
      readAsDataURL: vi.fn(function readAsDataURL() {
        this.onerror(new Error('boom'));
      }),
    };
    const OriginalFileReader = global.FileReader;
    global.FileReader = vi.fn(function FileReader() {
      return failingReader;
    });

    await expect(fileToBase64(new File(['x'], 'x.txt'))).rejects.toThrow(
      'Failed to read the selected file.'
    );

    global.FileReader = OriginalFileReader;
  });
});
