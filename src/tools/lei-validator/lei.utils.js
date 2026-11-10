const LEI_LENGTH = 20;
const ALPHANUMERIC_PATTERN = /^[A-Z0-9]+$/;

/**
 * Calculates the ISO 7064 MOD 97-10 remainder for an alphanumeric value.
 *
 * @param {string} value - The value to evaluate.
 * @returns {number} The MOD 97 remainder.
 */
export function calculateMod97(value) {
  let remainder = 0;

  for (const character of value) {
    const digits = /[0-9]/.test(character)
      ? character
      : String(character.charCodeAt(0) - 55);
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder;
}

/**
 * Validates a Legal Entity Identifier according to ISO 17442 and MOD 97-10.
 *
 * @param {string} value - The LEI to validate.
 * @returns {{ isValid: boolean, error: string }} Validation result.
 */
export function validateLei(value) {
  if (typeof value !== 'string') {
    return { isValid: false, error: 'LEI must be a string.' };
  }

  if (value.length !== LEI_LENGTH) {
    return { isValid: false, error: 'An LEI must contain exactly 20 characters.' };
  }

  if (!ALPHANUMERIC_PATTERN.test(value)) {
    return { isValid: false, error: 'An LEI may contain only uppercase letters and digits.' };
  }

  // Unlike IBAN, an LEI stores its check digits at the end, so it is
  // evaluated in place after letters are expanded to their numeric values.
  if (calculateMod97(value) !== 1) {
    return { isValid: false, error: 'This LEI has an invalid MOD 97-10 check digit pair.' };
  }

  return { isValid: true, error: '' };
}
