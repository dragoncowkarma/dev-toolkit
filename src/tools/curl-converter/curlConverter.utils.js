const NO_ARG_FLAGS = new Set([
  '-s', '--silent', '-k', '--insecure', '-L', '--location', '-i', '--include',
  '-v', '--verbose', '--compressed', '-#', '--progress-bar', '-4', '--ipv4',
  '-6', '--ipv6', '-f', '--fail', '-N', '--no-buffer', '-g', '--globoff',
]);

const DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-ascii']);

/**
 * Splits a cURL command string into shell-style tokens, honoring single and
 * double quoted segments plus backslash escapes.
 *
 * @param {string} command Raw command text.
 * @returns {string[]} Ordered list of tokens.
 * @throws {Error} When a quoted segment is never closed.
 */
export function tokenizeCommand(command) {
  const tokens = [];
  let current = '';
  let quote = null;
  let hasToken = false;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (char === '\\' && '"\\$`\n'.includes(command[i + 1] ?? '')) {
        current += command[i + 1];
        i += 1;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      hasToken = true;
      continue;
    }

    if (char === '\\' && i + 1 < command.length) {
      current += command[i + 1];
      i += 1;
      hasToken = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }

    current += char;
    hasToken = true;
  }

  if (quote) {
    throw new Error('Unterminated quote in the cURL command.');
  }
  if (hasToken) tokens.push(current);
  return tokens;
}

function findHeader(headers, name) {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
}

function looksLikeJson(text) {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

const URL_ENCODED_PATTERN = /^[^\s=&]+=[^\s&]*(&[^\s=&]+=[^\s&]*)*$/;

function looksLikeUrlEncoded(text) {
  return URL_ENCODED_PATTERN.test(text);
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: undefined };
  }
}

/**
 * Base64-encodes UTF-8 text using whichever encoder the runtime exposes.
 *
 * @param {string} text Text to encode.
 * @returns {string} Base64-encoded representation.
 */
export function encodeBase64(text) {
  if (typeof btoa !== 'function') {
    throw new Error('Base64 encoding is not supported in this environment.');
  }
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/**
 * Parses a cURL command string into a structured request description.
 *
 * @param {string} input Raw cURL command, possibly spanning multiple lines.
 * @returns {{
 *   method: string,
 *   url: string,
 *   headers: Record<string, string>,
 *   queryParams: Record<string, string>,
 *   body: unknown,
 *   bodyType: 'none'|'json'|'form-data'|'urlencoded'|'text',
 * }} The parsed request.
 * @throws {Error} When the command is empty, malformed, or has no URL.
 */
export function parseCurl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Enter a cURL command to convert.');
  }

  const normalized = input.trim().replace(/\\\r?\n/g, ' ');
  const tokens = tokenizeCommand(normalized);

  if (tokens.length === 0 || tokens[0].toLowerCase() !== 'curl') {
    throw new Error('Command must start with "curl".');
  }

  let url = '';
  let explicitMethod = '';
  const headers = {};
  const dataParts = [];
  const formParts = [];
  let authUser = '';

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      explicitMethod = (tokens[i += 1] || '').toUpperCase();
      continue;
    }

    if (token === '-H' || token === '--header') {
      const headerValue = tokens[i += 1] || '';
      const separatorIndex = headerValue.indexOf(':');
      if (separatorIndex === -1) {
        throw new Error(`Invalid header: "${headerValue}". Expected "Key: Value".`);
      }
      const key = headerValue.slice(0, separatorIndex).trim();
      const value = headerValue.slice(separatorIndex + 1).trim();
      if (key) headers[key] = value;
      continue;
    }

    if (DATA_FLAGS.has(token) || token === '--data-urlencode') {
      dataParts.push(tokens[i += 1] || '');
      continue;
    }

    if (token === '-F' || token === '--form') {
      const formValue = tokens[i += 1] || '';
      const equalsIndex = formValue.indexOf('=');
      const key = equalsIndex === -1 ? formValue : formValue.slice(0, equalsIndex);
      const value = equalsIndex === -1 ? '' : formValue.slice(equalsIndex + 1);
      formParts.push({ key, value, isFile: value.startsWith('@') });
      continue;
    }

    if (token === '-u' || token === '--user') {
      authUser = tokens[i += 1] || '';
      continue;
    }

    if (token === '--url') {
      url = tokens[i += 1] || '';
      continue;
    }

    if (NO_ARG_FLAGS.has(token)) {
      continue;
    }

    if (token.startsWith('-')) {
      // Unrecognized flag: skip it without consuming the next token, since we
      // cannot reliably tell whether it expects a value.
      continue;
    }

    if (!url) {
      url = token;
    }
  }

  if (!url) {
    throw new Error('No URL found in the cURL command.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: "${url}".`);
  }

  const queryParams = {};
  parsedUrl.searchParams.forEach((value, key) => {
    queryParams[key] = value;
  });

  if (authUser) {
    const [user, ...passParts] = authUser.split(':');
    headers.Authorization = `Basic ${encodeBase64(`${user}:${passParts.join(':')}`)}`;
  }

  const method = explicitMethod || (formParts.length > 0 || dataParts.length > 0 ? 'POST' : 'GET');

  let bodyType = 'none';
  let body = null;

  if (formParts.length > 0) {
    bodyType = 'form-data';
    body = formParts;
  } else if (dataParts.length > 0) {
    const rawBody = dataParts.join('&');
    const contentType = findHeader(headers, 'content-type').toLowerCase();

    if (contentType.includes('json')) {
      const parsed = safeJsonParse(rawBody);
      if (parsed.ok) {
        bodyType = 'json';
        body = parsed.value;
      } else {
        // Declared JSON but not valid JSON: keep the Content-Type header the
        // caller specified, but pass the raw bytes through unchanged instead
        // of re-encoding them as a JSON string literal.
        bodyType = 'text';
        body = rawBody;
      }
    } else if (!contentType && looksLikeJson(rawBody)) {
      const parsed = safeJsonParse(rawBody);
      if (parsed.ok) {
        bodyType = 'json';
        body = parsed.value;
        headers['Content-Type'] = 'application/json';
      } else {
        bodyType = 'text';
        body = rawBody;
      }
    } else if (
      contentType.includes('urlencoded')
      || (!contentType && looksLikeUrlEncoded(rawBody))
    ) {
      bodyType = 'urlencoded';
      body = rawBody;
      if (!contentType) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else {
      bodyType = 'text';
      body = rawBody;
    }
  }

  return { method, url: parsedUrl.toString(), headers, queryParams, body, bodyType };
}

function quote(value) {
  return JSON.stringify(String(value));
}

function indentBlock(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line, index) => (index === 0 ? line : pad + line)).join('\n');
}

/**
 * Indents every line of a block of text (including the first), skipping
 * blank lines so no trailing whitespace is introduced.
 *
 * @param {string} text Text to indent.
 * @param {number} spaces Number of spaces to prepend to each non-blank line.
 * @returns {string} Indented text.
 */
function indentAll(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line) => (line ? pad + line : line)).join('\n');
}

/**
 * Wraps a snippet body in an async IIFE with a try/catch so the generated
 * code is a self-contained, immediately executable script (no dangling
 * top-level `await`).
 *
 * @param {string} body Snippet body using `await` expressions.
 * @returns {string} The body wrapped in `(async () => { try { ... } catch ... } })();`.
 */
function wrapInAsyncIife(body) {
  return '(async () => {\n'
    + '  try {\n'
    + `${indentAll(body, 4)}\n`
    + '  } catch (error) {\n'
    + '    console.error(error);\n'
    + '  }\n'
    + '})();';
}

/**
 * Builds the preamble statements (if any) and inline expression needed to
 * represent a parsed request body in generated JavaScript code.
 *
 * @param {unknown} body Parsed body value from {@link parseCurl}.
 * @param {string} bodyType Body classification from {@link parseCurl}.
 * @returns {{preamble: string, expression: string}} Code fragments to splice in.
 */
function buildBody(body, bodyType) {
  if (bodyType === 'none' || body === null || body === undefined) {
    return { preamble: '', expression: '' };
  }

  if (bodyType === 'json') {
    return {
      preamble: '',
      expression: `JSON.stringify(${indentBlock(JSON.stringify(body, null, 2), 2)})`,
    };
  }

  if (bodyType === 'form-data') {
    const lines = ['const formData = new FormData();'];
    body.forEach(({ key, value, isFile }) => {
      if (isFile) {
        lines.push(`formData.append(${quote(key)}, /* file: ${value.slice(1)} */ file);`);
      } else {
        lines.push(`formData.append(${quote(key)}, ${quote(value)});`);
      }
    });
    return { preamble: `${lines.join('\n')}\n\n`, expression: 'formData' };
  }

  return { preamble: '', expression: quote(body) };
}

function formatHeaders(headers) {
  return Object.keys(headers).length > 0 ? indentBlock(JSON.stringify(headers, null, 2), 2) : '';
}

/**
 * Generates a browser `fetch`-based JavaScript snippet for a parsed request.
 *
 * The request is wrapped in a self-contained `(async () => { ... })();` IIFE
 * with a try/catch so the snippet is directly executable (no dangling
 * top-level `await`) when pasted into a browser script or a CommonJS file.
 *
 * @param {ReturnType<typeof parseCurl>} parsed Parsed cURL request.
 * @returns {string} Formatted JavaScript source.
 */
export function generateFetch(parsed) {
  const { method, url, headers, body, bodyType } = parsed;
  const { preamble, expression } = buildBody(body, bodyType);

  const optionLines = [`method: ${quote(method)}`];
  const headerBlock = formatHeaders(headers);
  if (headerBlock) optionLines.push(`headers: ${headerBlock}`);
  if (expression) optionLines.push(`body: ${indentBlock(expression, 2)}`);

  const options = optionLines.map((line) => `  ${line}`).join(',\n');

  const requestBlock = `${preamble}const response = await fetch(${quote(url)}, {\n`
    + `${options},\n});\n`
    + 'const data = await response.json();\n'
    + 'console.log(data);';

  return wrapInAsyncIife(requestBlock);
}

/**
 * Generates an `axios.request` JavaScript snippet for a parsed request.
 *
 * The request is wrapped in a self-contained `(async () => { ... })();` IIFE
 * with a try/catch so the snippet is directly executable (no dangling
 * top-level `await`) when pasted into a browser script or a CommonJS file.
 *
 * @param {ReturnType<typeof parseCurl>} parsed Parsed cURL request.
 * @returns {string} Formatted JavaScript source.
 */
export function generateAxios(parsed) {
  const { method, url, headers, body, bodyType } = parsed;
  const { preamble, expression } = buildBody(body, bodyType);

  const optionLines = [`method: ${quote(method.toLowerCase())}`, `url: ${quote(url)}`];
  const headerBlock = formatHeaders(headers);
  if (headerBlock) optionLines.push(`headers: ${headerBlock}`);
  if (expression) optionLines.push(`data: ${indentBlock(expression, 2)}`);

  const options = optionLines.map((line) => `  ${line}`).join(',\n');

  const requestBlock = `${preamble}const response = await axios.request({\n${options},\n});\n`
    + 'console.log(response.data);';

  return wrapInAsyncIife(requestBlock);
}

/**
 * Generates a Node.js snippet using the built-in `http`/`https` module for a
 * parsed request.
 *
 * @param {ReturnType<typeof parseCurl>} parsed Parsed cURL request.
 * @returns {string} Formatted JavaScript source.
 */
export function generateNode(parsed) {
  const { method, url, headers, body, bodyType } = parsed;

  let parsedUrl = null;
  try {
    parsedUrl = new URL(url);
  } catch {
    parsedUrl = null;
  }

  const moduleName = parsedUrl?.protocol === 'http:' ? 'http' : 'https';
  const hostname = parsedUrl ? parsedUrl.hostname : '';
  const path = parsedUrl ? `${parsedUrl.pathname}${parsedUrl.search}` : url;

  const optionLines = [
    `hostname: ${quote(hostname)}`,
    `path: ${quote(path)}`,
    `method: ${quote(method)}`,
  ];
  const headerBlock = formatHeaders(headers);
  if (headerBlock) optionLines.push(`headers: ${headerBlock}`);
  const options = optionLines.map((line) => `  ${line}`).join(',\n');

  const lines = [
    `const ${moduleName} = require(${quote(moduleName)});`,
    '',
    `const options = {\n${options},\n};`,
    '',
    `const req = ${moduleName}.request(options, (res) => {`,
    "  let data = '';",
    "  res.on('data', (chunk) => { data += chunk; });",
    "  res.on('end', () => { console.log(data); });",
    '});',
    '',
    "req.on('error', (error) => { console.error(error); });",
  ];

  if (bodyType === 'form-data') {
    lines.push(
      '',
      '// Multipart form-data requires manual boundary encoding with the',
      '// built-in http/https module; consider the Fetch or Axios tabs instead.',
    );
  } else {
    const { expression } = buildBody(body, bodyType);
    if (expression) lines.push('', `req.write(${expression});`);
  }

  lines.push('req.end();');

  return lines.join('\n');
}

const TOKEN_PATTERN = new RegExp(
  '(//.*)'
  + "|('(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\"|`(?:[^`\\\\]|\\\\.)*`)"
  + '|\\b(const|let|var|await|async|new|function|require|import|from|return|true|false|null)\\b',
  'g',
);

/**
 * Tokenizes generated JavaScript code into plain/comment/string/keyword
 * segments for lightweight, dependency-free syntax highlighting.
 *
 * @param {string} code Source code to tokenize.
 * @returns {Array<{text: string, type: 'plain'|'comment'|'string'|'keyword'}>} Ordered tokens.
 */
export function tokenizeCodeForHighlight(code) {
  const tokens = [];
  let lastIndex = 0;
  let match;

  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: code.slice(lastIndex, match.index), type: 'plain' });
    }
    const type = match[1] ? 'comment' : match[2] ? 'string' : 'keyword';
    tokens.push({ text: match[0], type });
    lastIndex = TOKEN_PATTERN.lastIndex;
  }
  if (lastIndex < code.length) {
    tokens.push({ text: code.slice(lastIndex), type: 'plain' });
  }
  return tokens;
}
