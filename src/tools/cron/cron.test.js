import { describe, expect, it } from 'vitest';
import { describeCron, formatExecution, getNextExecutions, parseCron } from './cron.utils.js';

describe('parseCron', () => {
  it('parses a five-field expression', () => {
    expect(parseCron('*/5 * * * *').hasSeconds).toBe(false);
  });
  it('parses a six-field expression', () => {
    expect(parseCron('*/10 * * * * *').hasSeconds).toBe(true);
  });
  it('accepts lists, ranges, and steps', () => {
    const parsed = parseCron('0,30 9-17/2 * * 1-5');
    expect([...parsed.fields[0].values]).toEqual([0, 30]);
    expect([...parsed.fields[1].values]).toEqual([9, 11, 13, 15, 17]);
  });
  it('normalizes Sunday 7 to 0', () => {
    expect(parseCron('0 0 * * 7').fields[4].values.has(0)).toBe(true);
  });
  it('preserves 7 outside the day-of-week field', () => {
    const parsed = parseCron('0 7 7 7 *');
    expect([...parsed.fields[1].values]).toEqual([7]);
    expect([...parsed.fields[2].values]).toEqual([7]);
    expect([...parsed.fields[3].values]).toEqual([7]);
  });
  it('expands steps from a starting offset through the field maximum', () => {
    expect([...parseCron('5/10 * * * *').fields[0].values])
      .toEqual([5, 15, 25, 35, 45, 55]);
  });
  it('rejects wrong field counts', () => {
    expect(() => parseCron('* * *')).toThrow('use 5 or 6 fields');
  });
  it('rejects out-of-range values', () => {
    expect(() => parseCron('60 * * * *')).toThrow('between 0 and 59');
  });
  it('rejects zero steps', () => {
    expect(() => parseCron('*/0 * * * *')).toThrow('step must be at least 1');
  });
});

describe('describeCron', () => {
  it('describes every-minute schedules', () => {
    expect(describeCron('* * * * *')).toBe('Every minute');
  });
  it('describes minute intervals', () => {
    expect(describeCron('*/5 * * * *')).toBe('Every 5 minutes');
  });
  it('describes the hourly preset', () => {
    expect(describeCron('0 * * * *')).toBe('Every hour');
  });
  it('describes multiple hour and minute values clearly', () => {
    expect(describeCron('0,30 9,17 * * *'))
      .toBe('Every day at 09:00, 09:30, 17:00, 17:30');
  });
  it('describes a weekday time', () => {
    expect(describeCron('0 9 * * 1')).toBe('Every Monday at 09:00');
  });
  it('describes second intervals', () => {
    expect(describeCron('*/10 * * * * *')).toBe('Every 10 seconds');
  });
});

describe('getNextExecutions', () => {
  it('returns the next five every-five-minute dates after the reference point', () => {
    const dates = getNextExecutions('*/5 * * * *', new Date(2026, 0, 1, 9, 2, 30));
    expect(dates.map((date) => date.getMinutes())).toEqual([5, 10, 15, 20, 25]);
    expect(dates.every((date) => date.getSeconds() === 0)).toBe(true);
  });
  it('uses OR semantics when both day-of-month and weekday are configured', () => {
    const dates = getNextExecutions('0 9 2 * 1', new Date(2026, 0, 1, 10));
    expect(dates[0]).toEqual(new Date(2026, 0, 2, 9));
    expect(dates[1]).toEqual(new Date(2026, 0, 5, 9));
  });
  it('supports seconds-prefixed schedules', () => {
    const dates = getNextExecutions('*/10 * * * * *', new Date(2026, 0, 1, 0, 0, 2));
    expect(dates.map((date) => date.getSeconds())).toEqual([10, 20, 30, 40, 50]);
  });
  it('requires a positive count', () => {
    expect(() => getNextExecutions('* * * * *', new Date(), 0)).toThrow();
  });
  it('formats dates for display', () => {
    expect(formatExecution(new Date(2026, 0, 1, 9, 0)).length).toBeGreaterThan(0);
  });
});
