export const IDENTIFIER_TYPES = {
  IMEI: 'imei',
  IMEI_WITHOUT_CHECK_DIGIT: 'imei-without-check-digit',
  IMEISV: 'imeisv',
  INVALID: 'invalid',
};

/**
 * Removes spaces and hyphens from an IMEI or IMEISV value.
 *
 * @param {string} value - The value to normalize.
 * @returns {string} The value without supported separators.
 */
export function normalizeIdentifier(value) {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
}

/**
 * Determines the identifier format from its normalized length.
 *
 * @param {string} value - An IMEI or IMEISV value, with optional separators.
 * @returns {string} One of the IDENTIFIER_TYPES values.
 */
export function detectIdentifierType(value) {
  const normalized = normalizeIdentifier(value);
  if (!/^\d+$/.test(normalized)) return IDENTIFIER_TYPES.INVALID;
  if (normalized.length === 14) return IDENTIFIER_TYPES.IMEI_WITHOUT_CHECK_DIGIT;
  if (normalized.length === 15) return IDENTIFIER_TYPES.IMEI;
  if (normalized.length === 16) return IDENTIFIER_TYPES.IMEISV;
  return IDENTIFIER_TYPES.INVALID;
}

/**
 * Computes an IMEI Luhn check digit for a 14-digit TAC and serial number.
 *
 * @param {string} imeiWithoutCheckDigit - Fourteen digits: TAC followed by SNR.
 * @returns {string|null} The computed check digit, or null for an invalid value.
 */
export function computeLuhnCheckDigit(imeiWithoutCheckDigit) {
  if (!/^\d{14}$/.test(imeiWithoutCheckDigit)) return null;

  let sum = 0;
  for (let index = 0; index < imeiWithoutCheckDigit.length; index += 1) {
    let digit = Number(imeiWithoutCheckDigit[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Validates the Luhn check digit of a 15-digit IMEI.
 *
 * @param {string} imei - A complete 15-digit IMEI.
 * @returns {boolean} Whether the supplied check digit is valid.
 */
export function isValidImei(imei) {
  return (
    /^\d{15}$/.test(imei) &&
    computeLuhnCheckDigit(imei.slice(0, 14)) === imei.slice(14)
  );
}

/**
 * Parses a valid IMEI or IMEISV into its structural components.
 *
 * @param {string} value - An identifier with optional spaces or hyphens.
 * @returns {{type: string, normalized: string, tac: string, snr: string, checkDigit: string|null,
 *   svn: string|null, fullImei: string|null, isValid: boolean}|null}
 *   Parsed data, or null when invalid.
 */
export function parseIdentifier(value) {
  const normalized = normalizeIdentifier(value);
  const type = detectIdentifierType(normalized);
  if (type === IDENTIFIER_TYPES.INVALID) return null;

  const tac = normalized.slice(0, 8);
  const snr = normalized.slice(8, 14);
  if (type === IDENTIFIER_TYPES.IMEI_WITHOUT_CHECK_DIGIT) {
    const checkDigit = computeLuhnCheckDigit(normalized);
    return {
      type,
      normalized,
      tac,
      snr,
      checkDigit,
      svn: null,
      fullImei: `${normalized}${checkDigit}`,
      isValid: true,
    };
  }

  if (type === IDENTIFIER_TYPES.IMEI) {
    const checkDigit = normalized.slice(14);
    return {
      type,
      normalized,
      tac,
      snr,
      checkDigit,
      svn: null,
      fullImei: normalized,
      isValid: isValidImei(normalized),
    };
  }

  return {
    type,
    normalized,
    tac,
    snr,
    checkDigit: null,
    svn: normalized.slice(14, 16),
    fullImei: null,
    isValid: true,
  };
}
