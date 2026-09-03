const DECIMAL_PATTERN = /^\d+$/;
const BASE36_PATTERN = /^[0-9A-Za-z]+$/;

/**
 * Encodes a non-negative decimal integer as an uppercase Base36 value.
 * @param {string|bigint|number} value - A non-negative integer.
 * @returns {string} The uppercase Base36 result.
 * @throws {Error} When the input is not a non-negative integer.
 */
export function encodeToBase36(value) {
  const decimalValue = toNonNegativeBigInt(value);
  return decimalValue.toString(36).toUpperCase();
}

/**
 * Returns whether a value contains one or more Base36 characters.
 * @param {string} value
 * @returns {boolean} Whether the value uses only the Base36 alphabet.
 */
export function isValidBase36(value) {
  return typeof value === 'string' && BASE36_PATTERN.test(value);
}

/**
 * Decodes a Base36 value into a non-negative integer.
 * @param {string} value - A Base36 value using digits and letters.
 * @returns {bigint} The decoded integer.
 * @throws {Error} When the input is empty or includes invalid characters.
 */
export function decodeFromBase36(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Base36 input must be a string.');
  }
  if (value.length === 0) {
    throw new Error('Enter a Base36 value.');
  }
  if (!isValidBase36(value)) {
    throw new Error('Base36 can only contain digits 0-9 and letters A-Z.');
  }

  let result = 0n;
  for (const character of value.toUpperCase()) {
    const digit = BigInt(parseInt(character, 36));
    result = result * 36n + digit;
  }
  return result;
}

/**
 * Converts a supported decimal input to a non-negative BigInt.
 * @param {string|bigint|number} value
 * @returns {bigint}
 * @throws {Error} When the input is invalid.
 */
function toNonNegativeBigInt(value) {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new Error('Enter a non-negative integer.');
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Enter a non-negative safe integer or a decimal string.');
    }
    return BigInt(value);
  }

  if (typeof value !== 'string') {
    throw new TypeError('Decimal input must be a string, number, or BigInt.');
  }
  if (value.length === 0) {
    throw new Error('Enter a non-negative integer.');
  }
  if (!DECIMAL_PATTERN.test(value)) {
    throw new Error('Enter a non-negative integer using digits 0-9.');
  }
  return BigInt(value);
}
