import { describe, expect, it } from 'vitest';
import { formatDuration, getJwtTimeDetails, parseJwt } from './jwt.utils.js';

const VALID_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiIxMjMiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.signature';

describe('parseJwt', () => {
  it('decodes a valid UTF-8 JWT header, payload, and signature', () => {
    expect(parseJwt(VALID_TOKEN)).toEqual({
      header: { alg: 'HS256', typ: 'JWT' },
      payload: { sub: '123', iat: 1700000000, exp: 2000000000 },
      signature: 'signature',
    });
  });

  it('reports a clear error for malformed compact JWTs', () => {
    expect(() => parseJwt('header.payload')).toThrow('Invalid JWT format');
    expect(() => parseJwt('a.b.signature!')).toThrow('Invalid JWT format');
    expect(() => parseJwt('abc.abc.signature')).toThrow(
      'JWT header does not contain valid UTF-8 JSON'
    );
  });
});

describe('getJwtTimeDetails', () => {
  it('identifies an expired token and exposes its expiration timestamp', () => {
    const details = getJwtTimeDetails({ exp: 1000 }, 1000001);
    expect(details.isExpired).toBe(true);
    expect(details.expiration?.date.toISOString()).toBe('1970-01-01T00:16:40.000Z');
    expect(details.expiration?.milliseconds).toBe(-1);
  });

  it('calculates remaining time and a future not-before time', () => {
    const details = getJwtTimeDetails({ exp: 1100, nbf: 1050, iat: 900 }, 1000000);
    expect(details.isExpired).toBe(false);
    expect(details.isNotActive).toBe(true);
    expect(details.expiration?.milliseconds).toBe(100000);
    expect(formatDuration(details.expiration?.milliseconds ?? 0)).toBe('1 minute 40 seconds');
  });
});
