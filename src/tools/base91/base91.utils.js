const BASE91_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
const BASE91_VALUES = new Map([...BASE91_ALPHABET].map((character, index) => [character, index]));

function assertString(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Input must be a string.');
  }
}

/**
 * Encodes raw bytes as a basE91 string.
 * @param {Uint8Array} bytes - The bytes to encode.
 * @returns {string} The basE91-encoded result.
 */
export function encodeBytesToBase91(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('Input must be a Uint8Array.');
  }

  let bitBuffer = 0;
  let bitCount = 0;
  let output = '';

  for (const byte of bytes) {
    bitBuffer |= byte << bitCount;
    bitCount += 8;
    if (bitCount > 13) {
      let value = bitBuffer & 8191;
      if (value > 88) {
        bitBuffer >>= 13;
        bitCount -= 13;
      } else {
        value = bitBuffer & 16383;
        bitBuffer >>= 14;
        bitCount -= 14;
      }
      output += BASE91_ALPHABET[value % 91] + BASE91_ALPHABET[Math.floor(value / 91)];
    }
  }

  if (bitCount > 0) {
    output += BASE91_ALPHABET[bitBuffer % 91];
    if (bitCount > 7 || bitBuffer > 90) {
      output += BASE91_ALPHABET[Math.floor(bitBuffer / 91)];
    }
  }
  return output;
}

/**
 * Decodes a basE91 string into raw bytes.
 * @param {string} encoded - The basE91 input.
 * @returns {Uint8Array} The decoded bytes.
 * @throws {Error} When the input contains invalid or malformed basE91 data.
 */
export function decodeBase91ToBytes(encoded) {
  assertString(encoded);
  let bitBuffer = 0;
  let bitCount = 0;
  let pendingValue = -1;
  const bytes = [];

  for (const character of encoded) {
    const value = BASE91_VALUES.get(character);
    if (value === undefined) {
      throw new Error('Invalid Base91 input. Please check for unsupported characters.');
    }
    if (pendingValue < 0) {
      pendingValue = value;
      continue;
    }

    const pairValue = pendingValue + value * 91;
    bitBuffer |= pairValue << bitCount;
    bitCount += (pairValue & 8191) > 88 ? 13 : 14;
    while (bitCount > 7) {
      bytes.push(bitBuffer & 255);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
    pendingValue = -1;
  }

  if (pendingValue >= 0) {
    bytes.push((bitBuffer | (pendingValue << bitCount)) & 255);
  }

  const decoded = new Uint8Array(bytes);
  if (encodeBytesToBase91(decoded) !== encoded) {
    throw new Error('Invalid Base91 input. The data appears truncated or malformed.');
  }
  return decoded;
}

/**
 * Encodes UTF-8 text as a basE91 string.
 * @param {string} text - The text to encode.
 * @returns {string} The basE91-encoded result.
 */
export function encodeToBase91(text) {
  assertString(text);
  return encodeBytesToBase91(new TextEncoder().encode(text));
}

/**
 * Decodes a basE91 string into UTF-8 text.
 * @param {string} encoded - The basE91 input.
 * @returns {string} The decoded text.
 * @throws {Error} When the input is malformed or is not valid UTF-8 text.
 */
export function decodeFromBase91(encoded) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(decodeBase91ToBytes(encoded));
  } catch (error) {
    if (error instanceof TypeError || error.message.startsWith('Invalid Base91')) {
      throw error;
    }
    throw new Error('Invalid Base91 input. The decoded bytes are not valid UTF-8 text.');
  }
}

/**
 * Reads a File or Blob and encodes its raw bytes as basE91.
 * @param {File|Blob} file - The file to encode.
 * @returns {Promise<string>} Resolves with the basE91-encoded contents.
 */
export async function fileToBase91(file) {
  try {
    return encodeBytesToBase91(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('Failed to read the selected file.');
  }
}

/**
 * Formats a byte count into a human-readable string.
 * @param {number} bytes - The byte count.
 * @returns {string} The formatted byte count.
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
