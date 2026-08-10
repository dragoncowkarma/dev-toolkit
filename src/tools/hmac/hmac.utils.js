/** Supported Web Crypto HMAC algorithms. */
export const HMAC_ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

/** Supported byte input encodings. */
export const INPUT_ENCODINGS = ['UTF-8', 'Hex', 'Base64'];

/** Supported HMAC output encodings. */
export const OUTPUT_ENCODINGS = ['Hex', 'Base64', 'Base64URL'];

function removeWhitespace(value) {
  return value.replace(/\s/g, '');
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Parses a user-supplied value into bytes using the selected encoding.
 * @param {string} value - Input to parse.
 * @param {string} encoding - One of `INPUT_ENCODINGS`.
 * @returns {Uint8Array} Parsed bytes.
 * @throws {Error} When the encoding or input is invalid.
 */
export function parseInput(value, encoding) {
  if (typeof value !== 'string') throw new TypeError('Input must be a string.');
  if (!INPUT_ENCODINGS.includes(encoding)) throw new Error(`Unsupported encoding: ${encoding}`);
  if (encoding === 'UTF-8') return new TextEncoder().encode(value);

  const cleaned = removeWhitespace(value);
  if (encoding === 'Hex') {
    if (!/^[0-9a-f]*$/i.test(cleaned) || cleaned.length % 2 !== 0) {
      throw new Error('Hex input must contain an even number of hexadecimal characters.');
    }
    return Uint8Array.from(cleaned.match(/.{1,2}/g) ?? [], (pair) => parseInt(pair, 16));
  }

  if (cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error('Base64 input is malformed.');
  }
  try {
    return Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Base64 input is malformed.');
  }
}

/**
 * Formats signature bytes in a selected output encoding.
 * @param {Uint8Array} bytes - Signature bytes.
 * @param {string} encoding - One of `OUTPUT_ENCODINGS`.
 * @returns {string} Formatted signature.
 */
export function formatSignature(bytes, encoding) {
  if (!OUTPUT_ENCODINGS.includes(encoding)) throw new Error(`Unsupported encoding: ${encoding}`);
  if (encoding === 'Hex') {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  const base64 = bytesToBase64(bytes);
  return encoding === 'Base64URL'
    ? base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : base64;
}

function parseSignature(value, encoding) {
  if (encoding === 'Base64URL') {
    const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return parseInput(padded, 'Base64');
  }
  return parseInput(value, encoding);
}

/**
 * Computes a Web Crypto HMAC signature.
 * @param {string} algorithm - One of `HMAC_ALGORITHMS`.
 * @param {string} key - Secret key value.
 * @param {string} keyEncoding - Encoding of the secret key.
 * @param {string} message - Message value.
 * @param {string} messageEncoding - Encoding of the message.
 * @param {string} outputEncoding - Encoding for the resulting signature.
 * @returns {Promise<string>} HMAC signature in the requested encoding.
 */
export async function computeHmac(
  algorithm,
  key,
  keyEncoding,
  message,
  messageEncoding,
  outputEncoding
) {
  if (!HMAC_ALGORITHMS.includes(algorithm)) throw new Error(`Unsupported algorithm: ${algorithm}`);
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API is unavailable in this browser.');
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    parseInput(key, keyEncoding),
    { name: 'HMAC', hash: { name: algorithm } },
    false,
    ['sign']
  );
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    parseInput(message, messageEncoding)
  );
  return formatSignature(new Uint8Array(signature), outputEncoding);
}

/**
 * Verifies a target HMAC signature against the supplied key and message.
 * @param {string} algorithm - One of `HMAC_ALGORITHMS`.
 * @param {string} key - Secret key value.
 * @param {string} keyEncoding - Encoding of the secret key.
 * @param {string} message - Message value.
 * @param {string} messageEncoding - Encoding of the message.
 * @param {string} signature - Signature to compare.
 * @param {string} signatureEncoding - Encoding of the target signature.
 * @returns {Promise<boolean>} Whether the target signature matches.
 */
export async function verifyHmac(
  algorithm,
  key,
  keyEncoding,
  message,
  messageEncoding,
  signature,
  signatureEncoding
) {
  if (!HMAC_ALGORITHMS.includes(algorithm)) throw new Error(`Unsupported algorithm: ${algorithm}`);
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API is unavailable in this browser.');
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    parseInput(key, keyEncoding),
    { name: 'HMAC', hash: { name: algorithm } },
    false,
    ['verify']
  );
  return globalThis.crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    parseSignature(signature, signatureEncoding),
    parseInput(message, messageEncoding)
  );
}
