import { describe, expect, it } from 'vitest';
import {
  decodeEncodedWords,
  parseAuthResults,
  parseEmailHeaders,
  parseReceivedChain,
} from './emailHeader.utils.js';

describe('parseEmailHeaders', () => {
  it('unfolds continuation lines, retains duplicates, and stops at the message body', () => {
    const raw = [
      'Received: from sender.example',
      ' by relay.example with ESMTP',
      ' for <recipient@example>; Tue, 12 Aug 2026 10:00:00 +0000',
      'Received: by final.example; Tue, 12 Aug 2026 10:01:00 +0000',
      '',
      'Subject: This body-like header must be ignored',
    ].join('\n');
    const result = parseEmailHeaders(raw);
    expect(result.error).toBeNull();
    expect(result.fields).toHaveLength(2);
    expect(result.fields[0]).toMatchObject({ line: 1, isDuplicate: true });
    expect(result.fields[0].value).toBe(
      'from sender.example by relay.example with ESMTP for <recipient@example>; '
        + 'Tue, 12 Aug 2026 10:00:00 +0000',
    );
  });

  it('reports empty, body-only, and leading-continuation input without throwing', () => {
    expect(parseEmailHeaders('').error.message).toMatch(/paste/i);
    expect(parseEmailHeaders('just a message body').error.line).toBe(1);
    expect(parseEmailHeaders(' continued').error.message).toMatch(/continuation/i);
  });
});

describe('parseReceivedChain', () => {
  it('returns four hops in delivery order with delays and absent clauses left null', () => {
    const headers = parseEmailHeaders([
      'Received: from relay-three by final with ESMTP; Tue, 12 Aug 2026 10:06:00 +0000',
      'Received: from relay-two by relay-three with ESMTP; Tue, 12 Aug 2026 10:03:00 +0000',
      'Received: by relay-two with ESMTP; Tue, 12 Aug 2026 10:01:00 +0000',
      'Received: from origin by relay-one for <r@example>; Tue, 12 Aug 2026 10:00:00 +0000',
    ].join('\n')).fields;
    const result = parseReceivedChain(headers);
    expect(result.hops.map((hop) => hop.delaySeconds)).toEqual([null, 60, 120, 180]);
    expect(result.totalSeconds).toBe(360);
    expect(result.hops[1].from).toBeNull();
    expect(result.hops[1].for).toBeNull();
  });

  it('retains a negative delay as clock skew', () => {
    const fields = parseEmailHeaders([
      'Received: by final; Tue, 12 Aug 2026 10:00:00 +0000',
      'Received: by origin; Tue, 12 Aug 2026 10:01:00 +0000',
    ].join('\n')).fields;
    const result = parseReceivedChain(fields);
    expect(result.hops).toHaveLength(2);
    expect(result.hops[1]).toMatchObject({ delaySeconds: -60, clockSkew: true });
  });
});

describe('decodeEncodedWords', () => {
  it('decodes supported encodings and joins adjacent encoded words only', () => {
    const joinedWords = '=?UTF-8?B?7ISc7Jq4?= =?UTF-8?B?7YWM7Iqk7Yq4?=';
    expect(decodeEncodedWords(joinedWords)).toBe('서울테스트');
    expect(decodeEncodedWords('=?UTF-8?Q?Cr=C3=A8me?= brulee')).toBe('Crème brulee');
    expect(decodeEncodedWords('=?UTF-8?Q?a_b?=')).toBe('a b');
  });

  it('retains unsupported and malformed encoded words byte-for-byte', () => {
    expect(decodeEncodedWords('=?Shift_JIS?B?SGVsbG8=?=')).toBe('=?Shift_JIS?B?SGVsbG8=?=');
    expect(decodeEncodedWords('=?UTF-8?B?7ISc7Jq4')).toBe('=?UTF-8?B?7ISc7Jq4');
    expect(decodeEncodedWords('=?UTF-8?B?@@@=?=')).toBe('=?UTF-8?B?@@@=?=');
  });
});

describe('parseAuthResults', () => {
  it('prefers topmost conflicting results and falls back to Received-SPF', () => {
    const conflicting = parseEmailHeaders([
      'Authentication-Results: newest.example; dkim=pass header.d=example.com; spf=pass',
      'Authentication-Results: older.example; dkim=fail header.d=example.com',
    ].join('\n')).fields;
    const auth = parseAuthResults(conflicting);
    expect(auth.dkim.result).toBe('pass');
    expect(auth.dkim.detail).toMatch(/conflicts.*fail/i);
    const fallback = parseAuthResults(parseEmailHeaders(
      'Received-SPF: softfail (example.com: domain test.example does not designate host)',
    ).fields);
    expect(fallback.spf.result).toBe('softfail');
  });
});
