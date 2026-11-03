import { describe, expect, it } from 'vitest';
import {
  buildQueryString,
  buildUrlOrQuery,
  detectDuplicates,
  moveParam,
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

describe('urlQuery.utils - moveParam', () => {
  const baseParams = [
    { id: 'p0', key: 'a', value: '1', isDuplicate: false },
    { id: 'p1', key: 'b', value: '2', isDuplicate: false },
    { id: 'p2', key: 'c', value: '3', isDuplicate: false },
  ];

  it('moves first row to middle or last position', () => {
    const movedToMiddle = moveParam(baseParams, 0, 1);
    expect(movedToMiddle.map((p) => p.key)).toEqual(['b', 'a', 'c']);
    expect(movedToMiddle[1]).toMatchObject({ id: 'p0', key: 'a', value: '1' });

    const movedToEnd = moveParam(baseParams, 0, 2);
    expect(movedToEnd.map((p) => p.key)).toEqual(['b', 'c', 'a']);
    expect(movedToEnd[2]).toMatchObject({ id: 'p0', key: 'a', value: '1' });
  });

  it('moves middle row up or down', () => {
    const movedUp = moveParam(baseParams, 1, 0);
    expect(movedUp.map((p) => p.key)).toEqual(['b', 'a', 'c']);
    expect(movedUp[0]).toMatchObject({ id: 'p1', key: 'b', value: '2' });

    const movedDown = moveParam(baseParams, 1, 2);
    expect(movedDown.map((p) => p.key)).toEqual(['a', 'c', 'b']);
    expect(movedDown[2]).toMatchObject({ id: 'p1', key: 'b', value: '2' });
  });

  it('moves last row to middle or first position', () => {
    const movedToMiddle = moveParam(baseParams, 2, 1);
    expect(movedToMiddle.map((p) => p.key)).toEqual(['a', 'c', 'b']);
    expect(movedToMiddle[1]).toMatchObject({ id: 'p2', key: 'c', value: '3' });

    const movedToFirst = moveParam(baseParams, 2, 0);
    expect(movedToFirst.map((p) => p.key)).toEqual(['c', 'a', 'b']);
    expect(movedToFirst[0]).toMatchObject({ id: 'p2', key: 'c', value: '3' });
  });

  it('handles boundary no-op conditions without mutating input', () => {
    const clone = [...baseParams];

    // First row up (out of bounds)
    const noOpFirstUp = moveParam(baseParams, 0, -1);
    expect(noOpFirstUp.map((p) => p.key)).toEqual(['a', 'b', 'c']);

    // Last row down (out of bounds)
    const noOpLastDown = moveParam(baseParams, 2, 3);
    expect(noOpLastDown.map((p) => p.key)).toEqual(['a', 'b', 'c']);

    // Negative or out of bounds fromIndex
    expect(moveParam(baseParams, -1, 1).map((p) => p.key)).toEqual(['a', 'b', 'c']);
    expect(moveParam(baseParams, 5, 1).map((p) => p.key)).toEqual(['a', 'b', 'c']);
    expect(moveParam(baseParams, 1, 10).map((p) => p.key)).toEqual(['a', 'b', 'c']);

    // Same index
    expect(moveParam(baseParams, 1, 1).map((p) => p.key)).toEqual(['a', 'b', 'c']);

    // Empty array or non-array
    expect(moveParam([], 0, 1)).toEqual([]);
    expect(moveParam(null, 0, 1)).toEqual([]);
    expect(moveParam(undefined, 0, 1)).toEqual([]);

    // Confirms baseParams was not mutated
    expect(baseParams).toEqual(clone);
  });

  it('preserves duplicate keys, their relative order, and updates duplicate flags', () => {
    const dupParams = [
      { id: 'd0', key: 'q', value: 'apple' },
      { id: 'd1', key: 'sort', value: 'asc' },
      { id: 'd2', key: 'q', value: 'banana' },
      { id: 'd3', key: 'page', value: '1' },
    ];

    // Move second duplicate 'q' up to become adjacent to first duplicate
    const moved = moveParam(dupParams, 2, 1);
    expect(moved.map((p) => `${p.key}=${p.value}`)).toEqual([
      'q=apple',
      'q=banana',
      'sort=asc',
      'page=1',
    ]);
    expect(moved[0]).toMatchObject({ id: 'd0', isDuplicate: true });
    expect(moved[1]).toMatchObject({ id: 'd2', isDuplicate: true });
    expect(moved[2]).toMatchObject({ id: 'd1', isDuplicate: false });
    expect(moved[3]).toMatchObject({ id: 'd3', isDuplicate: false });

    // Move first duplicate 'q' to the end
    const movedToEnd = moveParam(moved, 0, 3);
    expect(movedToEnd.map((p) => `${p.key}=${p.value}`)).toEqual([
      'q=banana',
      'sort=asc',
      'page=1',
      'q=apple',
    ]);
    expect(movedToEnd[0]).toMatchObject({ id: 'd2', isDuplicate: true });
    expect(movedToEnd[3]).toMatchObject({ id: 'd0', isDuplicate: true });
  });
});
