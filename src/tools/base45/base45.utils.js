const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });

function isUint8Array(value) {
  return Object.prototype.toString.call(value) === '[object Uint8Array]';
}

/**
 * Encodes raw bytes as a Base45 string according to RFC 9285.
 *
 * @param {Uint8Array} bytes - The bytes to encode.
 * @returns {string} The Base45-encoded result.
 */
export function encodeBytesToBase45(bytes) {
  if (!isUint8Array(bytes)) {
    throw new TypeError('Input must be a Uint8Array.');
  }

  let encoded = '';
  for (let index = 0; index < bytes.length; index += 2) {
    const hasPair = index + 1 < bytes.length;
    const value = hasPair ? (bytes[index] * 256) + bytes[index + 1] : bytes[index];
    encoded += BASE45_ALPHABET[value % 45];
    encoded += BASE45_ALPHABET[Math.floor(value / 45) % 45];
    if (hasPair) {
      encoded += BASE45_ALPHABET[Math.floor(value / (45 * 45))];
    }
  }
  return encoded;
}

/**
 * Encodes UTF-8 text as a Base45 string.
 *
 * @param {string} text - The text to encode.
 * @returns {string} The Base45-encoded result.
 */
export function encodeToBase45(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  return encodeBytesToBase45(TEXT_ENCODER.encode(text));
}

/**
 * Decodes a Base45 string into its raw bytes.
 *
 * @param {string} base45 - The Base45 string to decode.
 * @returns {Uint8Array} The decoded bytes.
 * @throws {Error} When the input is not a well-formed Base45 value.
 */
export function decodeBase45ToBytes(base45) {
  if (typeof base45 !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (base45.length % 3 === 1) {
    throw new Error(
      'Invalid Base45 input: length must use three-character groups with an optional final pair.'
    );
  }

  const values = [];
  for (let index = 0; index < base45.length; index += 1) {
    const value = BASE45_ALPHABET.indexOf(base45[index]);
    if (value === -1) {
      throw new Error(
        `Invalid Base45 input: character "${base45[index]}" at position ${index + 1} ` +
        'is not allowed.'
      );
    }
    values.push(value);
  }

  const decoded = [];
  for (let index = 0; index < values.length; index += 3) {
    const isFinalPair = values.length - index === 2;
    const value = values[index] + (values[index + 1] * 45) +
      (isFinalPair ? 0 : values[index + 2] * 45 * 45);
    const maximum = isFinalPair ? 255 : 65535;
    if (value > maximum) {
      const group = isFinalPair ? 'two-character' : 'three-character';
      throw new Error(`Invalid Base45 input: ${group} group exceeds its byte range.`);
    }
    if (isFinalPair) {
      decoded.push(value);
    } else {
      decoded.push(Math.floor(value / 256), value % 256);
    }
  }

  return Uint8Array.from(decoded);
}

/**
 * Checks whether a value is a well-formed Base45 string.
 *
 * @param {string} value - The value to validate.
 * @returns {boolean} Whether the value can be decoded as Base45 bytes.
 */
export function isValidBase45(value) {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    decodeBase45ToBytes(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decodes a Base45 string into UTF-8 text.
 *
 * @param {string} base45 - The Base45 string to decode.
 * @returns {string} The decoded UTF-8 text.
 * @throws {Error} When the input is invalid Base45 or does not contain UTF-8 text.
 */
export function decodeFromBase45(base45) {
  const bytes = decodeBase45ToBytes(base45);
  try {
    return TEXT_DECODER.decode(bytes);
  } catch {
    throw new Error('Base45 data does not contain valid UTF-8 text.');
  }
}
