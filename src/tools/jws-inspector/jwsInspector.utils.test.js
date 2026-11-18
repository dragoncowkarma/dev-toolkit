import { describe, expect, it } from 'vitest';
import { getHeaderFields, isValidBase64Url, parseJwsCompact } from './jwsInspector.utils.js';

const VALID_JWS =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXUyIsImtpZCI6ImRlbW8ta2V5In0.' +
  'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRG9lIn0.c2lnbmF0dXJl';

describe('isValidBase64Url', () => {
  it('accepts unpadded Base64URL and rejects invalid characters or lengths', () => {
    expect(isValidBase64Url('eyJhbGciOiJIUzI1NiJ9')).toBe(true);
    expect(isValidBase64Url('invalid+base64')).toBe(false);
    expect(isValidBase64Url('a')).toBe(false);
  });
});

describe('parseJwsCompact', () => {
  it('inspects valid compact JWS segments without verifying the signature', () => {
    const result = parseJwsCompact(VALID_JWS);

    expect(result.segments.signature).toBe('c2lnbmF0dXJl');
    expect(result.header).toMatchObject({ alg: 'HS256', typ: 'JWS', kid: 'demo-key' });
    expect(result.headerFields).toEqual({ alg: 'HS256', typ: 'JWS', kid: 'demo-key' });
    expect(result.payload).toEqual({
      raw: '{"sub":"1234567890","name":"Jane Doe"}',
      json: { sub: '1234567890', name: 'Jane Doe' },
      isJson: true,
    });
  });

  it('rejects compact serializations that do not have exactly three segments', () => {
    expect(() => parseJwsCompact('one.two')).toThrow(/exactly 3 Base64URL segments/);
    expect(() => parseJwsCompact('one.two.three.four')).toThrow(/exactly 3 Base64URL segments/);
  });

  it('rejects invalid Base64URL in every compact segment', () => {
    expect(() => parseJwsCompact('@@@.e30.c2ln')).toThrow(/protected header segment.*Base64URL/);
    expect(() => parseJwsCompact('e30.@@@.c2ln')).toThrow(/payload segment.*Base64URL/);
    expect(() => parseJwsCompact('e30.e30.@@@')).toThrow(/signature segment.*Base64URL/);
  });

  it('rejects malformed and non-object protected header JSON', () => {
    expect(() => parseJwsCompact('bm90LWpzb24.e30.c2ln')).toThrow(/valid JSON/);
    expect(() => parseJwsCompact('W10.e30.c2ln')).toThrow(/must be an object/);
  });

  it('retains a non-JSON payload as raw text', () => {
    const result = parseJwsCompact('eyJhbGciOiJub25lIn0.aGVsbG8.');

    expect(result.payload).toEqual({ raw: 'hello', json: null, isJson: false });
  });
});

describe('getHeaderFields', () => {
  it('returns fields of interest without resolving referenced keys', () => {
    const jwk = { kty: 'EC', crv: 'P-256' };
    expect(getHeaderFields({ alg: 'ES256', jwk, x5c: ['certificate'], ignored: true })).toEqual({
      alg: 'ES256',
      jwk,
      x5c: ['certificate'],
    });
  });
});
