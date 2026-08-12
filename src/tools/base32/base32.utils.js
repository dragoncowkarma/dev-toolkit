const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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
 * Encodes a Uint8Array of bytes into an RFC 4648 Base32 string.
 * @param {Uint8Array} bytes
 * @param {boolean} [padded=true]
 * @returns {string}
 */
export function encodeBytesToBase32(bytes, padded = true) {
  let buffer = 0;
  let bits = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i += 1) {
    // Accumulate bytes into buffer. Note: buffer may overflow int32 after 4 bytes,
    // but bits <= 12 so low 12 bits needed by bitwise shift remain intact.
    buffer = (buffer << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >> bits) & 31];
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }

  if (padded) {
    const remainder = output.length % 8;
    if (remainder > 0) {
      output += '='.repeat(8 - remainder);
    }
  }

  return output;
}

/**
 * Encodes a string (UTF-8 text or hex) to Base32.
 * @param {string} input
 * @param {{ padded?: boolean, inputType?: 'text'|'hex' }} [options]
 * @returns {string}
 */
export function encodeToBase32(
  input,
  { padded = true, inputType = 'text' } = {}
) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (input === '') return '';
  const bytes =
    inputType === 'hex' ? hexToBytes(input) : new TextEncoder().encode(input);
  return encodeBytesToBase32(bytes, padded);
}

/**
 * Decodes a Base32 string to Uint8Array bytes.
 * Note: Non-zero trailing bits in partial blocks are accepted leniently per
 * standard browser tool conventions.
 * @param {string} base32
 * @returns {Uint8Array}
 */
export function decodeBase32ToBytes(base32) {
  if (typeof base32 !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  const cleaned = stripWhitespace(base32).toUpperCase();
  if (cleaned.length === 0) return new Uint8Array(0);

  if (!/^[A-Z2-7]*={0,6}$/.test(cleaned)) {
    throw new Error('Base32 input contains invalid characters.');
  }

  const paddingIndex = cleaned.indexOf('=');
  const body = paddingIndex === -1 ? cleaned : cleaned.slice(0, paddingIndex);
  const padding = paddingIndex === -1 ? '' : cleaned.slice(paddingIndex);

  const validRemainders = [0, 2, 4, 5, 7];
  if (!validRemainders.includes(body.length % 8)) {
    throw new Error('Base32 input has an incomplete final byte group.');
  }

  const expectedPadding = body.length % 8 === 0 ? 0 : 8 - (body.length % 8);
  if (padding && (body.length % 8 === 0 || padding.length !== expectedPadding)) {
    throw new Error('Base32 padding is malformed.');
  }

  let buffer = 0;
  let bits = 0;
  const bytes = [];

  for (let i = 0; i < body.length; i += 1) {
    const val = BASE32_ALPHABET.indexOf(body[i]);
    if (val === -1) {
      throw new Error('Base32 input contains invalid characters.');
    }
    buffer = (buffer << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }

  return Uint8Array.from(bytes);
}

/**
 * Validates whether a string is well-formed Base32.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidBase32(value) {
  if (typeof value !== 'string') return false;
  try {
    decodeBase32ToBytes(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decodes Base32 to UTF-8 string or hex string.
 * @param {string} base32
 * @param {{ outputType?: 'text'|'hex'|'auto' }} [options]
 * @returns {string}
 */
export function decodeFromBase32(base32, { outputType = 'text' } = {}) {
  const bytes = decodeBase32ToBytes(base32);
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
 * Decodes Base32 with details about text/hex representation and UTF-8 validity.
 * @param {string} base32
 * @returns {{ bytes: Uint8Array, text: string|null, hex: string, isUtf8: boolean }}
 */
export function decodeBase32Details(base32) {
  const bytes = decodeBase32ToBytes(base32);
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
 * Reads a File/Blob into a Base32 string.
 * @param {File|Blob} file
 * @param {{ padded?: boolean }} [options]
 * @returns {Promise<string>}
 */
export function fileToBase32(file, { padded = true } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = /** @type {ArrayBuffer} */ (reader.result);
      const bytes = new Uint8Array(buffer);
      resolve(encodeBytesToBase32(bytes, padded));
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
