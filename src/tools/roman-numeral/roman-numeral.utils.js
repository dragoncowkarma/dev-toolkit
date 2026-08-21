const ROMAN_VALUES = [
  ['M', 1000],
  ['CM', 900],
  ['D', 500],
  ['CD', 400],
  ['C', 100],
  ['XC', 90],
  ['L', 50],
  ['XL', 40],
  ['X', 10],
  ['IX', 9],
  ['V', 5],
  ['IV', 4],
  ['I', 1],
];

const ROMAN_CHARACTER_VALUES = Object.fromEntries(
  ROMAN_VALUES.filter(([symbol]) => symbol.length === 1),
);
const CANONICAL_ROMAN_PATTERN =
  /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/**
 * Converts an integer from 1 through 3999 to standard subtractive Roman notation.
 *
 * @param {number} number Arabic integer to convert.
 * @returns {string|null} Canonical Roman numeral, or null for an invalid input.
 */
export function toRoman(number) {
  if (!Number.isInteger(number) || number < 1 || number > 3999) return null;

  let remaining = number;
  let roman = '';

  ROMAN_VALUES.forEach(([symbol, value]) => {
    while (remaining >= value) {
      roman += symbol;
      remaining -= value;
    }
  });

  return roman;
}

/**
 * Converts a standard Roman numeral to an integer from 1 through 3999.
 *
 * Input is case-insensitive and surrounding whitespace is ignored. Non-canonical
 * numerals, including invalid repeats and subtractive pairs, return null.
 *
 * @param {string} romanString Roman numeral to convert.
 * @returns {number|null} Arabic integer, or null when the string is malformed.
 */
export function fromRoman(romanString) {
  if (typeof romanString !== 'string') return null;

  const normalized = romanString.trim().toUpperCase();
  if (!normalized || !CANONICAL_ROMAN_PATTERN.test(normalized)) return null;

  let total = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const current = ROMAN_CHARACTER_VALUES[normalized[index]];
    const next = ROMAN_CHARACTER_VALUES[normalized[index + 1]] ?? 0;
    total += current < next ? -current : current;
  }

  return toRoman(total) === normalized ? total : null;
}
