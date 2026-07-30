import { describe, expect, it } from 'vitest';
import {
  convertTimestamp,
  detectTimestampUnit,
  formatISO,
  formatLocal,
  formatRelativeTime,
  formatUTC,
  getLocalTimezoneInfo,
} from './timestamp.utils.js';

describe('detectTimestampUnit', () => {
  it('detects 10-digit numbers as seconds', () => {
    expect(detectTimestampUnit(1700000000)).toBe('seconds');
  });

  it('detects 13-digit numbers as milliseconds', () => {
    expect(detectTimestampUnit(1700000000000)).toBe('milliseconds');
  });

  it('handles negative numbers correctly', () => {
    expect(detectTimestampUnit(-1418294000)).toBe('seconds');
    expect(detectTimestampUnit(-1418294000000)).toBe('milliseconds');
  });
});

describe('formatISO', () => {
  it('formats Date object to ISO 8601 string', () => {
    const date = new Date('2026-07-30T09:55:49.000Z');
    expect(formatISO(date)).toBe('2026-07-30T09:55:49.000Z');
  });

  it('returns empty string for invalid date', () => {
    expect(formatISO(new Date('invalid'))).toBe('');
    expect(formatISO(null)).toBe('');
  });
});

describe('formatUTC', () => {
  it('formats Date object to UTC string', () => {
    const date = new Date('2026-07-30T09:55:49.000Z');
    expect(formatUTC(date)).toBe('Thu, 30 Jul 2026 09:55:49 GMT');
  });

  it('returns empty string for invalid date', () => {
    expect(formatUTC(new Date('invalid'))).toBe('');
    expect(formatUTC(null)).toBe('');
  });
});

describe('formatLocal', () => {
  it('returns a non-empty formatted string for valid date', () => {
    const date = new Date('2026-07-30T09:55:49.000Z');
    const result = formatLocal(date);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns empty string for invalid date', () => {
    expect(formatLocal(new Date('invalid'))).toBe('');
  });
});

describe('getLocalTimezoneInfo', () => {
  it('returns local timezone descriptor string containing UTC offset', () => {
    const result = getLocalTimezoneInfo(new Date('2026-07-30T09:55:49.000Z'));
    expect(result).toMatch(/UTC[+-]\d{2}:\d{2}/);
  });
});

describe('formatRelativeTime', () => {
  const baseTime = new Date('2026-07-30T12:00:00.000Z');

  it('returns "just now" for differences less than 5 seconds', () => {
    const target = new Date('2026-07-30T12:00:02.000Z');
    expect(formatRelativeTime(target, baseTime)).toBe('just now');
  });

  it('formats past and future seconds correctly', () => {
    const past = new Date('2026-07-30T11:59:30.000Z'); // 30s ago
    const future = new Date('2026-07-30T12:00:30.000Z'); // 30s future
    expect(formatRelativeTime(past, baseTime)).toBe('30 seconds ago');
    expect(formatRelativeTime(future, baseTime)).toBe('30 seconds from now');
  });

  it('formats past and future minutes correctly', () => {
    const past = new Date('2026-07-30T11:57:00.000Z'); // 3 mins ago
    const future = new Date('2026-07-30T12:03:00.000Z'); // 3 mins future
    expect(formatRelativeTime(past, baseTime)).toBe('3 minutes ago');
    expect(formatRelativeTime(future, baseTime)).toBe('3 minutes from now');
  });

  it('formats past and future hours correctly', () => {
    const past = new Date('2026-07-30T10:00:00.000Z'); // 2 hours ago
    const future = new Date('2026-07-30T14:00:00.000Z'); // 2 hours future
    expect(formatRelativeTime(past, baseTime)).toBe('2 hours ago');
    expect(formatRelativeTime(future, baseTime)).toBe('2 hours from now');
  });

  it('formats past and future days correctly', () => {
    const past = new Date('2026-07-25T12:00:00.000Z'); // 5 days ago
    const future = new Date('2026-08-04T12:00:00.000Z'); // 5 days future
    expect(formatRelativeTime(past, baseTime)).toBe('5 days ago');
    expect(formatRelativeTime(future, baseTime)).toBe('5 days from now');
  });

  it('formats months and years at boundary values', () => {
    const pastMonth = new Date('2026-06-15T12:00:00.000Z');
    const pastYear = new Date('2024-07-30T12:00:00.000Z');
    expect(formatRelativeTime(pastMonth, baseTime)).toBe('1 month ago');
    expect(formatRelativeTime(pastYear, baseTime)).toBe('2 years ago');
  });

  it('returns empty string for invalid date', () => {
    expect(formatRelativeTime(new Date('invalid'), baseTime)).toBe('');
  });
});

describe('convertTimestamp', () => {
  const refTime = new Date('2026-07-30T12:00:00.000Z');

  it('returns empty output structure for empty input', () => {
    const res = convertTimestamp('', 'auto', refTime);
    expect(res.isValid).toBe(true);
    expect(res.isEmpty).toBe(true);
    expect(res.unixSeconds).toBe('');
    expect(res.unixMs).toBe('');
  });

  it('converts Unix timestamp in seconds auto-detected', () => {
    const res = convertTimestamp('1785412800', 'auto', refTime); // 2026-07-30T12:00:00.000Z
    expect(res.isValid).toBe(true);
    expect(res.inputType).toBe('timestamp');
    expect(res.detectedUnit).toBe('seconds');
    expect(res.unixSeconds).toBe('1785412800');
    expect(res.unixMs).toBe('1785412800000');
    expect(res.iso).toBe('2026-07-30T12:00:00.000Z');
    expect(res.utc).toBe('Thu, 30 Jul 2026 12:00:00 GMT');
    expect(res.relative).toBe('just now');
  });

  it('converts Unix timestamp in milliseconds auto-detected', () => {
    const res = convertTimestamp('1785412800000', 'auto', refTime);
    expect(res.isValid).toBe(true);
    expect(res.inputType).toBe('timestamp');
    expect(res.detectedUnit).toBe('milliseconds');
    expect(res.unixSeconds).toBe('1785412800');
    expect(res.unixMs).toBe('1785412800000');
    expect(res.iso).toBe('2026-07-30T12:00:00.000Z');
  });

  it('respects forced unit mode for timestamp', () => {
    // Treat 1785412800 as milliseconds explicitly
    const res = convertTimestamp('1785412800', 'milliseconds', refTime);
    expect(res.isValid).toBe(true);
    expect(res.detectedUnit).toBe('milliseconds');
    expect(res.unixMs).toBe('1785412800');
  });

  it('converts date string input accurately', () => {
    const res = convertTimestamp('2026-07-30T12:00:00.000Z', 'auto', refTime);
    expect(res.isValid).toBe(true);
    expect(res.inputType).toBe('date-string');
    expect(res.unixSeconds).toBe('1785412800');
    expect(res.unixMs).toBe('1785412800000');
    expect(res.iso).toBe('2026-07-30T12:00:00.000Z');
  });

  it('handles invalid date strings gracefully', () => {
    const res = convertTimestamp('invalid date string', 'auto', refTime);
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/Invalid/);
  });

  it('handles invalid timestamp numbers gracefully', () => {
    const res = convertTimestamp('999999999999999999999', 'auto', refTime);
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/Invalid/);
  });
});
