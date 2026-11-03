import { describe, expect, it } from 'vitest';
import {
  detectRecordType,
  parseDkimRecord,
  parseDmarcRecord,
  parseEmailAuthenticationRecord,
  parseSpfRecord,
} from './emailAuthParser.utils.js';

describe('email-authentication record detection', () => {
  it('detects records from their version prefixes', () => {
    expect(detectRecordType('v=spf1 -all')).toBe('spf');
    expect(detectRecordType('v=DKIM1; k=rsa; p=YWJj')).toBe('dkim');
    expect(detectRecordType('v=DMARC1; p=reject')).toBe('dmarc');
  });

  it('reports empty and unrecognized input', () => {
    expect(parseEmailAuthenticationRecord('').errors).toContain('Enter a TXT record to parse.');
    expect(parseEmailAuthenticationRecord('hello')).toMatchObject({
      errors: ['Unable to detect SPF, DKIM, or DMARC from the v= prefix.'],
    });
  });
});

describe('SPF parsing', () => {
  it('parses qualifiers and mechanisms in a valid record', () => {
    const result = parseSpfRecord('v=spf1 ip4:192.0.2.0/24 include:mail.example.com ~all');
    expect(result.errors).toEqual([]);
    expect(result.mechanisms).toEqual(expect.arrayContaining([
      expect.objectContaining({ qualifier: '+', name: 'ip4', value: '192.0.2.0/24' }),
      expect.objectContaining({ qualifier: '+', name: 'include', value: 'mail.example.com' }),
      expect.objectContaining({ qualifier: '~', name: 'all' }),
    ]));
  });

  it('warns when more than ten DNS-lookups are possible', () => {
    const includes = Array.from({ length: 11 }, (_, index) => `include:${index}.example.com`);
    const result = parseSpfRecord(`v=spf1 ${includes.join(' ')} -all`);
    expect(result.warnings.join(' ')).toMatch(/11 DNS lookups/);
  });

  it('warns about multiple all mechanisms', () => {
    expect(parseSpfRecord('v=spf1 -all ~all').warnings).toContain(
      'SPF contains multiple all mechanisms.'
    );
  });
});

describe('DKIM parsing', () => {
  it('accepts a valid Base64 public key', () => {
    const result = parseDkimRecord('v=DKIM1; k=rsa; p=YWJjZA==; h=sha256');
    expect(result.errors).toEqual([]);
  });

  it('reports malformed and revoked public keys', () => {
    expect(parseDkimRecord('v=DKIM1; p=not-base64!').errors.join(' ')).toMatch(/Base64/);
    expect(parseDkimRecord('v=DKIM1; p=').warnings.join(' ')).toMatch(/revoked/);
  });
});

describe('DMARC parsing', () => {
  it('accepts valid policy, percentage, and mailto reporting addresses', () => {
    const result = parseDmarcRecord(
      'v=DMARC1; p=reject; sp=quarantine; pct=100; rua=mailto:reports@example.com'
    );
    expect(result.errors).toEqual([]);
  });

  it('reports invalid policies, percentages, and reporting addresses', () => {
    const result = parseDmarcRecord('v=DMARC1; p=discard; sp=invalid; pct=101; rua=https://x');
    expect(result.errors).toEqual(expect.arrayContaining([
      'DMARC p= must be none, quarantine, or reject.',
      'DMARC sp= must be none, quarantine, or reject.',
      'DMARC pct= must be an integer from 0 to 100.',
      'DMARC rua= must contain one or more well-formed mailto: URIs.',
    ]));
  });
});
