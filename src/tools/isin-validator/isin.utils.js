/**
 * ISO 6166 International Securities Identification Number (ISIN) utilities.
 * An ISIN consists of:
 * - 2-letter uppercase country code (ISO 3166-1 alpha-2)
 * - 9-character alphanumeric national security identifier (NSIN)
 * - 1 numeric check digit calculated using the Luhn mod-10 algorithm
 */

/**
 * Predefined sample ISINs for demonstration and testing.
 */
export const SAMPLE_ISINS = Object.freeze([
  { label: 'Apple Inc. (US)', value: 'US0378331005' },
  { label: 'Alphabet Cl. A (US)', value: 'US02079K3059' },
  { label: 'BMW AG (DE)', value: 'DE0005190003' },
  { label: 'Samsung Electronics (KR)', value: 'KR7005930003' },
  { label: 'Invalid Checksum Sample', value: 'US0378331006' },
]);

/**
 * Converts alphanumeric characters to digit strings per ISO 6166:
 * Letters A–Z map to values 10–35; numeric characters remain unchanged.
 *
 * @param {string} char Single character to convert.
 * @returns {string} String of digits.
 */
export function charToDigits(char) {
  const code = char.charCodeAt(0);
  // 'A' is 65, so 65 - 55 = 10; 'Z' is 90, so 90 - 55 = 35.
  if (code >= 65 && code <= 90) {
    return String(code - 55);
  }
  return char;
}

/**
 * Expands a string of uppercase letters and digits into a contiguous sequence of digits.
 *
 * @param {string} text Text consisting of uppercase letters and digits.
 * @returns {string} Converted string containing only numeric digits.
 */
export function expandToDigits(text) {
  let result = '';
  for (let i = 0; i < text.length; i += 1) {
    result += charToDigits(text[i]);
  }
  return result;
}

/**
 * Calculates the expected ISO 6166 check digit for the first 11 characters of an ISIN.
 * Uses the Luhn mod-10 algorithm with alternating weights 2 and 1 from right to left.
 *
 * @param {string} isin11 The first 11 characters of an ISIN (2 country + 9 NSIN).
 * @returns {number} The calculated single-digit check digit (0–9).
 */
export function calculateCheckDigit(isin11) {
  const digits = expandToDigits(isin11);
  let sum = 0;
  let doubleNext = true; // The digit directly preceding check digit is multiplied by 2

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = parseInt(digits[i], 10);
    if (doubleNext) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    doubleNext = !doubleNext;
  }

  return (10 - (sum % 10)) % 10;
}

/**
 * @typedef {Object} IsinValidationResult
 * @property {boolean} isValid True if the ISIN is completely valid.
 * @property {'empty' | 'length' | 'format' | 'checksum' | null} errorType Error category if invalid.
 * @property {string | null} errorMessage Human-readable description of error.
 * @property {string | null} countryCode Extracted 2-letter country code.
 * @property {string | null} nsin Extracted 9-character NSIN.
 * @property {number | null} checkDigit Actual check digit provided.
 * @property {number | null} expectedCheckDigit Calculated check digit.
 * @property {string | null} digits Converted digit sequence used for Luhn check.
 */

/**
 * Validates an ISIN string for structural compliance and checksum accuracy.
 *
 * @param {string} rawInput The raw ISIN input to validate.
 * @returns {IsinValidationResult} Comprehensive validation outcome.
 */
export function validateIsin(rawInput) {
  if (typeof rawInput !== 'string') {
    return {
      isValid: false,
      errorType: 'format',
      errorMessage: 'Input must be a string.',
      countryCode: null,
      nsin: null,
      checkDigit: null,
      expectedCheckDigit: null,
      digits: null,
    };
  }

  const isin = rawInput.trim();

  if (isin.length === 0) {
    return {
      isValid: false,
      errorType: 'empty',
      errorMessage: 'Please enter an ISIN.',
      countryCode: null,
      nsin: null,
      checkDigit: null,
      expectedCheckDigit: null,
      digits: null,
    };
  }

  // Structural Check 1: Length must be exactly 12 characters.
  if (isin.length !== 12) {
    return {
      isValid: false,
      errorType: 'length',
      errorMessage: `Invalid length: ISIN must be exactly 12 characters (received ${isin.length}).`,
      countryCode: null,
      nsin: null,
      checkDigit: null,
      expectedCheckDigit: null,
      digits: null,
    };
  }

  const countryCode = isin.slice(0, 2);
  const nsin = isin.slice(2, 11);
  const checkDigitStr = isin[11];

  // Structural Check 2: First 2 chars must be uppercase letters (country code).
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return {
      isValid: false,
      errorType: 'format',
      errorMessage:
        'Invalid format: First 2 characters must be uppercase letters (ISO country code).',
      countryCode: /^[A-Za-z]{2}$/.test(countryCode) ? countryCode.toUpperCase() : null,
      nsin: null,
      checkDigit: null,
      expectedCheckDigit: null,
      digits: null,
    };
  }

  // Structural Check 3: Chars 3–11 must be uppercase alphanumeric (NSIN).
  if (!/^[A-Z0-9]{9}$/.test(nsin)) {
    return {
      isValid: false,
      errorType: 'format',
      errorMessage:
        'Invalid format: Characters 3–11 must be uppercase alphanumeric characters (NSIN).',
      countryCode,
      nsin: null,
      checkDigit: null,
      expectedCheckDigit: null,
      digits: null,
    };
  }

  // Structural Check 4: Char 12 must be a numeric digit.
  if (!/^[0-9]$/.test(checkDigitStr)) {
    return {
      isValid: false,
      errorType: 'format',
      errorMessage: 'Invalid format: Character 12 must be a numeric check digit (0–9).',
      countryCode,
      nsin,
      checkDigit: null,
      expectedCheckDigit: null,
      digits: null,
    };
  }

  const actualCheckDigit = parseInt(checkDigitStr, 10);
  const expectedCheckDigit = calculateCheckDigit(isin.slice(0, 11));
  const fullDigits = expandToDigits(isin);

  // Checksum Check: Luhn mod-10 verification.
  if (actualCheckDigit !== expectedCheckDigit) {
    return {
      isValid: false,
      errorType: 'checksum',
      errorMessage:
        `Checksum mismatch: Expected check digit ${expectedCheckDigit}, ` +
        `but got ${actualCheckDigit}.`,
      countryCode,
      nsin,
      checkDigit: actualCheckDigit,
      expectedCheckDigit,
      digits: fullDigits,
    };
  }

  return {
    isValid: true,
    errorType: null,
    errorMessage: null,
    countryCode,
    nsin,
    checkDigit: actualCheckDigit,
    expectedCheckDigit,
    digits: fullDigits,
  };
}
