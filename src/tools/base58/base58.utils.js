const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const BASE58_MAP = new Map();
for (let i = 0; i < BASE58_ALPHABET.length; i += 1) {
  BASE58_MAP.set(BASE58_ALPHABET[i], BigInt(i));
}

/**
 * Removes all whitespace characters from a string.
 * @param {string} value
 * @returns {string}
 */
function stripWhitespace(value) {
  return value.replace(/\s/g, '');
}

/**
 * Formats a byte array as a space-separated hex string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
  const hexes = [];
  for (let i = 0; i < bytes.length; i += 1) {
    hexes.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return hexes.join(' ');
}

/**
 * Converts a hex string into a Uint8Array.
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  const cleaned = stripWhitespace(hex).replace(/^0x/i, '');
  if (cleaned.length === 0) return new Uint8Array(0);
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
    throw new Error('Hex input contains invalid characters.');
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex input must have an even number of digits.');
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Checks if a value is a Uint8Array across realms.
 * @param {unknown} val
 * @returns {boolean}
 */
function isUint8Array(val) {
  return (
    val instanceof Uint8Array ||
    (Boolean(val) &&
      Object.prototype.toString.call(val) === '[object Uint8Array]')
  );
}

/**
 * Encodes a Uint8Array of bytes into a Base58 string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function encodeBytesToBase58(bytes) {
  if (!isUint8Array(bytes)) {
    throw new TypeError('Input must be a Uint8Array.');
  }
  if (bytes.length === 0) return '';

  let zeroCount = 0;
  while (zeroCount < bytes.length && bytes[zeroCount] === 0) {
    zeroCount += 1;
  }

  let num = 0n;
  for (let i = zeroCount; i < bytes.length; i += 1) {
    num = (num << 8n) | BigInt(bytes[i]);
  }

  let result = '';
  while (num > 0n) {
    const remainder = Number(num % 58n);
    num = num / 58n;
    result = BASE58_ALPHABET[remainder] + result;
  }

  const prefix = '1'.repeat(zeroCount);
  return prefix + result;
}

/**
 * Decodes a Base58 string to Uint8Array bytes.
 * @param {string} base58
 * @returns {Uint8Array}
 */
export function decodeBase58ToBytes(base58) {
  if (typeof base58 !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  const cleaned = stripWhitespace(base58);
  if (cleaned.length === 0) return new Uint8Array(0);

  let zeroCount = 0;
  while (zeroCount < cleaned.length && cleaned[zeroCount] === '1') {
    zeroCount += 1;
  }

  let num = 0n;
  for (let i = zeroCount; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    const digit = BASE58_MAP.get(char);
    if (digit === undefined) {
      throw new Error(`Invalid Base58 character: '${char}'.`);
    }
    num = num * 58n + digit;
  }

  const bytes = [];
  let temp = num;
  while (temp > 0n) {
    bytes.push(Number(temp & 0xffn));
    temp >>= 8n;
  }
  bytes.reverse();

  const result = new Uint8Array(zeroCount + bytes.length);
  result.fill(0, 0, zeroCount);
  result.set(bytes, zeroCount);

  return result;
}

/**
 * Encodes a string (UTF-8 text or hex) to Base58.
 * @param {string} input
 * @param {{ inputType?: 'text'|'hex' }} [options]
 * @returns {string}
 */
export function encodeToBase58(input, { inputType = 'text' } = {}) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (input === '') return '';
  const bytes =
    inputType === 'hex' ? hexToBytes(input) : new TextEncoder().encode(input);
  return encodeBytesToBase58(bytes);
}

/**
 * Decodes Base58 to UTF-8 string or hex string.
 * @param {string} base58
 * @param {{ outputType?: 'text'|'hex'|'auto' }} [options]
 * @returns {string}
 */
export function decodeFromBase58(base58, { outputType = 'text' } = {}) {
  const bytes = decodeBase58ToBytes(base58);
  if (bytes.length === 0) return '';
  if (outputType === 'hex') return bytesToHex(bytes);

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    if (outputType === 'auto') {
      return bytesToHex(bytes);
    }
    throw new Error(
      'Decoded binary data is not valid UTF-8 text. Switch to Hex mode to view.'
    );
  }
}

/**
 * Decodes Base58 with details about text/hex representation and UTF-8 validity.
 * @param {string} base58
 * @returns {{ bytes: Uint8Array, text: string|null, hex: string, isUtf8: boolean }}
 */
export function decodeBase58Details(base58) {
  const bytes = decodeBase58ToBytes(base58);
  const hex = bytesToHex(bytes);
  if (bytes.length === 0) {
    return { bytes, text: '', hex: '', isUtf8: true };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { bytes, text, hex, isUtf8: true };
  } catch {
    return { bytes, text: null, hex, isUtf8: false };
  }
}

/**
 * Validates whether a string is well-formed Base58.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidBase58(value) {
  if (typeof value !== 'string') return false;
  try {
    decodeBase58ToBytes(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes double SHA-256 hash of a byte array using Web Crypto API.
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
export async function doubleSha256(bytes) {
  const hash1 = await crypto.subtle.digest('SHA-256', bytes);
  const hash2 = await crypto.subtle.digest('SHA-256', hash1);
  return new Uint8Array(hash2);
}

/**
 * Encodes bytes into a Base58Check string with a 4-byte checksum.
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export async function encodeBytesToBase58Check(bytes) {
  if (!isUint8Array(bytes)) {
    throw new TypeError('Input must be a Uint8Array.');
  }
  const hash = await doubleSha256(bytes);
  const checksum = hash.slice(0, 4);

  const combined = new Uint8Array(bytes.length + 4);
  combined.set(bytes, 0);
  combined.set(checksum, bytes.length);

  return encodeBytesToBase58(combined);
}

/**
 * Encodes text or hex input to Base58Check.
 * @param {string} input
 * @param {{ inputType?: 'text'|'hex' }} [options]
 * @returns {Promise<string>}
 */
export async function encodeToBase58Check(input, { inputType = 'text' } = {}) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (input === '') return '';
  const bytes =
    inputType === 'hex' ? hexToBytes(input) : new TextEncoder().encode(input);
  return encodeBytesToBase58Check(bytes);
}

/**
 * Decodes a Base58Check string into details including checksum validation.
 * @param {string} base58
 * @returns {Promise<{
 *   bytes: Uint8Array,
 *   rawBytes: Uint8Array,
 *   text: string|null,
 *   hex: string,
 *   isUtf8: boolean,
 *   checksumValid: boolean,
 *   checksumError?: string
 * }>}
 */
export async function decodeBase58CheckDetails(base58) {
  const rawBytes = decodeBase58ToBytes(base58);
  if (rawBytes.length === 0) {
    return {
      bytes: new Uint8Array(0),
      rawBytes,
      text: '',
      hex: '',
      isUtf8: true,
      checksumValid: true,
    };
  }

  if (rawBytes.length < 4) {
    const hex = bytesToHex(rawBytes);
    let text = null;
    let isUtf8 = false;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
      isUtf8 = true;
    } catch {
      isUtf8 = false;
    }
    return {
      bytes: rawBytes,
      rawBytes,
      text,
      hex,
      isUtf8,
      checksumValid: false,
      checksumError:
        'Input is too short for Base58Check (minimum 4-byte checksum required).',
    };
  }

  const payload = rawBytes.slice(0, rawBytes.length - 4);
  const expectedChecksum = rawBytes.slice(rawBytes.length - 4);
  const hash = await doubleSha256(payload);
  const actualChecksum = hash.slice(0, 4);

  let checksumValid = true;
  for (let i = 0; i < 4; i += 1) {
    if (expectedChecksum[i] !== actualChecksum[i]) {
      checksumValid = false;
      break;
    }
  }

  const hex = bytesToHex(payload);
  let text = null;
  let isUtf8 = false;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
    isUtf8 = true;
  } catch {
    isUtf8 = false;
  }

  return {
    bytes: payload,
    rawBytes,
    text: isUtf8 ? text : null,
    hex,
    isUtf8,
    checksumValid,
    checksumError: checksumValid
      ? undefined
      : 'Base58Check checksum validation failed (checksum mismatch).',
  };
}

/**
 * Reads a File/Blob into a Base58 or Base58Check string.
 * @param {File|Blob} file
 * @param {{ useChecksum?: boolean }} [options]
 * @returns {Promise<string>}
 */
export function fileToBase58(file, { useChecksum = false } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buffer = /** @type {ArrayBuffer} */ (reader.result);
        const bytes = new Uint8Array(buffer);
        if (useChecksum) {
          const result = await encodeBytesToBase58Check(bytes);
          resolve(result);
        } else {
          resolve(encodeBytesToBase58(bytes));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () =>
      reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Formats a byte size.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
