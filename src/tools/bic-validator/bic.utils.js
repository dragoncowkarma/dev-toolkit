const BIC_PATTERN = /^([A-Z]{4})([A-Z]{2})([A-Z0-9]{2})([A-Z0-9]{3})?$/;

const ISO_COUNTRY_CODES = new Set(
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL
  BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV
  CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE
  GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO
  IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT
  LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA
  NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA
  RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC
  TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN
  VU WF WS YE YT ZA ZM ZW`
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Normalizes a BIC entered by a user without accepting internal whitespace.
 *
 * @param {string} value Raw BIC input.
 * @returns {string} Trimmed, uppercase BIC input.
 */
export function normalizeBic(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

/**
 * Parses and validates an ISO 9362 BIC/SWIFT code.
 *
 * @param {string} value Raw BIC input.
 * @returns {{valid: boolean, value: string, error?: string, bankCode?: string,
 * countryCode?: string, locationCode?: string, branchCode?: string}}
 */
export function parseBic(value) {
  if (typeof value !== 'string') {
    return { valid: false, value: '', error: 'Enter a BIC/SWIFT code.' };
  }

  const normalized = normalizeBic(value);
  if (normalized.length !== 8 && normalized.length !== 11) {
    return {
      valid: false,
      value: normalized,
      error: 'A BIC/SWIFT code must contain exactly 8 or 11 characters.',
    };
  }

  const match = normalized.match(BIC_PATTERN);
  if (!match) {
    return {
      valid: false,
      value: normalized,
      error: 'Use four letters, a valid country code, and alphanumeric location and branch codes.',
    };
  }

  const [, bankCode, countryCode, locationCode, explicitBranchCode] = match;
  if (!ISO_COUNTRY_CODES.has(countryCode)) {
    return {
      valid: false,
      value: normalized,
      error: `“${countryCode}” is not a valid ISO 3166-1 alpha-2 country code.`,
    };
  }

  return {
    valid: true,
    value: normalized,
    bankCode,
    countryCode,
    locationCode,
    branchCode: explicitBranchCode ?? 'XXX',
  };
}

/**
 * Determines whether a value is a valid ISO 9362 BIC/SWIFT code.
 *
 * @param {string} value Raw BIC input.
 * @returns {boolean} Whether the BIC is valid.
 */
export function isValidBic(value) {
  return parseBic(value).valid;
}
