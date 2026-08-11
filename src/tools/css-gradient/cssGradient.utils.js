/**
 * Utility functions for validating colors, positions, and stops, and generating
 * CSS gradient declarations (linear, radial, conic).
 */

/**
 * Checks if RGB channel component is valid (0-255 or 0%-100%).
 *
 * @param {string} val - RGB component value string.
 * @returns {boolean} True if valid.
 */
function checkRgbComponent(val) {
  if (typeof val !== 'string') return false;
  if (val.endsWith('%')) {
    const num = parseFloat(val);
    return !Number.isNaN(num) && num >= 0 && num <= 100;
  }
  const num = Number(val);
  return !Number.isNaN(num) && Number.isInteger(num) && num >= 0 && num <= 255;
}

/**
 * Checks if Alpha component is valid (0-1 or 0%-100%).
 *
 * @param {string} val - Alpha component value string.
 * @returns {boolean} True if valid.
 */
function checkAlphaComponent(val) {
  if (typeof val !== 'string') return false;
  if (val.endsWith('%')) {
    const num = parseFloat(val);
    return !Number.isNaN(num) && num >= 0 && num <= 100;
  }
  const num = Number(val);
  return !Number.isNaN(num) && num >= 0 && num <= 1;
}

/**
 * Validates whether a color string is valid CSS color format.
 * Accepts HEX (#rgb, #rgba, #rrggbb, #rrggbbaa), RGB/RGBA, HSL/HSLA, and named colors.
 *
 * @param {string} color - The color string to validate.
 * @returns {boolean} True if the color is valid, false otherwise.
 */
export function validateColor(color) {
  if (typeof color !== 'string') return false;
  const trimmed = color.trim();
  if (!trimmed) return false;

  // 1. HEX format: #rgb, #rgba, #rrggbb, #rrggbbaa
  const hexRegex = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  if (hexRegex.test(trimmed)) return true;

  // 2. RGB / RGBA format (comma-separated: rgb(255, 0, 0) or rgba(255, 0, 0, 0.5))
  const rgbPattern =
    '^rgba?\\(\\s*(\\d{1,3}%?)\\s*,\\s*(\\d{1,3}%?)\\s*,\\s*(\\d{1,3}%?)' +
    '(?:\\s*,\\s*(\\d*(?:\\.\\d+)?%?))?\\s*\\)$';
  const rgbRegex = new RegExp(rgbPattern, 'i');
  const rgbMatch = trimmed.match(rgbRegex);
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    if (!checkRgbComponent(r) || !checkRgbComponent(g) || !checkRgbComponent(b)) {
      return false;
    }
    if (a !== undefined && !checkAlphaComponent(a)) {
      return false;
    }
    return true;
  }

  // Modern RGB syntax: rgb(255 0 0 / 0.5)
  const rgbModernPattern =
    '^rgba?\\(\\s*(\\d{1,3}%?)\\s+(\\d{1,3}%?)\\s+(\\d{1,3}%?)' +
    '(?:\\s*\\/\\s*(\\d*(?:\\.\\d+)?%?))?\\s*\\)$';
  const rgbModernRegex = new RegExp(rgbModernPattern, 'i');
  const rgbModernMatch = trimmed.match(rgbModernRegex);
  if (rgbModernMatch) {
    const [, r, g, b, a] = rgbModernMatch;
    if (!checkRgbComponent(r) || !checkRgbComponent(g) || !checkRgbComponent(b)) {
      return false;
    }
    if (a !== undefined && !checkAlphaComponent(a)) {
      return false;
    }
    return true;
  }

  // 3. HSL / HSLA format
  const hslPattern =
    '^hsla?\\(\\s*(\\d{1,3}(?:deg)?)\\s*,\\s*(\\d{1,3}%)\\s*,\\s*(\\d{1,3}%)' +
    '(?:\\s*,\\s*(\\d*(?:\\.\\d+)?%?))?\\s*\\)$';
  const hslRegex = new RegExp(hslPattern, 'i');
  if (hslRegex.test(trimmed)) return true;

  // 4. Common CSS named colors & transparent
  const namedColors = [
    'transparent',
    'currentcolor',
    'black',
    'white',
    'red',
    'green',
    'blue',
    'yellow',
    'cyan',
    'magenta',
    'gray',
    'grey',
    'orange',
    'purple',
    'pink',
  ];
  if (namedColors.includes(trimmed.toLowerCase())) return true;

  return false;
}

/**
 * Validates a stop position (0 to 100).
 *
 * @param {number|string} position - The position to validate.
 * @returns {boolean} True if position is a valid number in range [0, 100], false otherwise.
 */
export function validatePosition(position) {
  if (position === '' || position === null || position === undefined) return false;
  const num = typeof position === 'number' ? position : Number(position);
  if (Number.isNaN(num)) return false;
  return num >= 0 && num <= 100;
}

/**
 * Validates color stops array.
 *
 * @param {Array<{color: string, position: number|string}>} stops - Color stops array.
 * @returns {{valid: boolean, error: string|null}} Validation result object.
 */
export function validateStops(stops) {
  if (!Array.isArray(stops) || stops.length < 2) {
    return { valid: false, error: 'At least 2 color stops are required.' };
  }

  for (let i = 0; i < stops.length; i += 1) {
    const stop = stops[i];
    if (!stop || !validateColor(stop.color)) {
      const displayVal = stop ? stop.color : '';
      return {
        valid: false,
        error: `Invalid color value "${displayVal}" at stop ${i + 1}.`,
      };
    }
    if (!validatePosition(stop.position)) {
      return {
        valid: false,
        error: `Position at stop ${i + 1} must be a number between 0% and 100%.`,
      };
    }
  }

  return { valid: true, error: null };
}

/**
 * Validates full gradient configuration object.
 *
 * @param {Object} config - Gradient configuration object.
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateGradientConfig(config) {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'Invalid configuration object.' };
  }

  const { type, angle, conicAngle, stops } = config;

  if (!['linear', 'radial', 'conic'].includes(type)) {
    return { valid: false, error: `Invalid gradient type: "${type}".` };
  }

  if (type === 'linear' && angle !== undefined) {
    const numAngle = Number(angle);
    if (Number.isNaN(numAngle) || numAngle < 0 || numAngle > 360) {
      return { valid: false, error: 'Linear gradient angle must be between 0° and 360°.' };
    }
  }

  if (type === 'conic' && conicAngle !== undefined) {
    const numAngle = Number(conicAngle);
    if (Number.isNaN(numAngle) || numAngle < 0 || numAngle > 360) {
      return { valid: false, error: 'Conic gradient starting angle must be between 0° and 360°.' };
    }
  }

  return validateStops(stops);
}

/**
 * Generates CSS gradient function string and declaration from configuration.
 *
 * @param {Object} config - Gradient configuration object.
 * @returns {{css: string, declaration: string, valid: boolean, error: string|null}}
 */
export function generateCssGradient(config) {
  const validation = validateGradientConfig(config);
  if (!validation.valid) {
    return { css: '', declaration: '', valid: false, error: validation.error };
  }

  const {
    type = 'linear',
    angle = 90,
    direction = 'to right',
    useKeywordDirection = false,
    shape = 'circle',
    radialPosition = 'center',
    conicAngle = 0,
    conicPosition = 'center',
    stops = [],
  } = config;

  const stopListStr = stops
    .map((s) => `${s.color.trim()} ${Number(s.position)}%`)
    .join(', ');

  let cssValue = '';

  if (type === 'linear') {
    if (useKeywordDirection && direction) {
      cssValue = `linear-gradient(${direction}, ${stopListStr})`;
    } else {
      cssValue = `linear-gradient(${angle}deg, ${stopListStr})`;
    }
  } else if (type === 'radial') {
    const posStr = radialPosition.trim() ? ` at ${radialPosition.trim()}` : '';
    cssValue = `radial-gradient(${shape}${posStr}, ${stopListStr})`;
  } else if (type === 'conic') {
    const posStr = conicPosition.trim() ? ` at ${conicPosition.trim()}` : '';
    cssValue = `conic-gradient(from ${conicAngle}deg${posStr}, ${stopListStr})`;
  }

  const declaration = `background: ${cssValue};`;

  return {
    css: cssValue,
    declaration,
    valid: true,
    error: null,
  };
}

/**
 * Adds a new stop to the stops array at an appropriate default position.
 *
 * @param {Array<Object>} stops - Current stops array.
 * @param {Object} [newStopProps] - Optional properties for the new stop.
 * @returns {Array<Object>} Updated stops array.
 */
export function addStop(stops, newStopProps = {}) {
  const currentStops = stops || [];
  const nextId = 'stop-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

  let defaultPosition = 50;
  if (currentStops.length >= 2) {
    const lastPos = Number(currentStops[currentStops.length - 1].position);
    const secondLastPos = Number(currentStops[currentStops.length - 2].position);
    if (!Number.isNaN(lastPos) && !Number.isNaN(secondLastPos)) {
      defaultPosition = Math.min(100, Math.round(lastPos + (100 - lastPos) / 2));
      if (defaultPosition <= lastPos && lastPos < 100) {
        defaultPosition = Math.min(100, lastPos + 10);
      }
    }
  }

  const newStop = {
    id: nextId,
    color: '#818cf8',
    position: defaultPosition,
    ...newStopProps,
  };

  return [...currentStops, newStop];
}

/**
 * Removes a stop by id or index.
 *
 * @param {Array<Object>} stops - Current stops array.
 * @param {string|number} idOrIndex - Stop ID or index to remove.
 * @returns {Array<Object>} Updated stops array.
 */
export function removeStop(stops, idOrIndex) {
  if (!Array.isArray(stops)) return [];
  if (typeof idOrIndex === 'number') {
    return stops.filter((_, idx) => idx !== idOrIndex);
  }
  return stops.filter((stop) => stop.id !== idOrIndex);
}

/**
 * Reorders stops by moving a stop from fromIndex to toIndex.
 *
 * @param {Array<Object>} stops - Current stops array.
 * @param {number} fromIndex - Index to move from.
 * @param {number} toIndex - Index to move to.
 * @returns {Array<Object>} Updated stops array.
 */
export function reorderStops(stops, fromIndex, toIndex) {
  if (!Array.isArray(stops)) return [];
  if (fromIndex < 0 || fromIndex >= stops.length) return stops;
  if (toIndex < 0 || toIndex >= stops.length) return stops;
  if (fromIndex === toIndex) return stops;

  const result = [...stops];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Sorts stops by position in ascending order.
 *
 * @param {Array<Object>} stops - Current stops array.
 * @returns {Array<Object>} Sorted stops array.
 */
export function sortStopsByPosition(stops) {
  if (!Array.isArray(stops)) return [];
  return [...stops].sort((a, b) => Number(a.position) - Number(b.position));
}

/**
 * Converts a valid hex color string to a standard 6-digit hex string (#rrggbb)
 * for HTML5 color input picker. Returns #000000 fallback if non-hex or invalid.
 *
 * @param {string} color - Input color string.
 * @returns {string} 6-digit hex string starting with #.
 */
export function normalizeHexForPicker(color) {
  if (typeof color !== 'string') return '#000000';
  const trimmed = color.trim();
  if (!trimmed.startsWith('#')) return '#000000';

  const hexContent = trimmed.slice(1);
  if (hexContent.length === 3) {
    return '#' + hexContent.split('').map((c) => c + c).join('');
  }
  if (hexContent.length === 4) {
    return '#' + hexContent.slice(0, 3).split('').map((c) => c + c).join('');
  }
  if (hexContent.length === 6) {
    return '#' + hexContent.toLowerCase();
  }
  if (hexContent.length === 8) {
    return '#' + hexContent.slice(0, 6).toLowerCase();
  }
  return '#000000';
}
