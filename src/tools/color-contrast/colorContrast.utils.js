const COLOR_FORMAT_HELP = 'Use #RGB, #RRGGBB, rgb()/rgba(), or hsl()/hsla().';

export const WCAG_THRESHOLDS = Object.freeze({
  aaNormal: 4.5,
  aaLarge: 3,
  aaaNormal: 7,
  aaaLarge: 4.5,
});

function validChannel(value) {
  return Number.isFinite(value) && value >= 0 && value <= 255;
}

function parseAlpha(value) {
  if (value === undefined) return 1;
  const alpha = value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value);
  return Number.isFinite(alpha) && alpha >= 0 && alpha <= 1 ? alpha : null;
}

function hslToRgb(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = saturation / 100;
  const l = lightness / 100;

  if (s === 0) {
    const channel = Math.round(l * 255);
    return { r: channel, g: channel, b: channel };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueToChannel = (offset) => {
    let value = offset;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };

  return {
    r: Math.round(hueToChannel(h + 1 / 3) * 255),
    g: Math.round(hueToChannel(h) * 255),
    b: Math.round(hueToChannel(h - 1 / 3) * 255),
  };
}

function success(rgb, alpha, format) {
  return { ok: true, color: { ...rgb, alpha }, format };
}

function failure(message) {
  return { ok: false, error: message };
}

/**
 * Parses a CSS HEX, RGB(A), or HSL(A) color into numeric sRGB channels.
 *
 * @param {string} input Color text to parse.
 * @returns {{ok: true, color: {r: number, g: number, b: number, alpha: number},
 *   format: string} | {ok: false, error: string}} Structured parse result.
 */
export function parseColor(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return failure(`Enter a color. ${COLOR_FORMAT_HELP}`);
  }

  const value = input.trim();
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const expanded = hex[1].length === 3
      ? [...hex[1]].map((character) => character.repeat(2)).join('')
      : hex[1];
    return success({
      r: parseInt(expanded.slice(0, 2), 16),
      g: parseInt(expanded.slice(2, 4), 16),
      b: parseInt(expanded.slice(4, 6), 16),
    }, 1, 'HEX');
  }

  const rgb = value.match(
    /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)(?:\s*,\s*([\d.]+%?))?\s*\)$/i,
  );
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number);
    const alpha = parseAlpha(rgb[4]);
    const expectsAlpha = /^rgba/i.test(value);
    if (channels.some((channel) => !validChannel(channel)) || alpha === null
      || (expectsAlpha && rgb[4] === undefined)) {
      return failure(
        `RGB channels must be 0-255 and alpha must be 0-1. ${COLOR_FORMAT_HELP}`,
      );
    }
    return success({ r: channels[0], g: channels[1], b: channels[2] }, alpha, 'RGB');
  }

  const hslPattern = [
    '^hsla?\\(\\s*(-?[\\d.]+)(?:deg)?\\s*,\\s*(-?[\\d.]+)%',
    '\\s*,\\s*(-?[\\d.]+)%(?:\\s*,\\s*([\\d.]+%?))?\\s*\\)$',
  ].join('');
  const hsl = value.match(new RegExp(hslPattern, 'i'));
  if (hsl) {
    const hue = Number(hsl[1]);
    const saturation = Number(hsl[2]);
    const lightness = Number(hsl[3]);
    const alpha = parseAlpha(hsl[4]);
    const expectsAlpha = /^hsla/i.test(value);
    if (!Number.isFinite(hue) || saturation < 0 || saturation > 100
      || lightness < 0 || lightness > 100 || alpha === null
      || (expectsAlpha && hsl[4] === undefined)) {
      return failure(`HSL saturation/lightness must be 0-100% and alpha 0-1. ${COLOR_FORMAT_HELP}`);
    }
    return success(hslToRgb(hue, saturation, lightness), alpha, 'HSL');
  }

  return failure(`Unable to parse "${value}". ${COLOR_FORMAT_HELP}`);
}

/**
 * Converts an RGB color to a native-picker-compatible uppercase HEX string.
 *
 * @param {{r: number, g: number, b: number}} color RGB color channels.
 * @returns {string} Color in #RRGGBB format.
 */
export function rgbToHex(color) {
  const channelToHex = (channel) => Math.round(channel).toString(16).padStart(2, '0');
  return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`.toUpperCase();
}

/**
 * Calculates WCAG 2.x relative luminance for an opaque sRGB color.
 *
 * @param {{r: number, g: number, b: number}} color RGB color channels.
 * @returns {number} Relative luminance from 0 to 1.
 */
export function getRelativeLuminance(color) {
  const linear = [color.r, color.g, color.b].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * Alpha-composites a foreground color over an opaque background color.
 *
 * @param {{r: number, g: number, b: number, alpha?: number}} foreground Top color.
 * @param {{r: number, g: number, b: number}} background Opaque base color.
 * @returns {{r: number, g: number, b: number}} Composite color.
 */
export function compositeColor(foreground, background) {
  const alpha = foreground.alpha ?? 1;
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
  };
}

/**
 * Calculates a WCAG contrast ratio, returning parse errors instead of throwing.
 * Translucent colors are composited in paint order over a white page canvas.
 *
 * @param {string} foreground Foreground CSS color.
 * @param {string} background Background CSS color.
 * @returns {{ok: true, ratio: number, foreground: object, background: object}
 *   | {ok: false, errors: {foreground?: string, background?: string}}} Result.
 */
export function getContrastRatio(foreground, background) {
  const foregroundResult = parseColor(foreground);
  const backgroundResult = parseColor(background);
  const errors = {};
  if (!foregroundResult.ok) errors.foreground = foregroundResult.error;
  if (!backgroundResult.ok) errors.background = backgroundResult.error;
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const canvas = { r: 255, g: 255, b: 255 };
  const resolvedBackground = compositeColor(backgroundResult.color, canvas);
  const resolvedForeground = compositeColor(foregroundResult.color, resolvedBackground);
  const foregroundLuminance = getRelativeLuminance(resolvedForeground);
  const backgroundLuminance = getRelativeLuminance(resolvedBackground);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return {
    ok: true,
    ratio: (lighter + 0.05) / (darker + 0.05),
    foreground: foregroundResult.color,
    background: backgroundResult.color,
  };
}

/**
 * Classifies a contrast ratio against all WCAG AA and AAA text thresholds.
 *
 * @param {number} ratio Contrast ratio to classify.
 * @returns {{aaNormal: boolean, aaLarge: boolean, aaaNormal: boolean, aaaLarge: boolean}}
 * Pass/fail values for normal and large text.
 */
export function classifyContrast(ratio) {
  return Object.fromEntries(
    Object.entries(WCAG_THRESHOLDS).map(([name, threshold]) => [name, ratio >= threshold]),
  );
}
