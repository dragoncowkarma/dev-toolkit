const DELIMITERS = [',', '\t', ';', '|'];

function locationForOffset(source, offset) {
  const prefix = source.slice(0, offset);
  const row = prefix.split(/\r\n|\r|\n/).length;
  const lastBreak = Math.max(prefix.lastIndexOf('\n'), prefix.lastIndexOf('\r'));
  return { row, column: offset - lastBreak };
}

function csvError(message, row, column) {
  return new Error(`${message} at row ${row}, column ${column}.`);
}

function normalizeDelimiter(delimiter) {
  if (DELIMITERS.includes(delimiter)) return delimiter;
  throw new Error('Delimiter must be a comma, tab, semicolon, or pipe.');
}

function validateRows(rows) {
  if (rows.length < 2) return;
  const expectedColumns = rows[0].length;
  const invalidRow = rows.findIndex((row) => row.length !== expectedColumns);
  if (invalidRow !== -1) {
    const actualColumns = rows[invalidRow].length;
    throw csvError(
      `Ragged row has ${actualColumns} columns; expected ${expectedColumns}`,
      invalidRow + 1,
      actualColumns + 1,
    );
  }
}

function countUnquotedDelimiters(source, delimiter) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '"') {
      if (!quoted && source[index] === delimiter) count += 1;
      continue;
    }
    if (quoted && source[index + 1] === '"') {
      index += 1;
    } else {
      quoted = !quoted;
    }
  }
  return count;
}

/**
 * Detects the most likely supported delimiter while ignoring quoted field contents.
 * @param {string} source CSV source text.
 * @returns {string} A supported delimiter.
 */
export function detectDelimiter(source) {
  if (typeof source !== 'string') throw new TypeError('CSV input must be a string.');
  return DELIMITERS.reduce((best, delimiter) => (
    countUnquotedDelimiters(source, delimiter) > countUnquotedDelimiters(source, best)
      ? delimiter
      : best
  ), ',');
}

/**
 * Parses RFC 4180-style delimited text into rows, preserving newlines inside quoted fields.
 * @param {string} source CSV source text.
 * @param {string} [delimiter=','] Field delimiter.
 * @returns {string[][]} Parsed rows.
 */
export function parseCSV(source, delimiter = ',') {
  if (typeof source !== 'string') throw new TypeError('CSV input must be a string.');
  const separator = normalizeDelimiter(delimiter);
  if (!source) return [];

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let quoteClosed = false;
  let line = 1;
  let column = 1;
  let fieldRow = 1;
  let fieldColumn = 1;

  function finishRow() {
    row.push(field);
    rows.push(row);
    row = [];
    field = '';
    quoteClosed = false;
    fieldRow = line + 1;
    fieldColumn = 1;
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (inQuotes) {
      if (character === '"') {
        if (next === '"') {
          field += '"';
          index += 1;
          column += 2;
        } else {
          inQuotes = false;
          quoteClosed = true;
          column += 1;
        }
      } else if (character === '\r') {
        field += next === '\n' ? '\r\n' : '\r';
        if (next === '\n') index += 1;
        line += 1;
        column = 1;
      } else if (character === '\n') {
        field += '\n';
        line += 1;
        column = 1;
      } else {
        field += character;
        column += 1;
      }
      continue;
    }

    if (character === '"') {
      if (field || quoteClosed) throw csvError('Unexpected quote', line, column);
      inQuotes = true;
      fieldRow = line;
      fieldColumn = column;
      column += 1;
    } else if (character === separator) {
      row.push(field);
      field = '';
      quoteClosed = false;
      fieldRow = line;
      fieldColumn = column + 1;
      column += 1;
    } else if (character === '\r' || character === '\n') {
      finishRow();
      if (character === '\r' && next === '\n') index += 1;
      line += 1;
      column = 1;
    } else {
      if (quoteClosed) throw csvError('Unexpected character after closing quote', line, column);
      field += character;
      column += 1;
    }
  }

  if (inQuotes) throw csvError('Unterminated quoted field', fieldRow, fieldColumn);
  const endsWithNewline = source.endsWith('\n') || source.endsWith('\r');
  if (!endsWithNewline) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Converts delimited text to JSON-compatible rows with optional object headers.
 * @param {string} source CSV source text.
 * @param {{delimiter?: string, hasHeader?: boolean}} [options] Conversion options.
 * @returns {Array<object>|string[][]} JSON-compatible data.
 */
export function csvToJson(source, { delimiter = 'auto', hasHeader = true } = {}) {
  const separator = delimiter === 'auto' ? detectDelimiter(source) : normalizeDelimiter(delimiter);
  const rows = parseCSV(source, separator);
  validateRows(rows);
  if (!hasHeader) return rows;
  if (!rows.length) return [];
  const [headers, ...dataRows] = rows;
  return dataRows.map((dataRow) => Object.fromEntries(
    headers.map((header, index) => [header, dataRow[index]]),
  ));
}

function serializeValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function quoteValue(value, delimiter) {
  const text = serializeValue(value);
  if (!text.includes(delimiter) && !/["\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * Converts a JSON object array string to RFC 4180-style delimited text.
 * @param {string} source JSON source text.
 * @param {{delimiter?: string}} [options] Conversion options.
 * @returns {string} Serialized delimited text.
 */
export function jsonToCsv(source, { delimiter = ',' } = {}) {
  const separator = normalizeDelimiter(delimiter);
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    const match = /position (\d+)/.exec(error.message);
    const position = match ? Number(match[1]) : 0;
    const { row, column } = locationForOffset(source, position);
    throw csvError('Invalid JSON', row, column);
  }
  if (!Array.isArray(data) || data.some((item) => !item || Array.isArray(item) ||
    typeof item !== 'object')) {
    throw csvError('JSON input must be an array of objects', 1, 1);
  }
  if (!data.length) return '';
  const headers = [];
  data.forEach((item) => Object.keys(item).forEach((key) => {
    if (!headers.includes(key)) headers.push(key);
  }));
  const lines = [headers, ...data.map((item) => headers.map((header) => item[header]))];
  return lines.map((values) => values.map((value) => quoteValue(value, separator)).join(separator))
    .join('\r\n');
}
