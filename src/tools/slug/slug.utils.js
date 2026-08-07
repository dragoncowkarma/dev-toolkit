/**
 * Static dictionary mapping common accented and special Latin characters
 * to their closest ASCII equivalents.
 */
const DIACRITICS_MAP = {
  // Lowercase accented & special Latin characters
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'ā': 'a', 'ă': 'a', 'ą': 'a',
  'ǎ': 'a', 'ǟ': 'a', 'ǡ': 'a', 'ǻ': 'a', 'ȃ': 'a', 'ȁ': 'a',
  'æ': 'ae',
  'ß': 'ss',
  'ç': 'c', 'ć': 'c', 'ĉ': 'c', 'ċ': 'c', 'č': 'c',
  'đ': 'd', 'ď': 'd', 'ð': 'd',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ē': 'e', 'ĕ': 'e', 'ė': 'e', 'ę': 'e', 'ě': 'e',
  'ȅ': 'e', 'ȇ': 'e',
  'ĝ': 'g', 'ğ': 'g', 'ġ': 'g', 'ģ': 'g',
  'ĥ': 'h', 'ħ': 'h',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ĩ': 'i', 'ī': 'i', 'ĭ': 'i', 'į': 'i', 'ǐ': 'i',
  'ı': 'i', 'ȋ': 'i', 'ȉ': 'i',
  'ĳ': 'ij',
  'ĵ': 'j',
  'ķ': 'k', 'ĸ': 'k',
  'ĺ': 'l', 'ļ': 'l', 'ľ': 'l', 'ŀ': 'l', 'ł': 'l',
  'ñ': 'n', 'ń': 'n', 'ņ': 'n', 'ň': 'n', 'ŉ': 'n', 'ŋ': 'n',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o', 'ō': 'o', 'ŏ': 'o', 'ő': 'o',
  'ǒ': 'o', 'ȍ': 'o', 'ȏ': 'o',
  'œ': 'oe',
  'þ': 'th',
  'ŕ': 'r', 'ŗ': 'r', 'ř': 'r',
  'ś': 's', 'ŝ': 's', 'ş': 's', 'š': 's', 'ș': 's',
  'ť': 't', 'ţ': 't', 'ŧ': 't', 'ț': 't',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ũ': 'u', 'ū': 'u', 'ŭ': 'u', 'ů': 'u', 'ű': 'u',
  'ų': 'u', 'ǔ': 'u', 'ȕ': 'u', 'ȗ': 'u',
  'ŵ': 'w',
  'ý': 'y', 'ÿ': 'y', 'ŷ': 'y',
  'ź': 'z', 'ż': 'z', 'ž': 'z',

  // Uppercase accented & special Latin characters
  'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A', 'Ā': 'A', 'Ă': 'A', 'Ą': 'A',
  'Ǎ': 'A', 'Ǟ': 'A', 'Ǡ': 'A', 'Ǻ': 'A', 'Ȃ': 'A', 'Ȁ': 'A',
  'Æ': 'AE',
  'Ç': 'C', 'Ć': 'C', 'Ĉ': 'C', 'Ċ': 'C', 'Č': 'C',
  'Đ': 'D', 'Ď': 'D', 'Ð': 'D',
  'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E', 'Ē': 'E', 'Ĕ': 'E', 'Ė': 'E', 'Ę': 'E', 'Ě': 'E',
  'Ȅ': 'E', 'Ȇ': 'E',
  'Ĝ': 'G', 'Ğ': 'G', 'Ġ': 'G', 'Ģ': 'G',
  'Ĥ': 'H', 'Ħ': 'H',
  'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I', 'Ĩ': 'I', 'Ī': 'I', 'Ĭ': 'I', 'Į': 'I', 'Ǐ': 'I',
  'İ': 'I', 'Ȋ': 'I', 'Ȉ': 'I',
  'Ĳ': 'IJ',
  'Ĵ': 'J',
  'Ķ': 'K',
  'Ĺ': 'L', 'Ļ': 'L', 'Ľ': 'L', 'Ŀ': 'L', 'Ł': 'L',
  'Ñ': 'N', 'Ń': 'N', 'Ņ': 'N', 'Ň': 'N', 'Ŋ': 'N',
  'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O', 'Ō': 'O', 'Ŏ': 'O', 'Ő': 'O',
  'Ǒ': 'O', 'Ȍ': 'O', 'Ȏ': 'O',
  'Œ': 'OE',
  'Þ': 'TH',
  'Ŕ': 'R', 'Ŗ': 'R', 'Ř': 'R',
  'Ś': 'S', 'Ŝ': 'S', 'Ş': 'S', 'Š': 'S', 'Ș': 'S',
  'Ť': 'T', 'Ţ': 'T', 'Ŧ': 'T', 'Ț': 'T',
  'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U', 'Ũ': 'U', 'Ū': 'U', 'Ŭ': 'U', 'Ů': 'U', 'Ű': 'U',
  'Ų': 'U', 'Ǔ': 'U', 'Ȕ': 'U', 'Ȗ': 'U',
  'Ŵ': 'W',
  'Ý': 'Y', 'Ÿ': 'Y', 'Ŷ': 'Y',
  'Ź': 'Z', 'Ż': 'Z', 'Ž': 'Z',
};

/**
 * Escapes characters with special meaning in a regular expression.
 *
 * @param {string} string - String to escape.
 * @returns {string} Escaped string suitable for RegExp.
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Transliterates Latin diacritics and accented characters to their closest ASCII equivalent.
 *
 * @param {string} str - Input text.
 * @returns {string} Transliterated text.
 */
function transliterate(str) {
  let result = '';
  for (const char of str) {
    result += DIACRITICS_MAP[char] !== undefined ? DIACRITICS_MAP[char] : char;
  }
  return result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Converts a text string into a URL-friendly slug.
 *
 * Transliterates common accented/diacritic Latin characters to ASCII equivalents,
 * strips non-alphanumeric characters, replaces whitespaces and disallowed characters
 * with a configurable separator, collapses multiple separators, and optionally truncates.
 *
 * @param {string} input - The text string to convert.
 * @param {Object} [options={}] - Options for slug conversion.
 * @param {string} [options.separator='-'] - Separator character (e.g., '-' or '_').
 * @param {boolean} [options.preserveCase=false] - Whether to preserve original character casing.
 * @param {number} [options.maxLength] - Optional maximum length of the generated slug.
 * @returns {string} The generated slug or an empty string if no valid characters remain.
 */
export function textToSlug(input, options = {}) {
  if (typeof input !== 'string' || input.length === 0) {
    return '';
  }

  const { separator = '-', preserveCase = false, maxLength } = options;
  const sep = typeof separator === 'string' && separator.length > 0 ? separator : '-';

  const transliterated = transliterate(input);
  const processed = preserveCase ? transliterated : transliterated.toLowerCase();

  const disallowedRegex = preserveCase ? /[^a-zA-Z0-9]+/g : /[^a-z0-9]+/g;
  let slug = processed.replace(disallowedRegex, sep);

  const escapedSep = escapeRegExp(sep);
  const collapseRegex = new RegExp(`${escapedSep}+`, 'g');
  slug = slug.replace(collapseRegex, sep);

  const trimRegex = new RegExp(`^${escapedSep}+|${escapedSep}+$`, 'g');
  slug = slug.replace(trimRegex, '');

  if (typeof maxLength === 'number' && Number.isFinite(maxLength)) {
    if (maxLength <= 0) {
      return '';
    }
    if (slug.length > maxLength) {
      slug = slug.slice(0, maxLength);
      slug = slug.replace(new RegExp(`${escapedSep}+$`, 'g'), '');
    }
  }

  return slug;
}
