const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]*$/;

export const HEADER_FIELD_NAMES = [
  'alg',
  'typ',
  'cty',
  'kid',
  'jwk',
  'jku',
  'x5c',
  'x5t',
  'x5t#S256',
  'crit',
  'b64',
];

/**
 * Checks whether a value is an unpadded Base64URL string.
 * @param {string} value
 * @returns {boolean} Whether the value has valid Base64URL characters and length.
 */
export function isValidBase64Url(value) {
  return typeof value === 'string' && BASE64_URL_PATTERN.test(value) && value.length % 4 !== 1;
}

/**
 * Decodes a Base64URL segment to bytes.
 * @param {string} segment
 * @param {string} name
 * @returns {Uint8Array} The decoded bytes.
 * @throws {Error} When the segment is not valid Base64URL.
 */
export function decodeBase64UrlSegment(segment, name) {
  if (!isValidBase64Url(segment)) {
    throw new Error(`The ${name} segment is not valid Base64URL.`);
  }

  const padded = `${segment}${'='.repeat((4 - (segment.length % 4)) % 4)}`;
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new Error(`The ${name} segment is not valid Base64URL.`);
  }
}

/**
 * Decodes bytes as UTF-8 text, rejecting malformed UTF-8 when required.
 * @param {Uint8Array} bytes
 * @param {boolean} fatal
 * @returns {string} Decoded UTF-8 text.
 */
function decodeUtf8(bytes, fatal) {
  return new TextDecoder('utf-8', { fatal }).decode(bytes);
}

/**
 * Collects standard and commonly used protected-header fields when present.
 * @param {Record<string, unknown>} header
 * @returns {Record<string, unknown>} The header fields relevant to inspection.
 */
export function getHeaderFields(header) {
  return Object.fromEntries(
    HEADER_FIELD_NAMES.filter((fieldName) => Object.hasOwn(header, fieldName)).map((fieldName) => [
      fieldName,
      header[fieldName],
    ])
  );
}

/**
 * Parses a compact JWS without attempting signature verification.
 * @param {string} compactJws
 * @returns {{
 *   segments: { protectedHeader: string, payload: string, signature: string },
 *   header: Record<string, unknown>,
 *   headerFields: Record<string, unknown>,
 *   payload: { raw: string, json: unknown | null, isJson: boolean }
 * }} Parsed JWS data suitable for client-side inspection.
 * @throws {Error} When compact serialization, Base64URL, or header JSON is invalid.
 */
export function parseJwsCompact(compactJws) {
  if (typeof compactJws !== 'string') {
    throw new TypeError('A compact JWS must be provided as text.');
  }

  const compact = compactJws.trim();
  const [protectedHeader, payload, signature, ...extraSegments] = compact.split('.');
  if (extraSegments.length > 0 || signature === undefined) {
    throw new Error('A compact JWS must contain exactly 3 Base64URL segments.');
  }

  if (protectedHeader.length === 0) {
    throw new Error('The protected header segment cannot be empty.');
  }

  let headerText;
  try {
    headerText = decodeUtf8(decodeBase64UrlSegment(protectedHeader, 'protected header'), true);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('The protected header must be valid UTF-8 JSON.');
    }
    throw error;
  }

  let header;
  try {
    header = JSON.parse(headerText);
  } catch {
    throw new Error('The protected header must contain valid JSON.');
  }
  if (header === null || Array.isArray(header) || typeof header !== 'object') {
    throw new Error('The protected header JSON must be an object.');
  }

  const payloadBytes = decodeBase64UrlSegment(payload, 'payload');
  const rawPayload = decodeUtf8(payloadBytes, false);
  let payloadJson = null;
  let isJson = false;
  try {
    payloadJson = JSON.parse(rawPayload);
    isJson = true;
  } catch {
    // RFC 7515 allows arbitrary payload octets, so retain text for inspection.
  }

  decodeBase64UrlSegment(signature, 'signature');

  return {
    segments: { protectedHeader, payload, signature },
    header,
    headerFields: getHeaderFields(header),
    payload: { raw: rawPayload, json: payloadJson, isJson },
  };
}
