const ISBN_10_PATTERN = /^\d{9}[\dX]$/;
const ISBN_13_PATTERN = /^\d{13}$/;

function invalidResult(error, isbn = '') {
  return { isValid: false, isbn, standard: '', error };
}

/**
 * Normalizes an ISBN by removing spaces and hyphens and uppercasing a possible X check digit.
 * @param {string} rawInput The ISBN supplied by the user.
 * @returns {{isbn: string, error: string}} The normalized ISBN or a user-facing error.
 */
export function normalizeIsbn(rawInput) {
  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    return { isbn: '', error: 'Enter an ISBN to validate.' };
  }
  const isbn = rawInput.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[0-9X]+$/.test(isbn)) {
    return {
      isbn: '',
      error: 'An ISBN may contain only digits, spaces, hyphens, and a final X check digit.',
    };
  }
  return { isbn, error: '' };
}

/**
 * Tests whether a normalized ISBN-10 has a valid ISO 2108 MOD-11 check digit.
 * @param {string} isbn A normalized 10-character ISBN.
 * @returns {boolean} Whether the MOD-11 checksum is valid.
 */
export function isIsbn10ChecksumValid(isbn) {
  if (!ISBN_10_PATTERN.test(isbn)) return false;
  const sum = [...isbn].reduce((total, character, index) => {
    const digit = character === 'X' ? 10 : Number(character);
    return total + digit * (10 - index);
  }, 0);
  return sum % 11 === 0;
}

/**
 * Tests whether a normalized ISBN-13 has a valid GS1 MOD-10 check digit.
 * @param {string} isbn A normalized 13-digit ISBN.
 * @returns {boolean} Whether the MOD-10 checksum is valid.
 */
export function isIsbn13ChecksumValid(isbn) {
  if (!ISBN_13_PATTERN.test(isbn)) return false;
  const sum = [...isbn].reduce(
    (total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return sum % 10 === 0;
}

/**
 * Computes a GS1 MOD-10 check digit for an ISBN-13 body of 12 digits.
 * @param {string} isbnBody The first 12 ISBN-13 digits.
 * @returns {string} The final ISBN-13 check digit, or an empty string for malformed input.
 */
export function computeIsbn13CheckDigit(isbnBody) {
  if (!/^\d{12}$/.test(isbnBody)) return '';
  const sum = [...isbnBody].reduce(
    (total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return String((10 - (sum % 10)) % 10);
}

/**
 * Computes a MOD-11 check digit for an ISBN-10 body of nine digits.
 * @param {string} isbnBody The first nine ISBN-10 digits.
 * @returns {string} The final ISBN-10 check digit (including X for ten), or an empty string.
 */
export function computeIsbn10CheckDigit(isbnBody) {
  if (!/^\d{9}$/.test(isbnBody)) return '';
  const sum = [...isbnBody].reduce(
    (total, character, index) => total + Number(character) * (10 - index),
    0,
  );
  const checkValue = (11 - (sum % 11)) % 11;
  return checkValue === 10 ? 'X' : String(checkValue);
}

/**
 * Validates an ISBN-10 or ISBN-13 identifier using its applicable ISO 2108 checksum rule.
 * @param {string} rawInput The ISBN supplied by the user.
 * @returns {{isValid: boolean, isbn: string, standard: string, error: string}} Validation result.
 */
export function validateIsbn(rawInput) {
  const normalized = normalizeIsbn(rawInput);
  if (normalized.error) return invalidResult(normalized.error);
  const { isbn } = normalized;
  if (isbn.length !== 10 && isbn.length !== 13) {
    return invalidResult(
      'An ISBN must contain exactly 10 or 13 characters after normalization.',
      isbn,
    );
  }
  if (isbn.length === 10) {
    if (!ISBN_10_PATTERN.test(isbn)) {
      return invalidResult('ISBN-10 uses nine digits followed by a digit or X check digit.', isbn);
    }
    if (!isIsbn10ChecksumValid(isbn)) {
      return invalidResult('The ISBN-10 MOD-11 check digit is invalid.', isbn);
    }
    return { isValid: true, isbn, standard: 'ISBN-10', error: '' };
  }
  if (!ISBN_13_PATTERN.test(isbn)) {
    return invalidResult('ISBN-13 must contain digits only; X is valid only for ISBN-10.', isbn);
  }
  if (!isbn.startsWith('978') && !isbn.startsWith('979')) {
    return invalidResult('ISBN-13 must begin with the 978 or 979 GS1 prefix.', isbn);
  }
  if (!isIsbn13ChecksumValid(isbn)) {
    return invalidResult('The ISBN-13 GS1 MOD-10 check digit is invalid.', isbn);
  }
  return { isValid: true, isbn, standard: 'ISBN-13', error: '' };
}

/**
 * Converts a valid ISBN-10 to its 978-prefixed ISBN-13 equivalent.
 * @param {string} rawInput The ISBN-10 supplied by the user.
 * @returns {{isValid: boolean, isbn: string, standard: string, convertedIsbn: string,
 *   error: string}}
 *   Conversion result or a user-facing error.
 */
export function convertIsbn10To13(rawInput) {
  const validation = validateIsbn(rawInput);
  if (!validation.isValid) return { ...validation, convertedIsbn: '' };
  if (validation.standard !== 'ISBN-10') {
    return {
      ...invalidResult('Enter a valid ISBN-10 to convert to ISBN-13.'),
      convertedIsbn: '',
    };
  }
  const isbnBody = `978${validation.isbn.slice(0, 9)}`;
  return {
    isValid: true,
    isbn: validation.isbn,
    standard: 'ISBN-13',
    convertedIsbn: `${isbnBody}${computeIsbn13CheckDigit(isbnBody)}`,
    error: '',
  };
}

/**
 * Converts a valid 978-prefixed ISBN-13 to its ISBN-10 equivalent.
 * @param {string} rawInput The ISBN-13 supplied by the user.
 * @returns {{isValid: boolean, isbn: string, standard: string, convertedIsbn: string,
 *   error: string}}
 *   Conversion result or a user-facing error.
 */
export function convertIsbn13To10(rawInput) {
  const validation = validateIsbn(rawInput);
  if (!validation.isValid) return { ...validation, convertedIsbn: '' };
  if (validation.standard !== 'ISBN-13') {
    return { ...invalidResult('Enter a valid ISBN-13 to convert to ISBN-10.'), convertedIsbn: '' };
  }
  if (validation.isbn.startsWith('979')) {
    return {
      ...invalidResult('ISBN-13 identifiers beginning with 979 have no ISBN-10 equivalent.'),
      isbn: validation.isbn,
      convertedIsbn: '',
    };
  }
  const isbnBody = validation.isbn.slice(3, 12);
  return {
    isValid: true,
    isbn: validation.isbn,
    standard: 'ISBN-10',
    convertedIsbn: `${isbnBody}${computeIsbn10CheckDigit(isbnBody)}`,
    error: '',
  };
}
