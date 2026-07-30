import { describe, it, expect } from 'vitest';
import {
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  hexToHsl,
  hslToHex,
  detectFormat,
  parseColor,
  getContrastingTextColor,
} from './color.utils.js';

describe('color.utils - normalizeHex', () => {
  it('should normalize 6-digit hex strings', () => {
    expect(normalizeHex('#ff5733')).toBe('#FF5733');
    expect(normalizeHex('ff5733')).toBe('#FF5733');
  });

  it('should expand 3-digit hex strings to 6-digit hex', () => {
    expect(normalizeHex('#f0a')).toBe('#FF00AA');
    expect(normalizeHex('f0a')).toBe('#FF00AA');
  });

  it('should throw an error for invalid hex strings', () => {
    expect(() => normalizeHex('#1234')).toThrow(/Invalid HEX color format/);
    expect(() => normalizeHex('xyz')).toThrow(/Invalid HEX color format/);
    expect(() => normalizeHex(123)).toThrow(/Input must be a string/);
  });
});

describe('color.utils - hexToRgb & rgbToHex', () => {
  it('should correctly convert HEX to RGB', () => {
    expect(hexToRgb('#FF5733')).toEqual({ r: 255, g: 87, b: 51 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#f57')).toEqual({ r: 255, g: 85, b: 119 });
  });

  it('should correctly convert RGB to HEX', () => {
    expect(rgbToHex(255, 87, 51)).toBe('#FF5733');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 255, 255)).toBe('#FFFFFF');
  });

  it('should throw error for invalid RGB values', () => {
    expect(() => rgbToHex(-1, 0, 0)).toThrow(/RGB values must be integers/);
    expect(() => rgbToHex(256, 0, 0)).toThrow(/RGB values must be integers/);
    expect(() => rgbToHex(10.5, 0, 0)).toThrow(/RGB values must be integers/);
  });
});

describe('color.utils - rgbToHsl & hslToRgb', () => {
  it('should convert RGB to HSL correctly', () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl(0, 255, 0)).toEqual({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl(0, 0, 255)).toEqual({ h: 240, s: 100, l: 50 });
    expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 100 });
    expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('should convert HSL to RGB correctly', () => {
    expect(hslToRgb(0, 100, 50)).toEqual({ r: 255, g: 0, b: 0 });
    expect(hslToRgb(120, 100, 50)).toEqual({ r: 0, g: 255, b: 0 });
    expect(hslToRgb(240, 100, 50)).toEqual({ r: 0, g: 0, b: 255 });
    expect(hslToRgb(0, 0, 100)).toEqual({ r: 255, g: 255, b: 255 });
    expect(hslToRgb(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('should throw error for out-of-range HSL values', () => {
    expect(() => hslToRgb(400, 50, 50)).toThrow(/HSL values out of range/);
    expect(() => hslToRgb(0, -10, 50)).toThrow(/HSL values out of range/);
    expect(() => hslToRgb(0, 50, 110)).toThrow(/HSL values out of range/);
  });
});

describe('color.utils - hexToHsl & hslToHex', () => {
  it('should convert HEX to HSL', () => {
    expect(hexToHsl('#FF0000')).toEqual({ h: 0, s: 100, l: 50 });
    expect(hexToHsl('#00FF00')).toEqual({ h: 120, s: 100, l: 50 });
  });

  it('should convert HSL to HEX', () => {
    expect(hslToHex(0, 100, 50)).toBe('#FF0000');
    expect(hslToHex(120, 100, 50)).toBe('#00FF00');
  });
});

describe('color.utils - Roundtrip conversions', () => {
  it('should preserve values during RGB -> HSL -> RGB conversion within tolerance', () => {
    const originalRgb = { r: 100, g: 150, b: 200 };
    const hsl = rgbToHsl(originalRgb.r, originalRgb.g, originalRgb.b);
    const convertedRgb = hslToRgb(hsl.h, hsl.s, hsl.l);

    expect(Math.abs(convertedRgb.r - originalRgb.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(convertedRgb.g - originalRgb.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(convertedRgb.b - originalRgb.b)).toBeLessThanOrEqual(2);
  });

  it('should preserve values during HEX -> RGB -> HSL -> HEX roundtrip', () => {
    const originalHex = '#34D399';
    const rgb = hexToRgb(originalHex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const resultHex = hslToHex(hsl.h, hsl.s, hsl.l);

    const resultRgb = hexToRgb(resultHex);
    expect(Math.abs(resultRgb.r - rgb.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(resultRgb.g - rgb.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(resultRgb.b - rgb.b)).toBeLessThanOrEqual(2);
  });
});

describe('color.utils - detectFormat & parseColor', () => {
  it('should correctly detect color format', () => {
    expect(detectFormat('#FF5733')).toBe('hex');
    expect(detectFormat('f57')).toBe('hex');
    expect(detectFormat('rgb(255, 87, 51)')).toBe('rgb');
    expect(detectFormat('hsl(9, 100%, 60%)')).toBe('hsl');
    expect(detectFormat('invalid')).toBe('unknown');
  });

  it('should parse HEX inputs successfully', () => {
    const res = parseColor('#FF5733');
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('hex');
    expect(res.hex).toBe('#FF5733');
    expect(res.rgb).toEqual({ r: 255, g: 87, b: 51 });
    expect(res.rgbStr).toBe('rgb(255, 87, 51)');
    expect(res.hslStr).toBe('hsl(11, 100%, 60%)');
  });

  it('should parse RGB inputs successfully', () => {
    const res = parseColor('rgb(255, 87, 51)');
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('rgb');
    expect(res.hex).toBe('#FF5733');
    expect(res.rgb).toEqual({ r: 255, g: 87, b: 51 });
  });

  it('should parse HSL inputs successfully', () => {
    const res = parseColor('hsl(11, 100%, 60%)');
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('hsl');
    expect(res.hex).toBe('#FF5833');
    expect(res.rgb).toEqual({ r: 255, g: 88, b: 51 });
  });

  it('should handle invalid or empty inputs gracefully without throwing', () => {
    expect(parseColor('').isValid).toBe(false);
    expect(parseColor('   ').isValid).toBe(false);
    expect(parseColor('rgb(300, 0, 0)').isValid).toBe(false);
    expect(parseColor('hsl(500, 100%, 50%)').isValid).toBe(false);
    expect(parseColor('not-a-color').isValid).toBe(false);
  });

  it('should calculate contrasting text color', () => {
    expect(getContrastingTextColor(255, 255, 255)).toBe('#000000');
    expect(getContrastingTextColor(0, 0, 0)).toBe('#FFFFFF');
    expect(getContrastingTextColor(255, 0, 0)).toBe('#FFFFFF');
  });
});
