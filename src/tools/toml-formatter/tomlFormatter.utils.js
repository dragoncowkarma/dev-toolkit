const BARE_KEY = /^[A-Za-z0-9_-]+$/;
const INTEGER = /^[+-]?(?:0|[1-9](?:_?\d)*)$/;
const BASE_INTEGER = /^[+-]?0[xX][0-9A-Fa-f](?:_?[0-9A-Fa-f])*$/;
const OCTAL_INTEGER = /^[+-]?0[oO][0-7](?:_?[0-7])*$/;
const BINARY_INTEGER = /^[+-]?0[bB][01](?:_?[01])*$/;
const FLOAT_PATTERN = [
  '^[+-]?(?:(?:\\d(?:_?\\d)*\\.(?:\\d(?:_?\\d)*)?)',
  '|(?:\\d(?:_?\\d)*[eE][+-]?\\d(?:_?\\d)*)',
  '|(?:\\d(?:_?\\d)*\\.(?:\\d(?:_?\\d)*)?[eE][+-]?\\d(?:_?\\d)*)',
  '|(?:inf|nan))$',
].join('');
const FLOAT = new RegExp(FLOAT_PATTERN, 'i');
const DATE_TIME = /^\d{4}-\d{2}-\d{2}(?:T| )\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME = /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

/** Represents a TOML temporal value while preserving its original lexical form. */
class TomlTemporal {
  constructor(value) {
    this.value = value;
  }

  toJSON() {
    return this.value;
  }
}

/** Represents a TOML syntax error with a one-based source position. */
export class TomlParseError extends Error {
  constructor(reason, line = 1, column = 1) {
    super(`TOML input error at line ${line}, column ${column}: ${reason}`);
    this.name = 'TomlParseError';
    this.reason = reason;
    this.line = line;
    this.column = column;
  }
}

class TomlParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
    this.currentTable = null;
    this.root = {};
  }

  location() {
    const before = this.source.slice(0, this.index);
    const line = before.split('\n').length;
    return { line, column: this.index - before.lastIndexOf('\n') };
  }

  fail(reason) {
    const { line, column } = this.location();
    throw new TomlParseError(reason, line, column);
  }

  peek(offset = 0) {
    return this.source[this.index + offset] ?? '';
  }

  take() {
    const value = this.peek();
    this.index += 1;
    return value;
  }

  skipInlineSpace() {
    while (this.peek() === ' ' || this.peek() === '\t') this.index += 1;
  }

  skipComment() {
    if (this.peek() !== '#') return;
    while (this.peek() && this.peek() !== '\n') this.index += 1;
  }

  skipDocumentSpace() {
    while (this.index < this.source.length) {
      this.skipInlineSpace();
      this.skipComment();
      if (this.peek() === '\r') this.index += 1;
      if (this.peek() === '\n') {
        this.index += 1;
        continue;
      }
      break;
    }
  }

  endLine() {
    this.skipInlineSpace();
    this.skipComment();
    if (this.peek() === '\r') this.index += 1;
    if (this.peek() === '\n') {
      this.index += 1;
      return;
    }
    if (this.peek()) this.fail('Expected the end of the line.');
  }

  parse() {
    while (this.index < this.source.length) {
      this.skipDocumentSpace();
      if (!this.peek()) break;
      if (this.peek() === '[') {
        this.parseHeader();
      } else {
        this.parseAssignment();
      }
    }
    return this.root;
  }

  parseHeader() {
    const isArray = this.peek(1) === '[';
    this.index += isArray ? 2 : 1;
    this.skipInlineSpace();
    const path = this.parseKeyPath();
    this.skipInlineSpace();
    const close = isArray ? ']]' : ']';
    if (!this.source.startsWith(close, this.index)) this.fail(`Expected closing ${close}.`);
    this.index += close.length;
    this.endLine();

    const parent = this.resolvePath(path.slice(0, -1), true);
    const key = path.at(-1);
    if (isArray) {
      if (parent[key] === undefined) parent[key] = [];
      if (!Array.isArray(parent[key])) {
        this.fail(`Table '${path.join('.')}' conflicts with a value.`);
      }
      const table = {};
      parent[key].push(table);
      this.currentTable = table;
      return;
    }
    if (parent[key] === undefined) parent[key] = {};
    if (!isPlainObject(parent[key])) this.fail(`Table '${path.join('.')}' conflicts with a value.`);
    this.currentTable = parent[key];
  }

  parseAssignment() {
    const path = this.parseKeyPath();
    this.skipInlineSpace();
    if (this.take() !== '=') this.fail("Expected '=' after a key.");
    this.skipInlineSpace();
    const value = this.parseValue();
    this.endLine();
    const table = this.currentTable ?? this.root;
    this.assign(table, path, value);
  }

  parseKeyPath() {
    const keys = [this.parseKey()];
    this.skipInlineSpace();
    while (this.peek() === '.') {
      this.index += 1;
      this.skipInlineSpace();
      keys.push(this.parseKey());
      this.skipInlineSpace();
    }
    return keys;
  }

  parseKey() {
    const quote = this.peek();
    if (quote === '"' || quote === "'") return this.parseString(quote, false);
    const start = this.index;
    while (/[A-Za-z0-9_-]/.test(this.peek())) this.index += 1;
    const key = this.source.slice(start, this.index);
    if (!BARE_KEY.test(key)) this.fail('Expected a bare or quoted key.');
    return key;
  }

  parseValue() {
    const character = this.peek();
    if (character === '"' || character === "'") return this.parseString(character, true);
    if (character === '[') return this.parseArray();
    if (character === '{') return this.parseInlineTable();
    return this.parseBareValue();
  }

  parseString(quote, allowMultiline) {
    const isMultiline = allowMultiline && this.source.startsWith(quote.repeat(3), this.index);
    this.index += isMultiline ? 3 : 1;
    if (isMultiline && this.peek() === '\n') this.index += 1;
    let value = '';
    while (this.index < this.source.length) {
      if (isMultiline && this.source.startsWith(quote.repeat(3), this.index)) {
        this.index += 3;
        return value;
      }
      const character = this.take();
      if (!isMultiline && character === quote) return value;
      if (!isMultiline && (character === '\n' || character === '\r')) {
        this.fail('Single-line strings cannot contain a newline.');
      }
      if (quote === "'") {
        value += character;
        continue;
      }
      if (character !== '\\') {
        value += character;
        continue;
      }
      value += this.parseEscape(isMultiline);
    }
    this.fail('Unterminated string.');
  }

  parseEscape(isMultiline) {
    const escape = this.take();
    const escapes = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
    if (escapes[escape] !== undefined) return escapes[escape];
    if (escape === 'u' || escape === 'U') {
      const length = escape === 'u' ? 4 : 8;
      const digits = this.source.slice(this.index, this.index + length);
      if (!new RegExp(`^[0-9A-Fa-f]{${length}}$`).test(digits)) {
        this.fail('Invalid Unicode escape.');
      }
      this.index += length;
      return String.fromCodePoint(Number.parseInt(digits, 16));
    }
    if (isMultiline && (escape === '\n' || escape === '\r')) {
      if (escape === '\r' && this.peek() === '\n') this.index += 1;
      while (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\n') this.index += 1;
      return '';
    }
    this.fail('Invalid escape sequence.');
  }

  parseArray() {
    this.index += 1;
    const values = [];
    this.skipArraySpace();
    while (this.peek() !== ']') {
      if (!this.peek()) this.fail('Unterminated array.');
      values.push(this.parseValue());
      this.skipArraySpace();
      if (this.peek() === ']') break;
      if (this.take() !== ',') this.fail("Expected ',' between array values.");
      this.skipArraySpace();
    }
    this.index += 1;
    return values;
  }

  skipArraySpace() {
    while (true) {
      while (/\s/.test(this.peek())) this.index += 1;
      if (this.peek() !== '#') return;
      this.skipComment();
    }
  }

  parseInlineTable() {
    this.index += 1;
    const value = {};
    this.skipInlineSpace();
    while (this.peek() !== '}') {
      if (!this.peek()) this.fail('Unterminated inline table.');
      if (this.peek() === '\n' || this.peek() === '\r') {
        this.fail('Inline tables must stay on one line.');
      }
      const path = this.parseKeyPath();
      if (this.take() !== '=') this.fail("Expected '=' after an inline table key.");
      this.skipInlineSpace();
      this.assign(value, path, this.parseValue());
      this.skipInlineSpace();
      if (this.peek() === '}') break;
      if (this.take() !== ',') this.fail("Expected ',' between inline table values.");
      this.skipInlineSpace();
    }
    this.index += 1;
    return value;
  }

  parseBareValue() {
    const start = this.index;
    const localDateTime = this.source.slice(start).match(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/,
    );
    if (localDateTime) {
      this.index += localDateTime[0].length;
      return new TomlTemporal(localDateTime[0]);
    }
    while (this.peek() && !/[\s,#\]}]/.test(this.peek())) this.index += 1;
    const raw = this.source.slice(start, this.index);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (DATE_TIME.test(raw) || LOCAL_DATE.test(raw) || LOCAL_TIME.test(raw)) {
      return new TomlTemporal(raw);
    }
    if (
      INTEGER.test(raw)
      || BASE_INTEGER.test(raw)
      || OCTAL_INTEGER.test(raw)
      || BINARY_INTEGER.test(raw)
    ) {
      const numeric = Number(raw.replaceAll('_', ''));
      if (!Number.isSafeInteger(numeric)) {
        this.fail('Integers must be within JavaScript safe range.');
      }
      return numeric;
    }
    if (FLOAT.test(raw)) {
      const numeric = Number(raw.replaceAll('_', ''));
      if (!Number.isFinite(numeric)) {
        this.fail('Non-finite float values are not supported in JSON preview.');
      }
      return numeric;
    }
    this.fail(`Unsupported or invalid value '${raw}'.`);
  }

  resolvePath(path, create) {
    let target = this.root;
    path.forEach((key) => {
      if (target[key] === undefined && create) target[key] = {};
      target = target[key];
      if (Array.isArray(target)) target = target.at(-1);
      if (!isPlainObject(target)) {
        this.fail(`Table path '${path.join('.')}' conflicts with a value.`);
      }
    });
    return target;
  }

  assign(target, path, value) {
    const parent = path.slice(0, -1).reduce((current, key) => {
      if (current[key] === undefined) current[key] = {};
      if (!isPlainObject(current[key])) {
        this.fail(`Key '${path.join('.')}' conflicts with a value.`);
      }
      return current[key];
    }, target);
    const key = path.at(-1);
    if (Object.hasOwn(parent, key)) this.fail(`Duplicate key '${path.join('.')}'.`);
    parent[key] = value;
  }
}

function isPlainObject(value) {
  return (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && !(value instanceof TomlTemporal)
  );
}

function formatKey(key) {
  return BARE_KEY.test(key) ? key : JSON.stringify(key);
}

function formatValue(value) {
  if (value instanceof TomlTemporal) return value.value;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([key, child]) => `${formatKey(key)} = ${formatValue(child)}`)
      .join(', ');
    return `{ ${entries} }`;
  }
  throw new TypeError('Unsupported TOML value.');
}

function isArrayOfTables(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isPlainObject);
}

function appendTable(lines, value, path, header) {
  if (header) {
    const closing = header === '[[' ? ']]' : ']';
    lines.push(`${header}${path.map(formatKey).join('.')}${closing}`);
  }
  Object.entries(value).forEach(([key, child]) => {
    if (!isPlainObject(child) && !isArrayOfTables(child)) {
      lines.push(`${formatKey(key)} = ${formatValue(child)}`);
    }
  });
  Object.entries(value).forEach(([key, child]) => {
    if (isPlainObject(child)) {
      if (lines.length && lines.at(-1) !== '') lines.push('');
      appendTable(lines, child, [...path, key], '[');
    } else if (isArrayOfTables(child)) {
      child.forEach((table) => {
        if (lines.length && lines.at(-1) !== '') lines.push('');
        appendTable(lines, table, [...path, key], '[[');
      });
    }
  });
}

/**
 * Parses TOML v1.0.0 subset text into JavaScript values.
 *
 * @param {string} source TOML source text.
 * @returns {Record<string, unknown>} Parsed TOML document.
 */
export function parseToml(source) {
  if (typeof source !== 'string') {
    throw new TomlParseError('TOML input must be text.');
  }
  if (!source.trim()) throw new TomlParseError('TOML input cannot be empty.');
  return new TomlParser(source.replaceAll('\r\n', '\n')).parse();
}

/**
 * Serializes a parsed TOML document with two-space-friendly normalized layout.
 *
 * @param {Record<string, unknown>} data Parsed TOML document.
 * @returns {string} Pretty-printed TOML text.
 */
export function serializeToml(data) {
  if (!isPlainObject(data)) throw new TypeError('TOML document must be an object.');
  const lines = [];
  appendTable(lines, data, [], '');
  return `${lines.join('\n').replace(/^\n+|\n+$/g, '')}\n`;
}

/**
 * Parses TOML and returns normalized TOML plus an inspectable JSON representation.
 *
 * @param {string} source TOML source text.
 * @returns {{data: Record<string, unknown>, toml: string, json: string}} Conversion result.
 */
export function formatToml(source) {
  const data = parseToml(source);
  return {
    data,
    toml: serializeToml(data),
    json: JSON.stringify(data, null, 2),
  };
}
