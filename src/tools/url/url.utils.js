/**
 * Encodes a string for safe use inside a URL component (query value, path segment, etc.)
 * using `encodeURIComponent`.
 * @param {string} text - The plain text to encode.
 * @returns {string} The percent-encoded result.
 */
export function encodeUrl(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  return encodeURIComponent(text);
}

/**
 * Decodes a percent-encoded URL component back into plain text using `decodeURIComponent`.
 * @param {string} text - The percent-encoded text to decode.
 * @returns {string} The decoded plain text.
 * @throws {Error} When the input contains malformed percent-encoding.
 */
export function decodeUrl(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  try {
    return decodeURIComponent(text);
  } catch {
    throw new Error(
      'Invalid percent-encoding. Please check for typos or incomplete "%" sequences.'
    );
  }
}

/**
 * Checks whether a string is a well-formed, absolute URL using the `URL` constructor.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether every `&`-separated segment of a string contains a `=`, the shape of a
 * deliberately supported bare "key=value" query string (as opposed to arbitrary plain text).
 * @param {string} value
 * @returns {boolean}
 */
function looksLikeBareQueryString(value) {
  return value.split('&').every((segment) => segment.includes('='));
}

/**
 * Parses the query string of a URL (or a bare/`?`-prefixed query string) into an ordered
 * list of decoded key/value pairs, suitable for table display. Plain text or relative-path
 * input with no unambiguous query marker (no `?` and not shaped like `key=value` pairs)
 * yields an empty array instead of being misread as a query string.
 * @param {string} input - A full URL, a "?"-prefixed query string, or a bare query string.
 * @returns {Array<{key: string, value: string}>}
 */
export function parseQueryParams(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return [];
  }

  let search;
  try {
    search = new URL(input).search;
  } catch {
    // Not a full, absolute URL. Only fall back to query parsing when the input is
    // unambiguously a query source: it contains a "?" marker, or it is shaped like a
    // bare "key=value[&key=value...]" string.
    const queryIndex = input.indexOf('?');
    if (queryIndex >= 0) {
      search = input.slice(queryIndex);
    } else if (looksLikeBareQueryString(input)) {
      search = input;
    } else {
      return [];
    }
  }

  const params = new URLSearchParams(search);
  return Array.from(params.entries()).map(([key, value]) => ({ key, value }));
}
