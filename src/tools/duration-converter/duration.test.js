import { describe, expect, it } from 'vitest';
import {
  durationToMilliseconds,
  durationToSeconds,
  formatClock,
  formatDuration,
  formatDurationFromSeconds,
  formatHumanBreakdown,
  parseDuration,
} from './duration.utils.js';

describe('parseDuration', () => {
  it('parses every standard component and computes its total seconds', () => {
    const result = parseDuration('P3DT4H5M6S');
    expect(result.components).toMatchObject({ days: 3, hours: 4, minutes: 5, seconds: 6 });
    expect(durationToSeconds(result.components)).toBe(273906);
    expect(durationToMilliseconds(result.components)).toBe(273906000);
  });

  it('distinguishes months before T from minutes after T', () => {
    expect(parseDuration('P1M').components).toMatchObject({ months: 1, minutes: 0 });
    expect(parseDuration('PT1M').components).toMatchObject({ months: 0, minutes: 1 });
  });

  it('accepts weeks, fractional final values, negative values, and lowercase', () => {
    expect(durationToSeconds(parseDuration('P2W').components)).toBe(1209600);
    expect(durationToSeconds(parseDuration('PT1.5H').components)).toBe(5400);
    expect(parseDuration('-PT1H').components.sign).toBe(-1);
    expect(parseDuration('pt1h').canonical).toBe('PT1H');
  });

  it('round trips valid samples to canonical ISO and formats zero', () => {
    ['P3DT4H5M6S', 'P2W', 'PT1.5H', '-PT1H', 'pt1h'].forEach((input) => {
      const result = parseDuration(input);
      expect(formatDuration(result.components)).toBe(result.canonical);
    });
    expect(formatDurationFromSeconds(0)).toBe('PT0S');
    expect(formatDurationFromSeconds(5400)).toBe('PT1H30M');
  });

  it('returns descriptive controlled errors for malformed durations', () => {
    ['P', 'P1DT', 'PT1M1H', 'P1.5YT1H', '1H', 'PTbanana'].forEach((input) => {
      const result = parseDuration(input);
      expect(result.isValid).toBe(false);
      expect(result.error).not.toBe('');
    });
  });
});

describe('duration display formatting', () => {
  it('formats component and clock output including hours past one day', () => {
    const components = parseDuration('P3DT4H5M6S').components;
    expect(formatHumanBreakdown(components)).toBe('3 days, 4 hours, 5 minutes, 6 seconds');
    expect(formatClock(durationToSeconds(components))).toBe('76:05:06');
  });
});
