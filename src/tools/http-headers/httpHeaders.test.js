import { describe, expect, it } from 'vitest';
import {
  analyzeHeaders,
  buildNormalizedOutput,
  classifyHeaderName,
  filterHeaderRows,
  normalizeHeaderFieldName,
  parseHttpHeaders,
  parseSetCookieAttributes,
} from './httpHeaders.utils.js';

describe('parseHttpHeaders - line endings', () => {
  it('parses a header block using CRLF line endings', () => {
    const result = parseHttpHeaders('Host: example.com\r\nAccept: */*\r\n');
    expect(result.error).toBeNull();
    expect(result.headers).toEqual([
      { name: 'Host', value: 'example.com', line: 1, category: 'other', isDuplicate: false },
      { name: 'Accept', value: '*/*', line: 2, category: 'other', isDuplicate: false },
    ]);
  });

  it('parses a header block using LF line endings', () => {
    const result = parseHttpHeaders('Host: example.com\nAccept: */*\n');
    expect(result.error).toBeNull();
    expect(result.headers.map((header) => header.name)).toEqual(['Host', 'Accept']);
  });

  it('returns an empty, error-free result for blank input', () => {
    expect(parseHttpHeaders('')).toEqual({ headers: [], startLine: null, error: null });
    expect(parseHttpHeaders('   \n  \n')).toEqual({ headers: [], startLine: null, error: null });
  });
});

describe('parseHttpHeaders - start lines', () => {
  it('detects a request start line in auto mode', () => {
    const result = parseHttpHeaders('GET /widgets HTTP/1.1\r\nHost: example.com\r\n');
    expect(result.startLine).toMatchObject({
      type: 'request',
      raw: 'GET /widgets HTTP/1.1',
      method: 'GET',
      target: '/widgets',
      httpVersion: 'HTTP/1.1',
      line: 1,
    });
    expect(result.headers[0]).toMatchObject({ name: 'Host', value: 'example.com', line: 2 });
  });

  it('detects a response start line in auto mode', () => {
    const result = parseHttpHeaders('HTTP/1.1 404 Not Found\nContent-Type: text/plain\n');
    expect(result.startLine).toMatchObject({
      type: 'response',
      raw: 'HTTP/1.1 404 Not Found',
      statusCode: 404,
      reasonPhrase: 'Not Found',
      httpVersion: 'HTTP/1.1',
      line: 1,
    });
    expect(result.headers[0]).toMatchObject({ name: 'Content-Type', line: 2 });
  });

  it('honors an explicit request mode and an explicit response mode', () => {
    const request = parseHttpHeaders('POST /x HTTP/1.1\nHost: a\n', { mode: 'request' });
    expect(request.startLine?.type).toBe('request');

    const response = parseHttpHeaders('HTTP/1.1 200 OK\nHost: a\n', { mode: 'response' });
    expect(response.startLine?.type).toBe('response');
  });

  it('parses a block with no start line, treating the first line as a header field', () => {
    const result = parseHttpHeaders('Host: example.com\nAccept: */*\n');
    expect(result.startLine).toBeNull();
    expect(result.headers).toHaveLength(2);
    expect(result.headers[0]).toMatchObject({ name: 'Host', line: 1 });
  });
});

describe('parseHttpHeaders - field parsing', () => {
  it('stops the header section at a blank line and ignores anything after it', () => {
    const result = parseHttpHeaders('Host: example.com\n\nX-Ignored: yes\n');
    expect(result.error).toBeNull();
    expect(result.headers).toEqual([
      { name: 'Host', value: 'example.com', line: 1, category: 'other', isDuplicate: false },
    ]);
  });

  it('retains duplicate field names and their original order', () => {
    const result = parseHttpHeaders('Set-Cookie: a=1\nHost: example.com\nSet-Cookie: b=2\n');
    expect(result.headers.map(({ name, value }) => [name, value])).toEqual([
      ['Set-Cookie', 'a=1'],
      ['Host', 'example.com'],
      ['Set-Cookie', 'b=2'],
    ]);
    expect(result.headers[0].isDuplicate).toBe(true);
    expect(result.headers[1].isDuplicate).toBe(false);
    expect(result.headers[2].isDuplicate).toBe(true);
  });

  it('splits values containing colons only on the first colon', () => {
    const result = parseHttpHeaders('Authorization: Bearer abc:def:ghi\n');
    expect(result.headers[0]).toMatchObject({
      name: 'Authorization',
      value: 'Bearer abc:def:ghi',
    });
  });

  it('reports a malformed line missing a colon with its one-based line number', () => {
    const result = parseHttpHeaders('Host: example.com\nNotAHeaderLine\nAccept: */*\n');
    expect(result.error).toEqual({
      message: 'Malformed header field at line 2: expected "Name: value".',
      line: 2,
    });
    expect(result.headers).toEqual([
      { name: 'Host', value: 'example.com', line: 1, category: 'other', isDuplicate: false },
    ]);
  });

  it('reports a malformed line with an empty field name', () => {
    const result = parseHttpHeaders(': no-name\n');
    expect(result.error).toEqual({
      message: 'Malformed header field at line 1: header name is empty.',
      line: 1,
    });
  });

  it('never throws, even for non-string input', () => {
    expect(() => parseHttpHeaders(undefined)).not.toThrow();
    expect(() => parseHttpHeaders(null)).not.toThrow();
    expect(() => parseHttpHeaders(42)).not.toThrow();
    expect(parseHttpHeaders(undefined)).toEqual({ headers: [], startLine: null, error: null });
  });
});

describe('classifyHeaderName', () => {
  it.each([
    ['Content-Type', 'content'],
    ['Cache-Control', 'caching'],
    ['Access-Control-Allow-Origin', 'cors'],
    ['Strict-Transport-Security', 'security'],
    ['Authorization', 'authentication'],
    ['Set-Cookie', 'cookie'],
    ['X-Custom-Header', 'other'],
  ])('classifies %s as %s', (name, category) => {
    expect(classifyHeaderName(name)).toBe(category);
  });

  it('is case-insensitive', () => {
    expect(classifyHeaderName('content-type')).toBe('content');
    expect(classifyHeaderName('CONTENT-TYPE')).toBe('content');
  });
});

describe('normalizeHeaderFieldName and buildNormalizedOutput', () => {
  it('normalizes field name casing per hyphenated segment', () => {
    expect(normalizeHeaderFieldName('content-type')).toBe('Content-Type');
    expect(normalizeHeaderFieldName('WWW-AUTHENTICATE')).toBe('Www-Authenticate');
  });

  it('produces stable, deterministic output preserving duplicate fields', () => {
    const parsed = parseHttpHeaders('set-cookie: a=1\nSET-COOKIE: b=2\n');
    const output = buildNormalizedOutput(parsed);
    expect(output).toBe('Set-Cookie: a=1\nSet-Cookie: b=2');
    expect(buildNormalizedOutput(parsed)).toBe(output);
  });

  it('preserves every hyphen separator so distinct field names are not coalesced', () => {
    expect(normalizeHeaderFieldName('X--Trace')).toBe('X--Trace');
    expect(normalizeHeaderFieldName('X-Trace')).toBe('X-Trace');
    expect(normalizeHeaderFieldName('X--Trace')).not.toBe(normalizeHeaderFieldName('X-Trace'));

    const parsed = parseHttpHeaders('X--Trace: alpha\nX-Trace: beta\n');
    expect(buildNormalizedOutput(parsed)).toBe('X--Trace: alpha\nX-Trace: beta');
  });

  it('includes the start line when present', () => {
    const parsed = parseHttpHeaders('GET / HTTP/1.1\nHost: example.com\n');
    expect(buildNormalizedOutput(parsed)).toBe('GET / HTTP/1.1\nHost: example.com');
  });
});

describe('analyzeHeaders - duplicate fields', () => {
  it('emits one advisory per duplicated field name, not per occurrence', () => {
    const { headers } = parseHttpHeaders('Accept-Language: en\nAccept-Language: fr\nHost: a\n');
    const advisories = analyzeHeaders(headers);
    expect(advisories).toHaveLength(1);
    expect(advisories[0]).toMatchObject({
      kind: 'duplicate-field',
      severity: 'warning',
    });
    expect(advisories[0].message).toContain('Accept-Language');
    expect(advisories[0].message).toContain('2 times');
  });

  it('emits no duplicate advisory when every field is unique', () => {
    const { headers } = parseHttpHeaders('Host: a\nAccept: */*\n');
    expect(analyzeHeaders(headers).some((a) => a.kind === 'duplicate-field')).toBe(false);
  });
});

describe('analyzeHeaders - CORS wildcard with credentials', () => {
  it('flags wildcard origin combined with credential allowance', () => {
    const { headers } = parseHttpHeaders(
      'Access-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true\n',
    );
    const advisories = analyzeHeaders(headers);
    expect(advisories.some((a) => a.kind === 'cors-wildcard-credentials')).toBe(true);
    expect(advisories.find((a) => a.kind === 'cors-wildcard-credentials').severity).toBe('high');
  });

  it('does not flag a non-wildcard origin with credentials', () => {
    const { headers } = parseHttpHeaders(
      'Access-Control-Allow-Origin: https://example.com\n'
        + 'Access-Control-Allow-Credentials: true\n',
    );
    expect(analyzeHeaders(headers).some((a) => a.kind === 'cors-wildcard-credentials'))
      .toBe(false);
  });

  it('does not flag a wildcard origin without credential allowance', () => {
    const { headers } = parseHttpHeaders('Access-Control-Allow-Origin: *\n');
    expect(analyzeHeaders(headers).some((a) => a.kind === 'cors-wildcard-credentials'))
      .toBe(false);
  });
});

describe('analyzeHeaders - SameSite=None cookies without Secure', () => {
  it('flags a SameSite=None cookie missing Secure', () => {
    const { headers } = parseHttpHeaders('Set-Cookie: session=abc; Path=/; SameSite=None\n');
    const advisories = analyzeHeaders(headers);
    expect(advisories).toHaveLength(1);
    expect(advisories[0]).toMatchObject({
      kind: 'cookie-samesite-none-insecure',
      severity: 'high',
    });
    expect(advisories[0].message).toContain('session');
  });

  it('does not flag a SameSite=None cookie that also sets Secure', () => {
    const { headers } = parseHttpHeaders(
      'Set-Cookie: session=abc; Path=/; SameSite=None; Secure\n',
    );
    expect(analyzeHeaders(headers)).toEqual([]);
  });

  it('does not flag cookies using SameSite=Lax or SameSite=Strict', () => {
    const { headers } = parseHttpHeaders(
      'Set-Cookie: a=1; SameSite=Lax\nSet-Cookie: b=2; SameSite=Strict\n',
    );
    // Two distinct Set-Cookie lines still trigger the duplicate-field advisory; only the
    // SameSite-specific advisory is under test here.
    expect(analyzeHeaders(headers).some((a) => a.kind === 'cookie-samesite-none-insecure'))
      .toBe(false);
  });
});

describe('parseSetCookieAttributes', () => {
  it('extracts the cookie name, SameSite value, and Secure flag', () => {
    expect(parseSetCookieAttributes('session=abc; Path=/; SameSite=None; Secure')).toEqual({
      cookieName: 'session',
      sameSite: 'none',
      hasSecure: true,
    });
  });

  it('reports a null SameSite and false Secure when absent', () => {
    expect(parseSetCookieAttributes('a=1; Path=/')).toEqual({
      cookieName: 'a',
      sameSite: null,
      hasSecure: false,
    });
  });
});

describe('filterHeaderRows', () => {
  const headers = parseHttpHeaders(
    'Content-Type: application/json\nX-Request-Id: 42\nCache-Control: no-store\n',
  ).headers;

  it('returns every row for a blank query', () => {
    expect(filterHeaderRows(headers, '')).toEqual(headers);
    expect(filterHeaderRows(headers, '   ')).toEqual(headers);
  });

  it('matches case-insensitively against name, value, and category', () => {
    expect(filterHeaderRows(headers, 'content').map((h) => h.name))
      .toEqual(['Content-Type']);
    expect(filterHeaderRows(headers, 'caching').map((h) => h.name))
      .toEqual(['Cache-Control']);
    expect(filterHeaderRows(headers, '42').map((h) => h.name))
      .toEqual(['X-Request-Id']);
  });

  it('returns no rows when nothing matches', () => {
    expect(filterHeaderRows(headers, 'nonexistent')).toEqual([]);
  });
});
