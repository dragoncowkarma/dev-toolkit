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

  if (['xhr', 'fetch', 'xmlhttprequest'].includes(extensionType)) return 'XHR/Fetch';
  if (extensionType === 'document' || mimeType.includes('text/html')) return 'Doc';
  if (extensionType === 'stylesheet' || mimeType.includes('text/css') || /\.css(?:[?#]|$)/.test(url)) {
    return 'CSS';
  }
  if (extensionType === 'script' || /javascript|ecmascript/.test(mimeType) || /\.m?js(?:[?#]|$)/.test(url)) {
    return 'JS';
  }
  if (extensionType === 'image' || mimeType.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp|ico)(?:[?#]|$)/.test(url)) {
    return 'Img';
  }
  if (extensionType === 'media' || /^(audio|video)\//.test(mimeType) || /\.(mp3|mp4|ogg|webm|wav)(?:[?#]|$)/.test(url)) {
    return 'Media';
  }
  return 'Other';
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

  if (!parsed || typeof parsed !== 'object' || !parsed.log || !Array.isArray(parsed.log.entries)) {
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
  const transferSize = safeSize(response._transferSize) || safeSize(response.bodySize) ||
    safeSize(response.content?.size);

  return {
    ...safeEntry,
    id: `${index}-${safeEntry.startedDateTime ?? ''}-${request.url ?? ''}`,
    request: { ...request, headers: request.headers ?? [], queryString: request.queryString ?? [], cookies: request.cookies ?? [] },
    response: { ...response, headers: response.headers ?? [], cookies: response.cookies ?? [], content: response.content ?? {} },
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
 * @returns {{totalRequests: number, totalTransferSize: number, totalLoadTime: number, statusCounts: object, sizeDistribution: Array<object>}}
 */
export function getOverview(entries) {
  const statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, Other: 0 };
  const sizeBins = [
    { label: '< 10 KB', min: 0, max: 10 * 1024, count: 0 },
    { label: '10–100 KB', min: 10 * 1024, max: 100 * 1024, count: 0 },
    { label: '100 KB–1 MB', min: 100 * 1024, max: 1024 * 1024, count: 0 },
    { label: '≥ 1 MB', min: 1024 * 1024, max: Infinity, count: 0 },
  ];
  const totalTransferSize = entries.reduce((total, entry) => total + entry.transferSize, 0);
  const starts = entries.map((entry) => entry.startedAt);
  const ends = entries.map((entry) => entry.startedAt + entry.duration);

  entries.forEach((entry) => {
    const status = Number(entry.response?.status);
    const group = status >= 200 && status < 300 ? '2xx' : status >= 300 && status < 400 ? '3xx' :
      status >= 400 && status < 500 ? '4xx' : status >= 500 && status < 600 ? '5xx' : 'Other';
    statusCounts[group] += 1;
    const bin = sizeBins.find((item) => entry.transferSize >= item.min && entry.transferSize < item.max);
    if (bin) bin.count += 1;
  });

  return {
    totalRequests: entries.length,
    totalTransferSize,
    totalLoadTime: entries.length ? Math.max(...ends) - Math.min(...starts) : 0,
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
    const matchesUrl = !urlQuery || String(entry.request?.url ?? '').toLowerCase().includes(urlQuery);
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
  return duration >= 1000 ? `${(duration / 1000).toFixed(2)} s` : `${Math.round(duration)} ms`;
}
