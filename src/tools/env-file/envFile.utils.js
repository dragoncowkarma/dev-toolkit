import yaml from 'js-yaml';

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function decodeDoubleQuoted(value) {
  return value.replace(/\\([n"\\])/g, (_, character) => {
    if (character === 'n') return '\n';
    return character;
  });
}

function unquotedValue(value) {
  return value.replace(/\s+#.*$/, '').trimEnd();
}

function parseValue(value, line) {
  const trimmed = value.trimStart();
  if (!trimmed.startsWith('"') && !trimmed.startsWith("'")) {
    return { value: unquotedValue(value), quote: null };
  }

  const quoteCharacter = trimmed[0];
  let end = 1;
  while (end < trimmed.length) {
    if (trimmed[end] === quoteCharacter && trimmed[end - 1] !== '\\') break;
    end += 1;
  }
  if (end === trimmed.length) {
    return { error: { line, message: 'Unterminated quoted value.' } };
  }

  const remainder = trimmed.slice(end + 1).trim();
  if (remainder && !remainder.startsWith('#')) {
    return { error: { line, message: 'Unexpected text after quoted value.' } };
  }
  const content = trimmed.slice(1, end);
  return {
    value: quoteCharacter === '"' ? decodeDoubleQuoted(content) : content,
    quote: quoteCharacter === '"' ? 'double' : 'single',
  };
}

/**
 * Parses line-oriented dotenv text without throwing on malformed input.
 *
 * @param {string} text Dotenv-compatible source text.
 * @returns {{entries: Array<object>, errors: Array<{line: number, message: string}>}}
 */
export function parseEnvFile(text) {
  const entries = [];
  const errors = [];
  const seenKeys = new Set();
  const sourceLines = String(text).split(/\r?\n/);

  sourceLines.forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return;

    const exportMatch = rawLine.match(/^\s*(export\s+)?(.*)$/);
    const isExport = Boolean(exportMatch[1]);
    const assignment = exportMatch[2];
    const equalsIndex = assignment.indexOf('=');
    if (equalsIndex === -1) {
      errors.push({ line, message: 'Expected KEY=VALUE assignment.' });
      return;
    }

    const key = assignment.slice(0, equalsIndex).trim();
    if (!KEY_PATTERN.test(key)) {
      errors.push({ line, message: `Invalid environment key: ${key || '(empty)'}.` });
      return;
    }

    const parsedValue = parseValue(assignment.slice(equalsIndex + 1), line);
    if (parsedValue.error) {
      errors.push(parsedValue.error);
      return;
    }

    entries.push({
      key,
      value: parsedValue.value,
      line,
      quote: parsedValue.quote,
      isExport,
      isDuplicate: seenKeys.has(key),
    });
    seenKeys.add(key);
  });

  Object.defineProperty(entries, 'sourceLines', { value: sourceLines, enumerable: false });
  return { entries, errors };
}

/**
 * Converts parsed entries to an object where later duplicate keys take precedence.
 *
 * @param {Array<{key: string, value: string}>} entries Parsed environment entries.
 * @returns {Record<string, string>} A dotenv-loader-compatible key/value object.
 */
export function toJSON(entries) {
  return entries.reduce((output, entry) => ({ ...output, [entry.key]: entry.value }), {});
}

/**
 * Converts parsed entries to a YAML document.
 *
 * @param {Array<{key: string, value: string}>} entries Parsed environment entries.
 * @returns {string} YAML text with a trailing newline.
 */
export function toYAML(entries) {
  return yaml.dump(toJSON(entries), { lineWidth: -1 });
}

/**
 * Converts parsed entries to shell export statements.
 *
 * @param {Array<{key: string, value: string}>} entries Parsed environment entries.
 * @returns {string} Shell-safe export statements.
 */
export function toShellExport(entries) {
  return entries.map(({ key, value }) => {
    const escaped = value.replace(/["`$\\]/g, '\\$&');
    return `export ${key}="${escaped}"`;
  }).join('\n');
}

/**
 * Creates a shareable example template, retaining source comments and blank lines.
 *
 * @param {Array<{key: string, isExport?: boolean}>} entries Parsed environment entries.
 * @returns {string} A dotenv example template.
 */
export function toExampleTemplate(entries) {
  if (!entries.sourceLines) {
    return entries.map(({ key, isExport }) => `${isExport ? 'export ' : ''}${key}=`).join('\n');
  }
  const byLine = new Map(entries.map((entry) => [entry.line, entry]));
  return entries.sourceLines.map((sourceLine, index) => {
    const entry = byLine.get(index + 1);
    if (!entry) return sourceLine;
    return `${entry.isExport ? 'export ' : ''}${entry.key}=`;
  }).join('\n');
}

/**
 * Finds keys that occur in only one of two environment files.
 *
 * @param {Array<{key: string}>} sourceEntries Entries from the real .env file.
 * @param {Array<{key: string}>} exampleEntries Entries from the .env.example file.
 * @returns {{missingInSource: string[], missingInExample: string[]}} Asymmetric key differences.
 */
export function findMissingKeys(sourceEntries, exampleEntries) {
  const sourceKeys = [...new Set(sourceEntries.map(({ key }) => key))];
  const exampleKeys = [...new Set(exampleEntries.map(({ key }) => key))];
  const sourceSet = new Set(sourceKeys);
  const exampleSet = new Set(exampleKeys);
  return {
    missingInSource: exampleKeys.filter((key) => !sourceSet.has(key)),
    missingInExample: sourceKeys.filter((key) => !exampleSet.has(key)),
  };
}

/**
 * Masks a secret while retaining a short trailing suffix for recognition.
 *
 * @param {string} value Secret value to mask.
 * @param {number} visibleChars Number of trailing characters to retain.
 * @returns {string} Masked value.
 */
export function maskValue(value, visibleChars = 4) {
  const text = String(value);
  const visible = Math.max(0, visibleChars);
  if (visible === 0 || text.length <= visible) return '•'.repeat(text.length);
  return `${'•'.repeat(text.length - visible)}${text.slice(-visible)}`;
}
