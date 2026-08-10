/**
 * Dependency-free GraphQL tokenization and printing utilities.
 */

const PUNCTUATORS = new Set(['!', '$', '&', '(', ')', ':', '=', '@', '[', ']', '{', '}', '|', ',']);
const PAIRS = { ')': '(', ']': '[', '}': '{' };

function isNameStart(character) {
  return /[A-Za-z_]/.test(character);
}

function isNameCharacter(character) {
  return /[A-Za-z0-9_]/.test(character);
}

function syntaxError(message, position) {
  return new Error(`GraphQL syntax error at character ${position + 1}: ${message}`);
}

function readString(input, start, block) {
  const delimiterLength = block ? 3 : 1;
  let index = start + delimiterLength;

  while (index < input.length) {
    if (!block && input[index] === '\\') {
      index += 2;
      continue;
    }
    if (input.startsWith(block ? '\"\"\"' : '\"', index)) {
      return index + delimiterLength;
    }
    index += 1;
  }

  throw syntaxError(`unterminated ${block ? 'block ' : ''}string`, start);
}

function tokenize(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('GraphQL input is empty.');
  }

  const tokens = [];
  const stack = [];
  let index = 0;

  while (index < input.length) {
    const character = input[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '#') {
      while (index < input.length && input[index] !== '\n' && input[index] !== '\r') index += 1;
      continue;
    }

    const start = index;
    if (input.startsWith('...', index)) {
      tokens.push({ type: 'spread', value: '...', start, end: index + 3 });
      index += 3;
      continue;
    }
    if (character === '\"') {
      const block = input.startsWith('\"\"\"', index);
      index = readString(input, index, block);
      tokens.push({ type: 'string', value: input.slice(start, index), start, end: index });
      continue;
    }
    if (isNameStart(character)) {
      index += 1;
      while (index < input.length && isNameCharacter(input[index])) index += 1;
      tokens.push({ type: 'name', value: input.slice(start, index), start, end: index });
      continue;
    }
    if (/-|[0-9]/.test(character)) {
      const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(input.slice(index));
      if (!number) throw syntaxError('invalid number', start);
      index += number[0].length;
      tokens.push({ type: 'number', value: number[0], start, end: index });
      continue;
    }
    if (PUNCTUATORS.has(character)) {
      if (PAIRS[character]) {
        const opening = stack.pop();
        if (opening !== PAIRS[character]) {
          throw syntaxError(`unexpected '${character}'`, start);
        }
      } else if (['(', '[', '{'].includes(character)) {
        stack.push(character);
      }
      tokens.push({ type: 'punctuator', value: character, start, end: ++index });
      continue;
    }
    throw syntaxError(`unexpected '${character}'`, start);
  }

  if (stack.length) {
    throw syntaxError(`unclosed '${stack[stack.length - 1]}'`, input.length);
  }
  return tokens;
}

function needsSpace(previous, token) {
  if (!previous) return false;
  if (previous.type === 'spread') return token.value === 'on';
  if (previous.value === '$' || previous.value === '@' || previous.value === '!' ||
      previous.value === '(' || previous.value === '[' || previous.value === ':') return false;
  if (token.value === '!' || token.value === ')' || token.value === ']' || token.value === ':' ||
      token.value === '(' || token.value === '[' || token.value === '@') return false;
  return ['name', 'number', 'string'].includes(previous.type) &&
    ['name', 'number', 'string'].includes(token.type);
}

function compactTokens(tokens) {
  let output = '';
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];
    if (token.value === ',') return;
    if (token.value === '=') {
      output += '=';
      return;
    }
    if (needsSpace(previous, token)) output += ' ';
    output += token.value;
  });
  return output;
}

/**
 * Produces a valid, compact GraphQL document without comments or insignificant whitespace.
 *
 * @param {string} input GraphQL source document.
 * @returns {string} Minified GraphQL document.
 */
export function minifyGraphQL(input) {
  return compactTokens(tokenize(input));
}

/**
 * Pretty-prints a GraphQL document with selection sets on their own indented lines.
 *
 * @param {string} input GraphQL source document.
 * @param {{ indentSize?: number|string }} [options] Formatting options.
 * @returns {string} Pretty-printed GraphQL document.
 */
export function formatGraphQL(input, options = {}) {
  const tokens = tokenize(input);
  const indentSize = Number(options.indentSize ?? 2);
  const indent = ' '.repeat(indentSize === 4 ? 4 : 2);
  const lines = [];
  let line = '';
  let depth = 0;
  let inlineDepth = 0;

  function commit() {
    if (line.trim()) lines.push(`${indent.repeat(depth)}${line.trimEnd()}`);
    line = '';
  }

  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];
    const beginsNewSelection = depth > 0 && inlineDepth === 0 && line &&
      (token.type === 'name' || token.type === 'spread') &&
      (['name', 'number', 'string'].includes(previous?.type) ||
        [')', ']', '!', '}'].includes(previous?.value)) &&
      previous?.value !== 'on';
    if (beginsNewSelection) commit();
    if (token.value === '{') {
      if (line) line += ' ';
      line += '{';
      commit();
      depth += 1;
    } else if (token.value === '}') {
      commit();
      depth -= 1;
      line = '}';
      const next = tokens[index + 1];
      if (!next || next.value !== '{') commit();
    } else if (token.value === ',') {
      line += ', ';
    } else if (token.value === '(' || token.value === '[') {
      inlineDepth += 1;
      line += token.value;
    } else if (token.value === ')' || token.value === ']') {
      inlineDepth -= 1;
      line = `${line.trimEnd()}${token.value}`;
    } else if (token.value === ':') {
      line = `${line.trimEnd()}: `;
    } else if (token.value === '=') {
      line = `${line.trimEnd()} = `;
    } else if (token.value === '|') {
      line = `${line.trimEnd()} | `;
    } else if (token.value === '&') {
      line = `${line.trimEnd()} & `;
    } else {
      if (line && needsSpace(previous, token)) line += ' ';
      line += token.value;
    }
  });
  commit();
  return lines.join('\n');
}
