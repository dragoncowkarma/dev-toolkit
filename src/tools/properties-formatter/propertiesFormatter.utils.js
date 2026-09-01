/**
 * Utility functions for parsing, normalizing, and inspecting Java `.properties` text.
 *
 * Java `.properties` syntax differs from INI in several ways that this module implements
 * from scratch (no INI reuse):
 * - Separators between key and value can be `=`, `:`, or plain whitespace.
 * - Leading whitespace on a natural line is always ignored.
 * - Lines whose first non-whitespace character is `#` or `!` are full-line comments.
 * - A natural line ending in an odd number of backslashes continues on the next physical
 *   line; leading whitespace of the continuation line is stripped before it is appended.
 * - Backslash escapes apply to both keys and values: `\t`, `\n`, `\r`, `\f`, `\\`, `\uXXXX`,
 *   and an escaped separator/whitespace (e.g. `\=`, `\:`, `\ `). Any other escaped character
 *   simply drops the backslash and keeps the character literally, matching the reference
 *   `java.util.Properties` loader behavior.
 *
 * Duplicate-key policy: every source occurrence of a key is preserved in `entries` (in
 * source order) so the UI can display the full history and flag duplicates, but the
 * normalized `data` map follows "last value wins" while keeping the position of the key's
 * first occurrence (JavaScript object insertion order for string keys is unaffected by
 * re-assigning an existing key).
 */

const WHITESPACE_CHARS = new Set([' ', '\t', '\f']);

export const SAMPLE_PROPERTIES = `# Application configuration sample
! Legacy "!" comments are supported too

app.name = Dev Toolkit
app.version: 1.4.0
app.description = A collection of \\
    developer utilities

welcome.message = Hello\\tWorld\\nEnjoy your stay!
path.separator = C:\\\\Program Files\\\\App

greeting.unicode = \\uD55C\\uAE00 Hello
app.author Jane Doe

# Duplicate key below demonstrates last-value-wins semantics
app.name = Dev Toolkit Pro
`;

/**
 * Checks whether a character is properties-format whitespace (space, tab, or form feed).
 * Line terminators are handled separately during line splitting.
 *
 * @param {string} ch A single character.
 * @returns {boolean} True when the character is treated as whitespace.
 */
function isWhitespace(ch) {
  return WHITESPACE_CHARS.has(ch);
}

/**
 * Strips leading whitespace (space, tab, form feed) from a natural line.
 *
 * @param {string} line A single physical line, without its terminator.
 * @returns {string} The line with leading whitespace removed.
 */
function stripLeadingWhitespace(line) {
  let idx = 0;
  while (idx < line.length && isWhitespace(line[idx])) {
    idx += 1;
  }
  return line.slice(idx);
}

/**
 * Counts the trailing backslashes at the end of a string, used to detect line continuation.
 *
 * @param {string} str The string to inspect.
 * @returns {number} The number of consecutive trailing `\` characters.
 */
function countTrailingBackslashes(str) {
  let count = 0;
  for (let idx = str.length - 1; idx >= 0 && str[idx] === '\\'; idx -= 1) {
    count += 1;
  }
  return count;
}

/**
 * Decodes a single backslash escape starting at `raw[index]` (which must be `\`).
 *
 * @param {string} raw The logical line being decoded.
 * @param {number} index Index of the `\` character in `raw`.
 * @param {number} lineNum 1-based source line number, used for error reporting.
 * @returns {{ text?: string, consumed?: number, error?: { line: number, message: string } }}
 */
function decodeEscape(raw, index, lineNum) {
  const next = raw[index + 1];

  if (next === undefined) {
    // A lone trailing backslash should already have been consumed as a line
    // continuation marker; treat any leftover as a literal backslash defensively.
    return { text: '\\', consumed: 1 };
  }

  switch (next) {
    case 't':
      return { text: '\t', consumed: 2 };
    case 'n':
      return { text: '\n', consumed: 2 };
    case 'r':
      return { text: '\r', consumed: 2 };
    case 'f':
      return { text: '\f', consumed: 2 };
    case 'u': {
      const hex = raw.slice(index + 2, index + 6);
      if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
        return {
          error: {
            line: lineNum,
            message: `Malformed \\uXXXX Unicode escape near "\\u${hex}".`,
          },
        };
      }
      return { text: String.fromCharCode(parseInt(hex, 16)), consumed: 6 };
    }
    default:
      // Java drops the backslash and keeps the escaped character literally,
      // which is how `\=`, `\:`, `\#`, `\!`, `\ `, and `\\` are handled.
      return { text: next, consumed: 2 };
  }
}

/**
 * Splits a fully-joined logical line into a decoded key and value.
 *
 * @param {string} raw The logical line (continuations already resolved).
 * @param {number} lineNum 1-based source line number, used for error reporting.
 * @returns {{ key?: string, value?: string, error?: { line: number, message: string } }}
 */
function splitKeyValue(raw, lineNum) {
  const len = raw.length;
  let i = 0;
  let key = '';

  while (i < len) {
    const ch = raw[i];
    if (ch === '\\') {
      const decoded = decodeEscape(raw, i, lineNum);
      if (decoded.error) return { error: decoded.error };
      key += decoded.text;
      i += decoded.consumed;
      continue;
    }
    if (isWhitespace(ch) || ch === '=' || ch === ':') {
      break;
    }
    key += ch;
    i += 1;
  }

  // Skip whitespace between the key and an optional separator.
  while (i < len && isWhitespace(raw[i])) i += 1;

  if (i < len && (raw[i] === '=' || raw[i] === ':')) {
    i += 1;
    // Skip whitespace between the separator and the value.
    while (i < len && isWhitespace(raw[i])) i += 1;
  }

  let value = '';
  while (i < len) {
    const ch = raw[i];
    if (ch === '\\') {
      const decoded = decodeEscape(raw, i, lineNum);
      if (decoded.error) return { error: decoded.error };
      value += decoded.text;
      i += decoded.consumed;
      continue;
    }
    value += ch;
    i += 1;
  }

  return { key, value };
}

/**
 * Parses Java `.properties` formatted text into an ordered list of entries plus a
 * normalized key/value map.
 *
 * @param {string} text Raw `.properties` source text.
 * @returns {{
 *   entries: Array<{ key: string, value: string, line: number, duplicate: boolean }>,
 *   data: Record<string, string>,
 *   errors: Array<{ line: number, message: string }>
 * }}
 */
export function parseProperties(text) {
  if (typeof text !== 'string') {
    return { entries: [], data: {}, errors: [{ line: 1, message: 'Input must be a string.' }] };
  }

  const physicalLines = text.split(/\r\n|\r|\n/);
  const entries = [];
  const errors = [];

  let i = 0;
  while (i < physicalLines.length) {
    const startLine = i + 1;
    const strippedFirst = stripLeadingWhitespace(physicalLines[i]);

    if (strippedFirst === '') {
      i += 1;
      continue;
    }
    if (strippedFirst[0] === '#' || strippedFirst[0] === '!') {
      i += 1;
      continue;
    }

    let logical = strippedFirst;
    let consumedLines = 1;
    let danglingLine = null;

    while (countTrailingBackslashes(logical) % 2 === 1) {
      logical = logical.slice(0, -1);
      const nextIndex = i + consumedLines;
      if (nextIndex >= physicalLines.length) {
        danglingLine = startLine + consumedLines - 1;
        break;
      }
      logical += stripLeadingWhitespace(physicalLines[nextIndex]);
      consumedLines += 1;
    }

    i += consumedLines;

    if (danglingLine !== null) {
      errors.push({
        line: danglingLine,
        message: 'Dangling line continuation: no following line to continue onto.',
      });
      continue;
    }

    const result = splitKeyValue(logical, startLine);
    if (result.error) {
      errors.push(result.error);
      continue;
    }

    entries.push({ key: result.key, value: result.value, line: startLine, duplicate: false });
  }

  const keyCounts = new Map();
  entries.forEach((entry) => {
    keyCounts.set(entry.key, (keyCounts.get(entry.key) ?? 0) + 1);
  });
  entries.forEach((entry) => {
    entry.duplicate = keyCounts.get(entry.key) > 1;
  });

  // Use a null-prototype map so keys like `__proto__` are stored as real own
  // properties instead of being interpreted as the prototype slot.
  const data = Object.create(null);
  entries.forEach((entry) => {
    data[entry.key] = entry.value;
  });

  return { entries, data, errors };
}

/**
 * Escapes a decoded key for safe, round-trippable `.properties` output.
 *
 * @param {string} key Decoded key text.
 * @returns {string} Escaped key text.
 */
function escapeKey(key) {
  let out = '';
  for (const ch of String(key)) {
    if (ch === '\\') out += '\\\\';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\f') out += '\\f';
    else if (ch === ' ') out += '\\ ';
    else if (ch === '=' || ch === ':' || ch === '#' || ch === '!') out += `\\${ch}`;
    else out += ch;
  }
  return out;
}

/**
 * Escapes a decoded value for safe, round-trippable `.properties` output. Only leading
 * whitespace needs escaping in a value; embedded/trailing whitespace is preserved as-is.
 *
 * @param {string} value Decoded value text.
 * @returns {string} Escaped value text.
 */
function escapeValue(value) {
  const str = value === null || value === undefined ? '' : String(value);
  let out = '';
  for (let idx = 0; idx < str.length; idx += 1) {
    const ch = str[idx];
    if (ch === '\\') out += '\\\\';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\f') out += '\\f';
    else if (ch === ' ' && idx === 0) out += '\\ ';
    else out += ch;
  }
  return out;
}

/**
 * Formats parsed `.properties` data (or raw source text) into normalized, deterministic
 * `.properties` text: one `key=value` pair per line, in first-occurrence order, with
 * duplicate keys collapsed to their last value.
 *
 * @param {string|Record<string, string>} input Raw `.properties` text or a parsed data map.
 * @returns {string} Normalized `.properties` text, or an empty string on parse errors.
 */
export function formatProperties(input) {
  let data = input;
  if (typeof input === 'string') {
    const parsed = parseProperties(input);
    if (parsed.errors.length > 0) return '';
    data = parsed.data;
  }

  if (!data || typeof data !== 'object') return '';

  return Object.keys(data)
    .map((key) => `${escapeKey(key)}=${escapeValue(data[key])}`)
    .join('\n');
}

/**
 * Converts `.properties` text (or a parsed data map) into pretty-printed JSON.
 *
 * @param {string|Record<string, string>} input Raw `.properties` text or a parsed data map.
 * @returns {string} Pretty-printed JSON string.
 */
export function toJSON(input) {
  let data = input;
  if (typeof input === 'string') {
    data = parseProperties(input).data;
  }
  return JSON.stringify(data || {}, null, 2);
}

/**
 * Extracts the unique set of duplicated keys from a parsed entries list, in the order
 * each key first appears.
 *
 * @param {Array<{ key: string, duplicate: boolean }>} entries Entries from `parseProperties`.
 * @returns {string[]} Unique duplicated key names, in first-occurrence order.
 */
export function getDuplicateKeys(entries) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const result = [];
  entries.forEach((entry) => {
    if (entry.duplicate && !seen.has(entry.key)) {
      seen.add(entry.key);
      result.push(entry.key);
    }
  });
  return result;
}
