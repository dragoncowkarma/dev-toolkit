/**
 * Utility functions for validating colors, positions, and stops, and generating
 * CSS gradient declarations (linear, radial, conic).
 */

/**
 * Complete, dependency-free W3C CSS named color keyword set including transparent and currentcolor.
 */
const CSS_NAMED_COLORS = new Set([
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'currentcolor',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'transparent',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
]);

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
 * Accepts HEX (#rgb, #rgba, #rrggbb, #rrggbbaa), RGB/RGBA, HSL/HSLA, and CSS named colors.
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

  // 4. Complete CSS named colors, currentcolor, and transparent
  return CSS_NAMED_COLORS.has(trimmed.toLowerCase());
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
      return {
        valid: false,
        error: 'Conic gradient starting angle must be between 0° and 360°.',
      };
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
 * Adds a new stop to the stops array at a collision-free default position.
 *
 * Position selection algorithm:
 * 1. Collect all valid numeric positions in range [0, 100] from current stops.
 * 2. Sort unique valid positions in ascending order.
 * 3. Find all adjacent positive intervals (end - start > 0).
 * 4. Select the largest interval by width (end - start).
 * 5. Tie-break rule: If multiple intervals share the maximum width, pick the first interval
 *    (the one starting at the lowest position).
 * 6. Calculate position strictly inside the selected interval:
 *    midpoint = Math.round((start + end) / 2). If midpoint equals start or end,
 *    use Number(((start + end) / 2).toFixed(2)).
 * 7. Fallback strategy (when no positive interval exists or all valid positions are equal):
 *    If all valid positions equal X, choose 100 if X < 100 else 50.
 *    If no valid positions exist, choose 50.
 *
 * @param {Array<Object>} stops - Current stops array.
 * @param {Object} [newStopProps] - Optional properties for the new stop.
 * @returns {Array<Object>} Updated stops array preserving existing stops and order.
 */
export function addStop(stops, newStopProps = {}) {
  const currentStops = Array.isArray(stops) ? stops : [];
  const nextId = 'stop-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

  const validPositions = [];
  for (const stop of currentStops) {
    if (stop && validatePosition(stop.position)) {
      validPositions.push(Number(stop.position));
    }
  }

  let defaultPosition = 50;

  if (validPositions.length > 0) {
    const uniqueSorted = Array.from(new Set(validPositions)).sort((a, b) => a - b);

    let maxInterval = null;
    for (let i = 0; i < uniqueSorted.length - 1; i += 1) {
      const start = uniqueSorted[i];
      const end = uniqueSorted[i + 1];
      const width = end - start;
      if (width > 0) {
        if (!maxInterval || width > maxInterval.width) {
          maxInterval = { start, end, width };
        }
      }
    }

    if (maxInterval) {
      const mid = Math.round((maxInterval.start + maxInterval.end) / 2);
      if (mid > maxInterval.start && mid < maxInterval.end) {
        defaultPosition = mid;
      } else {
        defaultPosition = Number(((maxInterval.start + maxInterval.end) / 2).toFixed(2));
      }
    } else {
      const x = uniqueSorted[0];
      defaultPosition = x < 100 ? 100 : 50;
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
