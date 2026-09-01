/**
 * @typedef {Object} UrlPartInfo
 * @property {string} origin
 * @property {string} pathname
 * @property {string} hash
 * @property {string} protocol
 * @property {string} host
 * @property {string} hostname
 * @property {string} port
 * @property {string} search
 */

/**
 * @typedef {Object} QueryParamItem
 * @property {string} id
 * @property {string} key
 * @property {string} value
 * @property {boolean} isDuplicate
 */

/**
 * @typedef {Object} ParseResult
 * @property {boolean} isValid
 * @property {boolean} isFullUrl
 * @property {UrlPartInfo | null} urlParts
 * @property {boolean} hasLeadingQuestionMark
 * @property {QueryParamItem[]} params
 * @property {string} normalizedUrl
 * @property {string | null} error
 */

/**
 * Marks parameters with duplicate keys while maintaining order.
 *
 * @param {Array<{ key: string, value: string, [key: string]: any }>} params
 * @returns {Array} Array of param objects with isDuplicate boolean set.
 */
export function detectDuplicates(params) {
  const counts = new Map();
  for (const item of params) {
    counts.set(item.key, (counts.get(item.key) || 0) + 1);
  }
  return params.map((item) => ({
    ...item,
    isDuplicate: (counts.get(item.key) || 0) > 1,
  }));
}

/**
 * Builds a query string from key-value parameter objects.
 *
 * @param {Array<{ key: string, value: string }>} params
 * @param {boolean} [hasLeadingQuestionMark=false]
 * @returns {string}
 */
export function buildQueryString(params, hasLeadingQuestionMark = false) {
  const searchParams = new URLSearchParams();
  for (const p of params) {
    searchParams.append(p.key, p.value);
  }
  const str = searchParams.toString();
  if (hasLeadingQuestionMark) {
    return str ? `?${str}` : '?';
  }
  return str;
}

/**
 * Reconstructs a full URL or query string from component state and parameters.
 *
 * @param {Object} options
 * @param {boolean} options.isFullUrl
 * @param {string} [options.baseUrl] - Original absolute URL string
 * @param {boolean} [options.hasLeadingQuestionMark]
 * @param {Array<{ key: string, value: string }>} options.params
 * @returns {string}
 */
export function buildUrlOrQuery({
  isFullUrl,
  baseUrl,
  hasLeadingQuestionMark = false,
  params = [],
}) {
  const queryString = buildQueryString(params, false);

  if (isFullUrl && baseUrl) {
    try {
      const url = new URL(baseUrl);
      url.search = queryString ? `?${queryString}` : '';
      return url.toString();
    } catch {
      // Fall through to query string fallback if base URL fails to parse
    }
  }

  return buildQueryString(params, hasLeadingQuestionMark);
}

/**
 * Parses an absolute URL or bare query string into component parts and query parameters.
 *
 * @param {string} input
 * @returns {ParseResult}
 */
export function parseUrlOrQuery(input) {
  if (input === null || input === undefined || input.trim() === '') {
    return {
      isValid: true,
      isFullUrl: false,
      urlParts: null,
      hasLeadingQuestionMark: false,
      params: [],
      normalizedUrl: '',
      error: null,
    };
  }

  const trimmed = input.trim();

  // Attempt to parse as an absolute URL first
  try {
    const url = new URL(trimmed);
    const paramsList = [];
    let idCounter = 0;

    for (const [key, value] of url.searchParams.entries()) {
      paramsList.push({
        id: `param-${idCounter++}`,
        key,
        value,
      });
    }

    const params = detectDuplicates(paramsList);
    const normalizedUrl = url.toString();

    return {
      isValid: true,
      isFullUrl: true,
      urlParts: {
        origin: url.origin,
        pathname: url.pathname,
        hash: url.hash,
        protocol: url.protocol,
        host: url.host,
        hostname: url.hostname,
        port: url.port,
        search: url.search,
      },
      hasLeadingQuestionMark: true,
      params,
      normalizedUrl,
      error: null,
    };
  } catch (err) {
    // If input starts with a scheme prefix or ://, it was intended as a full URL but is malformed
    const hasSchemePrefix =
      /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) || trimmed.startsWith('//');

    if (hasSchemePrefix) {
      return {
        isValid: false,
        isFullUrl: true,
        urlParts: null,
        hasLeadingQuestionMark: false,
        params: [],
        normalizedUrl: '',
        error: `Invalid URL format: ${err.message}`,
      };
    }

    // Treat as bare query string
    try {
      const hasLeadingQuestionMark = trimmed.startsWith('?');
      const searchParams = new URLSearchParams(trimmed);
      const paramsList = [];
      let idCounter = 0;

      for (const [key, value] of searchParams.entries()) {
        paramsList.push({
          id: `param-${idCounter++}`,
          key,
          value,
        });
      }

      const params = detectDuplicates(paramsList);
      const normalizedUrl = buildQueryString(params, hasLeadingQuestionMark);

      return {
        isValid: true,
        isFullUrl: false,
        urlParts: null,
        hasLeadingQuestionMark,
        params,
        normalizedUrl,
        error: null,
      };
    } catch (parseErr) {
      return {
        isValid: false,
        isFullUrl: false,
        urlParts: null,
        hasLeadingQuestionMark: false,
        params: [],
        normalizedUrl: '',
        error: `Invalid query string: ${parseErr.message}`,
      };
    }
  }
}
