const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

export const BECH32 = 'bech32';
export const BECH32M = 'bech32m';
export const MAX_BECH32_LENGTH = 90;

const CHECKSUM_CONSTANTS = {
  [BECH32]: 1,
  [BECH32M]: 0x2bc830a3,
};

/**
 * Validates a Bech32 human-readable part.
 * @param {string} hrp The human-readable part to validate.
 * @returns {string} The normalized lowercase human-readable part.
 * @throws {Error} When the human-readable part is outside the BIP limits.
 */
export function validateHrp(hrp) {
  if (typeof hrp !== 'string' || hrp.length < 1 || hrp.length > 83) {
    throw new Error('The human-readable part must contain 1 to 83 characters.');
  }
  for (const character of hrp) {
    const codePoint = character.codePointAt(0);
    if (codePoint < 33 || codePoint > 126) {
      throw new Error('The human-readable part must use US-ASCII characters 33 through 126.');
    }
  }
  return hrp.toLowerCase();
}

/**
 * Converts values between fixed-width bit groups.
 * @param {number[]|Uint8Array} values The input values to convert.
 * @param {number} fromBits Width of input values.
 * @param {number} toBits Width of output values.
 * @param {boolean} pad Whether incomplete output groups may be zero-padded.
 * @returns {number[]} Converted values.
 * @throws {Error} When input values or trailing bits are invalid.
 */
export function convertBits(values, fromBits, toBits, pad) {
  if (
    !Number.isInteger(fromBits) ||
    !Number.isInteger(toBits) ||
    fromBits < 1 ||
    toBits < 1 ||
    fromBits > 30 ||
    toBits > 30
  ) {
    throw new Error('Bit group widths must be integers between 1 and 30.');
  }

  const maximumInput = (1 << fromBits) - 1;
  const maximumOutput = (1 << toBits) - 1;
  let accumulator = 0;
  let bitCount = 0;
  const converted = [];

  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value > maximumInput) {
      throw new Error(`Invalid ${fromBits}-bit value.`);
    }
    accumulator = (accumulator << fromBits) | value;
    bitCount += fromBits;
    while (bitCount >= toBits) {
      bitCount -= toBits;
      converted.push((accumulator >> bitCount) & maximumOutput);
    }
  }

  if (pad) {
    if (bitCount > 0) converted.push((accumulator << (toBits - bitCount)) & maximumOutput);
  } else if (bitCount >= fromBits || ((accumulator << (toBits - bitCount)) & maximumOutput) !== 0) {
    throw new Error('Invalid non-zero trailing padding bits.');
  }

  return converted;
}

/**
 * Computes the BIP-173 polymod checksum state.
 * @param {number[]} values Expanded HRP and data values.
 * @returns {number} The polymod result.
 */
export function polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < GENERATORS.length; index += 1) {
      if ((top >>> index) & 1) checksum ^= GENERATORS[index];
    }
  }
  return checksum >>> 0;
}

/**
 * Expands an HRP into its BIP-173 checksum values.
 * @param {string} hrp The normalized human-readable part.
 * @returns {number[]} The expanded HRP values.
 */
export function expandHrp(hrp) {
  return [
    ...Array.from(hrp, (character) => character.charCodeAt(0) >> 5),
    0,
    ...Array.from(hrp, (character) => character.charCodeAt(0) & 31),
  ];
}

/**
 * Identifies a checksum variant from a complete data sequence.
 * @param {string} hrp The normalized human-readable part.
 * @param {number[]} values Data words including the six checksum words.
 * @returns {'bech32'|'bech32m'|null} The matching variant, if any.
 */
export function verifyChecksum(hrp, values) {
  const checksum = polymod([...expandHrp(hrp), ...values]);
  if (checksum === CHECKSUM_CONSTANTS[BECH32]) return BECH32;
  if (checksum === CHECKSUM_CONSTANTS[BECH32M]) return BECH32M;
  return null;
}

function assertVariant(variant) {
  if (!Object.hasOwn(CHECKSUM_CONSTANTS, variant)) {
    throw new Error('Select either Bech32 or Bech32m.');
  }
}

function validateWords(words) {
  for (const word of words) {
    if (!Number.isInteger(word) || word < 0 || word > 31) {
      throw new Error('Data words must be 5-bit values between 0 and 31.');
    }
  }
}

function createChecksum(hrp, words, variant) {
  const state = polymod([...expandHrp(hrp), ...words, 0, 0, 0, 0, 0, 0]);
  const result = state ^ CHECKSUM_CONSTANTS[variant];
  return Array.from({ length: 6 }, (_, index) => (result >> (5 * (5 - index))) & 31);
}

/**
 * Encodes 5-bit words as a lowercase Bech32 or Bech32m string.
 * @param {string} hrp The human-readable part.
 * @param {number[]} words Payload data words, without checksum words.
 * @param {'bech32'|'bech32m'} variant The desired checksum variant.
 * @returns {string} The encoded string.
 */
export function encodeBech32(hrp, words, variant = BECH32) {
  const normalizedHrp = validateHrp(hrp);
  assertVariant(variant);
  validateWords(words);
  const checksum = createChecksum(normalizedHrp, words, variant);
  const encodedData = [...words, ...checksum].map((word) => CHARSET[word]).join('');
  const encoded = `${normalizedHrp}1${encodedData}`;
  if (encoded.length > MAX_BECH32_LENGTH) {
    throw new Error(`A Bech32 string must not exceed ${MAX_BECH32_LENGTH} characters.`);
  }
  return encoded;
}

/**
 * Decodes and validates a Bech32 or Bech32m string.
 * @param {string} value The encoded string to decode.
 * @returns {{hrp: string, words: number[], checksum: string, variant: 'bech32'|'bech32m'}}
 * @throws {Error} When the value violates the BIP-173/BIP-350 format.
 */
export function decodeBech32(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > MAX_BECH32_LENGTH) {
    throw new Error(`A Bech32 string must contain 8 to ${MAX_BECH32_LENGTH} characters.`);
  }
  if (value !== value.toLowerCase() && value !== value.toUpperCase()) {
    throw new Error('Mixed-case Bech32 strings are not valid.');
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint < 33 || codePoint > 126) {
      throw new Error('Bech32 strings must use printable US-ASCII characters.');
    }
  }

  const normalized = value.toLowerCase();
  const separatorIndex = normalized.lastIndexOf('1');
  if (separatorIndex < 1 || separatorIndex + 7 > normalized.length) {
    throw new Error(
      'The separator must follow the HRP and precede at least six checksum characters.'
    );
  }

  const hrp = validateHrp(normalized.slice(0, separatorIndex));
  const encodedData = normalized.slice(separatorIndex + 1);
  const values = Array.from(encodedData, (character) => {
    const word = CHARSET.indexOf(character);
    if (word === -1) throw new Error(`Character "${character}" is not in the Bech32 alphabet.`);
    return word;
  });
  const variant = verifyChecksum(hrp, values);
  if (!variant) throw new Error('Checksum mismatch: this is not a valid Bech32 or Bech32m string.');

  const payloadWords = values.slice(0, -6);
  return {
    hrp,
    words: payloadWords,
    checksum: encodedData.slice(-6),
    variant,
  };
}

/**
 * Converts hexadecimal text into bytes.
 * @param {string} value Hexadecimal bytes, optionally separated by whitespace.
 * @returns {Uint8Array} Parsed bytes.
 * @throws {Error} When the hexadecimal input is malformed.
 */
export function hexToBytes(value) {
  if (typeof value !== 'string') throw new Error('Hexadecimal input must be text.');
  const normalized = value.replace(/\s/g, '');
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(normalized)) {
    throw new Error('Hexadecimal bytes must use complete pairs of 0-9 and A-F.');
  }
  return Uint8Array.from(normalized.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

/**
 * Converts bytes to lowercase hexadecimal text.
 * @param {number[]|Uint8Array} bytes The bytes to render.
 * @returns {string} Lowercase hexadecimal bytes.
 */
export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new Error('Byte values must be integers between 0 and 255.');
    }
    return byte.toString(16).padStart(2, '0');
  }).join('');
}

/**
 * Encodes a string as UTF-8 bytes.
 * @param {string} value Text to encode.
 * @returns {Uint8Array} UTF-8 bytes.
 */
export function utf8ToBytes(value) {
  if (typeof value !== 'string') throw new Error('UTF-8 input must be text.');
  return new TextEncoder().encode(value);
}

/**
 * Decodes UTF-8 bytes without replacing malformed byte sequences.
 * @param {number[]|Uint8Array} bytes Bytes to decode.
 * @returns {string|null} The decoded string, or null when bytes are not valid UTF-8.
 */
export function bytesToUtf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}
