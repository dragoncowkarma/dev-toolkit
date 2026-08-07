/** Error raised when a JSONPath expression cannot be parsed safely. */
export class JsonPathSyntaxError extends Error {
  constructor(message, position) {
    const location = Number.isInteger(position) ? ` at character ${position + 1}` : '';
    super(`${message}${location}.`);
    this.name = 'JsonPathSyntaxError';
    this.position = position;
  }
}

function createSyntaxError(message, position) {
  return new JsonPathSyntaxError(message, position);
}

function isContainer(value) {
  return value !== null && typeof value === 'object';
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function skipWhitespace(source, position) {
  let nextPosition = position;
  while (nextPosition < source.length && /\s/.test(source[nextPosition])) {
    nextPosition += 1;
  }
  return nextPosition;
}

function isBarePropertyName(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(value);
}

function readBareProperty(source, position) {
  let end = position;
  while (end < source.length && /[A-Za-z0-9_$-]/.test(source[end])) {
    end += 1;
  }

  const key = source.slice(position, end);
  if (!isBarePropertyName(key)) {
    throw createSyntaxError('Expected a property name', position);
  }

  return { key, end };
}

function scanBracket(source, openPosition) {
  let quote = '';
  let escaped = false;
  let nestedBrackets = 0;

  for (let position = openPosition + 1; position < source.length; position += 1) {
    const character = source[position];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      nestedBrackets += 1;
    } else if (character === ']') {
      if (nestedBrackets === 0) {
        return {
          content: source.slice(openPosition + 1, position),
          end: position + 1,
        };
      }
      nestedBrackets -= 1;
    }
  }

  throw createSyntaxError('Unterminated bracket selector', openPosition);
}

function scanClosingParenthesis(source, openPosition) {
  let quote = '';
  let escaped = false;
  let depth = 0;

  for (let position = openPosition; position < source.length; position += 1) {
    const character = source[position];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) return position;
    }
  }

  return -1;
}

function splitTopLevel(source, delimiter) {
  const parts = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  let bracketDepth = 0;
  let parenthesisDepth = 0;

  for (let position = 0; position < source.length; position += 1) {
    const character = source[position];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      bracketDepth += 1;
    } else if (character === ']') {
      bracketDepth = Math.max(bracketDepth - 1, 0);
    } else if (character === '(') {
      parenthesisDepth += 1;
    } else if (character === ')') {
      parenthesisDepth = Math.max(parenthesisDepth - 1, 0);
    } else if (character === delimiter && bracketDepth === 0 && parenthesisDepth === 0) {
      parts.push(source.slice(start, position));
      start = position + 1;
    }
  }

  parts.push(source.slice(start));
  return parts;
}

function parseQuotedString(source, position) {
  const quote = source[0];
  const escapes = {
    '"': '"',
    "'": "'",
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
  };
  let value = '';

  for (let index = 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === quote) {
      if (index !== source.length - 1) {
        throw createSyntaxError('Unexpected text after a quoted property', position + index + 1);
      }
      return value;
    }

    if (character !== '\\') {
      value += character;
      continue;
    }

    const escapedCharacter = source[index + 1];
    if (!escapedCharacter) {
      throw createSyntaxError('Unterminated escape sequence', position + index);
    }

    if (escapedCharacter === 'u') {
      const hex = source.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        throw createSyntaxError('Invalid unicode escape sequence', position + index);
      }
      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
    } else if (hasOwn(escapes, escapedCharacter)) {
      value += escapes[escapedCharacter];
      index += 1;
    } else {
      throw createSyntaxError('Invalid escape sequence', position + index);
    }
  }

  throw createSyntaxError('Unterminated quoted property', position);
}

function parseSliceBound(value, position) {
  if (value === '') return null;
  if (!/^-?\d+$/.test(value)) {
    throw createSyntaxError('Slice bounds must be integers', position);
  }
  return Number.parseInt(value, 10);
}

function parseSlice(source, position) {
  const parts = splitTopLevel(source, ':');
  if (parts.length < 2 || parts.length > 3) {
    throw createSyntaxError('A slice must have two or three parts', position);
  }

  const values = parts.map((part, index) => {
    const trimmed = part.trim();
    return parseSliceBound(trimmed, position + source.indexOf(part) + index);
  });
  const step = values[2] ?? 1;

  if (step === 0) {
    throw createSyntaxError('Slice step cannot be zero', position);
  }

  return {
    type: 'slice',
    start: values[0],
    end: values[1],
    step,
  };
}

function createLiteral(value) {
  return { type: 'literal', value };
}

function parseFilterExpression(source, basePosition) {
  let position = 0;

  function fail(message) {
    throw createSyntaxError(message, basePosition + position);
  }

  function skip() {
    position = skipWhitespace(source, position);
  }

  function consume(value) {
    skip();
    if (!source.startsWith(value, position)) return false;
    position += value.length;
    return true;
  }

  function parseFilterReference() {
    const root = source[position];
    position += 1;
    const selectors = [];

    while (true) {
      const selectorPosition = skipWhitespace(source, position);
      const character = source[selectorPosition];
      if (character === '.') {
        position = selectorPosition + 1;
        const property = readBareProperty(source, position);
        selectors.push({ type: 'child', key: property.key });
        position = property.end;
      } else if (character === '[') {
        position = selectorPosition;
        const bracket = scanBracket(source, position);
        const selector = parseBracketContent(bracket.content, position + 1);
        if (selector.type !== 'child' && selector.type !== 'index') {
          fail('Filter references only support property and index selectors');
        }
        selectors.push(selector);
        position = bracket.end;
      } else {
        break;
      }
    }

    return { type: 'reference', root, selectors };
  }

  function parseStringLiteral() {
    const start = position;
    const quote = source[position];
    position += 1;
    let escaped = false;

    while (position < source.length) {
      const character = source[position];
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        position += 1;
        const value = parseQuotedString(source.slice(start, position), basePosition + start);
        return createLiteral(value);
      }
      position += 1;
    }

    fail('Unterminated string literal');
  }

  function parseNumberLiteral() {
    const numberMatch = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      source.slice(position),
    );
    if (!numberMatch) fail('Invalid number literal');
    position += numberMatch[0].length;
    return createLiteral(Number(numberMatch[0]));
  }

  function parseWordLiteral() {
    const wordMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(position));
    if (!wordMatch) fail('Expected a filter value');
    position += wordMatch[0].length;

    if (wordMatch[0] === 'true') return createLiteral(true);
    if (wordMatch[0] === 'false') return createLiteral(false);
    if (wordMatch[0] === 'null') return createLiteral(null);
    fail(`Unknown filter literal "${wordMatch[0]}"`);
  }

  function parsePrimary() {
    skip();
    const character = source[position];

    if (character === '(') {
      position += 1;
      const expression = parseOr();
      if (!consume(')')) fail('Expected a closing parenthesis');
      return expression;
    }
    if (character === '@' || character === '$') return parseFilterReference();
    if (character === '"' || character === "'") return parseStringLiteral();
    if (character === '-' || /\d/.test(character ?? '')) return parseNumberLiteral();
    if (/[A-Za-z_]/.test(character ?? '')) return parseWordLiteral();
    fail('Expected a filter value');
  }

  function parseUnary() {
    skip();
    if (source[position] === '!' && source[position + 1] !== '=') {
      position += 1;
      return { type: 'not', value: parseUnary() };
    }
    return parsePrimary();
  }

  function readComparisonOperator() {
    skip();
    const operators = ['===', '!==', '==', '!=', '<=', '>=', '<', '>'];
    const operator = operators.find((candidate) => source.startsWith(candidate, position));
    if (!operator) return '';
    position += operator.length;
    return operator;
  }

  function parseComparison() {
    const left = parseUnary();
    const operator = readComparisonOperator();
    if (!operator) return left;
    return { type: 'comparison', operator, left, right: parseUnary() };
  }

  function parseAnd() {
    let expression = parseComparison();
    while (consume('&&')) {
      expression = { type: 'and', left: expression, right: parseComparison() };
    }
    return expression;
  }

  function parseOr() {
    let expression = parseAnd();
    while (consume('||')) {
      expression = { type: 'or', left: expression, right: parseAnd() };
    }
    return expression;
  }

  const expression = parseOr();
  skip();
  if (position !== source.length) fail('Unexpected filter expression text');
  return expression;
}

function parseFilterSelector(source, position) {
  if (!source.startsWith('?(')) {
    throw createSyntaxError('A filter must start with ?(', position);
  }

  const closingPosition = scanClosingParenthesis(source, 1);
  if (closingPosition === -1 || closingPosition !== source.length - 1) {
    throw createSyntaxError('Invalid filter expression', position);
  }

  const predicateSource = source.slice(2, -1).trim();
  if (!predicateSource) {
    throw createSyntaxError('A filter expression cannot be empty', position);
  }

  return {
    type: 'filter',
    predicate: parseFilterExpression(predicateSource, position + source.indexOf(predicateSource)),
  };
}

function parseSimpleBracketSelector(source, position) {
  const selector = source.trim();
  const selectorPosition = position + source.indexOf(selector);

  if (!selector) {
    throw createSyntaxError('A bracket selector cannot be empty', position);
  }
  if (selector.startsWith('?')) return parseFilterSelector(selector, selectorPosition);
  if (splitTopLevel(selector, ':').length > 1) return parseSlice(selector, selectorPosition);
  if (selector === '*') return { type: 'wildcard' };
  if (selector[0] === '"' || selector[0] === "'") {
    return { type: 'child', key: parseQuotedString(selector, selectorPosition) };
  }
  if (/^-?\d+$/.test(selector)) {
    return { type: 'index', index: Number.parseInt(selector, 10) };
  }
  if (isBarePropertyName(selector)) return { type: 'child', key: selector };

  throw createSyntaxError('Invalid bracket selector', selectorPosition);
}

function parseBracketContent(source, position) {
  const selectors = splitTopLevel(source, ',');
  if (selectors.length === 1) return parseSimpleBracketSelector(source, position);
  return {
    type: 'union',
    selectors: selectors.map((selector, index) => (
      parseSimpleBracketSelector(selector, position + source.indexOf(selector, index))
    )),
  };
}

function readBracketSelector(source, position) {
  const bracket = scanBracket(source, position);
  return {
    selector: parseBracketContent(bracket.content, position + 1),
    end: bracket.end,
  };
}

/**
 * Parses a JSONPath expression into selector tokens.
 * @param {string} expression JSONPath expression beginning with `$`.
 * @returns {Array<object>} Parsed selector tokens.
 * @throws {JsonPathSyntaxError} When the expression is invalid.
 */
export function parseJsonPath(expression) {
  if (typeof expression !== 'string') {
    throw createSyntaxError('JSONPath expression must be a string');
  }

  const source = expression.trim();
  if (!source) throw createSyntaxError('JSONPath expression is empty', 0);
  if (source[0] !== '$') throw createSyntaxError('JSONPath must begin with $', 0);

  const selectors = [];
  let position = 1;

  while (position < source.length) {
    const character = source[position];
    if (/\s/.test(character)) {
      throw createSyntaxError('Whitespace is not allowed between path selectors', position);
    }

    if (character === '[') {
      const bracket = readBracketSelector(source, position);
      selectors.push(bracket.selector);
      position = bracket.end;
      continue;
    }

    if (character !== '.') {
      throw createSyntaxError('Expected a dot or bracket selector', position);
    }

    if (source[position + 1] === '.') {
      position += 2;
      if (position >= source.length) {
        throw createSyntaxError('Recursive descent requires a selector', position - 2);
      }

      let selector;
      if (source[position] === '[') {
        const bracket = readBracketSelector(source, position);
        selector = bracket.selector;
        position = bracket.end;
      } else if (source[position] === '*') {
        selector = { type: 'wildcard' };
        position += 1;
      } else {
        const property = readBareProperty(source, position);
        selector = { type: 'child', key: property.key };
        position = property.end;
      }
      selectors.push({ type: 'recursive', selector });
      continue;
    }

    position += 1;
    if (source[position] === '*') {
      selectors.push({ type: 'wildcard' });
      position += 1;
    } else {
      const property = readBareProperty(source, position);
      selectors.push({ type: 'child', key: property.key });
      position = property.end;
    }
  }

  return selectors;
}

/**
 * Alias for consumers that prefer tokenizer terminology for JSONPath selectors.
 * @param {string} expression JSONPath expression beginning with `$`.
 * @returns {Array<object>} Parsed selector tokens.
 */
export function tokenizeJsonPath(expression) {
  return parseJsonPath(expression);
}

function normalizeArrayIndex(index, length) {
  const normalized = index < 0 ? length + index : index;
  return normalized >= 0 && normalized < length ? normalized : null;
}

function selectChild(nodes, key) {
  const selected = [];

  nodes.forEach((node) => {
    const { value } = node;
    if (!isContainer(value)) return;

    if (Array.isArray(value)) {
      if (!/^\d+$/.test(key)) return;
      const index = normalizeArrayIndex(Number.parseInt(key, 10), value.length);
      if (index !== null) selected.push({ value: value[index] });
      return;
    }

    if (hasOwn(value, key)) selected.push({ value: value[key] });
  });

  return selected;
}

function selectIndex(nodes, index) {
  const selected = [];
  nodes.forEach((node) => {
    if (!Array.isArray(node.value)) return;
    const normalized = normalizeArrayIndex(index, node.value.length);
    if (normalized !== null) selected.push({ value: node.value[normalized] });
  });
  return selected;
}

function selectWildcard(nodes) {
  const selected = [];
  nodes.forEach((node) => {
    if (!isContainer(node.value)) return;
    if (Array.isArray(node.value)) {
      node.value.forEach((value) => selected.push({ value }));
      return;
    }
    Object.keys(node.value).forEach((key) => selected.push({ value: node.value[key] }));
  });
  return selected;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function sliceIndices(length, startValue, endValue, step) {
  const indices = [];

  if (step > 0) {
    let start = startValue ?? 0;
    let end = endValue ?? length;
    if (start < 0) start += length;
    if (end < 0) end += length;
    start = clamp(start, 0, length);
    end = clamp(end, 0, length);
    for (let index = start; index < end; index += step) indices.push(index);
  } else {
    let start = startValue ?? length - 1;
    let end = endValue ?? -1;
    if (startValue !== null && start < 0) start += length;
    if (endValue !== null && end < 0) end += length;
    start = clamp(start, -1, length - 1);
    end = clamp(end, -1, length - 1);
    for (let index = start; index > end; index += step) indices.push(index);
  }

  return indices;
}

function selectSlice(nodes, selector) {
  const selected = [];
  nodes.forEach((node) => {
    if (!Array.isArray(node.value)) return;
    const indices = sliceIndices(node.value.length, selector.start, selector.end, selector.step);
    indices.forEach((index) => selected.push({ value: node.value[index] }));
  });
  return selected;
}

function resolveReference(reference, current, root) {
  let value = reference.root === '@' ? current : root;

  for (const selector of reference.selectors) {
    if (selector.type === 'child') {
      if (!isContainer(value)) return undefined;
      if (Array.isArray(value)) {
        if (!/^\d+$/.test(selector.key)) return undefined;
        const index = normalizeArrayIndex(Number.parseInt(selector.key, 10), value.length);
        if (index === null) return undefined;
        value = value[index];
      } else {
        if (!hasOwn(value, selector.key)) return undefined;
        value = value[selector.key];
      }
    } else if (selector.type === 'index') {
      if (!Array.isArray(value)) return undefined;
      const index = normalizeArrayIndex(selector.index, value.length);
      if (index === null) return undefined;
      value = value[index];
    }
  }

  return value;
}

function compareValues(operator, left, right) {
  switch (operator) {
    case '==':
    case '===':
      return left === right;
    case '!=':
    case '!==':
      return left !== right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    default:
      return false;
  }
}

function evaluatePredicateNode(node, current, root) {
  switch (node.type) {
    case 'literal':
      return node.value;
    case 'reference':
      return resolveReference(node, current, root);
    case 'not':
      return !evaluatePredicateNode(node.value, current, root);
    case 'and':
      return Boolean(evaluatePredicateNode(node.left, current, root))
        && Boolean(evaluatePredicateNode(node.right, current, root));
    case 'or':
      return Boolean(evaluatePredicateNode(node.left, current, root))
        || Boolean(evaluatePredicateNode(node.right, current, root));
    case 'comparison':
      return compareValues(
        node.operator,
        evaluatePredicateNode(node.left, current, root),
        evaluatePredicateNode(node.right, current, root),
      );
    default:
      return false;
  }
}

function selectFilter(nodes, predicate, root) {
  const selected = [];

  nodes.forEach((node) => {
    if (!isContainer(node.value)) return;
    const candidates = Array.isArray(node.value)
      ? node.value
      : Object.keys(node.value).map((key) => node.value[key]);
    candidates.forEach((value) => {
      if (evaluatePredicateNode(predicate, value, root)) selected.push({ value });
    });
  });

  return selected;
}

function collectContainers(value) {
  const nodes = [];
  const visited = new WeakSet();

  function visit(current) {
    if (!isContainer(current) || visited.has(current)) return;
    visited.add(current);
    nodes.push({ value: current });

    const children = Array.isArray(current)
      ? current
      : Object.keys(current).map((key) => current[key]);
    children.forEach(visit);
  }

  visit(value);
  return nodes;
}

function applySelector(nodes, selector, root) {
  switch (selector.type) {
    case 'child':
      return selectChild(nodes, selector.key);
    case 'index':
      return selectIndex(nodes, selector.index);
    case 'wildcard':
      return selectWildcard(nodes);
    case 'slice':
      return selectSlice(nodes, selector);
    case 'filter':
      return selectFilter(nodes, selector.predicate, root);
    case 'union':
      return selector.selectors.flatMap((unionSelector) => (
        applySelector(nodes, unionSelector, root)
      ));
    case 'recursive': {
      const containers = nodes.flatMap((node) => collectContainers(node.value));
      return applySelector(containers, selector.selector, root);
    }
    default:
      return [];
  }
}

/**
 * Evaluates a JSONPath expression against parsed JSON-compatible data.
 * @param {unknown} data Parsed JSON-compatible data.
 * @param {string} expression JSONPath expression beginning with `$`.
 * @returns {unknown[]} Matching values in document order.
 * @throws {JsonPathSyntaxError} When the expression is invalid.
 */
export function evaluateJsonPath(data, expression) {
  const selectors = parseJsonPath(expression);
  const nodes = selectors.reduce(
    (currentNodes, selector) => applySelector(currentNodes, selector, data),
    [{ value: data }],
  );
  return nodes.map((node) => node.value);
}

/**
 * Parses JSON source without throwing so callers can render validation feedback safely.
 * @param {string} source JSON source text.
 * @returns {{ok: boolean, value: unknown, error: string}} A parsed value or error message.
 */
export function parseJsonInput(source) {
  if (typeof source !== 'string') {
    return { ok: false, value: undefined, error: 'JSON input must be a string.' };
  }
  if (!source.trim()) {
    return { ok: false, value: undefined, error: 'JSON input is empty.' };
  }

  try {
    return { ok: true, value: JSON.parse(source), error: '' };
  } catch (error) {
    return { ok: false, value: undefined, error: `Invalid JSON: ${error.message}` };
  }
}

/**
 * Formats matching JSON nodes as an indented JSON array.
 * @param {unknown[]} matches JSONPath matches.
 * @returns {string} Pretty-printed JSON output.
 */
export function formatJsonPathResults(matches) {
  return JSON.stringify(matches, null, 2);
}

/**
 * Safely evaluates text inputs for the tool UI without exposing parser exceptions.
 * @param {string} jsonSource JSON source text.
 * @param {string} expression JSONPath expression.
 * @returns {{matches: unknown[], count: number, output: string, error: string, ready: boolean}}
 * Evaluation state suitable for rendering.
 */
export function evaluateJsonPathInput(jsonSource, expression) {
  if (typeof jsonSource === 'string' && !jsonSource.trim()) {
    return { matches: [], count: 0, output: '', error: '', ready: false };
  }

  const parsed = parseJsonInput(jsonSource);
  if (!parsed.ok) {
    return { matches: [], count: 0, output: '', error: parsed.error, ready: false };
  }

  if (typeof expression !== 'string' || !expression.trim()) {
    return { matches: [], count: 0, output: '', error: '', ready: false };
  }

  try {
    const matches = evaluateJsonPath(parsed.value, expression);
    return {
      matches,
      count: matches.length,
      output: formatJsonPathResults(matches),
      error: '',
      ready: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSONPath error';
    return {
      matches: [],
      count: 0,
      output: '',
      error: `Invalid JSONPath: ${message}`,
      ready: false,
    };
  }
}
