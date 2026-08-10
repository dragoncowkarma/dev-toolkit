import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET_TIMEZONES,
  calculateDayDifference,
  convertTimezone,
  formatUtcOffset,
  getDayDiffLabel,
  getNowInTimezone,
  getSupportedTimezones,
  getUtcOffsetMinutes,
  getWallTimeParts,
  isValidTimezone,
  parseSourceToUtcDate,
} from './timezone.utils.js';

describe('timezone.utils.js unit tests', () => {
  describe('getSupportedTimezones & isValidTimezone', () => {
    it('returns a non-empty array of timezones including defaults', () => {
      const zones = getSupportedTimezones();
      expect(Array.isArray(zones)).toBe(true);
      expect(zones.length).toBeGreaterThan(5);
      expect(zones).toContain('UTC');
      expect(zones).toContain('Asia/Seoul');
    });

    it('validates timezone strings correctly', () => {
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Asia/Seoul')).toBe(true);
      expect(isValidTimezone('Invalid/Timezone_Name')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone(null)).toBe(false);
    });
  });

  describe('UTC offset computation & formatting', () => {
    it('formats UTC offset minutes correctly', () => {
      expect(formatUtcOffset(0)).toBe('UTC+00:00');
      expect(formatUtcOffset(540)).toBe('UTC+09:00');
      expect(formatUtcOffset(-240)).toBe('UTC-04:00');
      expect(formatUtcOffset(330)).toBe('UTC+05:30');
      expect(formatUtcOffset(-210)).toBe('UTC-03:30');
    });

    it('computes exact UTC offset minutes for standard and offset timezones', () => {
      const fixedDate = new Date('2026-08-10T12:00:00Z');
      expect(getUtcOffsetMinutes(fixedDate, 'UTC')).toBe(0);
      expect(getUtcOffsetMinutes(fixedDate, 'Asia/Seoul')).toBe(540);
      expect(getUtcOffsetMinutes(fixedDate, 'Asia/Kolkata')).toBe(330);
    });
  });

  describe('parseSourceToUtcDate', () => {
    it('parses local date and time string in specified source timezone to UTC Date', () => {
      const date = parseSourceToUtcDate('2026-08-10T14:30:00', 'Asia/Seoul');
      expect(date).toBeInstanceOf(Date);
      expect(date.toISOString()).toBe('2026-08-10T05:30:00.000Z');
    });

    it('handles dates formatted with space instead of T', () => {
      const date = parseSourceToUtcDate('2026-08-10 14:30', 'Asia/Seoul');
      expect(date).toBeInstanceOf(Date);
      expect(date.toISOString()).toBe('2026-08-10T05:30:00.000Z');
    });

    it('returns null for invalid date/time inputs', () => {
      expect(parseSourceToUtcDate('invalid-date', 'UTC')).toBeNull();
      expect(parseSourceToUtcDate('2026-13-45T14:30', 'UTC')).toBeNull();
      expect(parseSourceToUtcDate('2026-08-10T25:70', 'UTC')).toBeNull();
      expect(parseSourceToUtcDate('', 'UTC')).toBeNull();
      expect(parseSourceToUtcDate('2026-08-10T14:30', 'Invalid/TZ')).toBeNull();
      expect(parseSourceToUtcDate('2026-02-30T14:30', 'UTC')).toBeNull();
      expect(parseSourceToUtcDate('2026-04-31T14:30', 'UTC')).toBeNull();
      expect(parseSourceToUtcDate('2026-02-29T14:30', 'UTC')).toBeNull();
      expect(parseSourceToUtcDate('2024-02-29T14:30', 'UTC')).not.toBeNull();
    });
  });

  describe('getWallTimeParts & calculateDayDifference', () => {
    it('extracts wall clock parts for a Date object in a timezone', () => {
      const fixedDate = new Date('2026-08-10T12:30:45Z');
      const parts = getWallTimeParts(fixedDate, 'Asia/Seoul');
      expect(parts).toEqual({
        year: 2026,
        month: 8,
        day: 10,
        hour: 21,
        minute: 30,
        second: 45,
      });
    });

    it('calculates calendar day difference between date parts', () => {
      const src = { year: 2026, month: 8, day: 10 };
      const tgtNext = { year: 2026, month: 8, day: 11 };
      const tgtPrev = { year: 2026, month: 8, day: 9 };
      expect(calculateDayDifference(src, tgtNext)).toBe(1);
      expect(calculateDayDifference(src, tgtPrev)).toBe(-1);
      expect(calculateDayDifference(src, src)).toBe(0);
    });
  });

  describe('Different-day detection', () => {
    it('detects previous day (-1 day) when target is behind source day', () => {
      // Source: Asia/Seoul (UTC+9) 2026-08-10 02:00 -> UTC is 2026-08-09 17:00
      // Target: America/New_York (UTC-4) -> Local target is 2026-08-09 13:00 (Previous day)
      const res = convertTimezone('2026-08-10T02:00', 'Asia/Seoul', 'America/New_York');
      expect(res.isValid).toBe(true);
      expect(res.dayDiff).toBe(-1);
      expect(res.dayDiffLabel).toBe('-1 day');
      expect(res.isDifferentDay).toBe(true);
      expect(res.localDate).toBe('2026-08-09');
    });

    it('detects next day (+1 day) when target is ahead of source day', () => {
      // Source: America/New_York (UTC-4) 2026-08-10 22:00 -> UTC is 2026-08-11 02:00
      // Target: Asia/Seoul (UTC+9) -> Local target is 2026-08-11 11:00 (Next day)
      const res = convertTimezone('2026-08-10T22:00', 'America/New_York', 'Asia/Seoul');
      expect(res.isValid).toBe(true);
      expect(res.dayDiff).toBe(1);
      expect(res.dayDiffLabel).toBe('+1 day');
      expect(res.isDifferentDay).toBe(true);
      expect(res.localDate).toBe('2026-08-11');
    });

    it('detects same day when target falls on same calendar day as source', () => {
      const res = convertTimezone('2026-08-10T14:00', 'Asia/Seoul', 'Asia/Tokyo');
      expect(res.isValid).toBe(true);
      expect(res.dayDiff).toBe(0);
      expect(res.dayDiffLabel).toBe('Same day');
      expect(res.isDifferentDay).toBe(false);
      expect(res.localDate).toBe('2026-08-10');
    });

    it('formats day difference labels properly for multi-day gaps', () => {
      expect(getDayDiffLabel(0)).toBe('Same day');
      expect(getDayDiffLabel(1)).toBe('+1 day');
      expect(getDayDiffLabel(-1)).toBe('-1 day');
      expect(getDayDiffLabel(2)).toBe('+2 days');
      expect(getDayDiffLabel(-2)).toBe('-2 days');
    });
  });

  describe('DST-transition correctness', () => {
    it('correctly calculates offset for America/New_York in winter (EST) and summer (EDT)', () => {
      // Winter: EST (UTC-5)
      const winterRes = convertTimezone('2026-01-15T12:00', 'UTC', 'America/New_York');
      expect(winterRes.offsetStr).toBe('UTC-05:00');
      expect(winterRes.localTime).toBe('07:00:00');

      // Summer: EDT (UTC-4)
      const summerRes = convertTimezone('2026-07-15T12:00', 'UTC', 'America/New_York');
      expect(summerRes.offsetStr).toBe('UTC-04:00');
      expect(summerRes.localTime).toBe('08:00:00');
    });

    it('handles conversion across known US spring-forward DST transition', () => {
      // US spring-forward in 2026 is March 8.
      // March 7: EST (UTC-5)
      const beforeDst = convertTimezone('2026-03-07T12:00', 'America/New_York', 'UTC');
      expect(beforeDst.offsetStr).toBe('UTC+00:00');
      expect(getUtcOffsetMinutes(beforeDst.utcDate, 'America/New_York')).toBe(-300);

      // March 9: EDT (UTC-4)
      const afterDst = convertTimezone('2026-03-09T12:00', 'America/New_York', 'UTC');
      expect(getUtcOffsetMinutes(afterDst.utcDate, 'America/New_York')).toBe(-240);
    });

    it('handles conversion across Europe/London DST transitions (GMT vs BST)', () => {
      // Winter: GMT (UTC+0)
      const winterRes = convertTimezone('2026-01-15T12:00', 'UTC', 'Europe/London');
      expect(winterRes.offsetStr).toBe('UTC+00:00');

      // Summer: BST (UTC+1)
      const summerRes = convertTimezone('2026-07-15T12:00', 'UTC', 'Europe/London');
      expect(summerRes.offsetStr).toBe('UTC+01:00');
    });
  });

  describe('getNowInTimezone & presets', () => {
    it('returns formatted date and time for current moment in a timezone', () => {
      const mockDate = new Date('2026-08-10T13:45:00.000Z');
      const nowResult = getNowInTimezone('Asia/Seoul', mockDate);
      expect(nowResult.dateStr).toBe('2026-08-10');
      expect(nowResult.timeStr).toBe('22:45');
      expect(nowResult.dateTimeStr).toBe('2026-08-10T22:45');
    });

    it('exports DEFAULT_PRESET_TIMEZONES array', () => {
      expect(DEFAULT_PRESET_TIMEZONES).toEqual([
        'UTC',
        'America/New_York',
        'Europe/London',
        'Asia/Seoul',
        'Asia/Tokyo',
        'Australia/Sydney',
      ]);
    });
  });
});
