const SEDOL_LENGTH = 7;
const SEDOL_BASE_PATTERN = /^[0-9B-DF-HJ-NP-TV-Z]{6}$/;
const SEDOL_CHECK_DIGIT_PATTERN = /^[0-9]$/;
const SEDOL_WEIGHTS = [1, 3, 1, 7, 3, 9];

const ERROR_MESSAGES = {
  length: 'A SEDOL must contain exactly 7 characters.',
  character: 'Use six uppercase consonants or digits followed by a checksum digit.',
  checksum: 'The checksum digit does not match this SEDOL.',
};

/**
 * Converts a valid SEDOL base character into its checksum value.
 *
 * @param {string} character - A digit or uppercase consonant.
 * @returns {number} The numeric checksum value.
 */
export function sedolCharacterValue(character) {
  if (/^[0-9]$/.test(character)) {
    return Number(character);
  }
  return character.charCodeAt(0) - 55;
}

/**
 * Calculates the SEDOL checksum digit for a six-character base.
 *
 * @param {string} base - Six uppercase consonants and/or digits.
 * @returns {number|null} The checksum digit, or null when the base is invalid.
 */
export function calculateSedolChecksum(base) {
  if (typeof base !== 'string' || !SEDOL_BASE_PATTERN.test(base)) {
    return null;
  }

  const sum = [...base].reduce(
    (total, character, index) => total + sedolCharacterValue(character) * SEDOL_WEIGHTS[index],
    0
  );
  return (10 - (sum % 10)) % 10;
}

/**
 * Validates a seven-character SEDOL identifier and classifies any failure.
 *
 * @param {string} value - The SEDOL candidate to validate.
 * @returns {{isValid: boolean, errorCode: string|null, errorMessage: string}}
 */
export function validateSedol(value) {
  if (typeof value !== 'string' || value.length !== SEDOL_LENGTH) {
    return { isValid: false, errorCode: 'length', errorMessage: ERROR_MESSAGES.length };
  }

  const base = value.slice(0, -1);
  const checkDigit = value.at(-1);
  if (!SEDOL_BASE_PATTERN.test(base) || !SEDOL_CHECK_DIGIT_PATTERN.test(checkDigit)) {
    return { isValid: false, errorCode: 'character', errorMessage: ERROR_MESSAGES.character };
  }

  if (calculateSedolChecksum(base) !== Number(checkDigit)) {
    return { isValid: false, errorCode: 'checksum', errorMessage: ERROR_MESSAGES.checksum };
  }

  return { isValid: true, errorCode: null, errorMessage: '' };
}
