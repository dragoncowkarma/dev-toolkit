const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]*={0,2}$/;

/**
 * Decodes a Base64URL-encoded JWT segment into a JSON object.
 *
 * @param {string} segment JWT header or payload segment.
 * @param {string} segmentName Human-readable segment name for errors.
 * @returns {Record<string, unknown>} The decoded JSON object.
 * @throws {Error} When the segment is not valid Base64URL JSON.
 */
export function decodeBase64UrlJson(segment, segmentName = 'JWT segment') {
  if (typeof segment !== 'string' || segment.length === 0) {
    throw new Error(`${segmentName} is missing.`);
  }

  if (!BASE64_URL_PATTERN.test(segment)) {
    throw new Error(`${segmentName} is not valid Base64URL data.`);
  }

  const unpadded = segment.replace(/=/g, '');
  if (unpadded.length % 4 === 1) {
    throw new Error(`${segmentName} is not valid Base64URL data.`);
  }

  try {
    const base64 = unpadded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(decoded);

    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      throw new Error('JSON is not an object.');
    }
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.includes('JSON is not an object')) {
      throw new Error(`${segmentName} must contain a JSON object.`);
    }
    throw new Error(`${segmentName} does not contain valid UTF-8 JSON.`);
  }
}

/**
 * Splits and decodes an unsigned JWT representation. Signature verification is
 * intentionally not performed because this browser-only tool has no key input.
 *
 * @param {string} token Compact JWT string.
 * @returns {{header: Record<string, unknown>, payload: Record<string, unknown>, signature: string}}
 * @throws {Error} When the token format or encoded JSON is invalid.
 */
export function parseJwt(token) {
  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error('Paste a JWT token to decode it.');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error('Invalid JWT format. A JWT must contain header, payload, and signature.');
  }
  if (!BASE64_URL_PATTERN.test(parts[2])) {
    throw new Error('Invalid JWT format. The signature must use Base64URL characters.');
  }

  return {
    header: decodeBase64UrlJson(parts[0], 'JWT header'),
    payload: decodeBase64UrlJson(parts[1], 'JWT payload'),
    signature: parts[2],
  };
}

/**
 * Converts a numeric JWT timestamp in seconds to timestamp metadata.
 *
 * @param {unknown} timestamp JWT timestamp in Unix seconds.
 * @param {number} [now] Current time in Unix milliseconds.
 * @returns {{date: Date, milliseconds: number}|null} Parsed metadata, or null when absent/invalid.
 */
export function getJwtTimestamp(timestamp, now = Date.now()) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return null;
  }

  const milliseconds = timestamp * 1000;
  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  return { date: new Date(milliseconds), milliseconds: milliseconds - now };
}

/**
 * Reads JWT time claims relative to a supplied current time.
 *
 * @param {Record<string, unknown>} payload Decoded JWT payload.
 * @param {number} [now] Current time in Unix milliseconds.
 * @returns {object} Time claim metadata and relative token status.
 */
export function getJwtTimeDetails(payload, now = Date.now()) {
  const expiration = getJwtTimestamp(payload.exp, now);
  const issuedAt = getJwtTimestamp(payload.iat, now);
  const notBefore = getJwtTimestamp(payload.nbf, now);

  return {
    expiration,
    issuedAt,
    notBefore,
    isExpired: expiration !== null && expiration.milliseconds <= 0,
    isNotActive: notBefore !== null && notBefore.milliseconds > 0,
  };
}

/**
 * Formats a signed duration into a concise human-readable value.
 *
 * @param {number} milliseconds Duration in milliseconds.
 * @returns {string} Human-readable duration.
 */
export function formatDuration(milliseconds) {
  const absoluteSeconds = Math.floor(Math.abs(milliseconds) / 1000);
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  const parts = [];
  let remaining = absoluteSeconds;

  for (const [name, size] of units) {
    const amount = Math.floor(remaining / size);
    if (amount > 0 || (name === 'second' && parts.length === 0)) {
      parts.push(`${amount} ${name}${amount === 1 ? '' : 's'}`);
      remaining %= size;
    }
    if (parts.length === 2) break;
  }

  return parts.join(' ');
}
