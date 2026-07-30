import { describe, expect, it } from 'vitest';
import { decodeUrl, encodeUrl, isValidUrl, parseQueryParams } from './url.utils.js';

describe('encodeUrl', () => {
  it('encodes reserved and special characters', () => {
    expect(encodeUrl('hello world/&?=')).toBe('hello%20world%2F%26%3F%3D');
  });

  it('encodes an empty string', () => {
    expect(encodeUrl('')).toBe('');
  });

  it('round-trips multi-byte UTF-8 text', () => {
    const original = '안녕하세요 🚀';
    expect(decodeUrl(encodeUrl(original))).toBe(original);
  });

  it('throws for non-string input', () => {
    expect(() => encodeUrl(123)).toThrow(TypeError);
  });
});

describe('decodeUrl', () => {
  it('decodes a percent-encoded string', () => {
    expect(decodeUrl('hello%20world')).toBe('hello world');
  });

  it('decodes an empty string', () => {
    expect(decodeUrl('')).toBe('');
  });

  it('throws a descriptive error for malformed percent-encoding', () => {
    expect(() => decodeUrl('100%')).toThrow(/Invalid percent-encoding/);
  });

  it('throws for non-string input', () => {
    expect(() => decodeUrl(123)).toThrow(TypeError);
  });
});

describe('isValidUrl', () => {
  it('returns true for well-formed absolute URLs', () => {
    expect(isValidUrl('https://example.com/path?a=1')).toBe(true);
    expect(isValidUrl('ftp://files.example.com')).toBe(true);
  });

  it('returns false for relative paths or malformed input', () => {
    expect(isValidUrl('/just/a/path')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('returns false for empty or non-string input', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('   ')).toBe(false);
    expect(isValidUrl(undefined)).toBe(false);
  });
});

describe('parseQueryParams', () => {
  it('parses parameters from a full URL', () => {
    expect(parseQueryParams('https://example.com/search?q=hello+world&sort=asc')).toEqual([
      { key: 'q', value: 'hello world' },
      { key: 'sort', value: 'asc' },
    ]);
  });

  it('parses a bare "?"-prefixed query string', () => {
    expect(parseQueryParams('?a=1&b=2')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });

  it('parses a bare query string without a leading "?"', () => {
    expect(parseQueryParams('a=1&b=2')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });

  it('decodes percent-encoded parameter values', () => {
    expect(parseQueryParams('?name=John%20Doe')).toEqual([{ key: 'name', value: 'John Doe' }]);
  });

  it('preserves repeated keys as separate entries', () => {
    expect(parseQueryParams('?tag=a&tag=b')).toEqual([
      { key: 'tag', value: 'a' },
      { key: 'tag', value: 'b' },
    ]);
  });

  it('returns an empty array for input with no query string', () => {
    expect(parseQueryParams('https://example.com/path')).toEqual([]);
  });

  it('returns an empty array for empty or non-string input', () => {
    expect(parseQueryParams('')).toEqual([]);
    expect(parseQueryParams(undefined)).toEqual([]);
  });

  it('returns an empty array for plain text containing "&" but no "?" or "="', () => {
    expect(parseQueryParams('hello world&more')).toEqual([]);
  });

  it('returns an empty array for a relative path with no "?"', () => {
    expect(parseQueryParams('/just/a/path')).toEqual([]);
    expect(parseQueryParams('some/relative/path')).toEqual([]);
  });

  it('parses a relative path that has a "?" query section', () => {
    expect(parseQueryParams('relative/path?query=1&other=2')).toEqual([
      { key: 'query', value: '1' },
      { key: 'other', value: '2' },
    ]);
  });
});
