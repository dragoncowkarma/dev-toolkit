/**
 * Standard Base62 alphabet, ordered by the numeric value of each character.
 */
export const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const BASE62_BASE = BigInt(BASE62_ALPHABET.length);
const DECIMAL_PATTERN = /^\d+$/;
const BASE62_PATTERN = /^[0-9a-zA-Z]+$/;

/**
 * Checks whether a value is a non-negative whole-number decimal string.
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidDecimal(value) {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value);
}

/**
 * Checks whether a value contains one or more standard Base62 characters.
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidBase62(value) {
  return typeof value === 'string' && BASE62_PATTERN.test(value);
}

/**
 * Validates a decimal value before converting it with BigInt.
 * @param {string} value
 * @returns {void}
 */
function assertValidDecimal(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Decimal input must be a string.');
  }
  if (value === '') {
    throw new Error('Enter a non-negative whole-number decimal value.');
  }
  if (value.startsWith('-')) {
    throw new Error('Negative numbers cannot be encoded as Base62.');
  }
  if (!isValidDecimal(value)) {
    throw new Error('Decimal input must be a non-negative whole number.');
  }
}

/**
 * Validates a Base62 value before converting it with BigInt.
 * @param {string} value
 * @returns {void}
 */
function assertValidBase62(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Base62 input must be a string.');
  }
  if (value === '') {
    throw new Error('Enter a Base62 value.');
  }
  if (isValidBase62(value)) {
    return;
  }

  const invalidCharacter = [...value].find((character) => !BASE62_ALPHABET.includes(character));
  const displayedCharacter = invalidCharacter === ' ' ? 'space' : invalidCharacter;
  throw new Error(
    `Invalid Base62 character "${displayedCharacter}". Use only 0-9, a-z, and A-Z.`
  );
}

/**
 * Encodes a non-negative decimal string as a standard Base62 string.
 * @param {string} decimal - A non-negative whole-number decimal string.
 * @returns {string} The Base62 representation.
 * @throws {Error} When the decimal value is empty, negative, or non-integer.
 */
export function encodeBase62(decimal) {
  assertValidDecimal(decimal);

  let remaining = BigInt(decimal);
  if (remaining === 0n) {
    return '0';
  }

  let encoded = '';
  while (remaining > 0n) {
    const remainder = Number(remaining % BASE62_BASE);
    encoded = `${BASE62_ALPHABET[remainder]}${encoded}`;
    remaining /= BASE62_BASE;
  }
  return encoded;
}

/**
 * Decodes a standard Base62 string to a non-negative decimal string.
 * @param {string} base62 - A Base62 value using 0-9, a-z, and A-Z.
 * @returns {string} The decimal representation.
 * @throws {Error} When the input is empty or contains an invalid Base62 character.
 */
export function decodeBase62(base62) {
  assertValidBase62(base62);

  let decoded = 0n;
  for (const character of base62) {
    const value = BigInt(BASE62_ALPHABET.indexOf(character));
    decoded = decoded * BASE62_BASE + value;
  }
  return decoded.toString();
}
