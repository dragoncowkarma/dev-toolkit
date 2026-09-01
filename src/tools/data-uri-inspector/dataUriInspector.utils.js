/**
 * Data URI Inspector utility module.
 * Parses, decodes, validates, and canonicalizes `data:` URLs entirely client-side,
 * following the data-URL grammar from RFC 2397:
 *   dataurl := "data:" [ mediatype ] [ ";base64" ] "," data
 *   mediatype := [ type "/" subtype ] *( ";" parameter )
 *   parameter := attribute "=" value
 * When the media type is omitted entirely, it defaults to "text/plain;charset=US-ASCII".
 */

// RFC 2045 token characters, used for type/subtype and parameter attribute/value.
const TOKEN_REGEX = /^[a-zA-Z0-9!#$%&'*+._`|~-]+$/;
const TYPE_SUBTYPE_REGEX =
  /^[a-zA-Z0-9!#$%&'*+._`|~-]+\/[a-zA-Z0-9!#$%&'*+._`|~-]+$/;
const HEX_PAIR_REGEX = /^[0-9a-fA-F]{2}$/;
const BASE64_STRICT_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

const TEXT_PREVIEW_CHAR_LIMIT = 2000;
const HEX_PREVIEW_BYTE_LIMIT = 512;

/**
 * Parses a single `attribute=value` header segment into a parameter entry.
 * @param {string} segment - The raw segment between semicolons.
 * @returns {{name: string, value: string}} The parsed parameter.
 * @throws {Error} When the segment is not a well-formed token=token pair.
 */
function parseParameterSegment(segment) {
  const eqIndex = segment.indexOf('=');
  const name = eqIndex === -1 ? segment : segment.slice(0, eqIndex);
  const value = eqIndex === -1 ? '' : segment.slice(eqIndex + 1);
  if (eqIndex === -1 || !TOKEN_REGEX.test(name) || !TOKEN_REGEX.test(value)) {
    throw new Error(`Malformed media type or parameter "${segment}" in the data URL header.`);
  }
  return { name, value };
}

/**
 * Parses the raw header text (everything between "data:" and the comma).
 * @param {string} header - The raw header text, excluding the trailing comma.
 * @returns {{
 *   explicitType: boolean,
 *   type: string|null,
 *   params: Array<{name: string, value: string}>,
 *   isBase64: boolean,
 * }}
 * @throws {Error} When the header contains a malformed token or a misplaced/duplicate
 *   ";base64" marker.
 */
function parseHeader(header) {
  if (header === '') {
    return { explicitType: false, type: null, params: [], isBase64: false };
  }

  const segments = header.split(';');
  let explicitType = false;
  let type = null;
  let remaining;

  if (segments[0] !== '' && TYPE_SUBTYPE_REGEX.test(segments[0])) {
    explicitType = true;
    type = segments[0].toLowerCase();
    remaining = segments.slice(1);
  } else if (segments[0] === '') {
    remaining = segments.slice(1);
  } else {
    remaining = segments;
  }

  const params = [];
  let isBase64 = false;
  for (const segment of remaining) {
    if (segment === 'base64') {
      if (isBase64) {
        throw new Error('Duplicate ";base64" marker in the data URL header.');
      }
      isBase64 = true;
      continue;
    }
    if (isBase64) {
      throw new Error('The ";base64" marker must be the last segment before the comma.');
    }
    params.push(parseParameterSegment(segment));
  }

  return { explicitType, type, params, isBase64 };
}

/**
 * Applies the RFC 2397 default of "text/plain;charset=US-ASCII" when the media type
 * was entirely omitted from the header.
 * @param {{
 *   explicitType: boolean,
 *   type: string|null,
 *   params: Array<{name: string, value: string}>,
 * }} parsed - The header parsed by `parseHeader`.
 * @returns {{mediaType: string, params: Array<{name: string, value: string}>}}
 */
function applyDefaults({ explicitType, type, params }) {
  const mediaType = explicitType ? type : 'text/plain';
  const finalParams =
    !explicitType && params.length === 0 ? [{ name: 'charset', value: 'US-ASCII' }] : params;
  return { mediaType, params: finalParams };
}

/**
 * Decodes percent-escaped and literal characters in a data URL payload into raw bytes.
 * Percent escapes decode to a single raw byte each; literal characters are encoded as UTF-8.
 * @param {string} text - The raw payload text.
 * @returns {Uint8Array} The decoded bytes.
 * @throws {Error} When a "%" is not followed by two valid hexadecimal digits.
 */
function percentDecodeToBytes(text) {
  const bytes = [];
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch === '%') {
      const hex = (chars[i + 1] ?? '') + (chars[i + 2] ?? '');
      if (!HEX_PAIR_REGEX.test(hex)) {
        throw new Error(`Invalid percent-encoding near "%${hex}" in the data URL payload.`);
      }
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      const codePoint = ch.codePointAt(0);
      if (codePoint <= 0x7f) {
        bytes.push(codePoint);
      } else {
        bytes.push(...new TextEncoder().encode(ch));
      }
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * Converts raw bytes into a binary string, chunked to avoid call-stack limits.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToAsciiString(bytes) {
  const CHUNK_SIZE = 0x8000;
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    result += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE));
  }
  return result;
}

/**
 * Decodes a base64 payload (after resolving any percent-escaped alphabet characters)
 * into raw bytes.
 * @param {string} payloadText - The raw payload text following the comma.
 * @returns {Uint8Array} The decoded bytes.
 * @throws {Error} When the payload is not valid base64.
 */
function decodeBase64Payload(payloadText) {
  const base64Text = bytesToAsciiString(percentDecodeToBytes(payloadText));
  if (!BASE64_STRICT_PATTERN.test(base64Text) || base64Text.length % 4 !== 0) {
    throw new Error('Invalid base64 payload. Please check for typos or missing characters.');
  }
  try {
    const binary = atob(base64Text);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new Error('Invalid base64 payload. Please check for typos or missing characters.');
  }
}

/**
 * Encodes raw bytes as a base64 string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64(bytes) {
  return btoa(bytesToAsciiString(bytes));
}

/**
 * Percent-encodes raw bytes deterministically: unreserved ASCII characters
 * (letters, digits, "-", "_", ".", "~") are kept literal, every other byte is
 * emitted as an uppercase "%XX" escape.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToPercent(bytes) {
  let result = '';
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    if (/^[A-Za-z0-9\-_.~]$/.test(char)) {
      result += char;
    } else {
      result += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return result;
}

/**
 * Parses and decodes a complete `data:` URL.
 * @param {string} url - The full data URL to parse.
 * @returns {{
 *   mediaType: string,
 *   params: Array<{name: string, value: string}>,
 *   isBase64: boolean,
 *   payloadText: string,
 *   encodedLength: number,
 *   decodedByteLength: number,
 *   bytes: Uint8Array,
 * }} The parsed and decoded data URL.
 * @throws {Error} When the URL is malformed or the payload cannot be decoded.
 */
export function parseDataUri(url) {
  if (typeof url !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  const trimmed = url.trim();
  if (trimmed === '') {
    throw new Error('Enter a data URL to inspect.');
  }
  if (!/^data:/i.test(trimmed)) {
    throw new Error('A data URL must start with "data:".');
  }

  const rest = trimmed.slice(5);
  const commaIndex = rest.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('Missing "," delimiter between the header and the payload.');
  }

  const headerText = rest.slice(0, commaIndex);
  const payloadText = rest.slice(commaIndex + 1);

  const { explicitType, type, params, isBase64 } = parseHeader(headerText);
  const { mediaType, params: finalParams } = applyDefaults({ explicitType, type, params });

  const bytes = isBase64 ? decodeBase64Payload(payloadText) : percentDecodeToBytes(payloadText);

  return {
    mediaType,
    params: finalParams,
    isBase64,
    payloadText,
    encodedLength: payloadText.length,
    decodedByteLength: bytes.length,
    bytes,
  };
}

/**
 * Builds a deterministic canonical `data:` URL from a parsed representation, preserving
 * declared parameter order and encoding mode without changing the decoded bytes.
 * @param {{
 *   mediaType: string,
 *   params: Array<{name: string, value: string}>,
 *   isBase64: boolean,
 *   bytes: Uint8Array,
 * }} parsed - The parsed data URL, as returned by `parseDataUri`.
 * @returns {string} The canonical data URL.
 */
export function buildCanonicalDataUri({ mediaType, params, isBase64, bytes }) {
  const paramsText = params.map((param) => `;${param.name}=${param.value}`).join('');
  const payload = isBase64 ? bytesToBase64(bytes) : bytesToPercent(bytes);
  return `data:${mediaType}${paramsText}${isBase64 ? ';base64' : ''},${payload}`;
}

/**
 * Determines whether decoded bytes look like textual content: they must decode as valid
 * UTF-8, contain no NUL bytes, and have a low ratio of non-printable control characters.
 * @param {Uint8Array} bytes
 * @param {string} text - The bytes already decoded as UTF-8 text.
 * @returns {boolean}
 */
function looksLikeText(bytes, text) {
  if (bytes.includes(0)) {
    return false;
  }
  if (text.length === 0) {
    return true;
  }
  let controlCount = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) {
      controlCount += 1;
    }
  }
  return controlCount / text.length < 0.1;
}

/**
 * Escapes control and non-printable characters in a bounded text preview.
 * @param {string} text
 * @returns {string}
 */
function escapeForPreview(text) {
  return JSON.stringify(text).slice(1, -1);
}

/**
 * Builds a bounded, safe-to-render preview of decoded bytes: an escaped text preview for
 * valid UTF-8 textual data, or a hexadecimal preview otherwise. Never returns markup that
 * could be interpreted as active HTML/SVG.
 * @param {Uint8Array} bytes - The decoded payload bytes.
 * @returns {{kind: 'text'|'hex', value: string, truncated: boolean}}
 */
export function buildPreview(bytes) {
  let text = null;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = null;
  }

  if (text !== null && looksLikeText(bytes, text)) {
    const truncated = text.length > TEXT_PREVIEW_CHAR_LIMIT;
    const slice = truncated ? text.slice(0, TEXT_PREVIEW_CHAR_LIMIT) : text;
    return { kind: 'text', value: escapeForPreview(slice) + (truncated ? '…' : ''), truncated };
  }

  const truncated = bytes.length > HEX_PREVIEW_BYTE_LIMIT;
  const slice = bytes.subarray(0, HEX_PREVIEW_BYTE_LIMIT);
  const hex = Array.from(slice, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
  return { kind: 'hex', value: hex + (truncated ? ' …' : ''), truncated };
}

/**
 * Parses, decodes, canonicalizes, and previews a complete `data:` URL in one call.
 * @param {string} url - The full data URL to inspect.
 * @returns {{
 *   mediaType: string,
 *   params: Array<{name: string, value: string}>,
 *   isBase64: boolean,
 *   payloadText: string,
 *   encodedLength: number,
 *   decodedByteLength: number,
 *   bytes: Uint8Array,
 *   canonicalUri: string,
 *   preview: {kind: 'text'|'hex', value: string, truncated: boolean},
 * }} The full inspection result.
 * @throws {Error} When the URL is malformed or the payload cannot be decoded.
 */
export function inspectDataUri(url) {
  const parsed = parseDataUri(url);
  const canonicalUri = buildCanonicalDataUri(parsed);
  const preview = buildPreview(parsed.bytes);
  return { ...parsed, canonicalUri, preview };
}
