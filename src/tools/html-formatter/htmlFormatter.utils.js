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
 * Elements that render inline, i.e. participate in the surrounding text flow rather than
 * starting a new block box. Whitespace-only text sitting between two of these (or between one
 * of these and non-whitespace text) is significant: it is the only thing separating two words
 * that would otherwise run together, so minification must collapse it to a single space rather
 * than delete it. Whitespace next to a block-level element (or at the start/end of a parent's
 * children) sits at a block boundary the browser already collapses away, so it stays safe to
 * drop entirely.
 */
const INLINE_ELEMENTS = new Set([
  'a', 'abbr', 'audio', 'b', 'bdi', 'bdo', 'br', 'button', 'canvas', 'cite', 'code', 'data',
  'dfn', 'em', 'i', 'iframe', 'img', 'input', 'kbd', 'label', 'map', 'mark', 'object', 'output',
  'picture', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'select', 'small', 'span', 'strong', 'sub',
  'sup', 'svg', 'textarea', 'time', 'u', 'var', 'video', 'wbr',
]);

/**
 * Whether a node carries visible inline content, meaning whitespace touching it can affect
 * the rendered text. Non-whitespace text and inline elements qualify; block elements, void
 * non-inline elements, comments, and doctypes do not (a comment or doctype never renders, and
 * a block element establishes its own box, so whitespace at its edge is never a word boundary).
 */
function isInlineContentNode(node) {
  if (node.type === 'text') return !WHITESPACE_ONLY.test(node.value);
  if (node.type === 'element') return INLINE_ELEMENTS.has(node.tagName.toLowerCase());
  return false;
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

function minifyNode(node) {
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
      return open + joinMinified(node.children) + serializeEndTag(node);
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
 */
function joinMinified(nodes) {
  let out = '';
  nodes.forEach((node, index) => {
    if (isWhitespaceOnlyText(node)) {
      const prev = nodes[index - 1];
      const next = nodes[index + 1];
      if (prev && next && isInlineContentNode(prev) && isInlineContentNode(next)) {
        out += ' ';
      }
      return;
    }
    out += minifyNode(node);
  });
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
  return joinMinified(nodes);
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
 * @param {string} source The HTML text to minify.
 * @returns {{ok: true, result: string}|{ok: false, error: {message: string, line: number,
 *   column: number}}} The minified HTML, or a structured, non-throwing parse error.
 */
export function minifyHtml(source) {
  const parsed = parseHtmlDocument(source);
  if (!parsed.ok) return parsed;
  return { ok: true, result: minifyHtmlTree(parsed.nodes) };
}
