export const HASH_ALGORITHMS = Object.freeze([
  'SHA-1',
  'SHA-256',
  'SHA-384',
  'SHA-512',
]);

export const HASH_FORMATS = Object.freeze({
  HEX: 'hex',
  BASE64: 'base64',
});

function getSubtleCrypto() {
  const subtleCrypto = globalThis.crypto?.subtle;
  if (!subtleCrypto) {
    throw new Error('Web Crypto API is not available in this browser.');
  }
  return subtleCrypto;
}

function validateAlgorithm(algorithm) {
  if (!HASH_ALGORITHMS.includes(algorithm)) {
    throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }
}

function validateFormat(format) {
  if (!Object.values(HASH_FORMATS).includes(format)) {
    throw new Error(`Unsupported hash format: ${format}`);
  }
}

function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function isArrayBuffer(value) {
  return (
    value instanceof ArrayBuffer ||
    Object.prototype.toString.call(value) === '[object ArrayBuffer]'
  );
}

/**
 * Creates a digest from bytes and returns it in Hex or Base64 format.
 *
 * @param {ArrayBuffer|ArrayBufferView} data Raw bytes to hash.
 * @param {string} algorithm One of the supported SHA algorithm names.
 * @param {'hex'|'base64'} format Output encoding.
 * @returns {Promise<string>} The encoded digest.
 */
export async function hashData(data, algorithm, format = HASH_FORMATS.HEX) {
  validateAlgorithm(algorithm);
  validateFormat(format);

  if (!isArrayBuffer(data) && !ArrayBuffer.isView(data)) {
    throw new TypeError('Hash data must be an ArrayBuffer or an ArrayBuffer view.');
  }

  const digest = await getSubtleCrypto().digest(algorithm, data);
  return format === HASH_FORMATS.HEX
    ? arrayBufferToHex(digest)
    : arrayBufferToBase64(digest);
}

/**
 * Creates a digest from UTF-8 text.
 *
 * @param {string} text Text to hash.
 * @param {string} algorithm One of the supported SHA algorithm names.
 * @param {'hex'|'base64'} format Output encoding.
 * @returns {Promise<string>} The encoded digest.
 */
export function hashText(text, algorithm, format = HASH_FORMATS.HEX) {
  if (typeof text !== 'string') {
    throw new TypeError('Hash input must be a string.');
  }
  return hashData(new TextEncoder().encode(text), algorithm, format);
}

/**
 * Reads and hashes the complete contents of a file.
 *
 * Web Crypto does not expose incremental digest state, so the file must be read
 * into memory before hashing.
 *
 * @param {File|Blob} file File-like object to hash.
 * @param {string} algorithm One of the supported SHA algorithm names.
 * @param {'hex'|'base64'} format Output encoding.
 * @returns {Promise<string>} The encoded digest.
 */
export async function hashFile(file, algorithm, format = HASH_FORMATS.HEX) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new TypeError('A readable file is required.');
  }
  const contents = await file.arrayBuffer();
  return hashData(contents, algorithm, format);
}
