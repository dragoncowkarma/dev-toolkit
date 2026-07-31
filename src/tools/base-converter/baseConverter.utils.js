const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE_MIN = 2;
const BASE_MAX = 36;
const BIT_WIDTHS = [8, 16, 32];

function assertBase(base) {
  if (!Number.isInteger(base) || base < BASE_MIN || base > BASE_MAX) {
    throw new RangeError(`Base must be an integer between ${BASE_MIN} and ${BASE_MAX}.`);
  }
}

function toDecimalBigInt(value, base) {
  const normalized = value.toUpperCase();
  const isNegative = normalized.startsWith('-');
  const digits = normalized.replace(/^[+-]/, '');
  let result = 0n;

  for (const digit of digits) {
    result = result * BigInt(base) + BigInt(DIGITS.indexOf(digit));
  }

  return isNegative ? -result : result;
}

function toBaseString(decimalValue, base) {
  if (decimalValue === 0n) return '0';

  const isNegative = decimalValue < 0n;
  let remaining = isNegative ? -decimalValue : decimalValue;
  let result = '';

  while (remaining > 0n) {
    const digit = Number(remaining % BigInt(base));
    result = `${DIGITS[digit]}${result}`;
    remaining /= BigInt(base);
  }

  return isNegative ? `-${result}` : result;
}

function toBigInt(decimalValue) {
  if (typeof decimalValue === 'bigint') return decimalValue;
  if (typeof decimalValue === 'number' && Number.isSafeInteger(decimalValue)) {
    return BigInt(decimalValue);
  }
  if (typeof decimalValue === 'string' && /^-?\d+$/.test(decimalValue)) {
    return BigInt(decimalValue);
  }
  throw new TypeError('Decimal value must be a safe integer, bigint, or integer string.');
}

/**
 * Checks whether a string is a valid integer in a base from 2 through 36.
 *
 * @param {string} value Number text to validate.
 * @param {number} base Numeric base from 2 through 36.
 * @returns {boolean} Whether the complete value is valid for the base.
 */
export function validateBaseInput(value, base) {
  if (typeof value !== 'string') return false;
  try {
    assertBase(base);
  } catch {
    return false;
  }

  const digits = value.toUpperCase().replace(/^[+-]/, '');
  if (!digits || /^[+-]/.test(digits)) return false;
  return [...digits].every((digit) => {
    const index = DIGITS.indexOf(digit);
    return index >= 0 && index < base;
  });
}

/**
 * Converts an integer string between bases 2 and 36 without number precision loss.
 *
 * @param {string} value Source integer text.
 * @param {number} fromBase Base of the source value.
 * @param {number} toBase Base of the returned value.
 * @returns {string} Canonical uppercase representation in the destination base.
 */
export function convertBase(value, fromBase, toBase) {
  assertBase(fromBase);
  assertBase(toBase);
  if (!validateBaseInput(value, fromBase)) {
    throw new TypeError(`Invalid base-${fromBase} number.`);
  }
  return toBaseString(toDecimalBigInt(value, fromBase), toBase);
}

/**
 * Returns fixed-width two's-complement binary information for 8, 16, and 32 bits.
 *
 * @param {number|bigint|string} decimalValue Integer to inspect.
 * @returns {{bit8: object, bit16: object, bit32: object}} Fixed-width binary views.
 */
export function getBinaryRepresentation(decimalValue) {
  const value = toBigInt(decimalValue);
  const representations = {};

  BIT_WIDTHS.forEach((width) => {
    const widthValue = BigInt(width);
    const range = 1n << widthValue;
    const signBit = 1n << (widthValue - 1n);
    const unsignedValue = ((value % range) + range) % range;
    const signedValue = unsignedValue >= signBit ? unsignedValue - range : unsignedValue;
    representations[`bit${width}`] = {
      binary: unsignedValue.toString(2).padStart(width, '0'),
      unsigned: Number(unsignedValue),
      signed: Number(signedValue),
    };
  });

  return representations;
}
