import { describe, expect, it } from 'vitest';
import {
  classifyContrast,
  getContrastRatio,
  parseColor,
  WCAG_THRESHOLDS,
} from './colorContrast.utils.js';

describe('color contrast utilities', () => {
  it.each([
    ['#fff', { r: 255, g: 255, b: 255, alpha: 1 }],
    ['rgb(12, 34, 56)', { r: 12, g: 34, b: 56, alpha: 1 }],
    ['rgba(255, 0, 0, 50%)', { r: 255, g: 0, b: 0, alpha: 0.5 }],
    ['hsl(120, 100%, 50%)', { r: 0, g: 255, b: 0, alpha: 1 }],
    ['hsla(240, 100%, 50%, 0.25)', { r: 0, g: 0, b: 255, alpha: 0.25 }],
  ])('parses %s', (input, expected) => {
    expect(parseColor(input)).toMatchObject({ ok: true, color: expected });
  });

  it('matches WCAG reference ratios', () => {
    expect(getContrastRatio('#000', '#fff')).toMatchObject({ ok: true });
    expect(getContrastRatio('#000', '#fff').ratio).toBeCloseTo(21, 10);
    expect(getContrastRatio('#fff', '#fff').ratio).toBeCloseTo(1, 10);
  });

  it('returns side-specific structured parse errors', () => {
    expect(getContrastRatio('nope', 'rgb(999, 0, 0)')).toEqual({
      ok: false,
      errors: {
        foreground: expect.stringContaining('Unable to parse'),
        background: expect.stringContaining('RGB channels'),
      },
    });
  });

  it.each(Object.entries(WCAG_THRESHOLDS))(
    'classifies the %s threshold at and around %s',
    (key, threshold) => {
      expect(classifyContrast(threshold)[key]).toBe(true);
      expect(classifyContrast(threshold + 0.0001)[key]).toBe(true);
      expect(classifyContrast(threshold - 0.0001)[key]).toBe(false);
    },
  );
});
