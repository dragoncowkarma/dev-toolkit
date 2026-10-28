import { describe, expect, it } from 'vitest';
import {
  parseStructuredData,
  parseSyslogBatch,
  parseSyslogMessage,
} from './syslogParser.utils.js';

describe('parseSyslogMessage', () => {
  it('parses an RFC 5424 message and decodes priority values', () => {
    const result = parseSyslogMessage(
      '<34>1 2026-10-29T12:30:45Z web-01 nginx 1234 access - Request accepted'
    );

    expect(result).toMatchObject({
      isValid: true,
      format: 'RFC 5424',
      priority: 34,
      facility: 4,
      facilityName: 'auth',
      severity: 2,
      severityName: 'Critical',
      hostname: 'web-01',
      appName: 'nginx',
      processId: '1234',
      messageId: 'access',
      message: 'Request accepted',
    });
  });

  it('supports nil RFC 5424 header fields', () => {
    const result = parseSyslogMessage('<13>1 - - - - - -');
    expect(result).toMatchObject({ isValid: true, timestamp: null, hostname: null, message: '' });
  });

  it('parses multiple RFC 5424 structured data elements and escapes', () => {
    const result = parseSyslogMessage(
      '<165>1 2026-10-29T12:30:45+09:00 host app 1 msg ' +
        '[meta user="Sam" note="a\\]b"][trace id="x"] hello'
    );
    expect(result.isValid).toBe(true);
    expect(result.structuredData).toEqual([
      { id: 'meta', parameters: { user: 'Sam', note: 'a]b' } },
      { id: 'trace', parameters: { id: 'x' } },
    ]);
    expect(result.message).toBe('hello');
  });

  it('parses RFC 3164 tag and process ID', () => {
    const result = parseSyslogMessage('<13>Oct 29 12:31:00 router-1 sshd[445]: Failed password');
    expect(result).toMatchObject({
      isValid: true,
      format: 'RFC 3164',
      facilityName: 'user',
      severityName: 'Notice',
      appName: 'sshd',
      tag: 'sshd[445]',
      processId: '445',
      message: 'Failed password',
    });
  });

  it('returns errors rather than throwing for malformed input', () => {
    expect(() => parseSyslogMessage('<999>bad')).not.toThrow();
    const result = parseSyslogMessage('<999>bad');
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Priority must be between 0 and 191.',
    ]));
  });

  it('warns when an RFC 5424 timestamp is not RFC3339', () => {
    const result = parseSyslogMessage('<34>1 yesterday host app 1 msg - body');
    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain('Timestamp does not match the RFC 5424 RFC3339 form.');
  });
});

describe('parseStructuredData', () => {
  it('returns an error for unterminated values without throwing', () => {
    expect(parseStructuredData('[example key="value]')).toMatchObject({
      error: 'Structured data parameter has an unterminated value.',
    });
  });
});

describe('parseSyslogBatch', () => {
  it('retains every source line number, including blank lines', () => {
    const input = '<13>Oct 29 12:31:00 host app: one\n\n<14>Oct 29 12:32:00 host app: two';
    const results = parseSyslogBatch(input);
    expect(results.map((result) => result.lineNumber)).toEqual([1, 2, 3]);
    expect(results[1].isValid).toBe(false);
    expect(results[2].message).toBe('two');
  });
});
