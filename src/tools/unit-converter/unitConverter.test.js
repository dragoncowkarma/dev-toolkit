import { describe, expect, it } from 'vitest';
import { convertUnit, parseConversionValue } from './unitConverter.utils.js';

describe('convertUnit', () => {
  it('converts all ratio-based categories', () => {
    expect(convertUnit(1, 'length', 'm', 'cm')).toBeCloseTo(100);
    expect(convertUnit(1, 'weight', 'kg', 'lb')).toBeCloseTo(2.20462262);
    expect(convertUnit(1, 'volume', 'l', 'fl-oz-us')).toBeCloseTo(33.8140227);
  });

  it('uses temperature offset formulas', () => {
    expect(convertUnit(0, 'temperature', 'celsius', 'fahrenheit')).toBe(32);
    expect(convertUnit(0, 'temperature', 'celsius', 'kelvin')).toBe(273.15);
    expect(convertUnit(-40, 'temperature', 'celsius', 'fahrenheit')).toBe(-40);
  });

  it('round trips every category within floating-point tolerance', () => {
    const conversions = [
      ['length', 'mi', 'mm'],
      ['weight', 'lb', 'mg'],
      ['temperature', 'fahrenheit', 'kelvin'],
      ['volume', 'gal-us', 'ml'],
    ];
    conversions.forEach(([category, from, to]) => {
      const original = category === 'temperature' ? 68 : 12.345;
      const roundTrip = convertUnit(convertUnit(original, category, from, to), category, to, from);
      expect(roundTrip).toBeCloseTo(original, 10);
    });
  });

  it('handles invalid and empty inputs without conversion', () => {
    expect(parseConversionValue('')).toBeNull();
    expect(parseConversionValue('not-a-number')).toBeNull();
    expect(() => convertUnit(Number.NaN, 'length', 'm', 'cm')).toThrow('Enter a valid number.');
  });
});
