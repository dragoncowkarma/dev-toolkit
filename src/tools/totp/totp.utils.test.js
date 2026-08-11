import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  counterForTime,
  generateRandomSecret,
  hotp,
  parseOtpAuthUri,
  secondsRemaining,
  totp,
} from './totp.utils.js';

const encoder = new TextEncoder();

describe('Base32 helpers', () => {
  it('round-trips byte lengths that require Base32 padding when represented padded', () => {
    [0, 1, 2, 3, 4, 5, 19, 20].forEach((length) => {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 41) % 256);
      expect(Array.from(base32Decode(base32Encode(bytes)).bytes)).toEqual(Array.from(bytes));
    });
  });

  it('accepts case-insensitive, whitespace-separated, padded and unpadded input', () => {
    expect(new TextDecoder().decode(base32Decode('jbsw y3dp').bytes)).toBe('Hello');
    expect(new TextDecoder().decode(base32Decode('MY').bytes)).toBe('f');
    expect(new TextDecoder().decode(base32Decode('MY======').bytes)).toBe('f');
  });

  it('returns structured errors for invalid Base32 input without throwing', () => {
    expect(base32Decode('JBSW$3DP')).toEqual({
      bytes: null,
      error: 'Base32 input contains characters outside A–Z and 2–7.',
    });
    expect(base32Decode('ABC').error).toContain('incomplete');
  });

  it('creates fresh random secrets without padding', () => {
    const first = generateRandomSecret();
    const second = generateRandomSecret();
    expect(first).toMatch(/^[A-Z2-7]+$/);
    expect(first).not.toBe(second);
    expect(base32Decode(first).bytes).toHaveLength(20);
  });
});

describe('RFC 4226 HOTP', () => {
  it('matches every RFC 4226 Appendix D test vector verbatim', async () => {
    const secret = encoder.encode('12345678901234567890');
    const vectors = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583',
      '399871', '520489'];
    await Promise.all(vectors.map(async (expected, counter) => {
      await expect(hotp(secret, counter)).resolves.toBe(expected);
    }));
  });

  it('supports six, seven, and eight digit zero-padded output', async () => {
    const secret = encoder.encode('12345678901234567890');
    await expect(hotp(secret, 0, { digits: 6 })).resolves.toBe('755224');
    await expect(hotp(secret, 0, { digits: 7 })).resolves.toBe('4755224');
    await expect(hotp(secret, 0, { digits: 8 })).resolves.toBe('84755224');
  });
});

describe('RFC 6238 TOTP', () => {
  it('matches every RFC 6238 Appendix B test vector verbatim', async () => {
    const secrets = {
      'SHA-1': '12345678901234567890',
      'SHA-256': '12345678901234567890123456789012',
      'SHA-512': '1234567890123456789012345678901234567890123456789012345678901234',
    };
    const vectors = [
      [59, '94287082', '46119246', '90693936'],
      [1111111109, '07081804', '68084774', '25091201'],
      [1111111111, '14050471', '67062674', '99943326'],
      [1234567890, '89005924', '91819424', '93441116'],
      [2000000000, '69279037', '90698825', '38618901'],
      [20000000000, '65353130', '77737706', '47863826'],
    ];
    for (const [timestamp, sha1, sha256, sha512] of vectors) {
      await expect(totp(encoder.encode(secrets['SHA-1']), {
        algorithm: 'SHA-1', digits: 8, timestampMs: timestamp * 1000,
      })).resolves.toBe(sha1);
      await expect(totp(encoder.encode(secrets['SHA-256']), {
        algorithm: 'SHA-256', digits: 8, timestampMs: timestamp * 1000,
      })).resolves.toBe(sha256);
      await expect(totp(encoder.encode(secrets['SHA-512']), {
        algorithm: 'SHA-512', digits: 8, timestampMs: timestamp * 1000,
      })).resolves.toBe(sha512);
    }
  });

  it('derives explicit counters and countdowns without reading the system clock', () => {
    expect(counterForTime(59_999)).toBe(1);
    expect(counterForTime(60_000)).toBe(2);
    expect(secondsRemaining(29_999)).toBe(0);
    expect(secondsRemaining(30_000)).toBe(29);
  });
});

describe('otpauth Key URI helpers', () => {
  it('parses TOTP and HOTP URIs, decoded names, and omitted parameter defaults', () => {
    expect(parseOtpAuthUri(
      'otpauth://totp/Acme%20Co%3Aalice%40example.com?secret=JBSWY3DP&issuer=Acme%20Co'
    )).toMatchObject({
      type: 'totp', label: 'Acme Co:alice@example.com', issuer: 'Acme Co', secret: 'JBSWY3DP',
      algorithm: 'SHA-1', digits: 6, period: 30, counter: null, error: null,
    });
    expect(parseOtpAuthUri(
      'otpauth://hotp/Example%3Abob?secret=JBSWY3DP&algorithm=SHA256&digits=8&counter=12'
    )).toMatchObject({
      type: 'hotp', label: 'Example:bob', issuer: '', algorithm: 'SHA-256', digits: 8,
      period: 30, counter: 12, error: null,
    });
  });

  it('returns structured errors for non-otpauth schemes and missing required values', () => {
    expect(parseOtpAuthUri('https://example.com').error).toContain('otpauth');
    expect(parseOtpAuthUri('otpauth://totp/Example').error).toContain('missing a secret');
    expect(parseOtpAuthUri('otpauth://hotp/Example?secret=A').error).toContain('require a counter');
    expect(parseOtpAuthUri('otpauth://totp/Example?secret=A&digits=5').error).toContain('6 to 8');
  });

  it('round-trips built URI effective fields', () => {
    const fields = {
      type: 'hotp', label: 'Acme:alice@example.com', issuer: 'Acme', secret: 'JBSWY3DP',
      algorithm: 'SHA-512', digits: 7, period: 45, counter: 17,
    };
    const parsed = parseOtpAuthUri(buildOtpAuthUri(fields));
    expect(parsed).toMatchObject({ ...fields, period: 30, error: null });
  });
});
