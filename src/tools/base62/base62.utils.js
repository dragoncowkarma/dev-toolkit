export const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const BASE = 62n;
const DECIMAL_PATTERN = /^\d+$/;
const BASE62_PATTERN = /^[0-9a-zA-Z]+$/;

/**
 * Converts a non-negative decimal integer to its canonical Base62 representation.
 * @param {string} decimal - A non-negative decimal integer.
 * @returns {string} The Base62 representation.
 * @throws {Error} When the input is not a non-negative integer.
 */
export function encodeBase62(decimal) {
  if (typeof decimal !== 'string') {
    throw new TypeError('Decimal input must be a string.');
  }

  const value = decimal.trim();
  if (value === '') {
    throw new Error('Enter a non-negative whole number.');
  }
  if (value.startsWith('-')) {
    throw new Error('Negative numbers cannot be encoded as Base62.');
  }
  if (!DECIMAL_PATTERN.test(value)) {
    throw new Error('Enter a non-negative whole number without decimals.');
  }

  let number = BigInt(value);
  if (number === 0n) return '0';

  let encoded = '';
  while (number > 0n) {
    const remainder = Number(number % BASE);
    encoded = BASE62_ALPHABET[remainder] + encoded;
    number /= BASE;
  }
  return encoded;
}

/**
 * Converts a Base62 value to its canonical decimal representation.
 * @param {string} base62 - A Base62 value using 0-9, a-z, and A-Z.
 * @returns {string} The decimal representation.
 * @throws {Error} When the input contains invalid Base62 characters.
 */
export function decodeBase62(base62) {
  if (typeof base62 !== 'string') {
    throw new TypeError('Base62 input must be a string.');
  }

  const value = base62.trim();
  if (value === '') {
    throw new Error('Enter a Base62 value using 0-9, a-z, or A-Z.');
  }
  if (!BASE62_PATTERN.test(value)) {
    throw new Error('Base62 can contain only 0-9, a-z, and A-Z.');
  }

  let decoded = 0n;
  for (const character of value) {
    decoded = decoded * BASE + BigInt(BASE62_ALPHABET.indexOf(character));
  }
  return decoded.toString();
}
