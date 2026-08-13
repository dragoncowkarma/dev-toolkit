const SUPPORTED_RESULTS = new Set([
  'pass', 'fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror',
]);

/**
 * Parses a pasted RFC 5322 header block without inspecting its body.
 * @param {string} raw Raw header text with CRLF or LF line endings.
 * @returns {{fields: Array<{name: string, value: string, line: number, isDuplicate: boolean}>,
 *   error: {message: string, line: number}|null}} Parsed fields or a descriptive error.
 */
export function parseEmailHeaders(raw) {
  const text = typeof raw === 'string' ? raw : '';
  if (!text.trim()) {
    return { fields: [], error: { message: 'Paste at least one email header field.', line: 1 } };
  }

  const lines = text.split(/\r\n|\n/);
  const fields = [];
  let currentField = null;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = index + 1;
    if (rawLine === '') break;

    if (/^[ \t]/.test(rawLine)) {
      if (!currentField) {
        return {
          fields: [],
          error: { message: 'A header continuation cannot appear before a field.', line },
        };
      }
      currentField.value = `${currentField.value} ${rawLine.trim()}`.trim();
      continue;
    }

    const colonIndex = rawLine.indexOf(':');
    if (colonIndex < 1) {
      return {
        fields: [],
        error: { message: 'Malformed header field: expected "Name: value".', line },
      };
    }

    const name = rawLine.slice(0, colonIndex).trim();
    if (!name) {
      return {
        fields: [],
        error: { message: 'Malformed header field: header name is empty.', line },
      };
    }

    currentField = { name, value: rawLine.slice(colonIndex + 1).trim(), line };
    fields.push(currentField);
  }

  if (fields.length === 0) {
    return {
      fields: [],
      error: { message: 'No header fields were found before the message body.', line: 1 },
    };
  }

  const counts = new Map();
  fields.forEach((field) => {
    const key = field.name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return {
    fields: fields.map((field) => ({
      ...field,
      isDuplicate: (counts.get(field.name.toLowerCase()) ?? 0) > 1,
    })),
    error: null,
  };
}

/**
 * Reads named clauses from the pre-date portion of one Received field.
 * @param {string} value Unfolded Received field value.
 * @returns {{from: string|null, by: string|null, with: string|null, id: string|null,
 *   for: string|null,
 *   date: string|null}} Parsed clauses and trailing date text.
 */
function parseReceivedValue(value) {
  const separator = value.lastIndexOf(';');
  const clauses = separator === -1 ? value : value.slice(0, separator);
  const date = separator === -1 ? null : value.slice(separator + 1).trim() || null;
  const values = { from: null, by: null, with: null, id: null, for: null };
  const clausePattern = new RegExp(
    '(?:^|\\s)(from|by|with|id|for)\\s+(.+?)(?=\\s+(?:from|by|with|id|for)\\s+|$)',
    'gi',
  );
  let match = clausePattern.exec(clauses);
  while (match) {
    values[match[1].toLowerCase()] = match[2].trim() || null;
    match = clausePattern.exec(clauses);
  }
  return { ...values, date };
}

/**
 * Parses and reverses Received fields into delivery order, preserving clock skew evidence.
 * @param {Array<{name: string, value: string, line: number}>} fields Parsed RFC 5322 fields.
 * @returns {{hops: Array<Object>, totalSeconds: number|null}} Hops and summed known delays.
 */
export function parseReceivedChain(fields) {
  const receivedFields = (Array.isArray(fields) ? fields : [])
    .filter((field) => field.name?.toLowerCase() === 'received')
    .reverse();
  let priorDate = null;
  let totalSeconds = 0;
  let hasTimestamp = false;
  const hops = receivedFields.map((field) => {
    const parsed = parseReceivedValue(field.value);
    const parsedMilliseconds = parsed.date ? Date.parse(parsed.date) : Number.NaN;
    const timestamp = Number.isNaN(parsedMilliseconds) ? null : parsedMilliseconds;
    const delaySeconds = timestamp === null || priorDate === null
      ? null
      : Math.round((timestamp - priorDate) / 1000);
    if (delaySeconds !== null) {
      totalSeconds += delaySeconds;
    }
    if (timestamp !== null) {
      priorDate = timestamp;
      hasTimestamp = true;
    }
    return {
      ...parsed,
      line: field.line,
      delaySeconds,
      clockSkew: delaySeconds !== null && delaySeconds < 0,
    };
  });
  return { hops, totalSeconds: hasTimestamp ? totalSeconds : null };
}

/**
 * Decodes one RFC 2047 encoded-word into bytes, or returns null when it is unsupported or invalid.
 * @param {string} charset Declared encoded-word character set.
 * @param {string} encoding `B` for base64 or `Q` for quoted-printable.
 * @param {string} encoded Encoded-word payload.
 * @returns {string|null} Decoded text, or null when the original word must be retained.
 */
function decodeEncodedWord(charset, encoding, encoded) {
  const normalizedCharset = charset.toLowerCase().replace(/_/g, '-');
  const decoderName = normalizedCharset === 'utf-8' || normalizedCharset === 'utf8'
    ? 'utf-8'
    : normalizedCharset === 'iso-8859-1' || normalizedCharset === 'latin1'
      ? 'iso-8859-1'
      : null;
  if (!decoderName) return null;

  try {
    let binary = '';
    if (encoding.toUpperCase() === 'B') {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) return null;
      const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
      binary = atob(padded);
    } else {
      if (/=(?![0-9A-Fa-f]{2})/.test(encoded)) return null;
      binary = encoded.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => (
        String.fromCharCode(Number.parseInt(hex, 16))
      ));
    }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder(decoderName, { fatal: decoderName === 'utf-8' }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Decodes supported RFC 2047 encoded-words while retaining invalid or unsupported words verbatim.
 * @param {string} value Header field value, possibly containing encoded-words.
 * @returns {string} Readable decoded value that never throws.
 */
export function decodeEncodedWords(value) {
  const input = typeof value === 'string' ? value : '';
  const pattern = /=\?([^?\s]+)\?([bBqQ])\?([^?]*)\?=/g;
  let output = '';
  let cursor = 0;
  let previousDecoded = false;
  let match = pattern.exec(input);
  while (match) {
    const [word, charset, encoding, payload] = match;
    const decoded = decodeEncodedWord(charset, encoding, payload);
    const between = input.slice(cursor, match.index);
    output += previousDecoded && decoded !== null && /^[ \t\r\n]+$/.test(between)
      ? ''
      : between;
    output += decoded ?? word;
    cursor = match.index + word.length;
    previousDecoded = decoded !== null;
    match = pattern.exec(input);
  }
  return output + input.slice(cursor);
}

/**
 * Normalizes an authentication method result to the set shown by the UI.
 * @param {string} value Raw authentication result token.
 * @returns {'pass'|'fail'|'softfail'|'neutral'|'none'|'temperror'|'permerror'|'unknown'} Result.
 */
function normalizeAuthResult(value) {
  const normalized = value.toLowerCase();
  return SUPPORTED_RESULTS.has(normalized) ? normalized : 'unknown';
}

/**
 * Summarizes Authentication-Results headers, preferring the topmost relay on disagreement.
 * @param {Array<{name: string, value: string, line: number}>} fields Parsed RFC 5322 fields.
 * @returns {{spf: {result: string, detail: string}, dkim: {result: string, detail: string},
 *   dmarc: {result: string, detail: string}}} Normalized mail authentication verdicts.
 */
export function parseAuthResults(fields) {
  const result = ['spf', 'dkim', 'dmarc'].reduce((summary, method) => ({
    ...summary,
    [method]: { result: 'unknown', detail: `No ${method.toUpperCase()} result found.` },
  }), {});
  const allFields = Array.isArray(fields) ? fields : [];
  const authenticationFields = allFields.filter((field) => (
    field.name?.toLowerCase() === 'authentication-results'
  ));

  ['spf', 'dkim', 'dmarc'].forEach((method) => {
    const matches = [];
    authenticationFields.forEach((field) => {
      const methodPattern = new RegExp(`\\b${method}\\s*=\\s*([^\\s;]+)`, 'ig');
      let match = methodPattern.exec(field.value);
      while (match) {
        matches.push({ result: normalizeAuthResult(match[1]), line: field.line });
        match = methodPattern.exec(field.value);
      }
    });
    if (matches.length > 0) {
      const [preferred, ...older] = matches;
      const conflicts = older.filter((candidate) => candidate.result !== preferred.result);
      result[method] = {
        result: preferred.result,
        detail: conflicts.length > 0
          ? `Topmost Authentication-Results line ${preferred.line} says ${preferred.result}; `
            + `conflicts with older ${conflicts.map((item) => item.result).join(', ')} result.`
          : `Authentication-Results line ${preferred.line} says ${preferred.result}.`,
      };
    }
  });

  if (authenticationFields.length === 0) {
    const receivedSpf = allFields.find((field) => field.name?.toLowerCase() === 'received-spf');
    if (receivedSpf) {
      const match = /^\s*([^\s(;]+)/.exec(receivedSpf.value);
      result.spf = {
        result: match ? normalizeAuthResult(match[1]) : 'unknown',
        detail: `Received-SPF line ${receivedSpf.line} supplies the SPF result.`,
      };
    }
  }
  return result;
}
