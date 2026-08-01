export const CASE_TYPES = {
  CAMEL: 'camel',
  PASCAL: 'pascal',
  SNAKE: 'snake',
  KEBAB: 'kebab',
  CONSTANT: 'constant',
  TITLE: 'title',
  LOWER: 'lower',
  UPPER: 'upper',
};

export const CASE_DEFINITIONS = [
  { id: CASE_TYPES.CAMEL, label: 'camelCase' },
  { id: CASE_TYPES.PASCAL, label: 'PascalCase' },
  { id: CASE_TYPES.SNAKE, label: 'snake_case' },
  { id: CASE_TYPES.KEBAB, label: 'kebab-case' },
  { id: CASE_TYPES.CONSTANT, label: 'CONSTANT_CASE' },
  { id: CASE_TYPES.TITLE, label: 'Title Case' },
  { id: CASE_TYPES.LOWER, label: 'lower case' },
  { id: CASE_TYPES.UPPER, label: 'UPPER CASE' },
];

function capitalize(word) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Splits a single line of text into words by recognizing common identifier
 * boundaries: whitespace, `-`/`_`/punctuation separators, camelCase
 * transitions, acronym runs (e.g. `XMLParser` → `XML`, `Parser`), and
 * letter/digit boundaries.
 *
 * @param {string} line A single line of text (no newlines).
 * @returns {string[]} The words found in the line, in original casing.
 */
export function splitIntoWords(line) {
  if (typeof line !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (line.trim() === '') return [];

  return line
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const CONVERTERS = {
  [CASE_TYPES.CAMEL]: (words) =>
    words.map((word, index) => (index === 0 ? word.toLowerCase() : capitalize(word))).join(''),
  [CASE_TYPES.PASCAL]: (words) => words.map(capitalize).join(''),
  [CASE_TYPES.SNAKE]: (words) => words.map((word) => word.toLowerCase()).join('_'),
  [CASE_TYPES.KEBAB]: (words) => words.map((word) => word.toLowerCase()).join('-'),
  [CASE_TYPES.CONSTANT]: (words) => words.map((word) => word.toUpperCase()).join('_'),
  [CASE_TYPES.TITLE]: (words) => words.map(capitalize).join(' '),
  [CASE_TYPES.LOWER]: (words) => words.map((word) => word.toLowerCase()).join(' '),
  [CASE_TYPES.UPPER]: (words) => words.map((word) => word.toUpperCase()).join(' '),
};

/**
 * Converts a single line of text to the given case convention.
 *
 * @param {string} line A single line of text (no newlines).
 * @param {string} caseType One of the {@link CASE_TYPES} values.
 * @returns {string} The converted line.
 */
export function convertLine(line, caseType) {
  const converter = CONVERTERS[caseType];
  if (!converter) {
    throw new TypeError(`Unsupported case type: ${caseType}`);
  }

  const words = splitIntoWords(line);
  if (words.length === 0) return '';

  return converter(words);
}

/**
 * Converts multi-line text to the given case convention, converting each
 * line independently and preserving the line structure.
 *
 * @param {string} text Text to convert, may contain multiple lines.
 * @param {string} caseType One of the {@link CASE_TYPES} values.
 * @returns {string} The converted text.
 */
export function convertText(text, caseType) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }

  return text
    .split(/\r\n|\r|\n/)
    .map((line) => convertLine(line, caseType))
    .join('\n');
}

/**
 * Converts text to every supported case convention at once.
 *
 * @param {string} text Text to convert, may contain multiple lines.
 * @returns {Record<string, string>} Map of case type id to converted text.
 */
export function convertToAllCases(text) {
  return CASE_DEFINITIONS.reduce((result, { id }) => {
    result[id] = convertText(text, id);
    return result;
  }, {});
}
