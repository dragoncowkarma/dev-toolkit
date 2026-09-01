import { describe, expect, it } from 'vitest';
import {
  buildQueryString,
  buildUrlOrQuery,
  detectDuplicates,
  parseUrlOrQuery,
} from './urlQuery.utils.js';

describe('urlQuery.utils - detectDuplicates', () => {
  it('identifies duplicate keys while preserving order', () => {
    const input = [
      { key: 'foo', value: '1' },
      { key: 'bar', value: '2' },
      { key: 'foo', value: '3' },
    ];
    const result = detectDuplicates(input);
    expect(result).toEqual([
      { key: 'foo', value: '1', isDuplicate: true },
      { key: 'bar', value: '2', isDuplicate: false },
      { key: 'foo', value: '3', isDuplicate: true },
    ]);
  });

  it('handles unique keys correctly', () => {
    const input = [
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ];
    const result = detectDuplicates(input);
    expect(result.every((item) => !item.isDuplicate)).toBe(true);
  });
});

describe('urlQuery.utils - buildQueryString & buildUrlOrQuery', () => {
  it('builds query string preserving duplicate keys and leading question mark', () => {
    const params = [
      { key: 'a', value: '1' },
      { key: 'b', value: 'hello world' },
      { key: 'a', value: '2' },
    ];
    expect(buildQueryString(params, true)).toBe('?a=1&b=hello+world&a=2');
    expect(buildQueryString(params, false)).toBe('a=1&b=hello+world&a=2');
  });

  it('reconstructs full URL maintaining origin, pathname, search, and hash', () => {
    const baseUrl = 'https://example.com:8080/path/page?old=val#section1';
    const params = [
      { key: 'q', value: 'search term' },
      { key: 'page', value: '2' },
      { key: 'q', value: 'duplicate' },
    ];
    const result = buildUrlOrQuery({
      isFullUrl: true,
      baseUrl,
      params,
    });
    expect(result).toBe('https://example.com:8080/path/page?q=search+term&page=2&q=duplicate#section1');
  });
});

describe('urlQuery.utils - parseUrlOrQuery', () => {
  it('parses full URLs into component parts and ordered parameters', () => {
    const input = 'https://user:pass@example.com:8080/search/item?foo=bar&baz=qux&foo=123#top';
    const result = parseUrlOrQuery(input);

    expect(result.isValid).toBe(true);
    expect(result.isFullUrl).toBe(true);
    expect(result.urlParts).toEqual({
      origin: 'https://example.com:8080',
      pathname: '/search/item',
      hash: '#top',
      protocol: 'https:',
      host: 'example.com:8080',
      hostname: 'example.com',
      port: '8080',
      search: '?foo=bar&baz=qux&foo=123',
    });
    expect(result.params).toHaveLength(3);
    expect(result.params[0]).toMatchObject({ key: 'foo', value: 'bar', isDuplicate: true });
    expect(result.params[1]).toMatchObject({ key: 'baz', value: 'qux', isDuplicate: false });
    expect(result.params[2]).toMatchObject({ key: 'foo', value: '123', isDuplicate: true });
  });

  it('parses bare query strings with leading ?', () => {
    const input = '?category=books&author=John%20Doe&category=tech';
    const result = parseUrlOrQuery(input);

    expect(result.isValid).toBe(true);
    expect(result.isFullUrl).toBe(false);
    expect(result.hasLeadingQuestionMark).toBe(true);
    expect(result.urlParts).toBeNull();
    expect(result.params).toHaveLength(3);
    expect(result.params[1]).toMatchObject({
      key: 'author',
      value: 'John Doe',
      isDuplicate: false,
    });
    expect(result.params[0].isDuplicate).toBe(true);
    expect(result.params[2].isDuplicate).toBe(true);
  });

  it('parses bare query strings without leading ?', () => {
    const input = 'a=1&b=2&a=3';
    const result = parseUrlOrQuery(input);

    expect(result.isValid).toBe(true);
    expect(result.isFullUrl).toBe(false);
    expect(result.hasLeadingQuestionMark).toBe(false);
    expect(result.params).toHaveLength(3);
    expect(result.normalizedUrl).toBe('a=1&b=2&a=3');
  });

  it('handles empty parameter keys and values', () => {
    const input = '?emptyVal=&emptyKey=bar&=';
    const result = parseUrlOrQuery(input);

    expect(result.isValid).toBe(true);
    expect(result.params).toHaveLength(3);
    expect(result.params[0]).toMatchObject({ key: 'emptyVal', value: '' });
    expect(result.params[1]).toMatchObject({ key: 'emptyKey', value: 'bar' });
    expect(result.params[2]).toMatchObject({ key: '', value: '' });
  });

  it('returns empty result for empty or whitespace input', () => {
    const result = parseUrlOrQuery('   ');
    expect(result.isValid).toBe(true);
    expect(result.params).toHaveLength(0);
    expect(result.normalizedUrl).toBe('');
  });

  it('reports error for malformed full URLs with invalid scheme syntax', () => {
    const result = parseUrlOrQuery('http:// invalid url');
    expect(result.isValid).toBe(false);
    expect(result.isFullUrl).toBe(true);
    expect(result.error).toMatch(/Invalid URL format/);
  });

  it('parses host:port or colon-containing bare params as query strings', () => {
    const resHostPort = parseUrlOrQuery('localhost:8080');
    expect(resHostPort.isValid).toBe(true);
    expect(resHostPort.isFullUrl).toBe(false);
    expect(resHostPort.urlParts).toBeNull();
    expect(resHostPort.params).toHaveLength(1);
    expect(resHostPort.params[0]).toMatchObject({ key: 'localhost:8080', value: '' });

    const resColonParam = parseUrlOrQuery('foo:bar=baz');
    expect(resColonParam.isValid).toBe(true);
    expect(resColonParam.isFullUrl).toBe(false);
    expect(resColonParam.urlParts).toBeNull();
    expect(resColonParam.params).toHaveLength(1);
    expect(resColonParam.params[0]).toMatchObject({ key: 'foo:bar', value: 'baz' });
  });
});
