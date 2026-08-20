/**
 * Utility functions for parsing, formatting, and converting INI configuration text.
 */

export const SAMPLE_INI = `# Global configuration
appName = DevToolkit
version = 1.0.0
debug = true

[database]
host = localhost
port = 5432
username = db_admin
password = "secret_password;123"

[server]
host = 127.0.0.1
port : 8080 ; Primary HTTP port
timeout = 30
`;

/**
 * Parses a value token, handling quoted strings and inline comments.
 *
 * @param {string} rawValue Unparsed value string after separator.
 * @param {number} lineNum 1-based line index for error reporting.
 * @returns {{ value?: string, quote?: string|null, error?: { line: number, message: string } }}
 */
function parseValue(rawValue, lineNum) {
  const trimmed = rawValue.trim();

  if (trimmed.length === 0) {
    return { value: '', quote: null };
  }

  // Quoted string values: "..." or '...'
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const quoteChar = trimmed[0];
    let endIdx = -1;
    let escaped = false;

    for (let i = 1; i < trimmed.length; i += 1) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (trimmed[i] === '\\') {
        escaped = true;
        continue;
      }
      if (trimmed[i] === quoteChar) {
        endIdx = i;
        break;
      }
    }

    if (endIdx === -1) {
      return { error: { line: lineNum, message: 'Unterminated quoted string.' } };
    }

    const content = trimmed.slice(1, endIdx);
    const remainder = trimmed.slice(endIdx + 1).trim();

    // Text after quote must be empty or start with an inline comment (; or #)
    if (remainder && !remainder.startsWith(';') && !remainder.startsWith('#')) {
      return { error: { line: lineNum, message: 'Unexpected text after quoted value.' } };
    }

    let unescaped = content;
    if (quoteChar === '"') {
      unescaped = content
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    } else {
      unescaped = content
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
    }

    return { value: unescaped, quote: quoteChar };
  }

  // Unquoted values: strip inline comment starting with whitespace + ';' or '#'
  let cleanValue = trimmed;
  const inlineCommentMatch = cleanValue.search(/\s+[;#]/);
  if (inlineCommentMatch !== -1) {
    cleanValue = cleanValue.slice(0, inlineCommentMatch);
  } else if (cleanValue.startsWith(';') || cleanValue.startsWith('#')) {
    cleanValue = '';
  }

  return { value: cleanValue.trim(), quote: null };
}

/**
 * Parses INI formatted string into a nested JavaScript object representation.
 * Supports [section] headers, key = value / key: value pairs, top-level global keys,
 * ; and # comments, and quoted string values.
 *
 * @param {string} text Raw INI string input.
 * @returns {{ data: Record<string, any>, errors: Array<{ line: number, message: string }> }}
 */
export function parseIni(text) {
  const data = {};
  const errors = [];
  let currentSection = null;

  if (typeof text !== 'string') {
    return { data, errors: [{ line: 1, message: 'Input must be a string.' }] };
  }

  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const lineNum = index + 1;
    const trimmedLine = rawLine.trim();

    // Skip empty lines and full-line comments starting with ; or #
    if (!trimmedLine || trimmedLine.startsWith(';') || trimmedLine.startsWith('#')) {
      return;
    }

    // Section header parsing
    if (trimmedLine.startsWith('[')) {
      const closeBracketIdx = trimmedLine.indexOf(']');
      if (closeBracketIdx === -1) {
        errors.push({ line: lineNum, message: 'Unclosed section header.' });
        return;
      }

      const remainder = trimmedLine.slice(closeBracketIdx + 1).trim();
      if (remainder && !remainder.startsWith(';') && !remainder.startsWith('#')) {
        errors.push({ line: lineNum, message: 'Unexpected text after section header.' });
        return;
      }

      const sectionName = trimmedLine.slice(1, closeBracketIdx).trim();
      if (!sectionName) {
        errors.push({ line: lineNum, message: 'Empty section header.' });
        return;
      }

      currentSection = sectionName;
      if (!(currentSection in data) || typeof data[currentSection] !== 'object') {
        data[currentSection] = {};
      }
      return;
    }

    // Key-value pair parsing: find separator '=' or ':'
    const eqIdx = trimmedLine.indexOf('=');
    const colonIdx = trimmedLine.indexOf(':');

    let sepIdx = -1;
    if (eqIdx !== -1 && colonIdx !== -1) {
      sepIdx = Math.min(eqIdx, colonIdx);
    } else if (eqIdx !== -1) {
      sepIdx = eqIdx;
    } else if (colonIdx !== -1) {
      sepIdx = colonIdx;
    }

    if (sepIdx === -1) {
      errors.push({
        line: lineNum,
        message: 'Expected key-value pair or section header.',
      });
      return;
    }

    const key = trimmedLine.slice(0, sepIdx).trim();
    if (!key) {
      errors.push({ line: lineNum, message: 'Missing key before separator.' });
      return;
    }

    const rawValue = trimmedLine.slice(sepIdx + 1);
    const parsedVal = parseValue(rawValue, lineNum);

    if (parsedVal.error) {
      errors.push(parsedVal.error);
      return;
    }

    // Duplicate keys within the same section: last value wins
    if (currentSection === null) {
      data[key] = parsedVal.value;
    } else {
      if (typeof data[currentSection] !== 'object' || data[currentSection] === null) {
        data[currentSection] = {};
      }
      data[currentSection][key] = parsedVal.value;
    }
  });

  return { data, errors };
}

/**
 * Formats a value for INI output, adding double quotes if special characters exist.
 *
 * @param {any} value Value to format.
 * @returns {string} Formatted INI value string.
 */
function formatValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (/[\s;="#\\]/.test(str) || str === '') {
    const escaped = str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"${escaped}"`;
  }
  return str;
}

/**
 * Formats a JS object structure or INI string into clean, normalized INI text.
 *
 * @param {string|Record<string, any>} input Raw INI string or parsed object.
 * @returns {string} Clean formatted INI string.
 */
export function formatIni(input) {
  let data = input;
  if (typeof input === 'string') {
    const parsed = parseIni(input);
    if (parsed.errors.length > 0) {
      return '';
    }
    data = parsed.data;
  }

  if (!data || typeof data !== 'object') {
    return '';
  }

  const lines = [];

  // Global keys (primitives at root level)
  const globalKeys = Object.keys(data).filter(
    (key) => typeof data[key] !== 'object' || data[key] === null
  );

  globalKeys.forEach((key) => {
    lines.push(`${key} = ${formatValue(data[key])}`);
  });

  // Sections (nested objects)
  const sectionKeys = Object.keys(data).filter(
    (key) => typeof data[key] === 'object' && data[key] !== null
  );

  sectionKeys.forEach((sectionName) => {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(`[${sectionName}]`);

    const sectionObj = data[sectionName];
    Object.keys(sectionObj).forEach((key) => {
      lines.push(`${key} = ${formatValue(sectionObj[key])}`);
    });
  });

  return lines.join('\n');
}

/**
 * Converts INI text or parsed object to pretty-printed JSON representation.
 *
 * @param {string|Record<string, any>} input Raw INI text or parsed object.
 * @returns {string} Pretty-printed JSON string.
 */
export function toJSON(input) {
  let data = input;
  if (typeof input === 'string') {
    const parsed = parseIni(input);
    data = parsed.data;
  }

  return JSON.stringify(data || {}, null, 2);
}
