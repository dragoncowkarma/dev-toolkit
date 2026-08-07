/**
 * @typedef {'content'|'caching'|'cors'|'security'|'authentication'|'cookie'|'other'} HeaderCategory
 */

/**
 * @typedef {Object} ParsedHeaderField
 * @property {string} name Field name exactly as it appeared, trimmed of surrounding whitespace.
 * @property {string} value Field value, trimmed of surrounding whitespace.
 * @property {number} line One-based line number of this field in the original input.
 * @property {HeaderCategory} category Best-effort classification of the field name.
 * @property {boolean} isDuplicate Whether another field with the same name (case-insensitive)
 *   is also present in the parsed block.
 */

/**
 * @typedef {Object} ParsedStartLine
 * @property {'request'|'response'} type Whether the line is a request-line or a status-line.
 * @property {string} raw The trimmed original start line text.
 * @property {number} line One-based line number of the start line in the original input.
 * @property {string} [method] Request method, present when `type` is `'request'`.
 * @property {string} [target] Request target, present when `type` is `'request'`.
 * @property {number} [statusCode] Numeric status code, present when `type` is `'response'`.
 * @property {string} [reasonPhrase] Reason phrase, present when `type` is `'response'`.
 * @property {string} httpVersion The `HTTP/x.y` version token.
 */

/**
 * @typedef {Object} ParseError
 * @property {string} message Human-readable description of the problem.
 * @property {number} line One-based line number where the problem was found.
 */

/**
 * @typedef {Object} ParseResult
 * @property {ParsedHeaderField[]} headers Fields parsed before any error was encountered.
 * @property {ParsedStartLine|null} startLine The detected request-line or status-line, if any.
 * @property {ParseError|null} error Set when a malformed field line stopped parsing.
 */

/** Header names classified by the local advisories in {@link analyzeHeaders}. */
const HEADER_CATEGORIES = {
  content: [
    'content-type', 'content-length', 'content-encoding', 'content-language',
    'content-disposition', 'content-range', 'transfer-encoding',
  ],
  caching: [
    'cache-control', 'expires', 'etag', 'last-modified', 'age', 'vary', 'pragma',
    'if-none-match', 'if-modified-since', 'if-match', 'if-unmodified-since',
  ],
  cors: [
    'access-control-allow-origin', 'access-control-allow-credentials',
    'access-control-allow-methods', 'access-control-allow-headers',
    'access-control-expose-headers', 'access-control-max-age',
    'access-control-request-method', 'access-control-request-headers', 'origin',
  ],
  security: [
    'strict-transport-security', 'content-security-policy', 'content-security-policy-report-only',
    'x-content-type-options', 'x-frame-options', 'x-xss-protection', 'referrer-policy',
    'permissions-policy', 'cross-origin-opener-policy', 'cross-origin-embedder-policy',
    'cross-origin-resource-policy',
  ],
  authentication: [
    'authorization', 'www-authenticate', 'proxy-authenticate', 'proxy-authorization',
  ],
  cookie: ['cookie', 'set-cookie'],
};

/** Advisory kinds emitted by {@link analyzeHeaders}. Every advisory is locally derivable. */
export const ADVISORY_KINDS = {
  DUPLICATE_FIELD: 'duplicate-field',
  CORS_WILDCARD_CREDENTIALS: 'cors-wildcard-credentials',
  COOKIE_SAMESITE_NONE_INSECURE: 'cookie-samesite-none-insecure',
};

/**
 * Classifies a header field name into one of the categories this tool understands.
 * @param {string} name Header field name.
 * @returns {HeaderCategory} The matched category, or `'other'` when unrecognized.
 */
export function classifyHeaderName(name) {
  const key = String(name ?? '').trim().toLowerCase();
  const match = Object.entries(HEADER_CATEGORIES)
    .find(([, names]) => names.includes(key));
  return match ? match[0] : 'other';
}

/**
 * Splits raw header text into physical lines, accepting either CRLF or LF endings.
 * @param {string} text Raw input text.
 * @returns {string[]} Lines in original order, without their line-ending characters.
 */
function splitLines(text) {
  return text.split(/\r\n|\n/);
}

/**
 * Attempts to interpret a line as an HTTP response status-line, e.g. `HTTP/1.1 200 OK`.
 * @param {string} line Candidate line, already trimmed.
 * @returns {Omit<ParsedStartLine, 'line'>|null} The parsed status-line, or `null`.
 */
function matchResponseLine(line) {
  const match = /^(HTTP\/\d(?:\.\d)?)\s+(\d{3})\s*(.*)$/i.exec(line);
  if (!match) return null;
  return {
    type: 'response',
    raw: line,
    httpVersion: match[1],
    statusCode: Number(match[2]),
    reasonPhrase: match[3].trim(),
  };
}

/**
 * Attempts to interpret a line as an HTTP request-line, e.g. `GET /path HTTP/1.1`.
 * @param {string} line Candidate line, already trimmed.
 * @returns {Omit<ParsedStartLine, 'line'>|null} The parsed request-line, or `null`.
 */
function matchRequestLine(line) {
  const match = /^([A-Za-z!#$%&'*+\-.^_`|~0-9]+)\s+(\S+)\s+(HTTP\/\d(?:\.\d)?)$/.exec(line);
  if (!match) return null;
  return {
    type: 'request',
    raw: line,
    method: match[1],
    target: match[2],
    httpVersion: match[3],
  };
}

/**
 * Detects an optional start line at the front of a header block, honoring the requested mode.
 * @param {string} line Candidate line, already trimmed.
 * @param {'auto'|'request'|'response'} mode Parsing mode.
 * @returns {Omit<ParsedStartLine, 'line'>|null} The parsed start line, or `null` when absent.
 */
function detectStartLine(line, mode) {
  if (mode === 'response') return matchResponseLine(line);
  if (mode === 'request') return matchRequestLine(line);
  return matchResponseLine(line) ?? matchRequestLine(line);
}

/**
 * Parses a raw HTTP request or response header block. Never throws: malformed input is
 * reported through the returned `error` field, with the one-based input line it occurred on.
 *
 * @param {string} rawInput Raw header text, using CRLF or LF line endings.
 * @param {Object} [options]
 * @param {'auto'|'request'|'response'} [options.mode='auto'] How to interpret an optional
 *   leading start line. `'auto'` tries a response status-line, then a request-line.
 * @returns {ParseResult} The parsed fields, optional start line, and optional error.
 */
export function parseHttpHeaders(rawInput, options = {}) {
  const mode = options.mode ?? 'auto';
  const text = typeof rawInput === 'string' ? rawInput : '';

  if (!text.trim()) {
    return { headers: [], startLine: null, error: null };
  }

  const lines = splitLines(text);
  let firstContentIndex = 0;
  while (firstContentIndex < lines.length && lines[firstContentIndex].trim() === '') {
    firstContentIndex += 1;
  }
  if (firstContentIndex >= lines.length) {
    return { headers: [], startLine: null, error: null };
  }

  const startLineMatch = detectStartLine(lines[firstContentIndex].trim(), mode);
  const startLine = startLineMatch
    ? { ...startLineMatch, line: firstContentIndex + 1 }
    : null;
  const headerStartIndex = startLine ? firstContentIndex + 1 : firstContentIndex;

  const rawHeaders = [];
  let error = null;
  for (let i = headerStartIndex; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const lineNumber = i + 1;
    if (rawLine.trim() === '') break;

    const colonIndex = rawLine.indexOf(':');
    if (colonIndex === -1) {
      error = {
        message: `Malformed header field at line ${lineNumber}: expected "Name: value".`,
        line: lineNumber,
      };
      break;
    }

    const name = rawLine.slice(0, colonIndex).trim();
    const value = rawLine.slice(colonIndex + 1).trim();
    if (!name) {
      error = {
        message: `Malformed header field at line ${lineNumber}: header name is empty.`,
        line: lineNumber,
      };
      break;
    }

    rawHeaders.push({ name, value, line: lineNumber });
  }

  const counts = new Map();
  rawHeaders.forEach(({ name }) => {
    const key = name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const headers = rawHeaders.map((header) => ({
    ...header,
    category: classifyHeaderName(header.name),
    isDuplicate: (counts.get(header.name.toLowerCase()) ?? 0) > 1,
  }));

  return { headers, startLine, error };
}

/**
 * Normalizes a header field name to a `Title-Case` form for readable, deterministic output.
 * This is a display convention only; HTTP header names are case-insensitive.
 * @param {string} name Header field name.
 * @returns {string} The normalized name.
 */
export function normalizeHeaderFieldName(name) {
  return String(name ?? '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-');
}

/**
 * Builds a deterministic, normalized text rendering of a parsed header block. Duplicate fields
 * are never coalesced: each parsed field produces its own output line, in input order.
 * @param {ParseResult} parseResult Result from {@link parseHttpHeaders}.
 * @returns {string} The normalized header block, using `\n` line endings.
 */
export function buildNormalizedOutput({ headers, startLine }) {
  const lines = [];
  if (startLine?.raw) lines.push(startLine.raw);
  headers.forEach(({ name, value }) => {
    lines.push(`${normalizeHeaderFieldName(name)}: ${value}`);
  });
  return lines.join('\n');
}

/**
 * Splits a `Set-Cookie` field value into its cookie name and known attributes.
 * @param {string} value Raw `Set-Cookie` field value.
 * @returns {{cookieName: string, sameSite: string|null, hasSecure: boolean}} Parsed attributes.
 */
export function parseSetCookieAttributes(value) {
  const parts = String(value ?? '').split(';').map((part) => part.trim()).filter(Boolean);
  const [nameValue, ...attributeParts] = parts;
  const cookieName = nameValue ? nameValue.split('=')[0].trim() : '';

  let sameSite = null;
  let hasSecure = false;
  attributeParts.forEach((part) => {
    const [attrName, attrValue] = part.split('=').map((piece) => piece?.trim());
    const lowerAttr = (attrName ?? '').toLowerCase();
    if (lowerAttr === 'samesite') sameSite = (attrValue ?? '').toLowerCase();
    if (lowerAttr === 'secure') hasSecure = true;
  });

  return { cookieName, sameSite, hasSecure };
}

/**
 * Flags header field names (case-insensitive) that occur more than once.
 * @param {ParsedHeaderField[]} headers Parsed header fields.
 * @returns {Array<{kind: string, severity: 'warning', message: string}>} Advisories.
 */
function findDuplicateFieldAdvisories(headers) {
  const seen = new Map();
  headers.forEach(({ name }) => {
    const key = name.toLowerCase();
    const entry = seen.get(key) ?? { name, count: 0 };
    entry.count += 1;
    seen.set(key, entry);
  });

  return [...seen.values()]
    .filter(({ count }) => count > 1)
    .map(({ name, count }) => ({
      kind: ADVISORY_KINDS.DUPLICATE_FIELD,
      severity: 'warning',
      message: `"${name}" appears ${count} times. Duplicate fields are kept as separate `
        + 'entries below; merge them intentionally if that was not your goal.',
    }));
}

/**
 * Flags a wildcard `Access-Control-Allow-Origin` combined with credential allowance, a
 * combination browsers reject outright.
 * @param {ParsedHeaderField[]} headers Parsed header fields.
 * @returns {Array<{kind: string, severity: 'high', message: string}>} Advisories.
 */
function findCorsWildcardCredentialAdvisories(headers) {
  const origin = headers
    .find((header) => header.name.toLowerCase() === 'access-control-allow-origin');
  const credentials = headers
    .find((header) => header.name.toLowerCase() === 'access-control-allow-credentials');
  if (!origin || !credentials) return [];
  if (origin.value.trim() !== '*') return [];
  if (credentials.value.trim().toLowerCase() !== 'true') return [];

  return [{
    kind: ADVISORY_KINDS.CORS_WILDCARD_CREDENTIALS,
    severity: 'high',
    message: 'Access-Control-Allow-Origin is "*" together with '
      + 'Access-Control-Allow-Credentials: true. Browsers reject this combination, so '
      + 'credentialed requests will fail even though both headers are present.',
  }];
}

/**
 * Flags `Set-Cookie` fields that set `SameSite=None` without also setting `Secure`, a
 * combination modern browsers reject.
 * @param {ParsedHeaderField[]} headers Parsed header fields.
 * @returns {Array<{kind: string, severity: 'high', message: string}>} Advisories.
 */
function findInsecureSameSiteNoneCookieAdvisories(headers) {
  return headers
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => ({ header, ...parseSetCookieAttributes(header.value) }))
    .filter(({ sameSite, hasSecure }) => sameSite === 'none' && !hasSecure)
    .map(({ header, cookieName }) => ({
      kind: ADVISORY_KINDS.COOKIE_SAMESITE_NONE_INSECURE,
      severity: 'high',
      message: `Cookie "${cookieName || header.name}" sets SameSite=None without Secure `
        + `(line ${header.line}). Browsers reject SameSite=None cookies unless they are `
        + 'also marked Secure.',
    }));
}

/**
 * Produces evidence-backed local advisories from parsed header fields. This never inspects
 * network state or the wider server configuration - only the fields the caller provided.
 * @param {ParsedHeaderField[]} headers Parsed header fields.
 * @returns {Array<{kind: string, severity: 'warning'|'high', message: string}>} Advisories.
 */
export function analyzeHeaders(headers) {
  return [
    ...findDuplicateFieldAdvisories(headers),
    ...findCorsWildcardCredentialAdvisories(headers),
    ...findInsecureSameSiteNoneCookieAdvisories(headers),
  ];
}

/**
 * Filters parsed header rows by a case-insensitive match against name, value, or category.
 * @param {ParsedHeaderField[]} headers Parsed header fields.
 * @param {string} query Free-text filter query.
 * @returns {ParsedHeaderField[]} Matching rows, or all rows when the query is blank.
 */
export function filterHeaderRows(headers, query) {
  const normalizedQuery = String(query ?? '').trim().toLowerCase();
  if (!normalizedQuery) return headers;
  return headers.filter(({ name, value, category }) => (
    name.toLowerCase().includes(normalizedQuery)
      || value.toLowerCase().includes(normalizedQuery)
      || category.toLowerCase().includes(normalizedQuery)
  ));
}
