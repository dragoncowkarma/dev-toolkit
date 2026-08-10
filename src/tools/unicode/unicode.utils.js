const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;
const NORMALIZATION_FORMS = new Set(['NFC', 'NFD', 'NFKC', 'NFKD']);

const INVISIBLE_CHARACTERS = new Map([
  [0x0009, { label: 'Tab', risk: 'low' }],
  [0x000a, { label: 'Line feed', risk: 'low' }],
  [0x000d, { label: 'Carriage return', risk: 'low' }],
  [0x00a0, { label: 'No-break space', risk: 'medium' }],
  [0x00ad, { label: 'Soft hyphen', risk: 'medium' }],
  [0x200b, { label: 'Zero-width space', risk: 'medium' }],
  [0x200c, { label: 'Zero-width non-joiner', risk: 'medium' }],
  [0x200d, { label: 'Zero-width joiner', risk: 'medium' }],
  [0x2060, { label: 'Word joiner', risk: 'medium' }],
  [0xfeff, { label: 'Byte order mark / zero-width no-break space', risk: 'medium' }],
]);

const BIDI_LABELS = new Map([
  [0x202a, 'Left-to-right embedding'],
  [0x202b, 'Right-to-left embedding'],
  [0x202c, 'Pop directional formatting'],
  [0x202d, 'Left-to-right override'],
  [0x202e, 'Right-to-left override'],
  [0x2066, 'Left-to-right isolate'],
  [0x2067, 'Right-to-left isolate'],
  [0x2068, 'First strong isolate'],
  [0x2069, 'Pop directional isolate'],
]);

function isScalarValue(codePoint) {
  return Number.isInteger(codePoint)
    && codePoint >= 0
    && codePoint <= MAX_CODE_POINT
    && (codePoint < SURROGATE_START || codePoint > SURROGATE_END);
}

function formatHex(codePoint) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

function getInvisibleInfo(codePoint) {
  if (BIDI_LABELS.has(codePoint)) {
    return { label: BIDI_LABELS.get(codePoint), risk: 'high' };
  }
  return INVISIBLE_CHARACTERS.get(codePoint) ?? null;
}

function getLabel(codePoint) {
  const invisibleInfo = getInvisibleInfo(codePoint);
  if (invisibleInfo) return invisibleInfo.label;
  if (codePoint === 0x20) return 'Space';
  if (codePoint === 0x7f) return 'Delete';
  if (codePoint < 0x20) return 'Control character';
  if (codePoint >= SURROGATE_START && codePoint <= SURROGATE_END) return 'Lone surrogate';
  return `Character ${formatHex(codePoint)}`;
}

/**
 * Encodes a Unicode scalar value as UTF-8 bytes.
 *
 * @param {number} codePoint Unicode scalar value from 0 through 0x10FFFF.
 * @returns {number[] | null} UTF-8 bytes, or null for invalid values and lone surrogates.
 */
export function encodeUtf8(codePoint) {
  if (!isScalarValue(codePoint)) return null;
  if (codePoint <= 0x7f) return [codePoint];
  if (codePoint <= 0x7ff) return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
  if (codePoint <= 0xffff) {
    return [0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f)];
  }
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
}

/**
 * Encodes a Unicode scalar value as UTF-16 code units.
 *
 * @param {number} codePoint Unicode scalar value from 0 through 0x10FFFF.
 * @returns {number[] | null} UTF-16 units, or null for invalid values and lone surrogates.
 */
export function encodeUtf16(codePoint) {
  if (!isScalarValue(codePoint)) return null;
  if (codePoint <= 0xffff) return [codePoint];
  const offset = codePoint - 0x10000;
  return [0xd800 | (offset >> 10), 0xdc00 | (offset & 0x3ff)];
}

/**
 * Produces common language and transport escape forms for one Unicode scalar value.
 *
 * @param {number} codePoint Unicode scalar value from 0 through 0x10FFFF.
 * @returns {{js: string, css: string, html: string, htmlHex: string, url: string,
 *   python: string} | null}
 *   Escape forms, or null for invalid values and lone surrogates.
 */
export function toEscapes(codePoint) {
  const utf8Bytes = encodeUtf8(codePoint);
  if (!utf8Bytes) return null;
  const hex = codePoint.toString(16).toUpperCase();
  const paddedHex = hex.padStart(4, '0');
  return {
    js: codePoint > 0xffff ? `\\u{${hex}}` : `\\u${paddedHex}`,
    css: `\\${hex} `,
    html: `&#${codePoint};`,
    htmlHex: `&#x${hex};`,
    url: utf8Bytes.map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join(''),
    python: codePoint > 0xffff ? `\\U${hex.padStart(8, '0')}` : `\\u${paddedHex}`,
  };
}

/**
 * Inspects each code point in text without splitting astral characters into surrogate records.
 *
 * @param {string} text Text to inspect; lone surrogate code units are retained as records.
 * @returns {Array<{char: string, codePoint: number, hex: string, utf8Bytes: number[] | null,
 *   utf16Units: number[] | null, isAstral: boolean, isInvisible: boolean, label: string}>}
 *   One record per code point, or an empty array for an empty string.
 */
export function inspectText(text) {
  return Array.from(text).map((char) => {
    const codePoint = char.codePointAt(0);
    const invisibleInfo = getInvisibleInfo(codePoint);
    return {
      char,
      codePoint,
      hex: formatHex(codePoint),
      utf8Bytes: encodeUtf8(codePoint),
      utf16Units: encodeUtf16(codePoint),
      isAstral: codePoint > 0xffff,
      isInvisible: Boolean(invisibleInfo),
      label: getLabel(codePoint),
    };
  });
}

/**
 * Finds invisible or direction-altering characters using code-point indexes.
 *
 * @param {string} text Text to scan.
 * @returns {Array<{index: number, codePoint: number, hex: string, label: string, risk: string}>}
 *   Matching characters in code-point index order; returns an empty array when none are found.
 */
export function detectInvisibles(text) {
  return Array.from(text).flatMap((char, index) => {
    const codePoint = char.codePointAt(0);
    const info = getInvisibleInfo(codePoint);
    return info ? [{ index, codePoint, hex: formatHex(codePoint), ...info }] : [];
  });
}

/**
 * Normalizes text with a supported Unicode normalization form.
 *
 * @param {string} text Text to normalize.
 * @param {'NFC' | 'NFD' | 'NFKC' | 'NFKD'} form Requested normalization form.
 * @returns {{text: string, changed: boolean, lengthBefore: number, lengthAfter: number} | null}
 *   Normalization details, or null for an unknown form.
 */
export function normalizeText(text, form) {
  if (!NORMALIZATION_FORMS.has(form)) return null;
  const normalizedText = text.normalize(form);
  return {
    text: normalizedText,
    changed: normalizedText !== text,
    lengthBefore: text.length,
    lengthAfter: normalizedText.length,
  };
}

/**
 * Compares all standard Unicode normalization forms against the original text.
 *
 * @param {string} text Text to normalize.
 * @returns {{NFC: {text: string, changed: boolean}, NFD: {text: string, changed: boolean},
 *   NFKC: {text: string, changed: boolean}, NFKD: {text: string, changed: boolean}}}
 *   Each form and whether it differs from the input.
 */
export function compareNormalizations(text) {
  return Object.fromEntries(
    [...NORMALIZATION_FORMS].map((form) => {
      const result = normalizeText(text, form);
      return [form, { text: result.text, changed: result.changed }];
    })
  );
}

/**
 * Parses decimal, hexadecimal, and HTML numeric code-point notation.
 *
 * @param {string} input A code-point value such as U+1F600, 0x1F600, 128512, or &#x1F600;.
 * @returns {number | null} A scalar value, or null for empty, invalid, out-of-range, and
 *   surrogate input.
 */
export function parseCodePointInput(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return null;
  let match = value.match(/^&#x([0-9a-f]+);$/i);
  let radix = 16;
  if (!match) {
    match = value.match(/^&#([0-9]+);$/);
    radix = 10;
  }
  if (!match) {
    match = value.match(/^u\+([0-9a-f]+)$/i) || value.match(/^0x([0-9a-f]+)$/i);
    radix = 16;
  }
  if (!match) {
    match = value.match(/^([0-9]+)$/);
    radix = 10;
  }
  if (!match) {
    match = value.match(/^([0-9a-f]+)$/i);
    radix = 16;
  }
  if (!match) return null;
  const codePoint = Number.parseInt(match[1], radix);
  return isScalarValue(codePoint) ? codePoint : null;
}
