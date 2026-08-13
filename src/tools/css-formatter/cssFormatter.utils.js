/**
 * Pure, dependency-free CSS formatting and minification utilities.
 *
 * Design overview
 * ----------------
 * 1. `extractProtectedRegions` pulls comments, quoted strings, and `url(...)`
 *    calls out of the source text and replaces each with a small opaque
 *    placeholder token. Everything downstream only ever sees the placeholder,
 *    never the real content, so whitespace/structure normalization can never
 *    corrupt a data URL, a string containing `{`/`;`, or a comment.
 * 2. `parseCssEvents` walks the placeholder text once, tracking brace and
 *    paren depth, and emits a flat list of structural events (`rule-start`,
 *    `rule-end`, `declaration`, `statement`, `comment`). It never throws;
 *    instead it reports whether braces stayed balanced.
 * 3. `formatCss` / `minifyCss` render that same event list two different
 *    ways, then substitute the placeholders back for the real content.
 *
 * If anything is unbalanced (or an unexpected error slips through), both
 * public entry points fall back to returning the original input unchanged
 * alongside a warning message - they never throw.
 */

const PH_START = '\uE000';
const PH_END = '\uE001';
const PLACEHOLDER_RE = /\uE000(\d+)\uE001/g;

/**
 * @typedef {{ kind: 'comment' | 'string' | 'url', raw: string, important: boolean }} ProtectedEntry
 */

function isIdentBoundary(char) {
  return char === undefined || !/[\w-]/.test(char);
}

/**
 * Replaces comments, quoted strings, and `url(...)` calls with opaque
 * placeholder tokens so later passes can treat the rest of the text as plain
 * structural CSS without risking corrupting their contents.
 *
 * @param {string} rawInput - Raw CSS source.
 * @returns {{ text: string, store: ProtectedEntry[], unterminated: boolean }}
 * The placeholder text, the table of extracted regions it references, and
 * whether an unterminated (EOF-closed) comment or string - one that never
 * reaches its closing `*\/` or matching quote before EOF or an unescaped
 * newline - was encountered - such input is malformed and should not be
 * treated as a normal protected region.
 */
export function extractProtectedRegions(rawInput) {
  const store = [];
  let out = '';
  let i = 0;
  let unterminated = false;
  // CSS input preprocessing normalizes CR, FF, and CRLF newline forms to a
  // single LF before tokenization even begins (see the CSS Syntax Module's
  // "preprocessing the input stream" step). Doing the same here - rather
  // than only ever checking for '\n' - keeps unescaped-newline "bad string"
  // detection correct for all CSS newline forms, while an escaped `\` +
  // CRLF continuation collapses to `\` + LF first and is still consumed as
  // a single escaped unit below, so it never falsely trips that check.
  const input = rawInput.replace(/\r\n?|\f/g, '\n');
  const { length: n } = input;

  const push = (kind, raw) => {
    store.push({ kind, raw, important: kind === 'comment' && raw.startsWith('/*!') });
    out += PH_START + (store.length - 1) + PH_END;
  };

  while (i < n) {
    const char = input[i];

    if (char === '/' && input[i + 1] === '*') {
      const close = input.indexOf('*/', i + 2);
      if (close === -1) unterminated = true;
      const end = close === -1 ? n : close + 2;
      push('comment', input.slice(i, end));
      i = end;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let j = i + 1;
      while (j < n && input[j] !== quote && input[j] !== '\n') {
        j += input[j] === '\\' ? 2 : 1;
      }
      // Reaching EOF or an unescaped newline before the closing quote is
      // malformed CSS (an unterminated string), not a normally-closed one -
      // record it so callers fall back instead of rendering bogus output.
      if (j >= n || input[j] !== quote) unterminated = true;
      j = Math.min(j + 1, n);
      push('string', input.slice(i, j));
      i = j;
      continue;
    }

    if ((char === 'u' || char === 'U')
      && /^url\(/i.test(input.slice(i, i + 4))
      && isIdentBoundary(input[i - 1])
    ) {
      let j = i + 4;
      while (j < n && input[j] !== ')') {
        if (input[j] === '"' || input[j] === "'") {
          const quote = input[j];
          j += 1;
          while (j < n && input[j] !== quote) {
            j += input[j] === '\\' ? 2 : 1;
          }
          j += 1;
        } else {
          j += 1;
        }
      }
      j = Math.min(j + 1, n);
      push('url', input.slice(i, j));
      i = j;
      continue;
    }

    out += char;
    i += 1;
  }

  return { text: out, store, unterminated };
}

/**
 * Substitutes placeholder tokens back for the real content they replaced.
 *
 * @param {string} text - Text containing placeholder tokens.
 * @param {ProtectedEntry[]} store - Table produced by `extractProtectedRegions`.
 * @param {{ stripComments?: boolean }} [options] - When `stripComments` is
 * true, non-important comments (any comment not starting with `/*!`) are
 * removed instead of restored; used by the minifier.
 * @returns {string} Text with every placeholder resolved.
 */
export function restoreProtectedRegions(text, store, { stripComments = false } = {}) {
  return text.replace(PLACEHOLDER_RE, (match, idText) => {
    const entry = store[Number(idText)];
    if (!entry) return '';
    if (entry.kind === 'comment' && stripComments && !entry.important) return '';
    return entry.raw;
  });
}

/**
 * Removes non-important comment placeholders in-place, leaving string and
 * url placeholders untouched for later restoration.
 *
 * A CSS comment is not an implicit token separator - `.a/* c *\/.b` must
 * stay adjacent as `.a.b`, not become the descendant selector `.a .b`. A
 * single space is only reintroduced when the comment sits directly between
 * two identifier characters (e.g. `foo/* c *\/bar`), where deleting it
 * outright would fuse two separate tokens into one (`foobar`).
 *
 * A removable comment's neighbor may itself be another removable comment -
 * `red/* one *\//* two *\/blue` - so the boundary check looks past any run of
 * adjacent removable-comment placeholders to find the nearest real character.
 * Each comment in the run independently sees the same identifier characters
 * on either side and reintroduces its own space; any resulting duplicate
 * spaces collapse to one in the whitespace-collapsing pass that follows.
 */
function stripMinifiableComments(text, store) {
  const tokens = [];
  let last = 0;
  let match = PLACEHOLDER_RE.exec(text);
  while (match) {
    if (match.index > last) {
      tokens.push({ isPlaceholder: false, value: text.slice(last, match.index) });
    }
    tokens.push({ isPlaceholder: true, id: Number(match[1]) });
    last = match.index + match[0].length;
    match = PLACEHOLDER_RE.exec(text);
  }
  if (last < text.length) tokens.push({ isPlaceholder: false, value: text.slice(last) });

  const isRemovableComment = (token) => {
    if (!token.isPlaceholder) return false;
    const entry = store[token.id];
    return Boolean(entry) && entry.kind === 'comment' && !entry.important;
  };

  const neighborChar = (fromIndex, step) => {
    for (let k = fromIndex + step; k >= 0 && k < tokens.length; k += step) {
      const token = tokens[k];
      if (!token.isPlaceholder) return step === -1 ? token.value.slice(-1) : token.value[0];
      if (!isRemovableComment(token)) return undefined;
    }
    return undefined;
  };

  return tokens.map((token, index) => {
    if (!token.isPlaceholder) return token.value;
    if (!isRemovableComment(token)) return PH_START + token.id + PH_END;
    const before = neighborChar(index, -1);
    const after = neighborChar(index, 1);
    return !isIdentBoundary(before) && !isIdentBoundary(after) ? ' ' : '';
  }).join('');
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Finds the index of the first `:` that sits outside of any parentheses -
 * i.e. the property/value separator of a declaration, ignoring colons that
 * appear inside functions such as `var(--x, a:b)`-like edge cases.
 */
function findTopLevelColon(text) {
  let depth = 0;
  for (let k = 0; k < text.length; k += 1) {
    const char = text[k];
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === ':' && depth === 0) return k;
  }
  return -1;
}

/**
 * A `(` that is directly attached to a preceding identifier - `selector(`,
 * `:not(`, `:is(` - opens a function/pseudo-class argument list, never a
 * media-feature group. A media-feature group's `(` is always "bare": the
 * start of the prelude, or preceded by whitespace/a combinator (`@media (`,
 * `and (`, `not (`), a comma, or another paren. Only bare parens can contain
 * a feature colon such as `(min-width: 600px)`.
 */
function isBareParenStart(out) {
  const lastChar = out.slice(-1);
  return lastChar === '' || !/[\w-]/.test(lastChar);
}

/**
 * A `:` inside a bare (media-feature) paren is only a media-feature
 * separator (e.g. `(min-width: 600px)`) when it directly follows the
 * feature's identifier, ignoring intervening whitespace such as
 * `(min-width : 600px)`.
 */
function isFeatureColonContext(out) {
  const lastChar = out.replace(/\s+$/, '').slice(-1);
  return lastChar !== '' && /[\w-]/.test(lastChar);
}

/**
 * Rewrites every `:` that appears inside a bare (media-feature) paren AND
 * directly follows an identifier (e.g. media features like
 * `(min-width: 600px)`) to use `replacement` for its surrounding whitespace.
 * Colons outside of parens are left untouched, and so are colons inside a
 * function/pseudo-class argument list - `selector(:hover)`, `:not(:hover)`,
 * `:is(div:hover)` - since that paren isn't a feature group at all, whatever
 * an identifier may sit directly before the colon inside it.
 */
function transformColonsInParens(text, replacement) {
  let depth = 0;
  let out = '';
  const parenIsFeatureGroup = [];
  for (let k = 0; k < text.length; k += 1) {
    const char = text[k];
    if (char === '(') {
      parenIsFeatureGroup.push(isBareParenStart(out));
      depth += 1;
      out += char;
    } else if (char === ')') {
      parenIsFeatureGroup.pop();
      depth = Math.max(0, depth - 1);
      out += char;
    } else if (
      char === ':' &&
      depth > 0 &&
      parenIsFeatureGroup[parenIsFeatureGroup.length - 1] &&
      isFeatureColonContext(out)
    ) {
      out = out.replace(/\s+$/, '') + replacement;
      let k2 = k + 1;
      while (k2 < text.length && /\s/.test(text[k2])) k2 += 1;
      k = k2 - 1;
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * Splits `text` on commas that sit outside of any parentheses, so selector
 * lists split correctly while argument lists inside `:not(a, b)` stay intact.
 */
function splitTopLevelCommas(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let k = 0; k < text.length; k += 1) {
    const char = text[k];
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, k).trim());
      start = k + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/**
 * Detects whether `buffer` (the text accumulated since the last statement
 * boundary) looks like the start of a custom-property declaration, e.g.
 * `--theme: ` or `--theme: some-value `. Used to tell a `{` that opens a
 * balanced block inside a custom property's value (valid per the CSS custom
 * property "declaration-value" grammar, e.g. `--theme: { color: red; };`)
 * apart from a `{` that opens a nested rule.
 */
function looksLikeCustomPropertyDeclaration(buffer) {
  return /^--[^\s:{}][^:{}]*:/.test(buffer.trimStart());
}

/**
 * Parses placeholder-substituted CSS text into a flat, renderer-agnostic
 * event stream. Never throws - unbalanced braces are reported via
 * `balanced: false` instead so callers can fall back conservatively.
 *
 * @param {string} text - Placeholder text from `extractProtectedRegions`.
 * @param {ProtectedEntry[]} store - Table produced by `extractProtectedRegions`,
 * used to tell a standalone comment (one that appears between declarations
 * or rules) apart from a comment embedded inside a selector or value.
 * @returns {{ events: Array<object>, balanced: boolean }}
 */
export function parseCssEvents(text, store) {
  const events = [];
  let buffer = '';
  let parenDepth = 0;
  let braceDepth = 0;
  // Tracks nesting inside a custom-property value's balanced `{...}` block
  // (e.g. `--theme: { color: red; };`), which is opaque token content, not
  // structural rule nesting - see `looksLikeCustomPropertyDeclaration`.
  let valueBlockDepth = 0;
  let balanced = true;

  const flush = (type) => {
    if (buffer.trim() !== '') {
      events.push({ type, raw: buffer });
    }
    buffer = '';
  };

  let i = 0;
  const { length: n } = text;
  while (i < n) {
    const char = text[i];

    if (char === PH_START) {
      let j = i + 1;
      while (j < n && text[j] !== PH_END) j += 1;
      const entry = store[Number(text.slice(i + 1, j))];
      // A comment with nothing but whitespace before it since the last
      // boundary stands alone on its own line; one embedded mid-selector or
      // mid-value (e.g. `color: red /* note */;`) stays inline instead.
      if (entry && entry.kind === 'comment' && buffer.trim() === '') {
        buffer = '';
        events.push({ type: 'comment', raw: entry.raw, important: entry.important });
      } else {
        buffer += text.slice(i, j + 1);
      }
      i = j + 1;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      buffer += char;
      i += 1;
      continue;
    }

    if (char === ')') {
      // An unmatched closing paren has no opener to balance against; record
      // it as unbalanced instead of silently clamping depth back to zero.
      if (parenDepth === 0) {
        balanced = false;
      } else {
        parenDepth -= 1;
      }
      buffer += char;
      i += 1;
      continue;
    }

    if (parenDepth === 0 && char === '{') {
      if (valueBlockDepth > 0) {
        // Nested block inside a custom property's `{...}` value content.
        valueBlockDepth += 1;
        buffer += char;
        i += 1;
        continue;
      }
      if (braceDepth > 0 && looksLikeCustomPropertyDeclaration(buffer)) {
        // The opening brace of a balanced block inside a custom property's
        // value (e.g. `--theme: { color: red; };`) - keep it as opaque
        // declaration content rather than starting a nested rule.
        valueBlockDepth = 1;
        buffer += char;
        i += 1;
        continue;
      }
      events.push({ type: 'rule-start', prelude: buffer });
      buffer = '';
      braceDepth += 1;
      i += 1;
      continue;
    }

    if (parenDepth === 0 && char === '}') {
      if (valueBlockDepth > 0) {
        valueBlockDepth -= 1;
        buffer += char;
        i += 1;
        continue;
      }
      flush(braceDepth > 0 ? 'declaration' : 'statement');
      if (braceDepth === 0) {
        balanced = false;
      } else {
        braceDepth -= 1;
      }
      events.push({ type: 'rule-end' });
      i += 1;
      continue;
    }

    if (parenDepth === 0 && char === ';') {
      if (valueBlockDepth > 0) {
        buffer += char;
        i += 1;
        continue;
      }
      flush(braceDepth > 0 ? 'declaration' : 'statement');
      i += 1;
      continue;
    }

    buffer += char;
    i += 1;
  }

  if (buffer.trim() !== '') {
    flush(braceDepth > 0 ? 'declaration' : 'statement');
    balanced = false;
  }
  if (braceDepth !== 0 || parenDepth !== 0 || valueBlockDepth !== 0) {
    balanced = false;
  }

  return { events, balanced };
}

function formatPrelude(raw, indent) {
  const collapsed = collapseWhitespace(raw);
  const withColonSpacing = transformColonsInParens(collapsed, ': ');
  const withCommaSpacing = withColonSpacing.replace(/\s*,\s*/g, ', ');
  if (withCommaSpacing.startsWith('@')) return withCommaSpacing;

  const parts = splitTopLevelCommas(withCommaSpacing).filter((part) => part !== '');
  if (parts.length <= 1) return withCommaSpacing;
  return parts.join(`,\n${indent}`);
}

function formatDeclaration(raw) {
  const collapsed = collapseWhitespace(raw);
  if (!collapsed) return '';
  if (collapsed.startsWith('@')) return collapsed;

  const colonIndex = findTopLevelColon(collapsed);
  if (colonIndex === -1) return collapsed;

  const property = collapsed.slice(0, colonIndex).trim();
  let value = collapsed.slice(colonIndex + 1).trim();
  value = value.replace(/\s*,\s*/g, ', ');
  value = value.replace(/\s*!\s*important/i, ' !important');
  return `${property}: ${value}`;
}

function renderFormatted(events, indentUnit) {
  let out = '';
  let depth = 0;

  events.forEach((event) => {
    const indent = indentUnit.repeat(depth);
    if (event.type === 'comment') {
      out += `${indent}${event.raw}\n`;
    } else if (event.type === 'rule-start') {
      out += `${indent}${formatPrelude(event.prelude, indent)} {\n`;
      depth += 1;
    } else if (event.type === 'rule-end') {
      depth = Math.max(0, depth - 1);
      out += `${indentUnit.repeat(depth)}}\n`;
    } else if (event.type === 'declaration') {
      const declaration = formatDeclaration(event.raw);
      if (declaration) out += `${indent}${declaration};\n`;
    } else if (event.type === 'statement') {
      const statement = collapseWhitespace(event.raw);
      if (statement) out += `${indent}${statement};\n`;
    }
  });

  return out.trimEnd();
}

function minifyPrelude(raw, store) {
  const collapsed = collapseWhitespace(stripMinifiableComments(raw, store));
  const colonTight = transformColonsInParens(collapsed, ':');
  const parenTight = colonTight.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  return parenTight.replace(/\s*,\s*/g, ',');
}

function tightenPunctuation(text) {
  return text.replace(/\s*,\s*/g, ',').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
}

function minifyDeclaration(raw, store) {
  const collapsed = collapseWhitespace(stripMinifiableComments(raw, store));
  if (!collapsed) return '';
  if (collapsed.startsWith('@')) return tightenPunctuation(collapsed);

  const colonIndex = findTopLevelColon(collapsed);
  if (colonIndex === -1) return collapsed;

  const property = collapsed.slice(0, colonIndex).trim();
  let value = collapsed.slice(colonIndex + 1).trim();
  value = tightenPunctuation(value);
  value = value.replace(/\s*!\s*important/i, '!important');
  return `${property}:${value}`;
}

function minifyStatement(raw, store) {
  return tightenPunctuation(collapseWhitespace(stripMinifiableComments(raw, store)));
}

function renderMinified(events, store) {
  let out = '';

  events.forEach((event) => {
    if (event.type === 'comment') {
      if (event.important) out += event.raw;
    } else if (event.type === 'rule-start') {
      out += `${minifyPrelude(event.prelude, store)}{`;
    } else if (event.type === 'rule-end') {
      if (out.endsWith(';')) out = out.slice(0, -1);
      out += '}';
    } else if (event.type === 'declaration') {
      const declaration = minifyDeclaration(event.raw, store);
      if (declaration) out += `${declaration};`;
    } else if (event.type === 'statement') {
      const statement = minifyStatement(event.raw, store);
      if (statement) out += `${statement};`;
    }
  });

  return out;
}

/**
 * A user-facing message shown when input cannot be safely reformatted.
 */
function malformedWarning(action) {
  return `The CSS could not be safely ${action} because it looks malformed or has `
    + 'unbalanced braces or parentheses. Showing the original input unchanged.';
}

function unexpectedWarning(action) {
  return `The CSS could not be ${action} due to an unexpected error. `
    + 'Showing the original input unchanged.';
}

/**
 * Formats CSS text with deterministic, configurable indentation. Comments,
 * quoted strings, and `url(...)` values (including data URLs) are preserved
 * exactly as written. Never throws: malformed or unbalanced input falls back
 * to returning the original text alongside a warning message.
 *
 * @param {string} input - CSS source to format.
 * @param {{ indentSize?: 2 | 4 }} [options] - Formatting options.
 * @returns {{ output: string, warning: string | null }} The formatted CSS
 * (or the original input on fallback) and an optional warning message.
 */
export function formatCss(input, options = {}) {
  const indentSize = options.indentSize === 4 ? 4 : 2;

  if (typeof input !== 'string' || input.trim() === '') {
    return { output: '', warning: null };
  }

  try {
    const { text, store, unterminated } = extractProtectedRegions(input);
    const { events, balanced } = parseCssEvents(text, store);
    if (unterminated || !balanced) {
      return { output: input.trim(), warning: malformedWarning('formatted') };
    }
    const rendered = renderFormatted(events, ' '.repeat(indentSize));
    const output = restoreProtectedRegions(rendered, store, { stripComments: false });
    return { output, warning: null };
  } catch {
    return { output: input.trim(), warning: unexpectedWarning('formatted') };
  }
}

/**
 * Minifies CSS text, removing safe whitespace and non-essential comments
 * while preserving quoted strings, `url(...)` values, `calc()` expressions,
 * `/*!`-prefixed "important" comments, and selector token boundaries (for
 * example the descendant-combinator space in `a :hover`). Never throws:
 * malformed or unbalanced input falls back to returning the original text
 * alongside a warning message.
 *
 * @param {string} input - CSS source to minify.
 * @returns {{ output: string, warning: string | null }} The minified CSS (or
 * the original input on fallback) and an optional warning message.
 */
export function minifyCss(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return { output: '', warning: null };
  }

  try {
    const { text, store, unterminated } = extractProtectedRegions(input);
    const { events, balanced } = parseCssEvents(text, store);
    if (unterminated || !balanced) {
      return { output: input.trim(), warning: malformedWarning('minified') };
    }
    const rendered = renderMinified(events, store);
    const output = restoreProtectedRegions(rendered, store, { stripComments: true });
    return { output, warning: null };
  } catch {
    return { output: input.trim(), warning: unexpectedWarning('minified') };
  }
}
