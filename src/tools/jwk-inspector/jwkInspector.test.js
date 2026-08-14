import { describe, expect, it } from 'vitest';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  computeJwkThumbprint,
  convertJwkToPem,
  convertPemToJwk,
  parseAndValidateInput,
  summarizeJwk,
  validateJwk,
} from './jwkInspector.utils.js';

// RFC 7638 Section 3.1 canonical RSA example vector
const RFC7638_RSA_JWK = {
  kty: 'RSA',
  n:
    '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1' +
    'RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc' +
    '5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs' +
    '8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4v' +
    'MQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8aw' +
    'apJzKnqDKgw',
  e: 'AQAB',
  alg: 'RS256',
  kid: '2011-04-29',
};

const VALID_EC_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'XQMrqoqsYKHBsAFJTFF4ZWg4MgTg-y45Q-Ch-3Na1Uw',
  y: 'bNBNeL873WeTlLweyWapc8aKyEfatEaBAP57v83HfKE',
  use: 'sig',
  kid: 'ec-key-1',
};

const VALID_OCT_JWK = {
  kty: 'oct',
  k: 'AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iR4hcWg-1MkhXYYiZsYTL7A',
  alg: 'HS256',
};

const SAMPLE_RSA_PEM =
  '-----BEGIN PUBLIC KEY-----\n' +
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkPjSZnJU+ja6SKk7rk2s\n' +
  'Q40pFxHasJiNJZPoST43ZcGdRH7U5lhPgY06FKnON52wmz1BjI3xCgrLGnpbCgce\n' +
  'QPMDnn9NKjhKdygDhc3LFzn7E937UD7AdYna8MRrGy1HV2NkCcLUPelJ145Ue0FH\n' +
  'YltYNoKWCMeZEvEhdnmnJGgs/pvCxHEisM7OlvTb+K5TXkrUW57Rf9kXqu1JkmOy\n' +
  'Z/FuptcR4p+YvBGHK4nYUAq4chnwPwNhYD+ydNl+OMExTkwEQGMsX+ZUTvf8_C6W\n' +
  'Jb0wQxYl+lXvqbLv9ycDhC/8Fnx6jAoA56LNPUSt/VbhfiVco9n49fB/4ZwN75Qc\n' +
  'wwIDAQAB\n' +
  '-----END PUBLIC KEY-----';

describe('jwkInspector.utils', () => {
  describe('base64UrlToBytes and bytesToBase64Url', () => {
    it('round-trips binary data accurately', () => {
      const original = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
      const base64url = bytesToBase64Url(original);
      const decoded = base64UrlToBytes(base64url);
      expect(Array.from(decoded)).toEqual(Array.from(original));
    });
  });

  describe('validateJwk', () => {
    it('validates a complete RSA key', () => {
      const result = validateJwk(RFC7638_RSA_JWK);
      expect(result.isValid).toBe(true);
      expect(result.kty).toBe('RSA');
      expect(result.errors).toHaveLength(0);
    });

    it('validates a complete EC key', () => {
      const result = validateJwk(VALID_EC_JWK);
      expect(result.isValid).toBe(true);
      expect(result.kty).toBe('EC');
      expect(result.errors).toHaveLength(0);
    });

    it('validates a complete oct key', () => {
      const result = validateJwk(VALID_OCT_JWK);
      expect(result.isValid).toBe(true);
      expect(result.kty).toBe('oct');
      expect(result.errors).toHaveLength(0);
    });

    it('flags missing kty', () => {
      const result = validateJwk({ n: 'abc', e: 'AQAB' });
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatch(/Missing required member "kty"/);
    });

    it('flags missing RSA required members', () => {
      const result = validateJwk({ kty: 'RSA', e: 'AQAB' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required member "n" for RSA key.');
    });

    it('flags missing EC required members', () => {
      const result = validateJwk({ kty: 'EC', crv: 'P-256', x: 'abc' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required member "y" for EC key.');
    });

    it('flags missing oct required member', () => {
      const result = validateJwk({ kty: 'oct' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required member "k" for symmetric (oct) key.');
    });

    it('flags unsupported kty', () => {
      const result = validateJwk({ kty: 'UNKNOWN' });
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatch(/Unsupported key type/);
    });

    it('warns on non-standard use value', () => {
      const result = validateJwk({ ...VALID_EC_JWK, use: 'invalid-use' });
      expect(result.isValid).toBe(true);
      expect(result.warnings[0]).toMatch(/Non-standard "use" parameter/);
    });

    it('handles non-object inputs gracefully', () => {
      expect(validateJwk(null).isValid).toBe(false);
      expect(validateJwk('string').isValid).toBe(false);
      expect(validateJwk([]).isValid).toBe(false);
    });
  });

  describe('computeJwkThumbprint', () => {
    it('matches the exact RFC 7638 example test vector for RSA', async () => {
      const thumbprint = await computeJwkThumbprint(RFC7638_RSA_JWK);
      expect(thumbprint).toBe('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');
    });

    it('computes expected thumbprint for EC key', async () => {
      const thumbprint = await computeJwkThumbprint(VALID_EC_JWK);
      expect(typeof thumbprint).toBe('string');
      expect(thumbprint.length).toBeGreaterThan(0);
    });

    it('computes expected thumbprint for oct key', async () => {
      const thumbprint = await computeJwkThumbprint(VALID_OCT_JWK);
      expect(thumbprint).toBe('UOwiw0NjCcjpUiKm3p6kADULRZNfaH_EFPY9SsCL3aQ');
    });

    it('throws when required members are missing', async () => {
      await expect(computeJwkThumbprint({ kty: 'RSA', e: 'AQAB' })).rejects.toThrow(
        /missing required member/i
      );
    });
  });

  describe('convertPemToJwk & convertJwkToPem', () => {
    it('converts an RSA SPKI PEM to JWK and back (round-trip)', async () => {
      const jwk = await convertPemToJwk(SAMPLE_RSA_PEM);
      expect(jwk.kty).toBe('RSA');
      expect(jwk.n).toBeDefined();
      expect(jwk.e).toBe('AQAB');

      const pem = await convertJwkToPem(jwk);
      expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
      expect(pem).toContain('-----END PUBLIC KEY-----');
    });

    it('converts an EC JWK to SPKI PEM and back', async () => {
      const pem = await convertJwkToPem(VALID_EC_JWK);
      expect(pem).toContain('-----BEGIN PUBLIC KEY-----');

      const jwk = await convertPemToJwk(pem);
      expect(jwk.kty).toBe('EC');
      expect(jwk.crv).toBe('P-256');
      expect(jwk.x).toBe(VALID_EC_JWK.x);
      expect(jwk.y).toBe(VALID_EC_JWK.y);
    });

    it('throws error when converting symmetric oct key to PEM', async () => {
      await expect(convertJwkToPem(VALID_OCT_JWK)).rejects.toThrow(/Symmetric keys/);
    });

    it('throws error for invalid PEM string', async () => {
      await expect(convertPemToJwk('invalid pem content')).rejects.toThrow();
    });
  });

  describe('summarizeJwk', () => {
    it('summarizes RSA key details', () => {
      const summary = summarizeJwk(RFC7638_RSA_JWK);
      expect(summary.kty).toBe('RSA');
      expect(summary.alg).toBe('RS256');
      expect(summary.kid).toBe('2011-04-29');
      expect(summary.details).toMatch(/RSA 2048-bit/);
    });

    it('summarizes EC key details', () => {
      const summary = summarizeJwk(VALID_EC_JWK);
      expect(summary.kty).toBe('EC');
      expect(summary.use).toBe('Signature (sig)');
      expect(summary.details).toBe('EC P-256');
    });
  });

  describe('parseAndValidateInput', () => {
    it('parses single JWK input', async () => {
      const res = await parseAndValidateInput(JSON.stringify(RFC7638_RSA_JWK));
      expect(res.detectedMode).toBe('JWK');
      expect(res.keys).toHaveLength(1);
      expect(res.keys[0].validation.isValid).toBe(true);
      expect(res.keys[0].thumbprint).toBe('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');
    });

    it('parses JWKS input with multiple keys', async () => {
      const jwks = { keys: [RFC7638_RSA_JWK, VALID_EC_JWK] };
      const res = await parseAndValidateInput(JSON.stringify(jwks));
      expect(res.detectedMode).toBe('JWKS');
      expect(res.keys).toHaveLength(2);
      expect(res.keys[0].validation.isValid).toBe(true);
      expect(res.keys[1].validation.isValid).toBe(true);
    });

    it('parses PEM input', async () => {
      const res = await parseAndValidateInput(SAMPLE_RSA_PEM);
      expect(res.detectedMode).toBe('PEM');
      expect(res.keys).toHaveLength(1);
      expect(res.keys[0].jwk.kty).toBe('RSA');
    });

    it('handles empty input', async () => {
      const res = await parseAndValidateInput('');
      expect(res.detectedMode).toBe('NONE');
      expect(res.keys).toHaveLength(0);
      expect(res.error).toBeNull();
    });

    it('returns clean error for malformed JSON', async () => {
      const res = await parseAndValidateInput('{ malformed json');
      expect(res.error).toMatch(/JSON Syntax Error/);
      expect(res.keys).toHaveLength(0);
    });
  });
});
