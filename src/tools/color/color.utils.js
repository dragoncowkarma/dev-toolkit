/**
 * Utility functions for converting and validating color representations (HEX, RGB, HSL).
 */

/**
 * Standardizes a 3-character or 6-character HEX color string to #RRGGBB format.
 *
 * @param {string} hex The HEX string to normalize.
 * @returns {string} Standardized uppercase HEX string (e.g., "#FF0000").
 * @throws {Error} If HEX string is invalid.
 */
export function normalizeHex(hex) {
  if (typeof hex !== 'string') {
    throw new Error('Input must be a string.');
  }
  const clean = hex.trim();
  const match = clean.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) {
    throw new Error('Invalid HEX color format. Expected #RGB or #RRGGBB (e.g. #FF5733 or #F57).');
  }
  let h = match[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((char) => char + char)
      .join('');
  }
  return `#${h.toUpperCase()}`;
}

/**
 * Converts a HEX color string to RGB object { r, g, b }.
 *
 * @param {string} hex The HEX string.
 * @returns {{ r: number, g: number, b: number }} The RGB object.
 */
export function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return { r, g, b };
}

/**
 * Converts RGB components to a HEX color string.
 *
 * @param {number} r Red channel (0-255).
 * @param {number} g Green channel (0-255).
 * @param {number} b Blue channel (0-255).
 * @returns {string} Uppercase HEX color string (e.g., "#FF5733").
 */
export function rgbToHex(r, g, b) {
  if (
    [r, g, b].some(
      (val) =>
        typeof val !== 'number' ||
        isNaN(val) ||
        val < 0 ||
        val > 255 ||
        !Number.isInteger(val)
    )
  ) {
    throw new Error('RGB values must be integers between 0 and 255.');
  }
  const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Converts RGB components to HSL object { h, s, l }.
 *
 * @param {number} r Red channel (0-255).
 * @param {number} g Green channel (0-255).
 * @param {number} b Blue channel (0-255).
 * @returns {{ h: number, s: number, l: number }} HSL object (h: 0-360, s: 0-100, l: 0-100).
 */
export function rgbToHsl(r, g, b) {
  if (
    [r, g, b].some(
      (val) =>
        typeof val !== 'number' ||
        isNaN(val) ||
        val < 0 ||
        val > 255 ||
        !Number.isInteger(val)
    )
  ) {
    throw new Error('RGB values must be integers between 0 and 255.');
  }
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / delta + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / delta + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Converts HSL components to RGB object { r, g, b }.
 *
 * @param {number} h Hue (0-360).
 * @param {number} s Saturation (0-100).
 * @param {number} l Lightness (0-100).
 * @returns {{ r: number, g: number, b: number }} RGB object (r, g, b: 0-255).
 */
export function hslToRgb(h, s, l) {
  if (
    typeof h !== 'number' ||
    isNaN(h) ||
    h < 0 ||
    h > 360 ||
    typeof s !== 'number' ||
    isNaN(s) ||
    s < 0 ||
    s > 100 ||
    typeof l !== 'number' ||
    isNaN(l) ||
    l < 0 ||
    l > 100
  ) {
    throw new Error(
      'HSL values out of range: Hue (0-360), Saturation (0-100%), Lightness (0-100%).'
    );
  }

  const hNorm = (h % 360) / 360;
  const sNorm = s / 100;
  const lNorm = l / 100;

  let r, g, b;

  if (sNorm === 0) {
    r = g = b = lNorm;
  } else {
    const hue2rgb = (p, q, t) => {
      let tNorm = t;
      if (tNorm < 0) tNorm += 1;
      if (tNorm > 1) tNorm -= 1;
      if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
      if (tNorm < 1 / 2) return q;
      if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
      return p;
    };

    const q =
      lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
    const p = 2 * lNorm - q;

    r = hue2rgb(p, q, hNorm + 1 / 3);
    g = hue2rgb(p, q, hNorm);
    b = hue2rgb(p, q, hNorm - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * Converts a HEX color string to HSL object { h, s, l }.
 *
 * @param {string} hex The HEX color string.
 * @returns {{ h: number, s: number, l: number }}
 */
export function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

/**
 * Converts HSL components to a HEX color string.
 *
 * @param {number} h Hue (0-360).
 * @param {number} s Saturation (0-100).
 * @param {number} l Lightness (0-100).
 * @returns {string} HEX color string.
 */
export function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/**
 * Detects format of an input color string.
 *
 * @param {string} input The color input string.
 * @returns {'hex' | 'rgb' | 'hsl' | 'unknown'}
 */
export function detectFormat(input) {
  if (typeof input !== 'string') return 'unknown';
  const trimmed = input.trim();
  if (/^#/i.test(trimmed) || /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/i.test(trimmed)) return 'hex';
  if (/^rgb\s*\(/i.test(trimmed)) return 'rgb';
  if (/^hsl\s*\(/i.test(trimmed)) return 'hsl';
  return 'unknown';
}

/**
 * Calculates perceived relative luminance to determine contrasting text color.
 *
 * @param {number} r Red (0-255).
 * @param {number} g Green (0-255).
 * @param {number} b Blue (0-255).
 * @returns {'#000000' | '#FFFFFF'} Recommended text color.
 */
export function getContrastingTextColor(r, g, b) {
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55 ? '#000000' : '#FFFFFF';
}

/**
 * Parses and converts any input color string (#HEX, rgb(...), hsl(...)).
 *
 * @param {string} input The input color string.
 * @returns {object} Validation result object with normalized hex, rgb, and hsl properties.
 */
export function parseColor(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return {
      isValid: false,
      error: 'Please enter a color code (HEX, RGB, or HSL).',
    };
  }

  const trimmed = input.trim();
  const format = detectFormat(trimmed);

  try {
    if (format === 'hex') {
      const hex = normalizeHex(trimmed);
      const rgb = hexToRgb(hex);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      return {
        isValid: true,
        format: 'hex',
        hex,
        rgb,
        hsl,
        rgbStr: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
        hslStr: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
      };
    }

    if (format === 'rgb') {
      const rgbRegex = /^rgb\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i;
      const match = trimmed.match(rgbRegex);
      if (!match) {
        return {
          isValid: false,
          error:
            'Invalid RGB format. Use rgb(r, g, b) format with values 0-255' +
            ' (e.g. rgb(255, 87, 51)).',
        };
      }
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);

      if ([r, g, b].some((val) => val < 0 || val > 255)) {
        return {
          isValid: false,
          error: 'RGB values must be integers between 0 and 255.',
        };
      }

      const hex = rgbToHex(r, g, b);
      const hsl = rgbToHsl(r, g, b);
      return {
        isValid: true,
        format: 'rgb',
        hex,
        rgb: { r, g, b },
        hsl,
        rgbStr: `rgb(${r}, ${g}, ${b})`,
        hslStr: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
      };
    }

    if (format === 'hsl') {
      const hslRegex =
        /^hsl\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)%?\s*,\s*(-?\d+(?:\.\d+)?)%?\s*\)$/i;
      const match = trimmed.match(hslRegex);
      if (!match) {
        return {
          isValid: false,
          error:
            'Invalid HSL format. Use hsl(h, s%, l%) format (e.g. hsl(9, 100%, 60%)).',
        };
      }
      const h = Number(match[1]);
      const s = Number(match[2]);
      const l = Number(match[3]);

      if (h < 0 || h > 360 || s < 0 || s > 100 || l < 0 || l > 100) {
        return {
          isValid: false,
          error:
            'HSL values out of range: Hue (0-360), Saturation (0-100%), Lightness (0-100%).',
        };
      }

      const rgb = hslToRgb(h, s, l);
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      const normHsl = {
        h: Math.round(h),
        s: Math.round(s),
        l: Math.round(l),
      };
      return {
        isValid: true,
        format: 'hsl',
        hex,
        rgb,
        hsl: normHsl,
        rgbStr: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
        hslStr: `hsl(${normHsl.h}, ${normHsl.s}%, ${normHsl.l}%)`,
      };
    }

    return {
      isValid: false,
      error:
        'Unrecognized color format. Supported formats: #RRGGBB, #RGB, ' +
        'rgb(r, g, b), hsl(h, s%, l%).',
    };
  } catch (err) {
    return {
      isValid: false,
      error: err.message,
    };
  }
}
