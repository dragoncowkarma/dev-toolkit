import { describe, expect, it } from 'vitest';
import {
  calculateExpiration,
  parseCookieInput,
  serializeDocumentCookie,
  serializeSetCookie,
  validateCookie,
} from './cookie.utils.js';

describe('parseCookieInput', () => {
  it('parses multiple Set-Cookie lines and normalizes known attributes', () => {
    const result = parseCookieInput([
      'Set-Cookie: session=abc; Domain=.example.com; Path=/; Secure; HttpOnly',
      'Set-Cookie: theme=dark; Max-Age=3600; SameSite=lax; Partitioned',
    ].join('\n'), { now: '2026-01-01T00:00:00Z' });

    expect(result.error).toBeNull();
    expect(result.type).toBe('set-cookie');
    expect(result.cookies).toHaveLength(2);
    expect(result.cookies[0]).toMatchObject({
      name: 'session',
      value: 'abc',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: true,
    });
    expect(result.cookies[1]).toMatchObject({
      name: 'theme',
      maxAge: 3600,
      sameSite: 'Lax',
      partitioned: true,
    });
    expect(result.cookies[1].expiration.ttlSeconds).toBe(3600);
  });

  it('parses request Cookie headers into independent cookie pairs', () => {
    const result = parseCookieInput('Cookie: session=abc; theme=dark; empty=', {
      mode: 'cookie',
    });

    expect(result.error).toBeNull();
    expect(result.cookies.map(({ name, value }) => ({ name, value }))).toEqual([
      { name: 'session', value: 'abc' },
      { name: 'theme', value: 'dark' },
      { name: 'empty', value: '' },
    ]);
    expect(result.cookies.every((cookie) => cookie.source === 'cookie')).toBe(true);
  });

  it('decodes URI values only when requested and preserves invalid encoding', () => {
    const decoded = parseCookieInput('Cookie: greeting=hello%20world', {
      decodeValues: true,
    });
    const invalid = parseCookieInput('Cookie: bad=%E0%A4%A', { decodeValues: true });

    expect(decoded.cookies[0].value).toBe('hello world');
    expect(invalid.cookies[0].value).toBe('%E0%A4%A');
    expect(invalid.cookies[0].warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'decode-failed' }),
    ]));
  });

  it('returns line-aware errors for malformed headers and mixed modes', () => {
    const malformed = parseCookieInput('Set-Cookie: missing-value-pair');
    const mixed = parseCookieInput('Set-Cookie: a=1', { mode: 'cookie' });

    expect(malformed.error).toMatchObject({ line: 1 });
    expect(malformed.error.message).toContain('name=value');
    expect(mixed.error.message).toContain('Expected Cookie');
    expect(() => parseCookieInput(null)).not.toThrow();
  });
});

describe('cookie security diagnostics', () => {
  it('enforces __Host- prefix requirements', () => {
    const findings = validateCookie({
      name: '__Host-session',
      value: 'abc',
      secure: false,
      domain: '.example.com',
      path: '/app',
      sameSite: 'Lax',
      partitioned: false,
      expires: '',
      maxAge: null,
    });

    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'host-prefix-secure',
      'host-prefix-domain',
      'host-prefix-path',
    ]));
  });

  it('enforces __Secure-, SameSite=None, and Partitioned Secure requirements', () => {
    const findings = validateCookie({
      name: '__Secure-token',
      value: 'abc',
      secure: false,
      domain: '',
      path: '/',
      sameSite: 'None',
      partitioned: true,
      expires: '',
      maxAge: null,
    });

    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'secure-prefix',
      'samesite-none-secure',
      'partitioned-secure',
    ]));
  });

  it('flags wildcard domains, ambiguous domain style, and relative paths', () => {
    const base = {
      name: 'scope', value: '1', secure: true, sameSite: 'Lax', partitioned: false,
      expires: '', maxAge: null,
    };
    const wildcard = validateCookie({ ...base, domain: '*.example.com', path: 'app' });
    const noLeadingDot = validateCookie({ ...base, domain: 'example.com', path: '/' });

    expect(wildcard.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'domain-wildcard', 'path-scope',
    ]));
    expect(noLeadingDot.map((finding) => finding.code)).toContain('domain-leading-dot');
  });
});

describe('cookie expiration and serialization', () => {
  it('calculates Max-Age relative TTL with precedence over Expires', () => {
    const expiration = calculateExpiration({
      maxAge: 90,
      expires: 'Wed, 21 Oct 2015 07:28:00 GMT',
    }, '2026-01-01T00:00:00Z');

    expect(expiration.source).toBe('max-age');
    expect(expiration.ttlSeconds).toBe(90);
    expect(expiration.utc).toBe('Thu, 01 Jan 2026 00:01:30 GMT');
    expect(expiration.expired).toBe(false);
  });

  it('calculates Expires TTL and identifies invalid dates', () => {
    const expires = calculateExpiration(
      { maxAge: null, expires: 'Thu, 01 Jan 2026 00:01:00 GMT' },
      '2026-01-01T00:00:00Z',
    );
    const invalid = calculateExpiration({ maxAge: null, expires: 'tomorrow-ish' });

    expect(expires.ttlSeconds).toBe(60);
    expect(invalid).toMatchObject({ source: 'invalid', expiresAt: null });
  });

  it('serializes normalized Set-Cookie and document.cookie outputs', () => {
    const cookie = {
      name: 'session',
      value: 'abc123',
      domain: '.Example.COM',
      path: '/',
      expires: 'Wed, 21 Oct 2026 07:28:00 GMT',
      maxAge: 3600,
      sameSite: 'none',
      secure: true,
      httpOnly: true,
      partitioned: true,
    };

    expect(serializeSetCookie(cookie)).toBe(
      'Set-Cookie: session=abc123; Domain=example.com; Path=/; '
        + 'Expires=Wed, 21 Oct 2026 07:28:00 GMT; Max-Age=3600; SameSite=None; '
        + 'Secure; HttpOnly; Partitioned',
    );
    expect(serializeDocumentCookie(cookie)).toBe(
      'document.cookie = "session=abc123; Domain=example.com; Path=/; '
        + 'Expires=Wed, 21 Oct 2026 07:28:00 GMT; Max-Age=3600; SameSite=None; '
        + 'Secure; Partitioned";',
    );
  });

  it('rejects invalid names, values, domains, and expiration values', () => {
    const base = {
      name: 'valid', value: '1', domain: '', path: '/', expires: '', maxAge: null,
      sameSite: '', secure: false, httpOnly: false, partitioned: false,
    };

    expect(() => serializeSetCookie({ ...base, name: 'bad name' })).toThrow('name');
    expect(() => serializeSetCookie({ ...base, value: 'bad;value' })).toThrow('value');
    expect(() => serializeSetCookie({ ...base, domain: '*.example.com' })).toThrow('Domain');
    expect(() => serializeSetCookie({ ...base, expires: 'invalid' })).toThrow('Expires');
  });
});
