/**
 * Pure HTML formatting and minification utilities.
 *
 * The parser below is a small hand-written HTML tokenizer/tree-builder. It does not use
 * DOMParser, innerHTML, or any external library so it stays safe to run on untrusted input
 * and works identically in tests (no browser globals required). It is intentionally lenient
 * (mismatched or stray closing tags are dropped rather than rejected) but reports structured,
 * non-throwing errors for the malformed constructs called out in the tool's requirements:
 * unterminated comments, tags, quoted attribute values, and raw-text elements.
 */

/** HTML void elements: they never have children or a closing tag. */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Elements whose content is preserved verbatim, character for character, instead of being
 * parsed as markup. `script` and `style` are raw text per the HTML spec; `textarea` is
 * escapable raw text; `pre` is included here (beyond the spec) because significant
 * whitespace formatting inside it must never be touched by this tool.
 */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'pre']);

/** Supported indentation options for {@link formatHtml}. */
export const HTML_INDENT_OPTIONS = {
  TWO_SPACES: '2',
  FOUR_SPACES: '4',
  TAB: 'tab',
};

const WHITESPACE_ONLY = /^[ \t\r\n\f]*$/;

/**
 * Elements that always start a new block box, i.e. never participate in the surrounding text
 * flow. This is a denylist rather than an allowlist of inline elements on purpose: an allowlist
 * that omits a legitimate inline/phrasing element (e.g. `del`, `ins`, or any custom element)
 * would silently treat it as a block boundary and drop a word-separating space, running two
 * words together. A denylist instead only has to be complete about the well-known block-level
 * elements; anything not listed here — including every ordinary inline/phrasing element and any
 * unrecognized or custom tag — is conservatively treated as inline, so its surrounding
 * whitespace is preserved (collapsed to one space) rather than risk deleting a meaningful
 * separator.
 */
const BLOCK_ELEMENTS = new Set([
  'html', 'head', 'body', 'title', 'meta', 'link', 'base', 'style', 'script', 'noscript',
  'template', 'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'dd', 'div',
  'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'header', 'hgroup', 'hr', 'li', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section',
  'summary', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'ul',
]);

/**
 * Whether a node carries visible inline content, meaning whitespace touching it can affect
 * the rendered text. Non-whitespace text and non-block elements qualify; block elements, comments,
 * and doctypes do not (a comment or doctype never renders, and a block element establishes its
 * own box, so whitespace at its edge is never a word boundary). See {@link BLOCK_ELEMENTS} for
 * why elements are classified by denylist rather than allowlist.
 */
function isInlineContentNode(node) {
  if (node.type === 'text') return !WHITESPACE_ONLY.test(node.value);
  if (node.type === 'element') return !BLOCK_ELEMENTS.has(node.tagName.toLowerCase());
  return false;
}

/**
 * Whether a node never renders anything itself, so it can never be a word boundary and should
 * be looked through when deciding whether whitespace elsewhere in the same run is significant.
 * Whitespace-only text is included because a run of it collapses with adjacent comments/doctypes
 * into a single logical gap between whatever content nodes bracket the run.
 */
function isNonRenderingNode(node) {
  return isWhitespaceOnlyText(node) || node.type === 'comment' || node.type === 'doctype';
}

/**
 * Internal error type carrying a one-based line/column so callers can render a precise
 * diagnostic. It is caught at the public API boundary and converted into a plain,
 * non-throwing result object.
 */
class HtmlParseError extends Error {
  /**
   * @param {string} message Human-readable description of the malformed input.
   * @param {number} line One-based line number where the problem starts.
   * @param {number} column One-based column number where the problem starts.
   */
  constructor(message, line, column) {
    super(message);
    this.name = 'HtmlParseError';
    this.line = line;
    this.column = column;
  }
}

/**
 * Converts an absolute character index into a one-based line and column.
 *
 * @param {string} text The full source text.
 * @param {number} index Zero-based character offset into `text`.
 * @returns {{line: number, column: number}} One-based line and column.
 */
function getLineColumn(text, index) {
  const clamped = Math.max(0, Math.min(index, text.length));
  let line = 1;
  let lastNewline = -1;

  for (let i = 0; i < clamped; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      lastNewline = i;
    }
  }

  return { line, column: clamped - lastNewline };
}

function isWhitespaceChar(char) {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f';
}

function isTagNameStartChar(char) {
  return char !== undefined && /[a-zA-Z]/.test(char);
}

function isTagNameChar(char) {
  return char !== undefined && /[a-zA-Z0-9:-]/.test(char);
}

/**
 * Creates a stateful parser bound to one HTML source string.
 *
 * @param {string} source The HTML text to parse.
 * @returns {{parseDocument: function(): object[]}} A parser exposing `parseDocument()`.
 */
function createParser(source) {
  const length = source.length;
  const lowerSource = source.toLowerCase();
  let pos = 0;

  function errorAt(message, index) {
    const { line, column } = getLineColumn(source, index);
    throw new HtmlParseError(message, line, column);
  }

  function isCommentStart(index) {
    return source.startsWith('<!--', index);
  }

  function isDoctypeStart(index) {
    return lowerSource.startsWith('<!doctype', index);
  }

  function isEndTagStart(index) {
    return (
      source[index] === '<' && source[index + 1] === '/' && isTagNameStartChar(source[index + 2])
    );
  }

  function isStartTagStart(index) {
    return source[index] === '<' && isTagNameStartChar(source[index + 1]);
  }

  function isConstructStart(index) {
    if (source[index] !== '<') return false;
    return (
      isCommentStart(index)
      || isDoctypeStart(index)
      || isEndTagStart(index)
      || isStartTagStart(index)
    );
  }

  function peekTagName(index) {
    let i = index;
    while (i < length && isTagNameChar(source[i])) i += 1;
    return source.slice(index, i);
  }

  /**
   * Scans a start or end tag beginning at `startPos` (which must point at `<`).
   * Respects quoted attribute values so a `>` inside a quoted value never ends the tag early.
   *
   * @param {number} startPos Index of the opening `<`.
   * @param {boolean} isEndTag Whether this is a closing tag (`</name ...>`).
   * @returns {{tagName: string, attrs: object[], selfClose: boolean, endIndex: number}}
   */
  function scanTag(startPos, isEndTag) {
    let i = startPos + 1;
    if (isEndTag) i += 1;

    const tagName = peekTagName(i);
    i += tagName.length;

    const attrs = [];
    let selfClose = false;

    for (;;) {
      while (i < length && isWhitespaceChar(source[i])) i += 1;

      if (i >= length) {
        const prefix = isEndTag ? 'closing ' : '';
        const slash = isEndTag ? '/' : '';
        errorAt(`Unterminated ${prefix}tag <${slash}${tagName}>`, startPos);
      }

      if (source[i] === '>') {
        i += 1;
        break;
      }

      if (source[i] === '/' && source[i + 1] === '>') {
        selfClose = true;
        i += 2;
        break;
      }

      if (source[i] === '/') {
        i += 1;
        continue;
      }

      const nameStart = i;
      while (
        i < length
        && !isWhitespaceChar(source[i])
        && source[i] !== '='
        && source[i] !== '>'
        && !(source[i] === '/' && source[i + 1] === '>')
      ) {
        i += 1;
      }

      if (i >= length) {
        errorAt(`Unterminated tag <${tagName}>`, startPos);
      }

      const name = source.slice(nameStart, i);
      if (name === '') {
        i += 1;
        continue;
      }

      let lookahead = i;
      while (lookahead < length && isWhitespaceChar(source[lookahead])) lookahead += 1;

      if (source[lookahead] === '=') {
        lookahead += 1;
        while (lookahead < length && isWhitespaceChar(source[lookahead])) lookahead += 1;

        const quote = source[lookahead];
        if (quote === '"' || quote === "'") {
          const valueStart = lookahead + 1;
          const closeIndex = source.indexOf(quote, valueStart);
          if (closeIndex === -1) {
            errorAt(`Unterminated quoted attribute value for "${name}"`, lookahead);
          }
          attrs.push({ name, value: source.slice(valueStart, closeIndex), quote, hasValue: true });
          i = closeIndex + 1;
        } else {
          const valueStart = lookahead;
          let valueEnd = lookahead;
          while (
            valueEnd < length
            && !isWhitespaceChar(source[valueEnd])
            && source[valueEnd] !== '>'
          ) {
            valueEnd += 1;
          }
          if (valueEnd >= length) {
            errorAt(`Unterminated tag <${tagName}>`, startPos);
          }
          const value = source.slice(valueStart, valueEnd);
          attrs.push({ name, value, quote: null, hasValue: true });
          i = valueEnd;
        }
      } else {
        attrs.push({ name, value: null, quote: null, hasValue: false });
      }
    }

    return { tagName, attrs, selfClose, endIndex: i };
  }

  function parseComment() {
    const start = pos;
    const contentStart = pos + 4;
    const endIndex = source.indexOf('-->', contentStart);
    if (endIndex === -1) {
      errorAt('Unterminated comment', start);
    }
    const raw = source.slice(start, endIndex + 3);
    pos = endIndex + 3;
    return { type: 'comment', raw };
  }

  function parseDoctype() {
    const start = pos;
    let i = pos + 2;
    let quote = null;

    while (i < length) {
      const char = source[i];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        i += 1;
        pos = i;
        return { type: 'doctype', raw: source.slice(start, i) };
      }
      i += 1;
    }

    errorAt('Unterminated doctype declaration', start);
    return null;
  }

  function findRawTextEnd(lowerName, from) {
    const closeTag = `</${lowerName}`;
    let searchIndex = from;

    for (;;) {
      const found = lowerSource.indexOf(closeTag, searchIndex);
      if (found === -1) return -1;

      const after = lowerSource[found + closeTag.length];
      if (after === undefined || isWhitespaceChar(after) || after === '>' || after === '/') {
        return found;
      }
      searchIndex = found + closeTag.length;
    }
  }

  function parseText() {
    const start = pos;
    do {
      pos += 1;
    } while (pos < length && !isConstructStart(pos));
    return { type: 'text', value: source.slice(start, pos) };
  }

  function parseElement() {
    const start = pos;
    const scanned = scanTag(pos, false);
    pos = scanned.endIndex;

    const lowerName = scanned.tagName.toLowerCase();
    const node = {
      type: 'element',
      tagName: scanned.tagName,
      attrs: scanned.attrs,
      selfClose: scanned.selfClose,
      void: VOID_ELEMENTS.has(lowerName),
      children: [],
      raw: null,
    };

    if (node.void) {
      return node;
    }

    if (RAW_TEXT_ELEMENTS.has(lowerName)) {
      const closeIndex = findRawTextEnd(lowerName, pos);
      if (closeIndex === -1) {
        errorAt(`Unterminated <${scanned.tagName}> element`, start);
      }
      const gtIndex = source.indexOf('>', closeIndex);
      if (gtIndex === -1) {
        errorAt(`Unterminated <${scanned.tagName}> element`, start);
      }
      node.raw = source.slice(pos, closeIndex);
      pos = gtIndex + 1;
      return node;
    }

    node.children = parseChildren(lowerName);

    const closesCurrent = pos < length
      && isEndTagStart(pos)
      && peekTagName(pos + 2).toLowerCase() === lowerName;
    if (!closesCurrent) {
      errorAt(`Unterminated tag <${scanned.tagName}>`, start);
    }

    const closing = scanTag(pos, true);
    pos = closing.endIndex;
    return node;
  }

  /**
   * Parses sibling nodes until EOF, or (when `currentTagName` is set) until the matching
   * closing tag is found. Any other closing tag encountered along the way is a stray/mismatched
   * tag and is discarded rather than rejected, so the parser stays lenient about real-world,
   * imperfectly nested markup.
   */
  function parseChildren(currentTagName) {
    const children = [];

    while (pos < length) {
      if (isEndTagStart(pos)) {
        const endName = peekTagName(pos + 2).toLowerCase();
        if (currentTagName !== null && endName === currentTagName) {
          return children;
        }
        const discarded = scanTag(pos, true);
        pos = discarded.endIndex;
        continue;
      }

      if (isCommentStart(pos)) {
        children.push(parseComment());
        continue;
      }

      if (isDoctypeStart(pos)) {
        children.push(parseDoctype());
        continue;
      }

      if (isStartTagStart(pos)) {
        children.push(parseElement());
        continue;
      }

      children.push(parseText());
    }

    return children;
  }

  return {
    parseDocument() {
      return parseChildren(null);
    },
  };
}

/**
 * Parses an HTML document (or fragment) into a lightweight node tree.
 *
 * @param {string} source The HTML text to parse.
 * @returns {{ok: true, nodes: object[]}|{ok: false, error: {message: string, line: number,
 *   column: number}}} The parsed tree, or a structured, non-throwing parse error.
 */
export function parseHtmlDocument(source) {
  if (typeof source !== 'string') {
    throw new TypeError('Input must be a string.');
  }

  try {
    const nodes = createParser(source).parseDocument();
    return { ok: true, nodes };
  } catch (error) {
    if (error instanceof HtmlParseError) {
      const { message, line, column } = error;
      return { ok: false, error: { message, line, column } };
    }
    throw error;
  }
}

function isWhitespaceOnlyText(node) {
  return node.type === 'text' && WHITESPACE_ONLY.test(node.value);
}

/**
 * Inline `white-space` values under which whitespace in a text node is rendering-significant, so
 * it must survive minification verbatim rather than being dropped or collapsed to one space.
 * `pre`, `pre-wrap`, and `break-spaces` render runs of spaces verbatim; `pre-line` collapses
 * runs of spaces/tabs but still turns embedded newlines into rendered line breaks, so a whitespace
 * run under it can't be safely dropped either. This tool treats `pre-line` the same as the fully
 * verbatim values rather than replicating its space-collapsing behavior: emitting the run
 * unchanged is the conservative choice that never removes something that renders, even though it
 * doesn't collapse runs of plain spaces the way a browser would.
 */
const PRESERVING_WHITE_SPACE_VALUES = new Set(['pre', 'pre-wrap', 'break-spaces', 'pre-line']);

/**
 * Reads the `white-space` declaration out of an element's inline `style` attribute, if any.
 * Declarations are resolved by CSS cascade rules: `!important` declarations win over normal
 * ones regardless of position, and among declarations of equal importance the last one wins
 * (source order). Only inline styles are considered: a standalone formatter cannot resolve
 * `<style>` blocks or external stylesheets, so those are out of scope by design rather than by
 * oversight.
 *
 * @param {object} node An element node.
 * @returns {string|null} The lower-cased property value, or `null` if not declared inline.
 */
function getInlineWhiteSpace(node) {
  const styleAttr = node.attrs.find(
    (attr) => attr.hasValue && attr.value !== null && attr.name.toLowerCase() === 'style'
  );
  if (!styleAttr) return null;

  const matches = [...styleAttr.value.matchAll(/white-space\s*:\s*([^;]+)/gi)];
  if (matches.length === 0) return null;

  const isImportant = (raw) => /!important/i.test(raw);
  const importantMatches = matches.filter((match) => isImportant(match[1]));
  const candidates = importantMatches.length > 0 ? importantMatches : matches;
  const winner = candidates[candidates.length - 1];

  return winner[1].replace(/!important/gi, '').trim().toLowerCase();
}

/**
 * Whether whitespace-only text nodes that are direct children of `node` must be preserved
 * verbatim rather than collapsed/dropped during minification. An element's own inline
 * `white-space` declaration takes precedence (it is an inherited CSS property); absent one, the
 * parent's resolved state is inherited unchanged, matching normal CSS inheritance as far as it
 * can be determined from inline styles alone.
 *
 * @param {object} node An element node.
 * @param {boolean} inherited Whether the parent element resolved to a preserving value.
 * @returns {boolean} Whether whitespace inside `node` must be kept verbatim.
 */
function resolvesToPreservingWhiteSpace(node, inherited) {
  const value = getInlineWhiteSpace(node);
  if (value === null) return inherited;
  return PRESERVING_WHITE_SPACE_VALUES.has(value);
}

function serializeStartTag(node) {
  let out = `<${node.tagName}`;
  for (const attr of node.attrs) {
    out += ` ${attr.name}`;
    if (attr.hasValue) {
      out += attr.quote ? `=${attr.quote}${attr.value}${attr.quote}` : `=${attr.value}`;
    }
  }
  out += node.selfClose ? '/>' : '>';
  return out;
}

function serializeEndTag(node) {
  return `</${node.tagName}>`;
}

function formatNode(node, depth, indentUnit) {
  switch (node.type) {
    case 'doctype':
    case 'comment':
      return node.raw;
    case 'text':
      return node.value;
    case 'element': {
      const open = serializeStartTag(node);
      if (node.void) return open;
      if (node.raw !== null) return open + node.raw + serializeEndTag(node);
      return open + joinFormatted(node.children, depth + 1, indentUnit) + serializeEndTag(node);
    }
    default:
      return '';
  }
}

/**
 * Joins sibling nodes for pretty-printing. A whitespace-only text node between siblings is
 * structurally insignificant and is replaced with a newline plus indentation; every other
 * node (including text with real content) is emitted unchanged and stays exactly adjacent to
 * its neighbors when the source had no separating whitespace, which preserves rendering. The
 * trailing separator (immediately before the parent's closing tag, if any) is indented one
 * level shallower so the closing tag lines up with its opening tag instead of its children.
 */
function joinFormatted(nodes, depth, indentUnit) {
  let out = '';
  nodes.forEach((node, index) => {
    if (isWhitespaceOnlyText(node)) {
      const isTrailingSeparator = index === nodes.length - 1;
      const separatorDepth = isTrailingSeparator ? Math.max(0, depth - 1) : depth;
      out += `\n${indentUnit.repeat(separatorDepth)}`;
    } else {
      out += formatNode(node, depth, indentUnit);
    }
  });
  return out;
}

function minifyNode(node, preserveWhitespace) {
  switch (node.type) {
    case 'doctype':
    case 'comment':
      return node.raw;
    case 'text':
      return node.value;
    case 'element': {
      const open = serializeStartTag(node);
      if (node.void) return open;
      if (node.raw !== null) return open + node.raw + serializeEndTag(node);
      const childPreserve = resolvesToPreservingWhiteSpace(node, preserveWhitespace);
      return open + joinMinified(node.children, childPreserve) + serializeEndTag(node);
    }
    default:
      return '';
  }
}

/**
 * Joins sibling nodes for minification. A whitespace-only text node is dropped entirely when it
 * sits at a block boundary (the start/end of the parent, or next to a block-level element),
 * since browsers already collapse that whitespace away. When it instead separates two inline
 * content nodes (e.g. `<span>Hello</span> <span>world</span>`), dropping it would run the
 * rendered words together, so it is collapsed to a single space instead.
 *
 * The word-boundary check looks past comments and doctypes rather than only the immediate
 * siblings: none of those nodes render, so `<span>Hello</span> <!-- x --> <span>world</span>`
 * is just as much a word boundary as `<span>Hello</span> <span>world</span>` is. Non-rendering
 * nodes (whitespace text, comments, doctypes) are grouped into one run at a time; the run emits
 * at most one collapsed space, positioned at the first whitespace-only text node in it, so a
 * run with several whitespace nodes around a comment doesn't produce duplicate spaces.
 *
 * `preserveWhitespace` overrides all of the above: it is `true` when `nodes`' parent resolved
 * (via {@link resolvesToPreservingWhiteSpace}) to an inline `white-space` value of `pre`,
 * `pre-wrap`, `break-spaces`, or `pre-line` (see {@link PRESERVING_WHITE_SPACE_VALUES} for why
 * `pre-line` — which only preserves newlines, not runs of spaces — is grouped with the fully
 * verbatim values here). In that case every whitespace-only text node is emitted unchanged
 * instead of being dropped or collapsed to one space, regardless of block-boundary position,
 * since this tool cannot know whether an anonymous box actually swallows it without a full
 * layout engine — emitting it verbatim is the conservative choice that never removes something
 * that renders.
 */
function joinMinified(nodes, preserveWhitespace = false) {
  let out = '';
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];

    if (!isNonRenderingNode(node)) {
      out += minifyNode(node, preserveWhitespace);
      index += 1;
      continue;
    }

    let runEnd = index;
    while (runEnd < nodes.length && isNonRenderingNode(nodes[runEnd])) runEnd += 1;

    const prev = nodes[index - 1];
    const next = nodes[runEnd];
    const runHasWhitespace = nodes
      .slice(index, runEnd)
      .some((runNode) => isWhitespaceOnlyText(runNode));
    const needsSpace = runHasWhitespace
      && prev !== undefined
      && next !== undefined
      && isInlineContentNode(prev)
      && isInlineContentNode(next);

    let spaceEmitted = false;
    for (let i = index; i < runEnd; i += 1) {
      const runNode = nodes[i];
      if (isWhitespaceOnlyText(runNode)) {
        if (preserveWhitespace) {
          out += runNode.value;
        } else if (needsSpace && !spaceEmitted) {
          out += ' ';
          spaceEmitted = true;
        }
        continue;
      }
      out += minifyNode(runNode, preserveWhitespace);
    }

    index = runEnd;
  }

  return out;
}

function resolveIndentUnit(indent) {
  if (indent === HTML_INDENT_OPTIONS.FOUR_SPACES) return '    ';
  if (indent === HTML_INDENT_OPTIONS.TAB) return '\t';
  return '  ';
}

/**
 * Pretty-prints an HTML document tree with the given indentation.
 *
 * @param {object[]} nodes Parsed node tree, as returned by {@link parseHtmlDocument}.
 * @param {'2'|'4'|'tab'} [indent] Indentation option.
 * @returns {string} The formatted HTML.
 */
export function formatHtmlTree(nodes, indent = HTML_INDENT_OPTIONS.TWO_SPACES) {
  const indentUnit = resolveIndentUnit(indent);
  return joinFormatted(nodes, 0, indentUnit).replace(/^\n/, '').replace(/\n$/, '');
}

/**
 * Minifies an HTML document tree by dropping structurally insignificant whitespace.
 *
 * @param {object[]} nodes Parsed node tree, as returned by {@link parseHtmlDocument}.
 * @returns {string} The minified HTML.
 */
export function minifyHtmlTree(nodes) {
  return joinMinified(nodes, false);
}

/**
 * Formats an HTML string: reindents structurally insignificant whitespace between tags while
 * leaving text, attributes, comments, doctypes, and the raw contents of `script`, `style`,
 * `textarea`, and `pre` elements untouched.
 *
 * @param {string} source The HTML text to format.
 * @param {'2'|'4'|'tab'} [indent] Indentation option: 2 spaces, 4 spaces, or tabs.
 * @returns {{ok: true, result: string}|{ok: false, error: {message: string, line: number,
 *   column: number}}} The formatted HTML, or a structured, non-throwing parse error.
 */
export function formatHtml(source, indent = HTML_INDENT_OPTIONS.TWO_SPACES) {
  const parsed = parseHtmlDocument(source);
  if (!parsed.ok) return parsed;
  return { ok: true, result: formatHtmlTree(parsed.nodes, indent) };
}

/**
 * Minifies an HTML string by removing structurally insignificant whitespace between tags,
 * while preserving text, attributes, comments, doctypes, and the raw contents of `script`,
 * `style`, `textarea`, and `pre` elements exactly.
 *
 * Whitespace-only text nodes between inline content are collapsed to a single space rather than
 * dropped, and that collapsing itself backs off whenever an ancestor element's inline `style`
 * attribute declares a whitespace-preserving `white-space` value (`pre`, `pre-wrap`,
 * `break-spaces`, or `pre-line`) — see {@link resolvesToPreservingWhiteSpace}. This tool parses
 * markup only: it
 * cannot resolve `<style>` blocks, external stylesheets, or the default user-agent stylesheet, so
 * whitespace significance driven by CSS it cannot see (including a `pre`-like `display` on a
 * `<style>`-only rule) is outside what it can preserve.
 *
 * @param {string} source The HTML text to minify.
 * @returns {{ok: true, result: string}|{ok: false, error: {message: string, line: number,
 *   column: number}}} The minified HTML, or a structured, non-throwing parse error.
 */
export function minifyHtml(source) {
  const parsed = parseHtmlDocument(source);
  if (!parsed.ok) return parsed;
  return { ok: true, result: minifyHtmlTree(parsed.nodes) };
}
