/**
 * @typedef {Record<string, string[]>} CspDirectives
 */

/**
 * @typedef {Object} CspParseError
 * @property {string} message Human-readable explanation of the syntax problem.
 * @property {number} segment One-based semicolon-delimited segment number.
 */

/**
 * @typedef {Object} CspParseResult
 * @property {CspDirectives} directives Parsed directives, including any valid earlier segments.
 * @property {CspParseError|null} error Syntax error, if the input could not be fully parsed.
 */

/** @type {Readonly<Record<string, 'HIGH'|'MEDIUM'|'LOW'>>} */
const RISK_LEVELS = {
  UNSAFE_INLINE: 'HIGH',
  UNSAFE_EVAL: 'HIGH',
  WILDCARD: 'HIGH',
  HTTP_SCHEME: 'MEDIUM',
  MISSING_DEFAULT_SRC: 'MEDIUM',
  MISSING_OBJECT_SRC: 'MEDIUM',
  MISSING_BASE_URI: 'MEDIUM',
  MISSING_FRAME_ANCESTORS: 'LOW',
};

const HEADER_PREFIX = /^\s*content-security-policy(?:-report-only)?\s*:\s*/i;
const DIRECTIVE_NAME = /^[a-z][a-z0-9-]*$/i;
const QUOTED_SOURCE = /^'[^']+'$/;

/**
 * Normalizes a source list while retaining its first-seen order.
 * @param {unknown} sources Source values associated with one directive.
 * @returns {string[]} Clean, unique CSP source expressions.
 */
export function normalizeCspSources(sources) {
  const values = Array.isArray(sources) ? sources : [];
  return [...new Set(values
    .filter((source) => typeof source === 'string')
    .map((source) => source.trim())
    .filter(Boolean))];
}

/**
 * Normalizes directive keys and source lists for consumers accepting caller-provided maps.
 * @param {unknown} directives Candidate directive map.
 * @returns {CspDirectives} A clean directive map with lower-case keys.
 */
function normalizeDirectiveMap(directives) {
  if (!directives || typeof directives !== 'object') return {};
  return Object.entries(directives).reduce((result, [rawName, sources]) => {
    const name = rawName.trim().toLowerCase();
    if (DIRECTIVE_NAME.test(name) && !Object.hasOwn(result, name)) {
      result[name] = normalizeCspSources(sources);
    }
    return result;
  }, {});
}

/**
 * Parses a Content Security Policy value or a complete `Content-Security-Policy` header.
 * It never throws: malformed directive syntax and invalid quote placement are returned as errors.
 * @param {unknown} rawInput Header value or complete header line.
 * @returns {CspParseResult} Structured directives and any parse error.
 */
export function parseCsp(rawInput) {
  const text = typeof rawInput === 'string' ? rawInput.trim() : '';
  if (!text) return { directives: {}, error: null };

  const value = text.replace(HEADER_PREFIX, '').trim();
  const directives = {};
  const segments = value.split(';');

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index].trim();
    if (!segment) continue;

    const [rawName, ...rawSources] = segment.split(/\s+/);
    const name = rawName.toLowerCase();
    if (!DIRECTIVE_NAME.test(rawName)) {
      return {
        directives,
        error: {
          message: `Invalid CSP directive "${rawName}" in segment ${index + 1}.`,
          segment: index + 1,
        },
      };
    }

    if (Object.hasOwn(directives, name)) {
      return {
        directives,
        error: {
          message: `Duplicate CSP directive "${name}" in segment ${index + 1}.`,
          segment: index + 1,
        },
      };
    }

    const invalidSource = rawSources.find((source) => source.includes("'")
      && !QUOTED_SOURCE.test(source));
    if (invalidSource) {
      return {
        directives,
        error: {
          message: `Invalid quote usage in source "${invalidSource}" for ${name}.`,
          segment: index + 1,
        },
      };
    }

    directives[name] = normalizeCspSources(rawSources);
  }

  return { directives, error: null };
}

/**
 * Produces a deterministic, normalized CSP header string from a directive map.
 * @param {CspDirectives} directives Directive names mapped to source-expression lists.
 * @param {Object} [options]
 * @param {boolean} [options.includeHeader=true] Whether to include the HTTP header name.
 * @returns {string} Normalized policy text.
 */
export function serializeCspHeader(directives, { includeHeader = true } = {}) {
  const safeDirectives = normalizeDirectiveMap(directives);
  const policy = Object.keys(safeDirectives)
    .sort()
    .map((name) => {
      const sources = normalizeCspSources(safeDirectives[name]);
      return [name, ...sources].join(' ');
    })
    .join('; ');
  return includeHeader && policy ? `Content-Security-Policy: ${policy}` : policy;
}

/**
 * Creates one advisory for a policy risk.
 * @param {string} id Stable risk identifier.
 * @param {'HIGH'|'MEDIUM'|'LOW'} level Risk severity.
 * @param {string} evidence Policy evidence that caused this result.
 * @param {string} advisory Concrete remediation guidance.
 * @returns {{id: string, level: 'HIGH'|'MEDIUM'|'LOW', evidence: string, advisory: string}}
 */
function createFinding(id, level, evidence, advisory) {
  return { id, level, evidence, advisory };
}

/**
 * Evaluates a CSP directive map using local, evidence-backed hardening checks.
 * @param {CspDirectives} directives Directive names mapped to source-expression lists.
 * @returns {{level: 'HIGH'|'MEDIUM'|'LOW'|'PASS', findings: Array<Object>}} Risk summary.
 */
export function evaluateCsp(directives) {
  const safeDirectives = normalizeDirectiveMap(directives);
  const findings = [];
  const entries = Object.entries(safeDirectives)
    .map(([name, sources]) => [name.toLowerCase(), normalizeCspSources(sources)]);

  entries.forEach(([name, sources]) => {
    if (sources.includes("'unsafe-inline'")) {
      findings.push(createFinding(
        'unsafe-inline',
        RISK_LEVELS.UNSAFE_INLINE,
        `${name} permits 'unsafe-inline'.`,
        "Remove 'unsafe-inline' and use nonce- or hash-based allowlists where possible.",
      ));
    }
    if (sources.includes("'unsafe-eval'")) {
      findings.push(createFinding(
        'unsafe-eval',
        RISK_LEVELS.UNSAFE_EVAL,
        `${name} permits 'unsafe-eval'.`,
        "Remove 'unsafe-eval' and avoid runtime string-to-code evaluation.",
      ));
    }
    if (sources.includes('*')) {
      findings.push(createFinding(
        'wildcard-source',
        RISK_LEVELS.WILDCARD,
        `${name} permits every origin with * .`,
        'Replace * with the smallest explicit set of trusted origins.',
      ));
    }
    const insecureSource = sources.find(
      (source) => source === 'http:' || /^http:\/\//i.test(source),
    );
    if (insecureSource) {
      findings.push(createFinding(
        'http-source',
        RISK_LEVELS.HTTP_SCHEME,
        `${name} permits insecure source ${insecureSource}.`,
        'Use https: or a specific HTTPS origin to avoid loading active content over HTTP.',
      ));
    }
  });

  const requiredDirectives = [
    ['default-src', 'missing-default-src', RISK_LEVELS.MISSING_DEFAULT_SRC,
      'No default-src fallback is present.',
      "Add default-src 'self' (or a stricter baseline) before adding specific exceptions."],
    ['object-src', 'missing-object-src', RISK_LEVELS.MISSING_OBJECT_SRC,
      'No explicit object-src restriction is present.',
      "Add object-src 'none' unless plugin content is deliberately required."],
    ['base-uri', 'missing-base-uri', RISK_LEVELS.MISSING_BASE_URI,
      'No base-uri restriction is present.',
      "Add base-uri 'self' or 'none' to control document base URL injection."],
    ['frame-ancestors', 'missing-frame-ancestors', RISK_LEVELS.MISSING_FRAME_ANCESTORS,
      'No frame-ancestors restriction is present.',
      "Add frame-ancestors 'none' or a trusted embedding allowlist to mitigate clickjacking."],
  ];

  requiredDirectives.forEach(([directive, id, level, evidence, advisory]) => {
    if (!Object.hasOwn(safeDirectives, directive)) {
      findings.push(createFinding(id, level, evidence, advisory));
    }
  });

  const priority = { HIGH: 3, MEDIUM: 2, LOW: 1, PASS: 0 };
  const level = findings.reduce(
    (highest, finding) => (priority[finding.level] > priority[highest] ? finding.level : highest),
    'PASS',
  );
  return { level, findings };
}
