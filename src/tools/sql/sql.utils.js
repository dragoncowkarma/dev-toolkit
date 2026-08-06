/** Keyword casing options accepted by {@link formatSql}. */
export const KEYWORD_CASE = {
  UPPER: 'upper',
  LOWER: 'lower',
  PRESERVE: 'preserve',
};

/** Indentation width options accepted by {@link formatSql}. */
export const INDENT_SIZE = {
  TWO: '2',
  FOUR: '4',
  TAB: 'tab',
};

const WHITESPACE_RE = /\s/;
const WORD_START_RE = /[A-Za-z_]/;
const WORD_CHAR_RE = /[A-Za-z0-9_$]/;
const DIGIT_RE = /[0-9]/;
const NUMBER_CHAR_RE = /[0-9.]/;
const OPERATOR_CHAR_RE = /[=<>!+\-*/%|&^~]/;
const SINGLE_PUNCTUATION = '(),;.';

// Multi-word phrases are matched greedily before falling back to single
// keywords, so e.g. "LEFT OUTER JOIN" is not split into "LEFT" + "OUTER JOIN".
const KEYWORD_PHRASES = [
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
  'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
  'GROUP BY', 'ORDER BY', 'INSERT INTO', 'DELETE FROM', 'UNION ALL',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE INDEX', 'DROP INDEX',
  'PRIMARY KEY', 'FOREIGN KEY', 'NOT NULL', 'IS NOT', 'NOT IN', 'NOT LIKE', 'IS NULL',
];

const SINGLE_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'AS', 'ON', 'IN', 'LIKE',
  'BETWEEN', 'EXISTS', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC',
  'JOIN', 'HAVING', 'LIMIT', 'OFFSET', 'VALUES', 'UPDATE', 'SET', 'UNION', 'RETURNING',
  'INTO', 'TABLE', 'INDEX', 'KEY', 'DEFAULT', 'UNIQUE', 'CHECK', 'REFERENCES', 'IS',
  'TRUE', 'FALSE', 'WITH', 'ALL', 'GROUP', 'BY', 'ORDER', 'INNER', 'LEFT', 'RIGHT',
  'FULL', 'OUTER', 'CROSS', 'CREATE', 'ALTER', 'DROP', 'INSERT', 'DELETE', 'PRIMARY', 'FOREIGN',
]);

// Keywords that always start a new (top-level) line when formatting.
const CLAUSE_BREAK_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE',
  'ALTER TABLE', 'DROP TABLE', 'UNION', 'UNION ALL', 'RETURNING',
]);

// Join keywords break onto a new line at the same indent as FROM.
const JOIN_BREAK_KEYWORDS = new Set([
  'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
]);

// AND / OR break onto a new line, indented one level deeper than the
// enclosing clause (WHERE / HAVING / ON).
const LOGICAL_BREAK_KEYWORDS = new Set(['AND', 'OR']);

/**
 * Splits raw SQL text into a flat token stream (whitespace, comments, string
 * literals, words, numbers, punctuation and operators).
 *
 * @param {string} sql Raw SQL source text.
 * @returns {Array<{type: string, value: string}>} Ordered token list.
 * @throws {Error} When a string literal or block comment is never closed.
 */
function tokenize(sql) {
  const tokens = [];
  const length = sql.length;
  let i = 0;

  while (i < length) {
    const char = sql[i];

    if (WHITESPACE_RE.test(char)) {
      let j = i + 1;
      while (j < length && WHITESPACE_RE.test(sql[j])) j += 1;
      tokens.push({ type: 'whitespace', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    if (char === '-' && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < length && sql[j] !== '\n') j += 1;
      tokens.push({ type: 'comment_line', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    if (char === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) {
        throw new Error('Unterminated block comment: missing closing "*/".');
      }
      tokens.push({ type: 'comment_block', value: sql.slice(i, end + 2) });
      i = end + 2;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      let j = i + 1;
      let closed = false;
      while (j < length) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) {
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        if (sql[j] === '\\' && quote !== '`') {
          j += 2;
          continue;
        }
        j += 1;
      }
      if (!closed) {
        throw new Error(`Unterminated string literal starting at position ${i}.`);
      }
      tokens.push({ type: 'string', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    if (WORD_START_RE.test(char)) {
      let j = i + 1;
      while (j < length && WORD_CHAR_RE.test(sql[j])) j += 1;
      tokens.push({ type: 'word', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    if (DIGIT_RE.test(char)) {
      let j = i + 1;
      while (j < length && NUMBER_CHAR_RE.test(sql[j])) j += 1;
      tokens.push({ type: 'number', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    if (SINGLE_PUNCTUATION.includes(char)) {
      tokens.push({ type: 'punct', value: char });
      i += 1;
      continue;
    }

    if (OPERATOR_CHAR_RE.test(char)) {
      let j = i + 1;
      while (j < length && OPERATOR_CHAR_RE.test(sql[j])) j += 1;
      tokens.push({ type: 'operator', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    tokens.push({ type: 'other', value: char });
    i += 1;
  }

  return tokens;
}

/**
 * Drops whitespace tokens while recording whether each remaining token was
 * preceded by whitespace in the original source.
 *
 * @param {Array<{type: string, value: string}>} rawTokens Tokens from {@link tokenize}.
 * @returns {Array<{type: string, value: string, spaceBefore: boolean}>} Significant tokens.
 */
function buildSignificantTokens(rawTokens) {
  const result = [];
  let spaceBefore = true;

  for (const token of rawTokens) {
    if (token.type === 'whitespace') {
      spaceBefore = true;
      continue;
    }
    result.push({ ...token, spaceBefore });
    spaceBefore = false;
  }

  return result;
}

function matchesPhraseAt(tokens, startIndex, words) {
  let index = startIndex;
  for (const word of words) {
    const token = tokens[index];
    if (!token || token.type !== 'word' || token.value.toUpperCase() !== word) {
      return false;
    }
    index += 1;
  }
  return true;
}

/**
 * Combines consecutive word tokens into keyword phrases (e.g. "GROUP BY")
 * and tags recognized single-word keywords, leaving everything else as
 * plain identifiers.
 *
 * @param {Array<{type: string, value: string, spaceBefore: boolean}>} tokens Significant tokens.
 * @returns {Array<object>} Tokens with keyword phrases merged.
 */
function mergeKeywordPhrases(tokens) {
  const merged = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type !== 'word') {
      merged.push(token);
      i += 1;
      continue;
    }

    let matchedWords = null;
    for (const phrase of KEYWORD_PHRASES) {
      const words = phrase.split(' ');
      if (matchesPhraseAt(tokens, i, words)) {
        matchedWords = words;
        break;
      }
    }

    if (matchedWords) {
      const originalWords = tokens.slice(i, i + matchedWords.length).map((t) => t.value);
      merged.push({
        type: 'keyword',
        phrase: matchedWords.join(' '),
        words: originalWords,
        spaceBefore: token.spaceBefore,
      });
      i += matchedWords.length;
      continue;
    }

    const upper = token.value.toUpperCase();
    if (SINGLE_KEYWORDS.has(upper)) {
      merged.push({
        type: 'keyword',
        phrase: upper,
        words: [token.value],
        spaceBefore: token.spaceBefore,
      });
    } else {
      merged.push({ type: 'identifier', value: token.value, spaceBefore: token.spaceBefore });
    }
    i += 1;
  }

  return merged;
}

function isSubqueryParen(tokens, parenIndex) {
  for (let j = parenIndex + 1; j < tokens.length; j += 1) {
    const token = tokens[j];
    if (token.type === 'comment_line' || token.type === 'comment_block') continue;
    return token.type === 'keyword' && token.phrase === 'SELECT';
  }
  return false;
}

/**
 * Finds the column-definition paren that immediately follows a
 * "CREATE TABLE <name>" so its contents can be listed one column per line.
 *
 * @param {Array<object>} tokens Merged keyword/identifier token stream.
 * @returns {Set<number>} Indices of parens that hold a definition list.
 */
function computeDefinitionListParens(tokens) {
  const indices = new Set();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== 'keyword' || token.phrase !== 'CREATE TABLE') continue;

    for (let j = i + 1; j < tokens.length; j += 1) {
      const next = tokens[j];
      if (next.type === 'punct' && next.value === '(') {
        indices.add(j);
        break;
      }
      if (next.type === 'keyword' && CLAUSE_BREAK_KEYWORDS.has(next.phrase)) {
        break;
      }
    }
  }

  return indices;
}

function keywordText(token, keywordCase) {
  if (keywordCase === KEYWORD_CASE.UPPER) {
    return token.words.map((w) => w.toUpperCase()).join(' ');
  }
  if (keywordCase === KEYWORD_CASE.LOWER) {
    return token.words.map((w) => w.toLowerCase()).join(' ');
  }
  return token.words.join(' ');
}

/**
 * Renders a merged token stream into indented, line-broken SQL text.
 *
 * @param {Array<object>} tokens Merged keyword/identifier token stream.
 * @param {{keywordCase: string, indentUnit: string}} options Render options.
 * @returns {string} Formatted SQL text.
 */
function renderTokens(tokens, { keywordCase, indentUnit }) {
  const definitionListParens = computeDefinitionListParens(tokens);
  const lines = [];
  const parenStack = [];
  let currentIndentLevel = 0;
  let currentText = '';
  let hasContent = false;
  let indentLevel = 0;
  let lastNoSpaceAfter = true;

  const indentFor = (level) => indentUnit.repeat(Math.max(level, 0));

  // Breaking twice in a row (e.g. right after an opening subquery paren,
  // before its first keyword) must not emit a blank line in between.
  function breakLine(level) {
    if (hasContent) {
      lines.push(indentFor(currentIndentLevel) + currentText);
    }
    currentIndentLevel = level;
    currentText = '';
    hasContent = false;
    lastNoSpaceAfter = true;
  }

  function writeText(text, { noSpaceBefore = false, noSpaceAfter = false } = {}) {
    const needsSpace = !lastNoSpaceAfter && !noSpaceBefore;
    currentText += (needsSpace ? ' ' : '') + text;
    hasContent = true;
    lastNoSpaceAfter = noSpaceAfter;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.type === 'comment_line') {
      writeText(token.value);
      breakLine(indentLevel);
      continue;
    }

    if (token.type === 'comment_block') {
      writeText(token.value);
      continue;
    }

    if (token.type === 'keyword') {
      if (CLAUSE_BREAK_KEYWORDS.has(token.phrase) || JOIN_BREAK_KEYWORDS.has(token.phrase)) {
        breakLine(indentLevel);
        writeText(keywordText(token, keywordCase));
      } else if (LOGICAL_BREAK_KEYWORDS.has(token.phrase)) {
        breakLine(indentLevel + 1);
        writeText(keywordText(token, keywordCase));
      } else {
        writeText(keywordText(token, keywordCase));
      }
      continue;
    }

    if (token.type === 'punct') {
      if (token.value === '(') {
        const subquery = isSubqueryParen(tokens, i);
        const defList = definitionListParens.has(i);
        writeText('(', { noSpaceBefore: !token.spaceBefore, noSpaceAfter: !(subquery || defList) });
        parenStack.push({ subquery, defList });
        if (subquery || defList) {
          indentLevel += 1;
          breakLine(indentLevel);
        }
        continue;
      }

      if (token.value === ')') {
        const frame = parenStack.pop() || { subquery: false, defList: false };
        if (frame.subquery || frame.defList) {
          indentLevel -= 1;
          breakLine(indentLevel);
        }
        writeText(')', { noSpaceBefore: true });
        continue;
      }

      if (token.value === ',') {
        writeText(',', { noSpaceBefore: true });
        const top = parenStack[parenStack.length - 1];
        if (top && top.defList) {
          breakLine(indentLevel);
        }
        continue;
      }

      if (token.value === ';') {
        writeText(';', { noSpaceBefore: true });
        continue;
      }

      if (token.value === '.') {
        writeText('.', { noSpaceBefore: true, noSpaceAfter: true });
        continue;
      }

      writeText(token.value);
      continue;
    }

    // identifier, string, number, operator, other
    writeText(token.value);
  }

  if (hasContent) {
    lines.push(indentFor(currentIndentLevel) + currentText);
  }

  return lines.join('\n');
}

function resolveIndentUnit(indentSize) {
  if (indentSize === INDENT_SIZE.TAB) return '\t';
  if (indentSize === INDENT_SIZE.FOUR) return '    ';
  if (indentSize === INDENT_SIZE.TWO) return '  ';
  throw new TypeError('Indent size must be "2", "4", or "tab".');
}

/**
 * Reformats a SQL query with keyword-aware line breaks, nested subquery
 * indentation, and a configurable keyword casing / indent width.
 *
 * @param {string} sql SQL source text to format.
 * @param {object} [options] Formatting options.
 * @param {'upper'|'lower'|'preserve'} [options.keywordCase] Keyword casing. Defaults to upper.
 * @param {'2'|'4'|'tab'} [options.indentSize] Indent width. Defaults to "2".
 * @returns {string} Formatted SQL text.
 * @throws {Error} When the input contains an unterminated string literal or block comment.
 */
export function formatSql(sql, options = {}) {
  if (typeof sql !== 'string') {
    throw new TypeError('SQL input must be a string.');
  }
  const keywordCase = options.keywordCase ?? KEYWORD_CASE.UPPER;
  if (!Object.values(KEYWORD_CASE).includes(keywordCase)) {
    throw new TypeError('Keyword case must be "upper", "lower", or "preserve".');
  }
  const indentUnit = resolveIndentUnit(options.indentSize ?? INDENT_SIZE.TWO);

  if (!sql.trim()) return '';

  const rawTokens = tokenize(sql);
  const significant = buildSignificantTokens(rawTokens);
  const merged = mergeKeywordPhrases(significant);

  return renderTokens(merged, { keywordCase, indentUnit });
}

/**
 * Collapses a SQL query to a single line by removing comments and reducing
 * runs of whitespace/newlines to a single space. String literal contents
 * (including their internal whitespace and quote characters) are preserved
 * verbatim.
 *
 * @param {string} sql SQL source text to minify.
 * @returns {string} Minified, single-line SQL text.
 * @throws {Error} When the input contains an unterminated string literal or block comment.
 */
export function minifySql(sql) {
  if (typeof sql !== 'string') {
    throw new TypeError('SQL input must be a string.');
  }
  if (!sql.trim()) return '';

  const tokens = tokenize(sql);
  let result = '';
  let prevWasSpace = true;
  // Set when a comment is dropped with no adjacent whitespace, so the
  // tokens on either side of it don't concatenate into one.
  let pendingBoundary = false;

  for (const token of tokens) {
    if (token.type === 'comment_line' || token.type === 'comment_block') {
      if (!prevWasSpace) {
        pendingBoundary = true;
      }
      continue;
    }

    if (token.type === 'whitespace') {
      if (!prevWasSpace) {
        result += ' ';
        prevWasSpace = true;
      }
      pendingBoundary = false;
      continue;
    }

    if (pendingBoundary && !prevWasSpace) {
      result += ' ';
      prevWasSpace = true;
    }
    pendingBoundary = false;

    result += token.value;
    prevWasSpace = false;
  }

  return result.trim();
}
