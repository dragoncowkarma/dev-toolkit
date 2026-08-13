/**
 * Utility functions for parsing, normalizing, and analyzing HAR 1.2 network captures.
 */

/**
 * Format bytes into a human-readable size string.
 * @param {number} bytes Number of bytes.
 * @returns {string} Formatted size string.
 */
export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.max(Math.floor(Math.log(bytes) / Math.log(k)), 0), sizes.length - 1);
  const val = bytes / Math.pow(k, i);
  return `${parseFloat(val.toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration in milliseconds into a readable time string.
 * @param {number} ms Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || isNaN(ms) || ms < 0) {
    return '0 ms';
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remSec = (seconds % 60).toFixed(1);
  return `${minutes} m ${remSec} s`;
}

/**
 * Determine high-level category from a MIME type.
 * @param {string} mimeType MIME type string.
 * @returns {string} Category identifier.
 */
export function getMimeCategory(mimeType) {
  if (!mimeType || typeof mimeType !== 'string') return 'other';
  const type = mimeType.toLowerCase().trim();

  if (type.includes('image/') || type.includes('svg') || type.includes('image')) {
    return 'image';
  }
  if (
    type.includes('font/') ||
    type.includes('woff') ||
    type.includes('ttf') ||
    type.includes('otf')
  ) {
    return 'font';
  }
  if (type.includes('css')) {
    return 'stylesheet';
  }
  if (type.includes('javascript') || type.includes('ecmascript')) {
    return 'script';
  }
  if (type.includes('text/html') || type.includes('application/xhtml')) {
    return 'document';
  }
  if (
    type.includes('json') ||
    type.includes('xml') ||
    type.includes('graphql') ||
    type.includes('fetch')
  ) {
    return 'xhr';
  }
  return 'other';
}

/**
 * Normalize timing breakdown phases, converting missing or -1 values to 0
 * and flagging invalid non-numeric inputs.
 * @param {Object} rawTimings Raw timings object from HAR entry.
 * @param {number} entryIndex 1-based index for warning reference.
 * @returns {{ timings: Object, total: number, warnings: string[] }} Normalized timings.
 */
export function normalizeTimings(rawTimings, entryIndex) {
  const phases = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];
  const normalized = {};
  const warnings = [];
  let total = 0;

  const timingsObj = rawTimings && typeof rawTimings === 'object' ? rawTimings : {};

  for (const phase of phases) {
    const val = timingsObj[phase];
    if (val === undefined || val === null || val === -1) {
      normalized[phase] = 0;
    } else if (typeof val === 'number' && !isNaN(val) && val >= 0) {
      normalized[phase] = val;
      total += val;
    } else if (typeof val === 'number' && val < 0) {
      normalized[phase] = 0;
      warnings.push(`Entry #${entryIndex}: Negative timing value (${val}) for phase '${phase}'.`);
    } else {
      normalized[phase] = 0;
      warnings.push(
        `Entry #${entryIndex}: Non-numeric timing value ('${val}') for phase '${phase}'.`
      );
    }
  }

  return { timings: normalized, total, warnings };
}

/**
 * Calculate aggregate summary metrics from a list of HAR entries.
 * @param {Array<Object>} entries List of parsed HAR entries.
 * @returns {Object} Summary object containing stats.
 */
export function calculateSummary(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      totalRequests: 0,
      totalTransferredSize: 0,
      totalTransferredFormatted: '0 B',
      totalWallClockTime: 0,
      totalWallClockFormatted: '0 ms',
      statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, '1xx': 0, other: 0 },
      mimeCounts: {
        xhr: 0,
        script: 0,
        stylesheet: 0,
        image: 0,
        font: 0,
        document: 0,
        other: 0,
      },
    };
  }

  let totalTransferred = 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;

  const statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, '1xx': 0, other: 0 };
  const mimeCounts = {
    xhr: 0,
    script: 0,
    stylesheet: 0,
    image: 0,
    font: 0,
    document: 0,
    other: 0,
  };

  for (const entry of entries) {
    totalTransferred += entry.transferredSize || 0;

    const st = entry.status;
    if (st >= 200 && st < 300) statusCounts['2xx']++;
    else if (st >= 300 && st < 400) statusCounts['3xx']++;
    else if (st >= 400 && st < 500) statusCounts['4xx']++;
    else if (st >= 500 && st < 600) statusCounts['5xx']++;
    else if (st >= 100 && st < 200) statusCounts['1xx']++;
    else statusCounts.other++;

    const cat = entry.mimeCategory || 'other';
    if (mimeCounts[cat] !== undefined) {
      mimeCounts[cat]++;
    } else {
      mimeCounts.other++;
    }

    if (entry.isValidDate && entry.parsedDate) {
      const startMs = entry.parsedDate.getTime();
      const endMs = startMs + (entry.time || 0);
      if (startMs < minStart) minStart = startMs;
      if (endMs > maxEnd) maxEnd = endMs;
    }
  }

  let totalWallClock = 0;
  if (minStart !== Infinity && maxEnd !== -Infinity && maxEnd >= minStart) {
    totalWallClock = maxEnd - minStart;
  } else {
    // Fallback: sum of entry durations
    totalWallClock = entries.reduce((acc, e) => acc + (e.time || 0), 0);
  }

  return {
    totalRequests: entries.length,
    totalTransferredSize: totalTransferred,
    totalTransferredFormatted: formatBytes(totalTransferred),
    totalWallClockTime: totalWallClock,
    totalWallClockFormatted: formatDuration(totalWallClock),
    statusCounts,
    mimeCounts,
  };
}

/**
 * Parse HAR 1.2 JSON string or object.
 * @param {string|Object} input HAR JSON string or parsed object.
 * @returns {Object} Parse result with entries, summary, warnings, or top-level error.
 */
export function parseHar(input) {
  if (!input || (typeof input === 'string' && !input.trim())) {
    return {
      success: false,
      error: 'Input is empty. Paste or upload a .har file to parse.',
      entries: [],
      summary: calculateSummary([]),
      warnings: [],
    };
  }

  let harObj = input;
  if (typeof input === 'string') {
    try {
      harObj = JSON.parse(input);
    } catch (err) {
      return {
        success: false,
        error: `Invalid JSON syntax: ${err.message}`,
        entries: [],
        summary: calculateSummary([]),
        warnings: [],
      };
    }
  }

  if (!harObj || typeof harObj !== 'object' || Array.isArray(harObj)) {
    return {
      success: false,
      error: 'Malformed HAR structure: Root must be a JSON object.',
      entries: [],
      summary: calculateSummary([]),
      warnings: [],
    };
  }

  const log = harObj.log;
  if (!log || typeof log !== 'object' || Array.isArray(log)) {
    return {
      success: false,
      error: 'Malformed HAR structure: Missing "log" object at root.',
      entries: [],
      summary: calculateSummary([]),
      warnings: [],
    };
  }

  if (!Array.isArray(log.entries)) {
    return {
      success: false,
      error: 'Malformed HAR structure: Missing or invalid "log.entries" array.',
      entries: [],
      summary: calculateSummary([]),
      warnings: [],
    };
  }

  const entries = [];
  const allWarnings = [];

  log.entries.forEach((rawEntry, idx) => {
    const entryNum = idx + 1;
    const entryWarnings = [];

    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      allWarnings.push(`Entry #${entryNum} is not a valid JSON object.`);
      return;
    }

    // 1. startedDateTime
    const startedDateTime = rawEntry.startedDateTime || '';
    let isValidDate = false;
    let parsedDate = null;

    if (typeof startedDateTime === 'string' && startedDateTime.trim()) {
      const ms = Date.parse(startedDateTime);
      if (!isNaN(ms)) {
        isValidDate = true;
        parsedDate = new Date(ms);
      }
    }

    if (!isValidDate) {
      entryWarnings.push(
        `Entry #${entryNum}: Missing or invalid startedDateTime ('${startedDateTime}').`
      );
    }

    // 2. Request parsing
    const rawReq = rawEntry.request;
    let requestObj = {
      method: 'GET',
      url: '',
      httpVersion: 'HTTP/1.1',
      headers: [],
      cookies: [],
      queryString: [],
      postData: null,
    };

    if (!rawReq || typeof rawReq !== 'object' || Array.isArray(rawReq)) {
      entryWarnings.push(`Entry #${entryNum}: Missing or malformed request object.`);
    } else {
      const method = typeof rawReq.method === 'string' ? rawReq.method.toUpperCase() : 'GET';
      const url = typeof rawReq.url === 'string' ? rawReq.url : '';
      const httpVersion = typeof rawReq.httpVersion === 'string' ? rawReq.httpVersion : 'HTTP/1.1';
      const headers = Array.isArray(rawReq.headers)
        ? rawReq.headers.filter((h) => h && typeof h === 'object')
        : [];
      const cookies = Array.isArray(rawReq.cookies)
        ? rawReq.cookies.filter((c) => c && typeof c === 'object')
        : [];
      const queryString = Array.isArray(rawReq.queryString)
        ? rawReq.queryString.filter((q) => q && typeof q === 'object')
        : [];
      const postData =
        rawReq.postData && typeof rawReq.postData === 'object' ? rawReq.postData : null;

      requestObj = {
        method,
        url,
        httpVersion,
        headers,
        cookies,
        queryString,
        postData,
      };
    }

    // 3. Response parsing
    const rawRes = rawEntry.response;
    let responseObj = {
      status: 0,
      statusText: '',
      httpVersion: 'HTTP/1.1',
      headers: [],
      cookies: [],
      content: null,
      mimeType: '',
      redirectURL: '',
      bodySize: 0,
      headersSize: 0,
    };

    let mimeType = '';

    if (!rawRes || typeof rawRes !== 'object' || Array.isArray(rawRes)) {
      entryWarnings.push(`Entry #${entryNum}: Missing or malformed response object.`);
    } else {
      const status = typeof rawRes.status === 'number' ? rawRes.status : 0;
      const statusText = typeof rawRes.statusText === 'string' ? rawRes.statusText : '';
      const httpVersion = typeof rawRes.httpVersion === 'string' ? rawRes.httpVersion : 'HTTP/1.1';
      const headers = Array.isArray(rawRes.headers)
        ? rawRes.headers.filter((h) => h && typeof h === 'object')
        : [];
      const cookies = Array.isArray(rawRes.cookies)
        ? rawRes.cookies.filter((c) => c && typeof c === 'object')
        : [];
      const content = rawRes.content && typeof rawRes.content === 'object' ? rawRes.content : null;
      const redirectURL = typeof rawRes.redirectURL === 'string' ? rawRes.redirectURL : '';

      // Determine mimeType
      if (content && typeof content.mimeType === 'string' && content.mimeType.trim()) {
        mimeType = content.mimeType;
      } else {
        const ctHeader = headers.find(
          (h) => typeof h.name === 'string' && h.name.toLowerCase() === 'content-type'
        );
        if (ctHeader && typeof ctHeader.value === 'string') {
          mimeType = ctHeader.value.split(';')[0].trim();
        }
      }

      responseObj = {
        status,
        statusText,
        httpVersion,
        headers,
        cookies,
        content,
        mimeType,
        redirectURL,
        bodySize: typeof rawRes.bodySize === 'number' ? rawRes.bodySize : 0,
        headersSize: typeof rawRes.headersSize === 'number' ? rawRes.headersSize : 0,
      };
    }

    // Transferred size calculation
    let transferredSize = 0;
    if (rawRes && typeof rawRes._transferSize === 'number' && rawRes._transferSize >= 0) {
      transferredSize = rawRes._transferSize;
    } else if (rawRes) {
      const hSize =
        typeof rawRes.headersSize === 'number' && rawRes.headersSize > 0
          ? rawRes.headersSize
          : 0;
      const bSize =
        typeof rawRes.bodySize === 'number' && rawRes.bodySize > 0 ? rawRes.bodySize : 0;
      const cSize =
        rawRes.content && typeof rawRes.content.size === 'number' && rawRes.content.size > 0
          ? rawRes.content.size
          : 0;
      transferredSize = hSize + bSize > 0 ? hSize + bSize : cSize;
    }

    // 4. Timings
    const { timings, total: phaseTotal, warnings: timingWarnings } = normalizeTimings(
      rawEntry.timings,
      entryNum
    );
    entryWarnings.push(...timingWarnings);

    let duration = phaseTotal;
    if (typeof rawEntry.time === 'number' && !isNaN(rawEntry.time) && rawEntry.time >= 0) {
      duration = rawEntry.time;
    } else if (typeof rawEntry.time === 'number' && rawEntry.time < 0) {
      entryWarnings.push(`Entry #${entryNum}: Negative overall entry time (${rawEntry.time}).`);
    }

    // 5. URL Path extraction & host
    let pathname = requestObj.url;
    let host = '';
    try {
      if (requestObj.url) {
        const parsedUrl = new URL(requestObj.url);
        pathname = parsedUrl.pathname + parsedUrl.search;
        host = parsedUrl.host;
      }
    } catch {
      pathname = requestObj.url;
    }

    // Status class
    const st = responseObj.status;
    let statusClass = 'other';
    if (st >= 200 && st < 300) statusClass = '2xx';
    else if (st >= 300 && st < 400) statusClass = '3xx';
    else if (st >= 400 && st < 500) statusClass = '4xx';
    else if (st >= 500 && st < 600) statusClass = '5xx';
    else if (st >= 100 && st < 200) statusClass = '1xx';

    const mimeCategory = getMimeCategory(mimeType);

    entries.push({
      id: entryNum,
      index: idx,
      startedDateTime,
      isValidDate,
      parsedDate,
      method: requestObj.method,
      url: requestObj.url,
      pathname,
      host,
      status: responseObj.status,
      statusClass,
      mimeType,
      mimeCategory,
      transferredSize,
      transferredFormatted: formatBytes(transferredSize),
      time: duration,
      timeFormatted: formatDuration(duration),
      timings,
      request: requestObj,
      response: responseObj,
      warnings: entryWarnings,
      serverIPAddress:
        typeof rawEntry.serverIPAddress === 'string' ? rawEntry.serverIPAddress : '',
      connection: typeof rawEntry.connection === 'string' ? rawEntry.connection : '',
    });

    if (entryWarnings.length > 0) {
      allWarnings.push(...entryWarnings);
    }
  });

  const summary = calculateSummary(entries);

  return {
    success: true,
    error: null,
    entries,
    summary,
    warnings: allWarnings,
  };
}

/**
 * Filter and sort HAR entries based on user selection.
 * @param {Array<Object>} entries List of parsed HAR entries.
 * @param {Object} options Options for filtering and sorting.
 * @returns {Array<Object>} Filtered and sorted entries.
 */
export function filterAndSortEntries(entries, options = {}) {
  if (!Array.isArray(entries)) return [];

  const {
    search = '',
    statusFilter = 'all',
    methodFilter = 'all',
    mimeFilter = 'all',
    sortBy = 'index',
    sortOrder = 'asc',
  } = options;

  let result = [...entries];

  // 1. Search term filter
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (e) =>
        e.url.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        String(e.status).includes(q) ||
        e.mimeType.toLowerCase().includes(q) ||
        e.host.toLowerCase().includes(q)
    );
  }

  // 2. Status filter
  if (statusFilter !== 'all') {
    if (statusFilter === 'errors') {
      result = result.filter((e) => e.status >= 400 || e.status === 0);
    } else {
      result = result.filter((e) => e.statusClass === statusFilter);
    }
  }

  // 3. Method filter
  if (methodFilter !== 'all') {
    result = result.filter((e) => e.method === methodFilter.toUpperCase());
  }

  // 4. MIME filter
  if (mimeFilter !== 'all') {
    result = result.filter((e) => e.mimeCategory === mimeFilter);
  }

  // 5. Sort
  const multiplier = sortOrder === 'desc' ? -1 : 1;
  result.sort((a, b) => {
    let valA = a[sortBy];
    let valB = b[sortBy];

    if (sortBy === 'index' || sortBy === 'id') {
      return (a.index - b.index) * multiplier;
    }
    if (sortBy === 'startedDateTime') {
      valA = a.parsedDate ? a.parsedDate.getTime() : 0;
      valB = b.parsedDate ? b.parsedDate.getTime() : 0;
    } else if (typeof valA === 'string' && typeof valB === 'string') {
      return valA.localeCompare(valB) * multiplier;
    }

    if (valA < valB) return -1 * multiplier;
    if (valA > valB) return 1 * multiplier;
    return 0;
  });

  return result;
}

/**
 * Embedded sample HAR JSON fixture for demonstrative testing and initial quick load.
 */
export const SAMPLE_HAR = {
  log: {
    version: '1.2',
    creator: { name: 'DevTools HAR Generator', version: '1.0' },
    pages: [{ startedDateTime: '2026-08-13T10:00:00.000Z', id: 'page_1', title: 'Sample Page' }],
    entries: [
      {
        startedDateTime: '2026-08-13T10:00:00.100Z',
        time: 145.2,
        request: {
          method: 'GET',
          url: 'https://api.example.com/v1/users?page=1&limit=10',
          httpVersion: 'HTTP/2.0',
          headers: [
            { name: 'Accept', value: 'application/json' },
            { name: 'User-Agent', value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
            { name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          ],
          cookies: [
            {
              name: 'session_id',
              value: 'sess_abc123xyz',
              path: '/',
              domain: 'api.example.com',
            },
          ],
          queryString: [
            { name: 'page', value: '1' },
            { name: 'limit', value: '10' },
          ],
          headersSize: 240,
          bodySize: 0,
        },
        response: {
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/2.0',
          headers: [
            { name: 'Content-Type', value: 'application/json; charset=utf-8' },
            { name: 'Cache-Control', value: 'max-age=3600, private' },
            { name: 'Set-Cookie', value: 'session_id=sess_abc123xyz; Path=/; Secure; HttpOnly' },
          ],
          cookies: [
            {
              name: 'session_id',
              value: 'sess_abc123xyz',
              path: '/',
              domain: 'api.example.com',
              httpOnly: true,
              secure: true,
            },
          ],
          content: {
            size: 2048,
            mimeType: 'application/json',
            text: '{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]}',
          },
          redirectURL: '',
          headersSize: 180,
          bodySize: 2048,
          _transferSize: 2228,
        },
        cache: {},
        timings: {
          blocked: 2.1,
          dns: 12.5,
          connect: 35.0,
          ssl: 20.4,
          send: 1.2,
          wait: 60.0,
          receive: 14.0,
        },
        serverIPAddress: '93.184.216.34',
        connection: '443',
      },
      {
        startedDateTime: '2026-08-13T10:00:00.250Z',
        time: 88.5,
        request: {
          method: 'POST',
          url: 'https://api.example.com/v1/auth/login',
          httpVersion: 'HTTP/1.1',
          headers: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Origin', value: 'https://example.com' },
          ],
          cookies: [],
          queryString: [],
          postData: {
            mimeType: 'application/json',
            text: '{"username":"admin","token":"secret"}',
          },
          headersSize: 150,
          bodySize: 42,
        },
        response: {
          status: 302,
          statusText: 'Found',
          httpVersion: 'HTTP/1.1',
          headers: [
            { name: 'Location', value: 'https://example.com/dashboard' },
            { name: 'Set-Cookie', value: 'auth_token=jwt_xyz789; Path=/; Secure' },
          ],
          cookies: [{ name: 'auth_token', value: 'jwt_xyz789', path: '/', secure: true }],
          content: { size: 0, mimeType: 'text/html' },
          redirectURL: 'https://example.com/dashboard',
          headersSize: 120,
          bodySize: 0,
          _transferSize: 120,
        },
        cache: {},
        timings: {
          blocked: 1.0,
          dns: 0,
          connect: 0,
          ssl: 0,
          send: 2.5,
          wait: 80.0,
          receive: 5.0,
        },
        serverIPAddress: '93.184.216.34',
        connection: '443',
      },
      {
        startedDateTime: '2026-08-13T10:00:00.350Z',
        time: 45.0,
        request: {
          method: 'GET',
          url: 'https://cdn.example.com/assets/logo.svg',
          httpVersion: 'HTTP/2.0',
          headers: [{ name: 'Accept', value: 'image/svg+xml,image/*;q=0.8' }],
          cookies: [],
          queryString: [],
          headersSize: 100,
          bodySize: 0,
        },
        response: {
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/2.0',
          headers: [
            { name: 'Content-Type', value: 'image/svg+xml' },
            { name: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          ],
          cookies: [],
          content: { size: 5120, mimeType: 'image/svg+xml' },
          redirectURL: '',
          headersSize: 90,
          bodySize: 5120,
          _transferSize: 5210,
        },
        cache: {},
        timings: {
          blocked: 0.5,
          dns: -1,
          connect: -1,
          ssl: -1,
          send: 0.5,
          wait: 24.0,
          receive: 20.0,
        },
        serverIPAddress: '151.101.1.69',
        connection: '443',
      },
      {
        startedDateTime: '2026-08-13T10:00:00.420Z',
        time: 32.0,
        request: {
          method: 'GET',
          url: 'https://api.example.com/v1/missing-resource',
          httpVersion: 'HTTP/1.1',
          headers: [],
          cookies: [],
          queryString: [],
          headersSize: 80,
          bodySize: 0,
        },
        response: {
          status: 404,
          statusText: 'Not Found',
          httpVersion: 'HTTP/1.1',
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          cookies: [],
          content: { size: 64, mimeType: 'application/json', text: '{"error":"Not Found"}' },
          redirectURL: '',
          headersSize: 70,
          bodySize: 64,
          _transferSize: 134,
        },
        cache: {},
        timings: {
          blocked: 0,
          dns: 0,
          connect: 0,
          ssl: 0,
          send: 1.0,
          wait: 30.0,
          receive: 1.0,
        },
        serverIPAddress: '93.184.216.34',
        connection: '443',
      },
      {
        startedDateTime: '2026-08-13T10:00:00.500Z',
        time: 210.0,
        request: {
          method: 'DELETE',
          url: 'https://api.example.com/v1/items/99',
          httpVersion: 'HTTP/1.1',
          headers: [{ name: 'Authorization', value: 'Bearer token' }],
          cookies: [],
          queryString: [],
          headersSize: 90,
          bodySize: 0,
        },
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          httpVersion: 'HTTP/1.1',
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          cookies: [],
          content: { size: 120, mimeType: 'application/json', text: '{"error":"Database error"}' },
          redirectURL: '',
          headersSize: 80,
          bodySize: 120,
          _transferSize: 200,
        },
        cache: {},
        timings: {
          blocked: 0,
          dns: 0,
          connect: 0,
          ssl: 0,
          send: 2.0,
          wait: 205.0,
          receive: 3.0,
        },
        serverIPAddress: '93.184.216.34',
        connection: '443',
      },
    ],
  },
};
