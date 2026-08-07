import {
  dump,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  load,
  YAMLException,
} from 'js-yaml';

const SUPPORTED_INDENTS = new Set([2, 4]);
const DECIMAL_NUMBER = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;

/**
 * Represents a conversion error with a user-facing source location.
 */
export class YamlConversionError extends Error {
  /**
   * @param {'JSON'|'YAML'} format The invalid input format.
   * @param {string} reason A concise explanation of the parse failure.
   * @param {number} [line=1] The one-based source line.
   * @param {number} [column=1] The one-based source column.
   * @param {'conversion'|'syntax'} [kind='conversion'] The error category.
   */
  constructor(format, reason, line = 1, column = 1, kind = 'conversion') {
    super(`${format} input error at line ${line}, column ${column}: ${reason}`);
    this.name = 'YamlConversionError';
    this.format = format;
    this.reason = reason;
    this.line = line;
    this.column = column;
    this.kind = kind;
  }
}

function locationAt(source, position) {
  const safePosition = Math.max(0, Math.min(position, source.length));
  let line = 1;
  let column = 1;

  for (let index = 0; index < safePosition; index += 1) {
    if (source[index] === '\r') {
      if (source[index + 1] === '\n' && index + 1 < safePosition) index += 1;
      line += 1;
      column = 1;
    } else if (source[index] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function requireText(source, format) {
  if (typeof source !== 'string') {
    throw new YamlConversionError(format, `${format} input must be text.`, 1, 1, 'syntax');
  }
  if (!source.trim()) {
    throw new YamlConversionError(
      format,
      `${format} input cannot be empty.`,
      1,
      1,
      'syntax',
    );
  }
}

function significantDigitCount(rawValue) {
  const base = rawValue.toLowerCase().split('e')[0].replace(/^[+-]/, '');
  const digits = base.replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length;
}

function representsInteger(rawValue) {
  const unsigned = rawValue.replace(/^[+-]/, '');
  const [coefficient, exponentText] = unsigned.toLowerCase().split('e');
  const [whole = '', fractional = ''] = coefficient.split('.');
  const digits = `${whole}${fractional}`;
  if (/^0*$/.test(digits)) return true;

  const exponent = Number(exponentText || 0);
  const fractionalDigits = fractional.length - exponent;
  if (fractionalDigits <= 0) return true;
  if (fractionalDigits >= digits.length) return false;
  return /^0+$/.test(digits.slice(-fractionalDigits));
}

function representsZero(rawValue) {
  const coefficient = rawValue.toLowerCase().split('e')[0].replace(/^[+-]/, '');
  return /^0*\.?0*$/.test(coefficient);
}

function assertLosslessNumber(value, rawValue, format) {
  if (!Number.isFinite(value)) {
    throw new YamlConversionError(
      format,
      'Non-finite numbers cannot be represented in JSON.',
    );
  }
  if (Object.is(value, -0)) {
    throw new YamlConversionError(
      format,
      'Negative zero cannot be converted losslessly.',
    );
  }
  if (
    typeof rawValue === 'string'
    && DECIMAL_NUMBER.test(rawValue)
    && rawValue.startsWith('-')
    && representsZero(rawValue)
  ) {
    throw new YamlConversionError(
      format,
      'Negative zero cannot be converted losslessly.',
    );
  }
  if (
    value === 0
    && typeof rawValue === 'string'
    && DECIMAL_NUMBER.test(rawValue)
    && !representsZero(rawValue)
  ) {
    throw new YamlConversionError(
      format,
      'Numbers too small to represent cannot be converted losslessly.',
    );
  }
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    throw new YamlConversionError(
      format,
      'Integers outside JavaScript safe range cannot be converted losslessly.',
    );
  }
  if (
    typeof rawValue === 'string'
    && DECIMAL_NUMBER.test(rawValue)
    && significantDigitCount(rawValue) > 15
    && !representsInteger(rawValue)
  ) {
    throw new YamlConversionError(
      format,
      'Decimal values with more than 15 significant digits cannot be converted losslessly.',
    );
  }
}

function assertJsonCompatible(value, format, rawValue, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;

  if (typeof value === 'number') {
    assertLosslessNumber(value, rawValue, format);
    return;
  }

  if (typeof value !== 'object') {
    throw new YamlConversionError(format, 'This value cannot be represented in JSON.');
  }
  if (value instanceof Date) {
    throw new YamlConversionError(format, 'Date values cannot be converted losslessly to JSON.');
  }
  if (ancestors.has(value)) {
    throw new YamlConversionError(format, 'Circular YAML aliases cannot be represented in JSON.');
  }

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new YamlConversionError(format, 'This YAML value cannot be represented in JSON.');
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      assertJsonCompatible(child, format, rawValue?.[index], ancestors);
    });
  } else {
    Object.entries(value).forEach(([key, child]) => {
      assertJsonCompatible(child, format, rawValue?.[key], ancestors);
    });
  }
  ancestors.delete(value);
}

function nextSignificantCharacter(source, position) {
  let index = position;

  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '#') {
      const lineEnd = source.indexOf('\n', index);
      index = lineEnd === -1 ? source.length : lineEnd + 1;
      continue;
    }
    return character;
  }

  return '';
}

function isUnquotedOverflowNumber(state) {
  if (
    state.tag !== '?'
    || state.kind !== 'scalar'
    || typeof state.result !== 'string'
  ) {
    return false;
  }

  return DECIMAL_NUMBER.test(state.result) && !Number.isFinite(Number(state.result));
}

function loadYamlWithStringKeys(source) {
  const openNodes = [];

  return load(source, {
    schema: JSON_SCHEMA,
    listener(event, state) {
      if (event === 'open') {
        openNodes.push({ start: state.position });
        return;
      }

      const node = openNodes.pop();
      if (node && isUnquotedOverflowNumber(state)) {
        const location = locationAt(source, node.start);
        throw new YamlConversionError(
          'YAML',
          'Numbers outside JavaScript range cannot be converted losslessly.',
          location.line,
          location.column,
        );
      }
      if (!node || nextSignificantCharacter(source, state.position) !== ':') return;
      if (typeof state.result === 'string') return;

      const location = locationAt(source, node.start);
      throw new YamlConversionError(
        'YAML',
        'YAML mapping keys must be strings to convert to JSON.',
        location.line,
        location.column,
      );
    },
  });
}

function jsonNumberLexemes(source) {
  const numbers = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character !== '-' && !/\d/.test(character)) continue;

    const match = source.slice(index).match(
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?/,
    );
    if (!match) continue;
    numbers.push(match[0]);
    index += match[0].length - 1;
  }

  return numbers;
}

function yamlError(error) {
  if (error instanceof YamlConversionError) return error;

  const mark = error instanceof YAMLException ? error.mark : undefined;
  const line = mark?.line === undefined ? 1 : mark.line + 1;
  const column = mark?.column === undefined ? 1 : mark.column + 1;
  const reason = error instanceof YAMLException
    ? error.reason
    : error?.message || 'Unable to parse YAML input.';

  return new YamlConversionError('YAML', reason, line, column, 'syntax');
}

function jsonError(source, error) {
  if (error instanceof YamlConversionError) return error;

  const position = Number(error?.message?.match(/position\s+(\d+)/i)?.[1]);
  const lineColumnMatch = error?.message?.match(/line\s+(\d+)\s*,?\s*column\s+(\d+)/i);
  const location = Number.isFinite(position)
    ? locationAt(source, position)
    : lineColumnMatch
      ? { line: Number(lineColumnMatch[1]), column: Number(lineColumnMatch[2]) }
      : { line: 1, column: 1 };

  return new YamlConversionError(
    'JSON',
    error?.message || 'Unable to parse JSON input.',
    location.line,
    location.column,
    'syntax',
  );
}

function normalizeIndent(indent) {
  const normalized = Number(indent);
  if (!SUPPORTED_INDENTS.has(normalized)) {
    throw new YamlConversionError('YAML', 'YAML indentation must be 2 or 4 spaces.');
  }
  return normalized;
}

/**
 * Converts YAML text to consistently formatted JSON text.
 *
 * @param {string} yamlStr YAML source text.
 * @returns {string} Parsed data serialized as two-space-indented JSON.
 * @throws {YamlConversionError} If the YAML source is empty or invalid.
 */
export function yamlToJson(yamlStr) {
  requireText(yamlStr, 'YAML');

  try {
    const value = loadYamlWithStringKeys(yamlStr);
    const rawValue = load(yamlStr, { schema: FAILSAFE_SCHEMA });
    if (value === undefined) {
      throw new YamlConversionError('YAML', 'YAML input does not contain a value.');
    }
    assertJsonCompatible(value, 'YAML', rawValue);
    return JSON.stringify(value, null, 2);
  } catch (error) {
    throw yamlError(error);
  }
}

/**
 * Converts JSON text to formatted YAML text.
 *
 * @param {string} jsonStr JSON source text.
 * @param {2|4} [indent=2] Number of spaces used for YAML nesting.
 * @returns {string} Parsed data serialized as YAML.
 * @throws {YamlConversionError} If the JSON source is empty or invalid.
 */
export function jsonToYaml(jsonStr, indent = 2) {
  requireText(jsonStr, 'JSON');
  const yamlIndent = normalizeIndent(indent);

  try {
    jsonNumberLexemes(jsonStr).forEach((rawValue) => {
      assertLosslessNumber(Number(rawValue), rawValue, 'JSON');
    });
    const value = JSON.parse(jsonStr);
    assertJsonCompatible(value, 'JSON');
    return dump(value, {
      indent: yamlIndent,
      lineWidth: -1,
      noRefs: true,
    });
  } catch (error) {
    throw jsonError(jsonStr, error);
  }
}
