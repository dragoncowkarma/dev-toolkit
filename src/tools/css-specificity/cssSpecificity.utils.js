const LEGACY_PSEUDO_ELEMENTS = new Set([
  'before', 'after', 'first-line', 'first-letter', 'selection', 'backdrop', 'placeholder',
]);
const MAX_PSEUDOS = new Set(['is', 'not', 'has', 'matches', '-webkit-any']);
const NTH_PSEUDOS = new Set(['nth-child', 'nth-last-child']);
const IDENTIFIER_START = /[a-zA-Z_\u0080-\uFFFF-]/;
const IDENTIFIER_CHARACTER = /[a-zA-Z0-9_\u0080-\uFFFF-]/;

function emptySpecificity() {
  return [0, 0, 0];
}

function compareVectors(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function maximumResult(results) {
  return results.reduce((highest, result) => (
    !highest || compareVectors(result.specificity, highest.specificity) > 0 ? result : highest
  ), null);
}

function isIdentifierStart(character) {
  return Boolean(character) && IDENTIFIER_START.test(character);
}

function readIdentifier(input, start) {
  let index = start;
  if (!isIdentifierStart(input[index])) return null;
  while (index < input.length) {
    if (input[index] === '\\') {
      if (index + 1 >= input.length) return null;
      index += 2;
    } else if (IDENTIFIER_CHARACTER.test(input[index])) {
      index += 1;
    } else {
      break;
    }
  }
  return { value: input.slice(start, index), end: index };
}

function readBalanced(input, start, opener, closer) {
  let depth = 1;
  let quote = null;
  for (let index = start + 1; index < input.length; index += 1) {
    const character = input[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === opener) {
      depth += 1;
    } else if (character === closer) {
      depth -= 1;
      if (depth === 0) return { content: input.slice(start + 1, index), end: index + 1 };
    }
  }
  return null;
}

function splitTopLevel(input, separator = ',') {
  const entries = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  let quote = null;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(') parentheses += 1;
    else if (character === ')') parentheses -= 1;
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets -= 1;
    else if (character === separator && parentheses === 0 && brackets === 0) {
      entries.push(input.slice(start, index).trim());
      start = index + 1;
    }
  }
  entries.push(input.slice(start).trim());
  return entries;
}

function findNthOfArgument(input) {
  let parentheses = 0;
  let brackets = 0;
  let quote = null;
  for (let index = 0; index < input.length - 1; index += 1) {
    const character = input[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(') parentheses += 1;
    else if (character === ')') parentheses -= 1;
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets -= 1;
    else if (parentheses === 0 && brackets === 0
      && input.slice(index, index + 2).toLowerCase() === 'of'
      && /\s/.test(input[index - 1] ?? '') && /\s/.test(input[index + 2] ?? '')) {
      return input.slice(index + 2).trim();
    }
  }
  return '';
}

function token(type, value, specificity) {
  return { type, value, specificity };
}

function parseSelector(selector) {
  const specificity = emptySpecificity();
  const tokens = [];
  let index = 0;

  function add(type, value, vector) {
    vector.forEach((amount, position) => { specificity[position] += amount; });
    tokens.push(token(type, value, vector));
  }

  while (index < selector.length) {
    const character = selector[index];
    if (/\s/.test(character) || character === '>' || character === '+' || character === '~'
      || character === '|' || character === '*') {
      index += 1;
      continue;
    }
    if (character === '#') {
      const identifier = readIdentifier(selector, index + 1);
      if (!identifier) return { error: 'An ID selector needs a name.' };
      add('ID', `#${identifier.value}`, [1, 0, 0]);
      index = identifier.end;
      continue;
    }
    if (character === '.') {
      const identifier = readIdentifier(selector, index + 1);
      if (!identifier) return { error: 'A class selector needs a name.' };
      add('Class', `.${identifier.value}`, [0, 1, 0]);
      index = identifier.end;
      continue;
    }
    if (character === '[') {
      const attribute = readBalanced(selector, index, '[', ']');
      if (!attribute || !attribute.content.trim()) {
        return { error: 'Attribute selectors need a closing bracket.' };
      }
      add('Attribute', `[${attribute.content.trim()}]`, [0, 1, 0]);
      index = attribute.end;
      continue;
    }
    if (character === ':') {
      const pseudoElement = selector[index + 1] === ':';
      const nameStart = index + (pseudoElement ? 2 : 1);
      const identifier = readIdentifier(selector, nameStart);
      if (!identifier) return { error: 'A pseudo selector needs a name.' };
      const name = identifier.value.toLowerCase();
      const displayName = `${pseudoElement ? '::' : ':'}${identifier.value}`;
      if (selector[identifier.end] !== '(') {
        add(pseudoElement || LEGACY_PSEUDO_ELEMENTS.has(name) ? 'Pseudo-element' : 'Pseudo-class',
          displayName,
          pseudoElement || LEGACY_PSEUDO_ELEMENTS.has(name) ? [0, 0, 1] : [0, 1, 0]);
        index = identifier.end;
        continue;
      }
      const functionArgument = readBalanced(selector, identifier.end, '(', ')');
      if (!functionArgument) {
        return { error: `${displayName}() is missing its closing parenthesis.` };
      }
      const functionLabel = `${displayName}(${functionArgument.content})`;
      if (pseudoElement) {
        add('Pseudo-element', functionLabel, [0, 0, 1]);
      } else if (name === 'where') {
        const nested = analyzeSelectorList(functionArgument.content);
        if (nested.length === 0 || nested.some((entry) => entry.error)) {
          return { error: 'Invalid selector inside :where().' };
        }
        tokens.push(token('Zero-specificity pseudo-class', functionLabel, [0, 0, 0]));
      } else if (MAX_PSEUDOS.has(name)) {
        const nested = analyzeSelectorList(functionArgument.content);
        if (nested.length === 0 || nested.some((entry) => entry.error)) {
          return { error: `Invalid selector list inside ${displayName}().` };
        }
        const maximum = maximumResult(nested);
        add('Pseudo-class (maximum argument)', functionLabel, maximum.specificity);
        tokens.push(...maximum.tokens.map((item) => ({ ...item, nested: true })));
      } else if (NTH_PSEUDOS.has(name)) {
        add('Pseudo-class', functionLabel, [0, 1, 0]);
        const ofArgument = findNthOfArgument(functionArgument.content);
        if (ofArgument) {
          const nested = analyzeSelectorList(ofArgument);
          if (nested.length === 0 || nested.some((entry) => entry.error)) {
            return { error: `Invalid selector list after of in ${displayName}().` };
          }
          const maximum = maximumResult(nested);
          add('nth-child of-selector maximum', ofArgument, maximum.specificity);
          tokens.push(...maximum.tokens.map((item) => ({ ...item, nested: true })));
        }
      } else {
        add('Pseudo-class', functionLabel, [0, 1, 0]);
      }
      index = functionArgument.end;
      continue;
    }
    const identifier = readIdentifier(selector, index);
    if (identifier) {
      if (selector[identifier.end] === '|') {
        const localName = readIdentifier(selector, identifier.end + 1);
        if (selector[identifier.end + 1] === '*') {
          index = identifier.end + 2;
        } else if (localName) {
          add('Type', `${identifier.value}|${localName.value}`, [0, 0, 1]);
          index = localName.end;
        } else {
          return { error: 'A namespace selector needs a local name.' };
        }
      } else {
        add('Type', identifier.value, [0, 0, 1]);
        index = identifier.end;
      }
      continue;
    }
    return { error: `Unexpected character "${character}".` };
  }
  return { specificity, tokens };
}

function extractSelectorInput(rawInput) {
  const input = rawInput.trim();
  const inline = input.match(/^style\s*=\s*(["']).*\1\s*$/is);
  if (inline) return { selector: input, inline: true, important: /!\s*important\b/i.test(input) };
  const declaration = input.match(/^(.+?)\s*\{[\s\S]*\}\s*$/);
  return {
    selector: declaration ? declaration[1].trim() : input,
    inline: false,
    important: /!\s*important\b/i.test(input),
  };
}

/**
 * Splits a comma-separated selector list without splitting commas in arguments or attributes.
 * @param {unknown} input CSS selector list text.
 * @returns {string[]} Individual selector strings, including invalid empty entries for reporting.
 */
export function splitSelectorList(input) {
  if (typeof input !== 'string') return [];
  return splitTopLevel(input.trim());
}

/**
 * Calculates Selectors Level 4 specificity for a selector or CSS declaration snippet.
 * @param {unknown} input A selector, selector list entry, inline style, or simple CSS rule.
 * @returns {{selector: string, specificity: number[], cascade: number[], tokens: object[],
 *   inline: boolean, important: boolean, error: string|null}} A non-throwing specificity analysis.
 */
export function calculateSpecificity(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return {
      selector: '', specificity: emptySpecificity(), cascade: [0, 0, 0, 0], tokens: [],
      inline: false, important: false, error: 'Enter a CSS selector.',
    };
  }
  const { selector, inline, important } = extractSelectorInput(input);
  if (inline) {
    return {
      selector,
      specificity: emptySpecificity(),
      cascade: [1, 0, 0, 0],
      tokens: [token('Inline style', 'style attribute', [1, 0, 0])],
      inline: true,
      important,
      error: null,
    };
  }
  const parsed = parseSelector(selector);
  if (parsed.error) {
    return {
      selector, specificity: emptySpecificity(), cascade: [0, 0, 0, 0], tokens: [], inline,
      important, error: parsed.error,
    };
  }
  return {
    selector,
    specificity: parsed.specificity,
    cascade: [0, ...parsed.specificity],
    tokens: parsed.tokens,
    inline,
    important,
    error: null,
  };
}

/**
 * Analyzes every selector in an input list, preserving source order for ties.
 * @param {unknown} input Comma-separated or newline-delimited CSS selectors.
 * @returns {ReturnType<typeof calculateSpecificity>[]} Analyses for each selector.
 */
export function analyzeSelectorList(input) {
  if (typeof input !== 'string' || !input.trim()) return [];
  const entries = splitSelectorList(input).flatMap((entry) => entry.split(/\r?\n/));
  return entries.map((entry) => calculateSpecificity(entry.trim()));
}

/**
 * Orders analyses by CSS declaration priority, inline status, then specificity.
 * @param {ReturnType<typeof calculateSpecificity>[]} analyses Results to sort.
 * @param {'ascending'|'descending'} [direction='descending'] Requested priority order.
 * @returns {ReturnType<typeof calculateSpecificity>[]} A new, stable sorted array.
 */
export function sortSpecificity(analyses, direction = 'descending') {
  const multiplier = direction === 'ascending' ? 1 : -1;
  return analyses.map((analysis, index) => ({ analysis, index })).sort((left, right) => {
    if (left.analysis.error && right.analysis.error) return left.index - right.index;
    if (left.analysis.error) return 1;
    if (right.analysis.error) return -1;
    const important = Number(left.analysis.important) - Number(right.analysis.important);
    const cascade = compareVectors(left.analysis.cascade, right.analysis.cascade);
    return (important || cascade || (left.index - right.index)) * multiplier;
  }).map(({ analysis }) => analysis);
}

/**
 * Compares two selector analyses using declaration priority and cascade specificity.
 * @param {ReturnType<typeof calculateSpecificity>} left First selector analysis.
 * @param {ReturnType<typeof calculateSpecificity>} right Second selector analysis.
 * @returns {number} Positive when left has higher priority, negative when right does.
 */
export function compareSpecificity(left, right) {
  if (left.important !== right.important) return left.important ? 1 : -1;
  return compareVectors(left.cascade, right.cascade);
}
