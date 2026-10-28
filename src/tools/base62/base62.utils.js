const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE62_VALUES = new Map([...BASE62_ALPHABET].map((character, index) => [character, index]));

/**
 * Encodes bytes using the standard 0-9A-Za-z Base62 alphabet.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function encodeBytesToBase62(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('Input must be a Uint8Array.');
  }
  if (bytes.length === 0) return '';

  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) leadingZeroes += 1;
  const digits = [0];

  for (const byte of bytes.subarray(leadingZeroes)) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry;
      digits[index] = value % 62;
      carry = Math.floor(value / 62);
    }
    while (carry > 0) {
      digits.push(carry % 62);
      carry = Math.floor(carry / 62);
    }
  }

  const encoded = digits.reverse().map((digit) => BASE62_ALPHABET[digit]).join('');
  return `${'0'.repeat(leadingZeroes)}${leadingZeroes === bytes.length ? '' : encoded}`;
}

/**
 * Decodes a Base62 string into its original bytes.
 * @param {string} value
 * @returns {Uint8Array}
 * @throws {Error} When the input contains a character outside the Base62 alphabet.
 */
export function decodeBase62ToBytes(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (value === '') return new Uint8Array();

  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === '0') leadingZeroes += 1;
  const bytes = [0];

  for (const character of value.slice(leadingZeroes)) {
    const digit = BASE62_VALUES.get(character);
    if (digit === undefined) {
      throw new Error(`Invalid Base62 character: "${character}". Use only 0-9, A-Z, and a-z.`);
    }
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const decoded = bytes[index] * 62 + carry;
      bytes[index] = decoded & 0xff;
      carry = decoded >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const decoded =
    leadingZeroes === value.length ? new Uint8Array() : Uint8Array.from(bytes.reverse());
  return new Uint8Array([...new Uint8Array(leadingZeroes), ...decoded]);
}

/**
 * Encodes UTF-8 text as Base62.
 * @param {string} text
 * @returns {string}
 */
export function encodeToBase62(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  return encodeBytesToBase62(new TextEncoder().encode(text));
}

/**
 * Decodes Base62 into UTF-8 text.
 * @param {string} value
 * @returns {string}
 */
export function decodeFromBase62(value) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(decodeBase62ToBytes(value));
  } catch (error) {
    if (error instanceof TypeError || error.message.startsWith('Invalid Base62')) throw error;
    throw new Error('Decoded Base62 data is binary, not valid UTF-8 text. Download it instead.');
  }
}

/**
 * Reads a File or Blob as raw bytes.
 * @param {File|Blob} file
 * @returns {Promise<Uint8Array>}
 */
export function fileToBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Formats a byte count for display.
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
