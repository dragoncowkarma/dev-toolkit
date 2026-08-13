/**
 * IBAN Registry country codes and their required total IBAN lengths. The table covers the
 * SEPA area plus other countries currently assigned an IBAN format by the IBAN Registry.
 */
export const IBAN_COUNTRY_LENGTHS = Object.freeze({
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27,
  BJ: 28, BR: 29, BF: 27, CV: 25, CM: 27, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18,
  DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GA: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IS: 26, IQ: 23, IE: 22, IL: 23, IT: 27,
  CI: 28, JO: 30, KZ: 20, XK: 20, KW: 30, LV: 21, LB: 28, LI: 21, LT: 20, LU: 20,
  MG: 27, ML: 28, MT: 31, MR: 27, MU: 30, MD: 24, MC: 27, ME: 22, MZ: 25, NL: 18,
  MK: 19, NO: 15, PK: 24, PS: 29, PL: 28, PT: 25, QA: 29, RO: 24, SM: 27, SA: 24,
  RS: 22, SC: 31, SK: 24, SI: 19, SE: 24, CH: 21, TL: 23, TN: 24, TR: 26, UA: 29,
  VA: 22, VG: 24,
});

const ALPHANUMERIC_PATTERN = /^[A-Z0-9]+$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const CHECK_DIGIT_PATTERN = /^\d{2}$/;

function invalidResult(error, iban = '') {
  return {
    isValid: false,
    iban,
    formattedIban: '',
    countryCode: '',
    checkDigits: '',
    bban: '',
    error,
  };
}

function characterToNumericString(character) {
  return /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
}

/**
 * Normalizes an IBAN by uppercasing it and removing conventional space separators.
 * @param {string} rawInput The IBAN supplied by the user.
 * @returns {{iban: string, error: string}} The normalized value or a user-facing error.
 */
export function normalizeIban(rawInput) {
  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    return { iban: '', error: 'Enter an IBAN to validate.' };
  }

  const iban = rawInput.toUpperCase().replaceAll(' ', '');
  if (!ALPHANUMERIC_PATTERN.test(iban)) {
    return {
      iban: '',
      error: 'An IBAN may contain only letters, numbers, and space separators.',
    };
  }

  return { iban, error: '' };
}

/**
 * Computes the MOD-97 remainder for an alphanumeric value without creating an unsafe Number.
 * Every converted numeric digit is processed as a bounded chunk, so arbitrarily long BBANs
 * remain safe without BigInt.
 * @param {string} value An uppercase alphanumeric string.
 * @returns {number} The value modulo 97.
 */
export function computeMod97(value) {
  let remainder = 0;

  for (const character of value) {
    const numericString = characterToNumericString(character);
    for (const digit of numericString) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder;
}

/**
 * Formats an IBAN as conventional groups of four characters.
 * @param {string} iban A normalized, validated IBAN.
 * @returns {string} The IBAN formatted with single spaces between groups.
 */
export function formatIban(iban) {
  return iban.match(/.{1,4}/g)?.join(' ') ?? '';
}

/**
 * Validates an IBAN's structure, registered country length, and ISO 7064 MOD-97-10 checksum.
 * @param {string} rawInput The IBAN supplied by the user.
 * @returns {{isValid: boolean, iban: string, formattedIban: string, countryCode: string,
 *   checkDigits: string, bban: string, error: string}} Validation details or a user-facing error.
 */
export function validateIban(rawInput) {
  const normalized = normalizeIban(rawInput);
  if (normalized.error) return invalidResult(normalized.error);

  const { iban } = normalized;
  if (iban.length < 4) {
    return invalidResult(
      'An IBAN must contain at least a country code and two check digits.',
      iban,
    );
  }

  const countryCode = iban.slice(0, 2);
  if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
    return invalidResult('An IBAN must begin with a two-letter country code.', iban);
  }

  if (!Object.hasOwn(IBAN_COUNTRY_LENGTHS, countryCode)) {
    return invalidResult(`Unsupported or unrecognized IBAN country code: ${countryCode}.`, iban);
  }

  const checkDigits = iban.slice(2, 4);
  if (!CHECK_DIGIT_PATTERN.test(checkDigits)) {
    return invalidResult('IBAN characters 3 and 4 must be two numeric check digits.', iban);
  }

  const expectedLength = IBAN_COUNTRY_LENGTHS[countryCode];
  if (iban.length !== expectedLength) {
    return invalidResult(
      `${countryCode} IBANs must contain exactly ${expectedLength} characters; `
        + `received ${iban.length}.`,
      iban,
    );
  }

  if (computeMod97(`${iban.slice(4)}${iban.slice(0, 4)}`) !== 1) {
    return invalidResult('The IBAN checksum failed the ISO 13616 MOD-97 validation.', iban);
  }

  return {
    isValid: true,
    iban,
    formattedIban: formatIban(iban),
    countryCode,
    checkDigits,
    bban: iban.slice(4),
    error: '',
  };
}

/**
 * Constructs a checksum-valid IBAN from a registered country code and BBAN.
 * @param {string} rawCountryCode The two-letter country code.
 * @param {string} rawBban The country-specific basic bank account number.
 * @returns {{isValid: boolean, iban: string, formattedIban: string, countryCode: string,
 *   checkDigits: string, bban: string, error: string}} Construction details or a user-facing error.
 */
export function constructIban(rawCountryCode, rawBban) {
  const countryCode = typeof rawCountryCode === 'string'
    ? rawCountryCode.trim().toUpperCase()
    : '';
  const bban = typeof rawBban === 'string' ? rawBban.toUpperCase().replaceAll(' ', '') : '';

  if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
    return invalidResult('Enter a two-letter IBAN country code.');
  }

  if (!Object.hasOwn(IBAN_COUNTRY_LENGTHS, countryCode)) {
    return invalidResult(`Unsupported or unrecognized IBAN country code: ${countryCode}.`);
  }

  if (!bban) {
    return invalidResult('Enter a BBAN to calculate IBAN check digits.');
  }

  if (!ALPHANUMERIC_PATTERN.test(bban)) {
    return invalidResult('A BBAN may contain only letters, numbers, and space separators.');
  }

  const expectedBbanLength = IBAN_COUNTRY_LENGTHS[countryCode] - 4;
  if (bban.length !== expectedBbanLength) {
    return invalidResult(
      `${countryCode} requires a ${expectedBbanLength}-character BBAN; received ${bban.length}.`,
    );
  }

  const checkDigits = String(98 - computeMod97(`${bban}${countryCode}00`)).padStart(2, '0');
  const iban = `${countryCode}${checkDigits}${bban}`;
  return {
    isValid: true,
    iban,
    formattedIban: formatIban(iban),
    countryCode,
    checkDigits,
    bban,
    error: '',
  };
}
