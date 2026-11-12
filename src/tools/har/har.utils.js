const TIMING_PHASES = ['blocked', 'dns', 'connect', 'send', 'wait', 'receive'];

/**
 * Converts an unknown HAR duration to a non-negative millisecond value.
 * @param {unknown} value
 * @returns {number}
 */
function safeDuration(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Converts an unknown HAR byte count to a non-negative byte value.
 * @param {unknown} value
 * @returns {number}
 */
function safeSize(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Identifies the request resource category from HAR extension fields, MIME type, and URL.
 * @param {object} entry
 * @returns {string}
 */
export function getResourceType(entry) {
  const safeEntry = entry ?? {};
  const request = safeEntry.request ?? {};
  const response = safeEntry.response ?? {};
  const extensionType = String(
    safeEntry._resourceType ?? safeEntry._initiator?.type ?? ''
  ).toLowerCase();
  const mimeType = String(response.content?.mimeType ?? '').toLowerCase();
  const url = String(request.url ?? '').toLowerCase();
  const isStylesheet = extensionType === 'stylesheet' ||
    mimeType.includes('text/css') ||
    /\.css(?:[?#]|$)/.test(url);
  const isScript = extensionType === 'script' ||
    /javascript|ecmascript/.test(mimeType) ||
    /\.m?js(?:[?#]|$)/.test(url);
  const isImage = extensionType === 'image' ||
    mimeType.startsWith('image/') ||
    /\.(png|jpe?g|gif|svg|webp|ico)(?:[?#]|$)/.test(url);
  const isMedia = extensionType === 'media' ||
    /^(audio|video)\//.test(mimeType) ||
    /\.(mp3|mp4|ogg|webm|wav)(?:[?#]|$)/.test(url);

  if (['xhr', 'fetch', 'xmlhttprequest'].includes(extensionType)) return 'XHR/Fetch';
  if (extensionType === 'document' || mimeType.includes('text/html')) return 'Doc';
  if (isStylesheet) return 'CSS';
  if (isScript) return 'JS';
  if (isImage) return 'Img';
  if (isMedia) return 'Media';
  return 'Other';
}

/**
 * Finds the earliest request start and latest request end without expanding an array.
 * @param {Array<object>} entries
 * @returns {{start: number, end: number}}
 */
export function getTimelineBounds(entries) {
  let start = Infinity;
  let end = -Infinity;

  for (const entry of entries) {
    const entryStart = Number.isFinite(entry?.startedAt) ? entry.startedAt : 0;
    const entryEnd = entryStart + safeDuration(entry?.duration);

    if (entryStart < start) start = entryStart;
    if (entryEnd > end) end = entryEnd;
  }

  return start === Infinity ? { start: 0, end: 0 } : { start, end };
}

/**
 * Parses a HAR JSON document and normalizes optional fields used by the UI.
 * @param {string} text
 * @returns {{entries: Array<object>, pages: Array<object>}}
 * @throws {Error} When the input is not valid HAR JSON.
 */
export function parseHar(text) {
  if (!text.trim()) {
    throw new Error('Paste HAR JSON or choose a .har file to begin.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This is not valid JSON. Check the pasted content and try again.');
  }

  if (!parsed || typeof parsed !== 'object' || !parsed.log ||
    !Array.isArray(parsed.log.entries)) {
    throw new Error('This JSON is not a HAR file. Expected a log.entries array.');
  }

  return {
    entries: parsed.log.entries.map((entry, index) => normalizeEntry(entry, index)),
    pages: Array.isArray(parsed.log.pages) ? parsed.log.pages : [],
  };
}

/**
 * Normalizes a HAR entry without discarding original request and response data.
 * @param {object} entry
 * @param {number} index
 * @returns {object}
 */
export function normalizeEntry(entry, index) {
  const safeEntry = entry ?? {};
  const timings = safeEntry.timings ?? {};
  const normalizedTimings = Object.fromEntries(
    TIMING_PHASES.map((phase) => [phase, safeDuration(timings[phase])])
  );
  const request = safeEntry.request ?? {};
  const response = safeEntry.response ?? {};
  const startedAt = Date.parse(safeEntry.startedDateTime ?? '');
  const duration = safeDuration(safeEntry.time) || Object.values(normalizedTimings).reduce(
    (total, value) => total + value,
    0
  );
  const transferSize = safeSize(response._transferSize) ||
    safeSize(response.bodySize) ||
    safeSize(response.content?.size);

  return {
    ...safeEntry,
    id: `${index}-${safeEntry.startedDateTime ?? ''}-${request.url ?? ''}`,
    request: {
      ...request,
      headers: request.headers ?? [],
      queryString: request.queryString ?? [],
      cookies: request.cookies ?? [],
    },
    response: {
      ...response,
      headers: response.headers ?? [],
      cookies: response.cookies ?? [],
      content: response.content ?? {},
    },
    startedAt: Number.isNaN(startedAt) ? index : startedAt,
    duration,
    transferSize,
    timings: normalizedTimings,
    resourceType: getResourceType(safeEntry),
  };
}

/**
 * Calculates aggregate display values for an array of normalized HAR entries.
 * @param {Array<object>} entries
 * @returns {{
 *   totalRequests: number,
 *   totalTransferSize: number,
 *   totalLoadTime: number,
 *   statusCounts: object,
 *   sizeDistribution: Array<object>
 * }}
 */
export function getOverview(entries) {
  const statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, Other: 0 };
  const sizeBins = [
    { label: '< 10 KB', min: 0, max: 10 * 1024, count: 0 },
    { label: '10–100 KB', min: 10 * 1024, max: 100 * 1024, count: 0 },
    { label: '100 KB–1 MB', min: 100 * 1024, max: 1024 * 1024, count: 0 },
    { label: '≥ 1 MB', min: 1024 * 1024, max: Infinity, count: 0 },
  ];
  const totalTransferSize = entries.reduce(
    (total, entry) => total + entry.transferSize,
    0
  );
  const { start, end } = getTimelineBounds(entries);

  entries.forEach((entry) => {
    const status = Number(entry.response?.status);
    const group = status >= 200 && status < 300 ? '2xx' :
      status >= 300 && status < 400 ? '3xx' :
        status >= 400 && status < 500 ? '4xx' :
          status >= 500 && status < 600 ? '5xx' : 'Other';
    statusCounts[group] += 1;
    const bin = sizeBins.find(
      (item) => entry.transferSize >= item.min && entry.transferSize < item.max
    );
    if (bin) bin.count += 1;
  });

  return {
    totalRequests: entries.length,
    totalTransferSize,
    totalLoadTime: end - start,
    statusCounts,
    sizeDistribution: sizeBins,
  };
}

/**
 * Returns entries matching the active request filters.
 * @param {Array<object>} entries
 * @param {{url?: string, method?: string, status?: string, resourceType?: string}} filters
 * @returns {Array<object>}
 */
export function filterEntries(entries, filters) {
  const urlQuery = (filters.url ?? '').trim().toLowerCase();

  return entries.filter((entry) => {
    const status = Number(entry.response?.status);
    const matchesUrl = !urlQuery ||
      String(entry.request?.url ?? '').toLowerCase().includes(urlQuery);
    const matchesMethod = !filters.method || entry.request?.method === filters.method;
    const matchesStatus = !filters.status || (
      filters.status === 'other' ? status < 200 || status >= 600 :
        status >= Number(filters.status) && status < Number(filters.status) + 100
    );
    const matchesType = !filters.resourceType || entry.resourceType === filters.resourceType;

    return matchesUrl && matchesMethod && matchesStatus && matchesType;
  });
}

/**
 * Escapes a value for safe placement inside single quotes in a POSIX shell command.
 * @param {string} value
 * @returns {string}
 */
function toShellSingleQuoted(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Builds an equivalent `curl` command for a normalized HAR entry.
 * @param {object} entry
 * @returns {string}
 */
export function toCurlCommand(entry) {
  const request = entry?.request ?? {};
  const method = String(request.method ?? 'GET').toUpperCase();
  const url = String(request.url ?? '');
  const headers = Array.isArray(request.headers) ? request.headers : [];
  const postData = request.postData;
  const parts = ['curl', `-X ${toShellSingleQuoted(method)}`, toShellSingleQuoted(url)];

  headers.forEach((header) => {
    if (!header?.name) return;
    parts.push(`-H ${toShellSingleQuoted(`${header.name}: ${header.value ?? ''}`)}`);
  });

  const hasContentTypeHeader = headers.some(
    (header) => header?.name && header.name.toLowerCase() === 'content-type'
  );
  if (!hasContentTypeHeader && postData?.mimeType) {
    parts.push(`-H ${toShellSingleQuoted(`Content-Type: ${postData.mimeType}`)}`);
  }

  if (postData?.text) {
    parts.push(`--data-raw ${toShellSingleQuoted(postData.text)}`);
  }

  return parts.join(' \\\n  ');
}

/**
 * Builds an equivalent HTTPie command for a normalized HAR entry.
 * @param {object} entry
 * @returns {string}
 */
export function toHttpieCommand(entry) {
  const request = entry?.request ?? {};
  const method = String(request.method ?? 'GET').toUpperCase();
  const url = String(request.url ?? '');
  const headers = Array.isArray(request.headers)
    ? request.headers.filter((header) => header?.name)
    : [];
  const postData = request.postData ?? {};
  const body = typeof postData.text === 'string' ? postData.text : null;
  const parts = ['http'];

  if (method !== 'GET') {
    parts.push(formatHttpieMethod(method));
  }
  parts.push(toShellSingleQuoted(url));

  if (body !== null && postData.mimeType && !hasHeader(headers, 'content-type')) {
    headers.push({ name: 'Content-Type', value: String(postData.mimeType) });
  }

  headers.forEach(({ name, value }) => {
    parts.push(toShellSingleQuoted(`${name}:${value ?? ''}`));
  });

  const jsonArguments = getHttpieJsonArguments(body, postData.mimeType);
  if (jsonArguments) {
    parts.push(...jsonArguments.map(toShellSingleQuoted));
  } else if (body !== null) {
    parts.push('--raw', toShellSingleQuoted(body));
  }

  return parts.join(' ');
}

function formatHttpieMethod(method) {
  return /^[!#$%&*+.^_`|~0-9A-Z-]+$/.test(method)
    ? method
    : toShellSingleQuoted(method);
}

function getHttpieJsonArguments(body, mimeType) {
  if (body === null || !/json/i.test(mimeType ?? '')) return null;

  try {
    const parsed = JSON.parse(body);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;

    return Object.entries(parsed).map(([key, value]) => (
      typeof value === 'string' ? `${key}=${value}` : `${key}:=${JSON.stringify(value)}`
    ));
  } catch {
    return null;
  }
}

/**
 * Formats a byte count for the interface.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats a duration in milliseconds for the interface.
 * @param {number} duration
 * @returns {string}
 */
export function formatDuration(duration) {
  return duration >= 1000 ? `${(duration / 1000).toFixed(2)} s` :
    `${Math.round(duration)} ms`;
}

/**
 * Converts a captured HAR request into a JavaScript fetch() call.
 * @param {object} entry
 * @returns {string}
 */
export function toFetchSnippet(entry) {
  const request = entry?.request ?? {};
  const method = String(request.method ?? 'GET').toUpperCase();
  const url = String(request.url ?? '');
  const postData = request.postData ?? {};
  const headers = Array.isArray(request.headers)
    ? request.headers.filter((header) => header?.name)
    : [];
  const body = typeof postData.text === 'string' ? postData.text : null;

  if (body !== null && postData.mimeType && !hasHeader(headers, 'content-type')) {
    headers.push({ name: 'Content-Type', value: String(postData.mimeType) });
  }

  if (method === 'GET' && headers.length === 0 && body === null) {
    return `fetch(${JSON.stringify(url)})`;
  }

  const options = [];
  options.push(`method: ${JSON.stringify(method)}`);

  if (headers.length > 0) {
    options.push(`headers: ${formatHeaders(headers)}`);
  }

  if (body !== null) {
    options.push(`body: ${formatRequestBody(body)}`);
  }

  return `fetch(${JSON.stringify(url)}, {\n  ${options.join(',\n  ')}\n})`;
}

/**
 * Converts a captured HAR request into a runnable Python requests call.
 * @param {object} entry
 * @returns {string}
 */
export function toPythonRequestsSnippet(entry) {
  const request = entry?.request ?? {};
  const method = String(request.method ?? 'GET').toLowerCase();
  const url = String(request.url ?? '');
  const postData = request.postData ?? {};
  const headers = Array.isArray(request.headers)
    ? request.headers.filter((header) => hasHeaderName(header) && !header.name.startsWith(':'))
    : [];
  const body = typeof postData.text === 'string' ? postData.text : null;
  const argumentsList = [JSON.stringify(url)];

  if (headers.length > 0) {
    argumentsList.push(`headers=${formatPythonDictionary(headers)}`);
  }

  if (body !== null) {
    argumentsList.push(formatPythonRequestBody(body, postData.mimeType));
  }

  const call = argumentsList.length === 1
    ? `requests.${method}(${argumentsList[0]})`
    : `requests.${method}(\n  ${argumentsList.join(',\n  ')}\n)`;

  return `import requests\n\nresponse = ${call}`;
}

/**
 * Converts a captured HAR request into a runnable Node.js axios call.
 * @param {object} entry
 * @returns {string}
 */
export function toNodeAxiosSnippet(entry) {
  const request = entry?.request ?? {};
  const method = String(request.method ?? 'GET').toUpperCase();
  const url = String(request.url ?? '');
  const postData = request.postData ?? {};
  const headers = Array.isArray(request.headers)
    ? request.headers.filter((header) => hasHeaderName(header) && !header.name.startsWith(':'))
    : [];
  const body = typeof postData.text === 'string' ? postData.text : null;
  const options = [
    `method: ${JSON.stringify(method)}`,
    `url: ${JSON.stringify(url)}`,
  ];

  if (body !== null && postData.mimeType && !hasHeader(headers, 'content-type')) {
    headers.push({ name: 'Content-Type', value: String(postData.mimeType) });
  }

  if (headers.length > 0) {
    options.push(`headers: ${formatHeaders(headers)}`);
  }

  if (body !== null) {
    options.push(`data: ${formatNodeRequestBody(body, postData.mimeType)}`);
  }

  return [
    "import axios from 'axios';",
    '',
    'async function main() {',
    `  const response = await axios({\n${options.map((option) => (
      indentLines(option, 4)
    )).join(',\n')}\n  });`,
    '  console.log(response.data);',
    '}',
    '',
    'main().catch(console.error);',
  ].join('\n');
}

/**
 * Converts a captured HAR request into a runnable Go net/http program.
 * @param {object} entry
 * @returns {string}
 */
export function toGoRequestsSnippet(entry) {
  const request = entry?.request ?? {};
  const method = String(request.method ?? 'GET').toUpperCase();
  const url = String(request.url ?? '');
  const postData = request.postData ?? {};
  const headers = Array.isArray(request.headers)
    ? request.headers.filter((header) => hasHeaderName(header) && !header.name.startsWith(':'))
    : [];
  const body = typeof postData.text === 'string' ? postData.text : null;
  const hasJsonBody = body !== null && /json/i.test(String(postData.mimeType ?? '')) &&
    isValidJson(body);
  const imports = ['"net/http"'];
  const statements = [];

  if (hasJsonBody) {
    imports.unshift('"bytes"');
    statements.push(`body := []byte(${JSON.stringify(JSON.stringify(JSON.parse(body)))})`);
    statements.push('requestBody := bytes.NewReader(body)');
  } else if (body !== null) {
    imports.push('"strings"');
    statements.push(`requestBody := strings.NewReader(${formatGoRawString(body)})`);
  }

  statements.push(
    `request, err := http.NewRequest(${JSON.stringify(method)}, ${JSON.stringify(url)}, ${
      body === null ? 'nil' : 'requestBody'
    })`,
    'if err != nil {',
    '  panic(err)',
    '}'
  );

  headers.forEach(({ name, value }) => {
    statements.push(
      `request.Header.Set(${JSON.stringify(String(name))}, ${JSON.stringify(String(value ?? ''))})`
    );
  });

  statements.push(
    'client := &http.Client{}',
    'response, err := client.Do(request)',
    'if err != nil {',
    '  panic(err)',
    '}',
    'defer response.Body.Close()'
  );

  return `package main\n\nimport (\n${imports.map((item) => `  ${item}`).join('\n')}\n)\n\n` +
    `func main() {\n${statements.map((statement) => `  ${statement}`).join('\n')}\n}`;
}

function hasHeader(headers, name) {
  return headers.some((header) => String(header?.name ?? '').toLowerCase() === name);
}

function hasHeaderName(header) {
  return typeof header?.name === 'string' && header.name.trim() !== '';
}

function isValidJson(value) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function formatGoRawString(value) {
  return String(value).split(/(`|\r)/).map((part) => {
    if (part === '`' || part === '\r') return JSON.stringify(part);
    return `\`${part}\``;
  }).join(' + ');
}

function formatHeaders(headers) {
  const properties = headers.map(({ name, value }) => (
    `${JSON.stringify(String(name ?? ''))}: ${JSON.stringify(String(value ?? ''))}`
  ));

  return `{\n    ${properties.join(',\n    ')}\n  }`;
}

function formatRequestBody(body) {
  try {
    return `JSON.stringify(${JSON.stringify(JSON.parse(body), null, 2)})`;
  } catch {
    return JSON.stringify(body);
  }
}

function formatNodeRequestBody(body, mimeType) {
  if (/json/i.test(String(mimeType ?? ''))) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      // Preserve invalid JSON verbatim instead of changing the captured request.
    }
  }

  return JSON.stringify(body);
}

function indentLines(value, spaces) {
  const indentation = ' '.repeat(spaces);
  return String(value).split('\n').map((line) => `${indentation}${line}`).join('\n');
}

function formatPythonDictionary(headers) {
  const properties = headers.map(({ name, value }) => (
    `${JSON.stringify(String(name))}: ${JSON.stringify(String(value ?? ''))}`
  ));

  return `{\n    ${properties.join(',\n    ')}\n  }`;
}

function formatPythonRequestBody(body, mimeType) {
  if (/json/i.test(String(mimeType ?? ''))) {
    try {
      return `json=${formatPythonValue(JSON.parse(body), 1)}`;
    } catch {
      // A JSON content type with invalid text must retain the captured request body.
    }
  }

  return `data="""${escapePythonTripleQuotedString(body)}"""`;
}

function formatPythonValue(value, indentation = 0) {
  const indent = '  '.repeat(indentation);
  const childIndent = '  '.repeat(indentation + 1);

  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((item) => `${childIndent}${formatPythonValue(item, indentation + 1)}`)
      .join(',\n')}\n${indent}]`;
  }

  const properties = Object.entries(value);
  if (properties.length === 0) return '{}';
  return `{\n${properties.map(([key, item]) => (
    `${childIndent}${JSON.stringify(key)}: ${formatPythonValue(item, indentation + 1)}`
  )).join(',\n')}\n${indent}}`;
}

function escapePythonTripleQuotedString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r');
}
