const BASE_CHARACTER_PATTERN = /^[0-9A-Z*@#]{8}$/;
const CHECK_DIGIT_PATTERN = /^\d$/;

/**
 * Converts one permitted CUSIP base character to its checksum value.
 * @param {string} character
 * @returns {number}
 */
export function getCusipCharacterValue(character) {
  if (/^\d$/.test(character)) return Number(character);
  if (/^[A-Z]$/.test(character)) return character.charCodeAt(0) - 55;
  return { '*': 36, '@': 37, '#': 38 }[character];
}

/**
 * Calculates the CUSIP check digit for an eight-character base identifier.
 * @param {string} base - The eight-character CUSIP issuer and issue code.
 * @returns {number} The calculated checksum digit.
 * @throws {TypeError} When the base is not an eight-character CUSIP base.
 */
export function calculateCusipCheckDigit(base) {
  if (typeof base !== 'string' || !BASE_CHARACTER_PATTERN.test(base)) {
    throw new TypeError('CUSIP base must contain eight valid characters.');
  }

  const total = [...base].reduce((sum, character, index) => {
    const weightedValue = getCusipCharacterValue(character) * (index % 2 === 1 ? 2 : 1);
    return sum + Math.floor(weightedValue / 10) + (weightedValue % 10);
  }, 0);

  return (10 - (total % 10)) % 10;
}

/**
 * Validates a nine-character US or Canadian CUSIP identifier.
 * @param {string} value
 * @returns {{ isValid: boolean, error: 'wrong-length' | 'invalid-character' |
 *   'checksum-mismatch' | null }}
 */
export function validateCusip(value) {
  if (typeof value !== 'string' || value.length !== 9) {
    return { isValid: false, error: 'wrong-length' };
  }

  const base = value.slice(0, 8);
  const checkDigit = value.slice(8);
  if (!BASE_CHARACTER_PATTERN.test(base) || !CHECK_DIGIT_PATTERN.test(checkDigit)) {
    return { isValid: false, error: 'invalid-character' };
  }

  return calculateCusipCheckDigit(base) === Number(checkDigit)
    ? { isValid: true, error: null }
    : { isValid: false, error: 'checksum-mismatch' };
}
