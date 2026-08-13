/**
 * Card network identification rules keyed by IIN/BIN prefix ranges. Each entry tests the
 * leading digits of a normalized card number against a documented issuer range. Order is
 * significant only in that the first match wins; the ranges below do not overlap.
 */
const NETWORK_RULES = Object.freeze([
  { network: 'Visa', test: (digits) => digits.startsWith('4') },
  {
    network: 'Mastercard',
    test: (digits) => isPrefixInRange(digits, 2, 51, 55) || isPrefixInRange(digits, 4, 2221, 2720),
  },
  {
    network: 'American Express',
    test: (digits) => isPrefixInRange(digits, 2, 34, 34) || isPrefixInRange(digits, 2, 37, 37),
  },
  {
    network: 'Discover',
    test: (digits) => digits.startsWith('6011') || digits.startsWith('65'),
  },
  { network: 'JCB', test: (digits) => isPrefixInRange(digits, 4, 3528, 3589) },
]);

const MIN_DIGIT_COUNT = 8;
const MAX_DIGIT_COUNT = 19;
const DIGITS_ONLY_PATTERN = /^[0-9]+$/;

function isPrefixInRange(digits, prefixLength, rangeStart, rangeEnd) {
  if (digits.length < prefixLength) return false;
  const prefix = Number(digits.slice(0, prefixLength));
  return prefix >= rangeStart && prefix <= rangeEnd;
}

function invalidResult(error) {
  return {
    isValid: false,
    digits: '',
    formattedNumber: '',
    network: null,
    digitCount: 0,
    lastFour: '',
    error,
  };
}

/**
 * Normalizes card number input by stripping the conventional group separators (spaces and
 * hyphens) used when card numbers are printed or typed in groups of four.
 * @param {string} rawInput The raw card number supplied by the user.
 * @returns {{digits: string, error: string}} The normalized digit string, or a user-facing
 *   error describing why normalization failed.
 */
export function normalizeCardNumber(rawInput) {
  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    return { digits: '', error: 'Enter a card number to validate.' };
  }

  const digits = rawInput.replaceAll(' ', '').replaceAll('-', '');
  if (!DIGITS_ONLY_PATTERN.test(digits)) {
    return {
      digits: '',
      error: 'A card number may contain only digits, spaces, and hyphens.',
    };
  }

  return { digits, error: '' };
}

/**
 * Validates that a normalized digit string falls within the practical ISO/IEC 7812 PAN
 * length range.
 * @param {string} digits A normalized, digits-only card number.
 * @returns {string} An empty string when the length is valid, otherwise a user-facing error.
 */
export function validateLength(digits) {
  if (digits.length < MIN_DIGIT_COUNT) {
    return `A card number must contain at least ${MIN_DIGIT_COUNT} digits; `
      + `received ${digits.length}.`;
  }

  if (digits.length > MAX_DIGIT_COUNT) {
    return `A card number must contain at most ${MAX_DIGIT_COUNT} digits; `
      + `received ${digits.length}.`;
  }

  return '';
}

/**
 * Verifies a digit string against the Luhn algorithm (ISO/IEC 7812-1 mod-10 double-add-double):
 * starting from the rightmost digit, every second digit is doubled, and any doubled result over
 * 9 has 9 subtracted from it, before summing every digit and checking the total is a multiple
 * of 10.
 * @param {string} digits A normalized, digits-only card number, including its check digit.
 * @returns {boolean} `true` when the digit string satisfies the Luhn checksum.
 */
export function isLuhnValid(digits) {
  let sum = 0;

  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  return sum % 10 === 0;
}

/**
 * Computes the Luhn check digit that must be appended to a partial digit string (a card
 * number with its final digit omitted) to satisfy the Luhn checksum. This runs the same
 * double-add-double algorithm in reverse: the digit adjacent to the (not-yet-known) check
 * digit is doubled first, since the check digit itself is never doubled.
 * @param {string} partialDigits A normalized, digits-only card number with the last digit
 *   omitted.
 * @returns {number} The check digit (0-9) that completes a Luhn-valid card number.
 */
export function computeLuhnCheckDigit(partialDigits) {
  let sum = 0;

  for (let index = 0; index < partialDigits.length; index += 1) {
    let digit = Number(partialDigits[partialDigits.length - 1 - index]);
    const positionFromRight = index + 1;
    if (positionFromRight % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  return (10 - (sum % 10)) % 10;
}

/**
 * Detects the card network from the leading digits (IIN/BIN range) of a normalized card
 * number.
 * @param {string} digits A normalized, digits-only card number.
 * @returns {string|null} The detected network name, or `null` when no known range matches.
 */
export function detectNetwork(digits) {
  const rule = NETWORK_RULES.find(({ test }) => test(digits));
  return rule ? rule.network : null;
}

/**
 * Formats a digit string in the conventional group layout for its network: 4-6-5 for American
 * Express, and 4-4-4-4(-...) for every other network.
 * @param {string} digits A normalized, digits-only card number.
 * @param {string|null} network The detected network, as returned by `detectNetwork`.
 * @returns {string} The digits re-rendered with single-space group separators.
 */
export function formatCardNumber(digits, network) {
  if (network === 'American Express') {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10)]
      .filter(Boolean)
      .join(' ');
  }

  return digits.match(/.{1,4}/g)?.join(' ') ?? '';
}

/**
 * Normalizes, length-checks, Luhn-validates, and formats a card number, and detects its
 * network. Rejects malformed input with a controlled, user-facing message instead of
 * throwing.
 * @param {string} rawInput The raw card number supplied by the user.
 * @returns {{isValid: boolean, digits: string, formattedNumber: string, network: string|null,
 *   digitCount: number, lastFour: string, error: string}} Validation details or a user-facing
 *   error.
 */
export function validateCard(rawInput) {
  const normalized = normalizeCardNumber(rawInput);
  if (normalized.error) return invalidResult(normalized.error);

  const { digits } = normalized;
  const lengthError = validateLength(digits);
  if (lengthError) return invalidResult(lengthError);

  if (!isLuhnValid(digits)) {
    return invalidResult('The card number failed the Luhn (ISO/IEC 7812-1) checksum.');
  }

  const network = detectNetwork(digits);
  return {
    isValid: true,
    digits,
    formattedNumber: formatCardNumber(digits, network),
    network,
    digitCount: digits.length,
    lastFour: digits.slice(-4),
    error: '',
  };
}

/**
 * Computes the Luhn check digit for a partial card number (a card number with its final digit
 * omitted) and returns the resulting full, checksum-valid number. Useful for constructing
 * test fixtures.
 * @param {string} rawPartialInput The raw partial card number, with the final digit omitted.
 * @returns {{isValid: boolean, digits: string, checkDigit: string, fullNumber: string,
 *   formattedNumber: string, network: string|null, error: string}} Computation details or a
 *   user-facing error.
 */
export function computeCheckDigit(rawPartialInput) {
  const normalized = normalizeCardNumber(rawPartialInput);
  if (normalized.error) {
    return {
      isValid: false,
      digits: '',
      checkDigit: '',
      fullNumber: '',
      formattedNumber: '',
      network: null,
      error: normalized.error,
    };
  }

  const { digits } = normalized;
  const lengthError = validateLength(`${digits}0`);
  if (lengthError) {
    return {
      isValid: false,
      digits: '',
      checkDigit: '',
      fullNumber: '',
      formattedNumber: '',
      network: null,
      error: lengthError,
    };
  }

  const checkDigit = computeLuhnCheckDigit(digits);
  const fullNumber = `${digits}${checkDigit}`;
  const network = detectNetwork(fullNumber);
  return {
    isValid: true,
    digits,
    checkDigit: String(checkDigit),
    fullNumber,
    formattedNumber: formatCardNumber(fullNumber, network),
    network,
    error: '',
  };
}
