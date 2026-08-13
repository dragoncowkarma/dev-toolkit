const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * @typedef {{ minified: string, originalBytes: number, minifiedBytes: number,
 * savedPercent: number, error?: string }} SvgMinifyResult
 */

/**
 * Returns a UTF-8 byte length without using JavaScript's UTF-16 string length.
 *
 * @param {string} value - The value to measure.
 * @returns {number} The number of UTF-8 bytes in `value`.
 */
function getUtf8ByteLength(value) {
  return new TextEncoder().encode(value).length;
}

/**
 * Finds the end of a markup tag without confusing a greater-than sign in an
 * attribute value for the tag terminator.
 *
 * @param {string} markup - Complete SVG markup.
 * @param {number} start - The index of the opening angle bracket.
 * @returns {number} The index of the closing angle bracket, or `-1`.
 */
function findTagEnd(markup, start) {
  let quote = '';

  for (let index = start + 1; index < markup.length; index += 1) {
    const character = markup[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }

  return -1;
}

/**
 * Finds a DOCTYPE terminator, including an optional internal subset.
 *
 * @param {string} markup - Complete SVG markup.
 * @param {number} start - The index of the opening angle bracket.
 * @returns {number} The index after the declaration, or `-1`.
 */
function findDoctypeEnd(markup, start) {
  let quote = '';
  let subsetDepth = 0;

  for (let index = start + 2; index < markup.length; index += 1) {
    const character = markup[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      subsetDepth += 1;
    } else if (character === ']') {
      subsetDepth = Math.max(0, subsetDepth - 1);
    } else if (character === '>' && subsetDepth === 0) {
      return index + 1;
    }
  }

  return -1;
}

/**
 * Removes editor-specific attributes from one SVG opening tag while preserving
 * every character of remaining attribute values.
 *
 * @param {string} tag - One complete opening SVG tag.
 * @param {boolean} isRoot - Whether `tag` is the root `<svg>` element.
 * @returns {string} The tag with editor-only attributes removed.
 */
function stripEditorAttributes(tag, isRoot) {
  const nameEnd = tag.search(/[\s/>]/);
  let output = tag.slice(0, nameEnd);
  let index = nameEnd;

  while (index < tag.length) {
    const attributeStart = index;
    while (/\s/.test(tag[index])) index += 1;
    if (tag[index] === '/' || tag[index] === '>' || index >= tag.length) {
      output += tag.slice(attributeStart);
      break;
    }

    const nameStart = index;
    while (index < tag.length && !/[\s=/>]/.test(tag[index])) index += 1;
    const attributeName = tag.slice(nameStart, index);
    while (/\s/.test(tag[index])) index += 1;

    if (tag[index] === '=') {
      index += 1;
      while (/\s/.test(tag[index])) index += 1;
      const quote = tag[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        while (index < tag.length && tag[index] !== quote) index += 1;
        index += 1;
      } else {
        while (index < tag.length && !/[\s/>]/.test(tag[index])) index += 1;
      }
    }

    const editorAttribute = /^(?:inkscape|sodipodi):/i.test(attributeName);
    const editorNamespace = isRoot && /^xmlns:(?:inkscape|sodipodi)$/i.test(attributeName);
    if (!editorAttribute && !editorNamespace) output += tag.slice(attributeStart, index);
  }

  return output;
}

/**
 * Converts a UTF-8 string to base64 without relying on Latin-1-only `btoa`.
 *
 * @param {string} value - Text to encode as UTF-8 bytes.
 * @returns {string} Base64-encoded UTF-8 bytes.
 */
function encodeUtf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  let output = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];

    output += BASE64_ALPHABET[first >> 2];
    output += BASE64_ALPHABET[((first & 3) << 4) | ((second || 0) >> 4)];
    output += second === undefined
      ? '='
      : BASE64_ALPHABET[((second & 15) << 2) | ((third || 0) >> 6)];
    output += third === undefined ? '=' : BASE64_ALPHABET[third & 63];
  }

  return output;
}

/**
 * Minifies SVG markup by removing non-rendering declarations, comments,
 * editor metadata, and whitespace-only gaps between markup tags. It performs
 * conservative structural validation and returns an error result instead of
 * throwing for malformed input.
 *
 * @param {unknown} markup - Raw SVG markup pasted by the user.
 * @returns {SvgMinifyResult} Minified output and UTF-8 byte-saving statistics.
 */
export function minifySvg(markup) {
  const original = markup == null ? '' : String(markup);
  const originalBytes = getUtf8ByteLength(original);
  const fail = (error) => ({
    minified: '',
    originalBytes,
    minifiedBytes: 0,
    savedPercent: 0,
    error,
  });

  try {
    const parts = [];
    const stack = [];
    let cursor = 0;
    let rootFound = false;
    let rootClosed = false;

    while (cursor < original.length) {
      const tagStart = original.indexOf('<', cursor);
      if (tagStart === -1) {
        if (rootClosed && original.slice(cursor).trim()) {
          return fail('SVG markup must not contain text outside its root element.');
        }
        parts.push(original.slice(cursor));
        break;
      }

      const textBeforeTag = original.slice(cursor, tagStart);
      if ((!rootFound || rootClosed) && textBeforeTag.trim()) {
        return fail('SVG markup must not contain text outside its root element.');
      }
      parts.push(textBeforeTag);

      if (original.startsWith('<!--', tagStart)) {
        const commentEnd = original.indexOf('-->', tagStart + 4);
        if (commentEnd === -1) return fail('SVG markup contains an unclosed comment.');
        cursor = commentEnd + 3;
        continue;
      }

      if (original.startsWith('<![CDATA[', tagStart)) {
        const cdataEnd = original.indexOf(']]>', tagStart + 9);
        if (cdataEnd === -1) return fail('SVG markup contains an unclosed CDATA section.');
        parts.push(original.slice(tagStart, cdataEnd + 3));
        cursor = cdataEnd + 3;
        continue;
      }

      if (/^<!doctype\b/i.test(original.slice(tagStart))) {
        const doctypeEnd = findDoctypeEnd(original, tagStart);
        if (doctypeEnd === -1) return fail('SVG markup contains an unclosed DOCTYPE declaration.');
        cursor = doctypeEnd;
        continue;
      }

      const tagEnd = findTagEnd(original, tagStart);
      if (tagEnd === -1) return fail('SVG markup contains an unclosed tag.');

      const tag = original.slice(tagStart, tagEnd + 1);
      cursor = tagEnd + 1;

      if (/^<\?xml\s/i.test(tag)) continue;
      if (/^<\?/.test(tag) || /^<!/.test(tag)) {
        parts.push(tag);
        continue;
      }

      const closingMatch = tag.match(/^<\/\s*([\w:.-]+)\s*>$/);
      if (closingMatch) {
        const closingName = closingMatch[1];
        if (stack.pop() !== closingName) {
          return fail(`SVG markup has an unbalanced </${closingName}> tag.`);
        }
        parts.push(tag);
        if (closingName === 'svg' && stack.length === 0) rootClosed = true;
        continue;
      }

      const openingMatch = tag.match(/^<\s*([\w:.-]+)(?:\s|\/?>)/);
      if (!openingMatch) return fail('SVG markup contains an invalid tag.');

      const elementName = openingMatch[1];
      if (!rootFound) {
        if (elementName !== 'svg') return fail('SVG markup must contain a root <svg> element.');
        rootFound = true;
      } else if (rootClosed) {
        return fail('SVG markup must contain exactly one root <svg> element.');
      }

      const selfClosing = /\/\s*>$/.test(tag);
      const cleanedTag = stripEditorAttributes(tag, elementName === 'svg' && stack.length === 0);
      parts.push(cleanedTag);
      if (!selfClosing) stack.push(elementName);
      if (selfClosing && elementName === 'svg') rootClosed = true;
    }

    if (!rootFound) return fail('SVG markup must contain a root <svg> element.');
    if (stack.length > 0) {
      return fail(`SVG markup has an unclosed <${stack[stack.length - 1]}> tag.`);
    }
    if (!rootClosed) return fail('SVG markup has an unclosed <svg> tag.');

    const minified = parts.join('').replace(/>\s+</g, '><').trim();
    const minifiedBytes = getUtf8ByteLength(minified);
    const savedPercent = originalBytes === 0
      ? 0
      : Math.round(((originalBytes - minifiedBytes) / originalBytes) * 10000) / 100;

    return { minified, originalBytes, minifiedBytes, savedPercent };
  } catch {
    return fail('SVG markup could not be processed safely.');
  }
}

/**
 * Builds a CSS `background-image` declaration with a compact URL-encoded SVG
 * data URI. It preserves the URI's readable SVG markup instead of base64.
 *
 * @param {string} minifiedSvg - Valid minified SVG markup.
 * @returns {string} A complete CSS `background-image` declaration.
 */
export function toCssDataUri(minifiedSvg) {
  const escaped = String(minifiedSvg).replace(/"|\s+|[#<>%]/g, (character) => {
    if (character === '"') return "'";
    if (/\s/.test(character)) return '%20';
    return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
  });

  return `background-image: url("data:image/svg+xml,${escaped}");`;
}

/**
 * Builds an `<img src>`-ready base64 SVG data URI using UTF-8 bytes.
 *
 * @param {string} minifiedSvg - Valid minified SVG markup.
 * @returns {string} A base64 SVG data URI.
 */
export function toBase64DataUri(minifiedSvg) {
  return `data:image/svg+xml;base64,${encodeUtf8Base64(String(minifiedSvg))}`;
}
