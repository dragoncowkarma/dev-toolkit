const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const ATTRIBUTE_NAMES = new Set([
  'domain', 'path', 'expires', 'max-age', 'samesite', 'secure', 'httponly',
  'partitioned',
]);

function createError(message, line = 1) {
  return { message, line };
}

function decodeValue(value, shouldDecode) {
  if (!shouldDecode) return { value, warning: null };
  try {
    return { value: decodeURIComponent(value), warning: null };
  } catch {
    return {
      value,
      warning: {
        code: 'decode-failed',
        message: 'Value contains invalid percent encoding and was left unchanged.',
      },
    };
  }
}

function splitNameValue(part, line) {
  const separator = part.indexOf('=');
  if (separator < 1) {
    return {
      error: createError(`Malformed cookie at line ${line}: expected a name=value pair.`, line),
    };
  }

  const name = part.slice(0, separator).trim();
  const value = part.slice(separator + 1).trim();
  if (!COOKIE_NAME_PATTERN.test(name)) {
    return {
      error: createError(`Malformed cookie at line ${line}: invalid cookie name "${name}".`, line),
    };
  }
  if (/[;\r\n]/.test(value)) {
    return {
      error: createError(`Malformed cookie at line ${line}: invalid cookie value.`, line),
    };
  }
  return { name, value, error: null };
}

function normalizeSameSite(value) {
  const match = ['strict', 'lax', 'none'].find(
    (candidate) => candidate === String(value).toLowerCase(),
  );
  return match ? match[0].toUpperCase() + match.slice(1) : '';
}

function emptyCookie(name, value, source, line) {
  return {
    name,
    value,
    domain: '',
    path: '',
    expires: '',
    maxAge: null,
    sameSite: '',
    secure: false,
    httpOnly: false,
    partitioned: false,
    unknownAttributes: [],
    source,
    line,
  };
}

function parseSetCookieLine(rawLine, line, shouldDecode) {
  const stripped = rawLine.replace(/^\s*set-cookie\s*:\s*/i, '').trim();
  const parts = stripped.split(';').map((part) => part.trim());
  const pair = splitNameValue(parts.shift() ?? '', line);
  if (pair.error) return { cookie: null, error: pair.error };

  const decoded = decodeValue(pair.value, shouldDecode);
  const cookie = emptyCookie(pair.name, decoded.value, 'set-cookie', line);
  if (decoded.warning) cookie.unknownAttributes.push(decoded.warning);

  for (const part of parts.filter(Boolean)) {
    const separator = part.indexOf('=');
    const rawName = (separator === -1 ? part : part.slice(0, separator)).trim();
    const rawValue = separator === -1 ? '' : part.slice(separator + 1).trim();
    const attributeName = rawName.toLowerCase();

    if (attributeName === 'domain') cookie.domain = rawValue;
    else if (attributeName === 'path') cookie.path = rawValue;
    else if (attributeName === 'expires') cookie.expires = rawValue;
    else if (attributeName === 'max-age') {
      if (/^-?\d+$/.test(rawValue)) cookie.maxAge = Number(rawValue);
      else cookie.unknownAttributes.push({
        code: 'invalid-max-age',
        message: `Max-Age "${rawValue}" is not an integer and was ignored.`,
      });
    } else if (attributeName === 'samesite') {
      cookie.sameSite = normalizeSameSite(rawValue);
      if (!cookie.sameSite) cookie.unknownAttributes.push({
        code: 'invalid-samesite',
        message: `SameSite "${rawValue}" must be Strict, Lax, or None.`,
      });
    } else if (attributeName === 'secure') cookie.secure = true;
    else if (attributeName === 'httponly') cookie.httpOnly = true;
    else if (attributeName === 'partitioned') cookie.partitioned = true;
    else cookie.unknownAttributes.push({
      code: 'unknown-attribute',
      message: `Unknown attribute "${rawName}" was preserved for inspection only.`,
      name: rawName,
      value: rawValue,
    });
  }

  return { cookie, error: null };
}

function parseRequestCookieLine(rawLine, line, shouldDecode) {
  const stripped = rawLine.replace(/^\s*cookie\s*:\s*/i, '').trim();
  const cookies = [];
  for (const part of stripped.split(';').map((item) => item.trim()).filter(Boolean)) {
    const pair = splitNameValue(part, line);
    if (pair.error) return { cookies, error: pair.error };
    const decoded = decodeValue(pair.value, shouldDecode);
    const cookie = emptyCookie(pair.name, decoded.value, 'cookie', line);
    if (decoded.warning) cookie.unknownAttributes.push(decoded.warning);
    cookies.push(cookie);
  }
  if (cookies.length === 0) {
    return {
      cookies,
      error: createError(`Malformed Cookie header at line ${line}: no cookie pairs found.`, line),
    };
  }
  return { cookies, error: null };
}

function detectMode(lines) {
  if (lines.some((line) => /^\s*set-cookie\s*:/i.test(line.text))) return 'set-cookie';
  if (lines.some((line) => /^\s*cookie\s*:/i.test(line.text))) return 'cookie';
  if (lines.length > 1) return 'set-cookie';

  const parts = lines[0].text.split(';').slice(1);
  const hasAttribute = parts.some((part) => {
    const name = part.trim().split('=', 1)[0].toLowerCase();
    return ATTRIBUTE_NAMES.has(name);
  });
  return hasAttribute ? 'set-cookie' : 'cookie';
}

/**
 * Calculates effective expiry information. Max-Age takes precedence over Expires.
 *
 * @param {Object} cookie Parsed or edited cookie attributes.
 * @param {Date|number|string} [now=new Date()] Reference instant for relative TTL.
 * @returns {{source: string, expiresAt: Date|null, utc: string, local: string,
 *   ttlSeconds: number|null, expired: boolean}} Normalized expiration information.
 */
export function calculateExpiration(cookie, now = new Date()) {
  const reference = new Date(now);
  if (Number.isFinite(cookie.maxAge)) {
    const expiresAt = new Date(reference.getTime() + cookie.maxAge * 1000);
    return {
      source: 'max-age',
      expiresAt,
      utc: expiresAt.toUTCString(),
      local: expiresAt.toLocaleString(),
      ttlSeconds: cookie.maxAge,
      expired: cookie.maxAge <= 0,
    };
  }

  if (cookie.expires) {
    const expiresAt = new Date(cookie.expires);
    if (!Number.isNaN(expiresAt.getTime())) {
      const ttlSeconds = Math.floor((expiresAt.getTime() - reference.getTime()) / 1000);
      return {
        source: 'expires',
        expiresAt,
        utc: expiresAt.toUTCString(),
        local: expiresAt.toLocaleString(),
        ttlSeconds,
        expired: ttlSeconds <= 0,
      };
    }
  }

  return {
    source: cookie.expires ? 'invalid' : 'session',
    expiresAt: null,
    utc: '',
    local: '',
    ttlSeconds: null,
    expired: false,
  };
}

/**
 * Diagnoses security and scope concerns in a parsed or edited cookie.
 *
 * @param {Object} cookie Cookie attributes to validate.
 * @returns {Array<{code: string, severity: string, message: string}>} Actionable findings.
 */
export function validateCookie(cookie) {
  const name = cookie.name ?? '';
  const domain = cookie.domain ?? '';
  const path = cookie.path ?? '';
  const findings = [...(cookie.unknownAttributes ?? []).map((finding) => ({
    ...finding,
    severity: 'warning',
  }))];

  if (name.startsWith('__Host-')) {
    if (!cookie.secure) findings.push({
      code: 'host-prefix-secure',
      severity: 'high',
      message: '__Host- cookies must include Secure.',
    });
    if (domain) findings.push({
      code: 'host-prefix-domain',
      severity: 'high',
      message: '__Host- cookies must not include Domain.',
    });
    if (path !== '/') findings.push({
      code: 'host-prefix-path',
      severity: 'high',
      message: '__Host- cookies must use Path=/.',
    });
  }

  if (name.startsWith('__Secure-') && !cookie.secure) findings.push({
    code: 'secure-prefix',
    severity: 'high',
    message: '__Secure- cookies must include Secure.',
  });
  if (cookie.sameSite === 'None' && !cookie.secure) findings.push({
    code: 'samesite-none-secure',
    severity: 'high',
    message: 'SameSite=None cookies must include Secure to be accepted by browsers.',
  });
  if (cookie.partitioned && !cookie.secure) findings.push({
    code: 'partitioned-secure',
    severity: 'high',
    message: 'Partitioned cookies must include Secure.',
  });
  if (domain.includes('*')) findings.push({
    code: 'domain-wildcard',
    severity: 'warning',
    message: 'Domain wildcards are invalid; specify a concrete host or parent domain.',
  });
  if (domain && !domain.startsWith('.')) findings.push({
    code: 'domain-leading-dot',
    severity: 'warning',
    message: 'Domain has no leading dot. Modern browsers ignore leading dots; verify scope.',
  });
  if (path && !path.startsWith('/')) findings.push({
    code: 'path-scope',
    severity: 'warning',
    message: 'Path should begin with "/" to define an unambiguous cookie scope.',
  });

  const expiration = calculateExpiration(cookie);
  if (expiration.source === 'invalid') findings.push({
    code: 'invalid-expires',
    severity: 'warning',
    message: 'Expires is not a valid HTTP date and will be ignored by browsers.',
  });
  return findings;
}

/**
 * Parses raw Set-Cookie header lines or request Cookie pairs without throwing.
 *
 * @param {string} rawInput Header text or bare cookie data.
 * @param {Object} [options] Parser options.
 * @param {'auto'|'set-cookie'|'cookie'} [options.mode='auto'] Input interpretation mode.
 * @param {boolean} [options.decodeValues=false] Decode percent-encoded cookie values.
 * @param {Date|number|string} [options.now=new Date()] TTL reference instant.
 * @returns {{cookies: Object[], type: string|null, error: Object|null}} Parse result.
 */
export function parseCookieInput(rawInput, options = {}) {
  const text = typeof rawInput === 'string' ? rawInput : '';
  if (!text.trim()) return { cookies: [], type: null, error: null };

  const lines = text.split(/\r?\n/)
    .map((line, index) => ({ text: line.trim(), line: index + 1 }))
    .filter((line) => line.text);
  const mode = options.mode && options.mode !== 'auto' ? options.mode : detectMode(lines);
  const cookies = [];

  for (const line of lines) {
    if (mode === 'set-cookie') {
      if (/^\s*cookie\s*:/i.test(line.text)) {
        return {
          cookies,
          type: mode,
          error: createError(`Expected Set-Cookie at line ${line.line}.`, line.line),
        };
      }
      const result = parseSetCookieLine(line.text, line.line, options.decodeValues);
      if (result.error) return { cookies, type: mode, error: result.error };
      cookies.push(result.cookie);
    } else {
      if (/^\s*set-cookie\s*:/i.test(line.text)) {
        return {
          cookies,
          type: mode,
          error: createError(`Expected Cookie at line ${line.line}.`, line.line),
        };
      }
      const result = parseRequestCookieLine(line.text, line.line, options.decodeValues);
      if (result.error) return { cookies, type: mode, error: result.error };
      cookies.push(...result.cookies);
    }
  }

  const now = options.now ?? new Date();
  return {
    cookies: cookies.map((cookie) => ({
      ...cookie,
      expiration: calculateExpiration(cookie, now),
      warnings: validateCookie(cookie),
    })),
    type: mode,
    error: null,
  };
}

function assertSerializable(cookie) {
  if (!COOKIE_NAME_PATTERN.test(cookie.name ?? '')) {
    throw new Error('Cookie name is required and must contain only token characters.');
  }
  if (/[;\r\n]/.test(cookie.value ?? '')) {
    throw new Error('Cookie value cannot contain semicolons or line breaks.');
  }
  if (/[*;\r\n]/.test(cookie.domain ?? '')) {
    throw new Error('Domain must be a concrete host name.');
  }
  if (/[;\r\n]/.test(cookie.path ?? '')) {
    throw new Error('Path cannot contain semicolons or line breaks.');
  }
}

/**
 * Serializes editable attributes into a normalized Set-Cookie field value.
 *
 * @param {Object} cookie Cookie attributes to serialize.
 * @param {Object} [options] Serialization options.
 * @param {boolean} [options.includeHeader=true] Prefix output with `Set-Cookie: `.
 * @param {boolean} [options.includeHttpOnly=true] Include the HttpOnly attribute.
 * @returns {string} Normalized Set-Cookie header or field value.
 */
export function serializeSetCookie(cookie, options = {}) {
  assertSerializable(cookie);
  const includeHeader = options.includeHeader ?? true;
  const includeHttpOnly = options.includeHttpOnly ?? true;
  const parts = [`${cookie.name}=${cookie.value ?? ''}`];

  if (cookie.domain) parts.push(`Domain=${cookie.domain.replace(/^\.+/, '').toLowerCase()}`);
  if (cookie.path) parts.push(`Path=${cookie.path}`);
  if (cookie.expires) {
    const expires = new Date(cookie.expires);
    if (Number.isNaN(expires.getTime())) throw new Error('Expires must be a valid date.');
    parts.push(`Expires=${expires.toUTCString()}`);
  }
  if (cookie.maxAge !== null && cookie.maxAge !== '' && cookie.maxAge !== undefined) {
    const maxAge = Number(cookie.maxAge);
    if (!Number.isFinite(maxAge)) throw new Error('Max-Age must be an integer.');
    parts.push(`Max-Age=${Math.trunc(maxAge)}`);
  }
  if (cookie.sameSite) {
    const sameSite = normalizeSameSite(cookie.sameSite);
    if (!sameSite) throw new Error('SameSite must be Strict, Lax, None, or empty.');
    parts.push(`SameSite=${sameSite}`);
  }
  if (cookie.secure) parts.push('Secure');
  if (cookie.httpOnly && includeHttpOnly) parts.push('HttpOnly');
  if (cookie.partitioned) parts.push('Partitioned');

  const value = parts.join('; ');
  return includeHeader ? `Set-Cookie: ${value}` : value;
}

/**
 * Builds a browser-ready document.cookie assignment. HttpOnly is intentionally omitted.
 *
 * @param {Object} cookie Cookie attributes to serialize.
 * @returns {string} JavaScript assignment snippet.
 */
export function serializeDocumentCookie(cookie) {
  const value = serializeSetCookie(cookie, { includeHeader: false, includeHttpOnly: false });
  return `document.cookie = ${JSON.stringify(value)};`;
}
