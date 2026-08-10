export const LANGUAGES = {
  JAVASCRIPT: 'javascript',
  HTML: 'html',
  SQL: 'sql',
  JAVA: 'java',
  PYTHON: 'python',
};

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#47;',
};

const HTML_DECODING = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

function assertInput(text, language) {
  if (typeof text !== 'string') throw new TypeError('Input must be a string.');
  if (!Object.values(LANGUAGES).includes(language)) {
    throw new TypeError('Choose a supported target language.');
  }
}

function unicodeEscape(character) {
  return Array.from(character)
    .flatMap((value) => {
      const units = [];
      for (let index = 0; index < value.length; index += 1) {
        units.push(`\\u${value.charCodeAt(index).toString(16).padStart(4, '0')}`);
      }
      return units;
    })
    .join('');
}

function escapeCode(text, quoteStyle, escapeUnicode) {
  const quote = quoteStyle === 'single' ? "'" : '"';
  return Array.from(text)
    .map((character) => {
      const common = { '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
      if (Object.hasOwn(common, character)) return common[character];
      if (character === quote) return `\\${quote}`;
      if (character.codePointAt(0) < 32 || (escapeUnicode && character.codePointAt(0) > 126)) {
        return unicodeEscape(character);
      }
      return character;
    })
    .join('');
}

function unescapeCode(text) {
  return text.replace(/\\(?:u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2})|([\\'"nrtbf]))/g,
    (match, braced, unicode, hex, simple) => {
      if (braced || unicode || hex) {
        const codePoint = Number.parseInt(braced || unicode || hex, 16);
        if (codePoint > 0x10ffff) return match;
        try { return String.fromCodePoint(codePoint); } catch { return match; }
      }
      return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\\': '\\', "'": "'", '"': '"' }[simple];
    });
}

function decodeHtml(text) {
  return text.replace(/&(?:#x[\da-f]+|#\d+|[a-z]+);/gi, (entity) => {
    const body = entity.slice(1, -1).toLowerCase();
    if (body.startsWith('#')) {
      const codePoint = Number.parseInt(body.slice(body[1] === 'x' ? 2 : 1), body[1] === 'x' ? 16 : 10);
      if (!Number.isInteger(codePoint) || codePoint > 0x10ffff) return entity;
      try { return String.fromCodePoint(codePoint); } catch { return entity; }
    }
    return HTML_DECODING[body] ?? entity;
  });
}

/** Escapes plain text for a supported target language or format. */
export function escapeString(text, language, options = {}) {
  assertInput(text, language);
  const quoteStyle = options.quoteStyle === 'single' ? 'single' : 'double';
  const escapeUnicode = Boolean(options.escapeUnicode);
  if (language === LANGUAGES.HTML) return text.replace(/[&<>"'/]/g, (character) => HTML_ENTITIES[character]);
  if (language === LANGUAGES.SQL) return text.replace(/\\/g, '\\\\').replace(/'/g, "''");
  return escapeCode(text, language === LANGUAGES.JAVASCRIPT ? quoteStyle : quoteStyle, escapeUnicode);
}

/** Unescapes a string representation for a supported target language or format. */
export function unescapeString(text, language) {
  assertInput(text, language);
  if (language === LANGUAGES.HTML) return decodeHtml(text);
  if (language === LANGUAGES.SQL) return text.replace(/''/g, "'").replace(/\\\\/g, '\\');
  return unescapeCode(text);
}
