const FACILITY_NAMES = [
  'kern', 'user', 'mail', 'daemon', 'auth', 'syslog', 'lpr', 'news',
  'uucp', 'cron', 'authpriv', 'ftp', 'ntp', 'security', 'console', 'solaris-cron',
  'local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7',
];

const SEVERITY_NAMES = [
  'Emergency', 'Alert', 'Critical', 'Error', 'Warning', 'Notice', 'Informational', 'Debug',
];

function parsePriority(text, errors) {
  const match = text.match(/^<(\d{1,3})>/);
  if (!match) {
    errors.push('Message must start with a priority value such as <34>.');
    return {
      remainder: text,
      priority: null,
      facility: null,
      facilityName: null,
      severity: null,
      severityName: null,
    };
  }

  const priority = Number(match[1]);
  if (priority > 191) errors.push('Priority must be between 0 and 191.');
  const facility = Math.floor(priority / 8);
  const severity = priority % 8;
  return {
    remainder: text.slice(match[0].length),
    priority,
    facility,
    facilityName: FACILITY_NAMES[facility] ?? 'unknown',
    severity,
    severityName: SEVERITY_NAMES[severity] ?? 'unknown',
  };
}

function takeToken(text) {
  const match = text.match(/^(\S+)(?:\s+|$)/);
  if (!match) return { token: null, remainder: text };
  return { token: match[1], remainder: text.slice(match[0].length) };
}

function normalizeNil(value) {
  return value === '-' || value === undefined ? null : value;
}

/**
 * Parses RFC 5424 structured data into SD elements and their parameters.
 * @param {string} text - Structured data and the optional message after it.
 * @returns {{ structuredData: Array<{id: string, parameters: Record<string, string>}>,
 *   message: string, error: string | null }}
 */
export function parseStructuredData(text) {
  const source = text.trimStart();
  if (source.startsWith('-')) {
    return { structuredData: [], message: source.slice(1).trimStart(), error: null };
  }
  if (!source.startsWith('[')) {
    return {
      structuredData: [],
      message: source,
      error: 'RFC 5424 structured data must be "-" or start with "[".',
    };
  }

  const structuredData = [];
  let cursor = 0;
  while (source[cursor] === '[') {
    cursor += 1;
    const idMatch = source.slice(cursor).match(/^([^\s=\]\"]+)/);
    if (!idMatch) {
      return { structuredData, message: '', error: 'Structured data element is missing its ID.' };
    }
    const id = idMatch[1];
    cursor += id.length;
    const parameters = {};

    while (cursor < source.length && source[cursor] !== ']') {
      if (!/\s/.test(source[cursor])) {
        return {
          structuredData,
          message: '',
          error: `Invalid structured data near "${source.slice(cursor)}".`,
        };
      }
      while (/\s/.test(source[cursor])) cursor += 1;
      const nameMatch = source.slice(cursor).match(/^([^\s=\]"]+)="/);
      if (!nameMatch) {
        return {
          structuredData,
          message: '',
          error: 'Structured data parameter must use name="value" syntax.',
        };
      }
      const name = nameMatch[1];
      cursor += nameMatch[0].length;
      let value = '';
      let closed = false;
      while (cursor < source.length) {
        const character = source[cursor];
        if (character === '"') {
          cursor += 1;
          closed = true;
          break;
        }
        if (character === '\\' && cursor + 1 < source.length) {
          const escaped = source[cursor + 1];
          value += escaped === '"' || escaped === '\\' || escaped === ']'
            ? escaped
            : `\\${escaped}`;
          cursor += 2;
        } else {
          value += character;
          cursor += 1;
        }
      }
      if (!closed) {
        return {
          structuredData,
          message: '',
          error: 'Structured data parameter has an unterminated value.',
        };
      }
      parameters[name] = value;
    }
    if (source[cursor] !== ']') {
      return {
        structuredData,
        message: '',
        error: 'Structured data element is missing a closing bracket.',
      };
    }
    cursor += 1;
    structuredData.push({ id, parameters });
  }
  return { structuredData, message: source.slice(cursor).trimStart(), error: null };
}

function parseRfc5424(remainder, base, errors, warnings) {
  const versionToken = takeToken(remainder);
  if (!/^\d+$/.test(versionToken.token ?? '')) errors.push('RFC 5424 version must be a number.');
  const fields = [];
  let rest = versionToken.remainder;
  for (let index = 0; index < 5; index += 1) {
    const token = takeToken(rest);
    fields.push(token.token);
    rest = token.remainder;
  }
  if (fields.some((field) => field === null)) {
    errors.push('RFC 5424 message is missing one or more header fields.');
  }
  const [timestamp, hostname, appName, processId, messageId] = fields.map(normalizeNil);
  const rfc3339Timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (timestamp && !rfc3339Timestamp.test(timestamp)) {
    warnings.push('Timestamp does not match the RFC 5424 RFC3339 form.');
  }
  const data = parseStructuredData(rest);
  if (data.error) errors.push(data.error);
  return {
    ...base,
    format: 'RFC 5424',
    version: versionToken.token ? Number(versionToken.token) : null,
    timestamp,
    hostname,
    appName,
    tag: appName,
    processId,
    messageId,
    structuredData: data.structuredData,
    message: data.message,
  };
}

function parseRfc3164(remainder, base, errors, warnings) {
  const legacyTimestamp = '[A-Z][a-z]{2}\\s{1,2}\\d{1,2}\\s+\\d{2}:\\d{2}:\\d{2}';
  const legacyPattern = new RegExp(`^(${legacyTimestamp})\\s+(\\S+)\\s+([^:]+):(?:\\s?(.*))?$`);
  const match = remainder.match(legacyPattern);
  if (!match) {
    errors.push('RFC 3164 message must contain timestamp, hostname, tag, and a colon.');
    return {
      ...base,
      format: 'Unknown',
      version: null,
      timestamp: null,
      hostname: null,
      appName: null,
      tag: null,
      processId: null,
      messageId: null,
      structuredData: [],
      message: remainder.trim(),
    };
  }
  const [, timestamp, hostname, rawTag, message = ''] = match;
  const tagMatch = rawTag.match(/^(.+?)(?:\[(.*?)\])?$/);
  if (!tagMatch?.[1]) warnings.push('Legacy tag is empty.');
  return {
    ...base,
    format: 'RFC 3164',
    version: null,
    timestamp,
    hostname,
    appName: tagMatch?.[1] ?? rawTag,
    tag: rawTag,
    processId: tagMatch?.[2] || null,
    messageId: null,
    structuredData: [],
    message,
  };
}

/**
 * Parses one RFC 5424 or RFC 3164 syslog message without throwing.
 * @param {string} input - A single syslog message.
 * @returns {object} Parsed fields, warnings, errors, format, and validity state.
 */
export function parseSyslogMessage(input) {
  const errors = [];
  const warnings = [];
  const text = typeof input === 'string' ? input.trim() : '';
  if (typeof input !== 'string') errors.push('Message must be a string.');
  if (!text) errors.push('Message is empty.');
  const priority = parsePriority(text, errors);
  const base = {
    isValid: false,
    errors,
    warnings,
    priority: priority.priority,
    facility: priority.facility,
    facilityName: priority.facilityName,
    severity: priority.severity,
    severityName: priority.severityName,
  };
  const result = /^\d+(?:\s|$)/.test(priority.remainder)
    ? parseRfc5424(priority.remainder, base, errors, warnings)
    : parseRfc3164(priority.remainder, base, errors, warnings);
  result.isValid = errors.length === 0;
  return result;
}

/**
 * Parses each line of a multi-line syslog input while retaining source line numbers.
 * @param {string} input - One or more newline-delimited syslog messages.
 * @returns {Array<object>} One parse result per input line.
 */
export function parseSyslogBatch(input) {
  const lines = typeof input === 'string' ? input.split(/\r?\n/) : [input];
  return lines.map((line, index) => ({
    lineNumber: index + 1,
    raw: line,
    ...parseSyslogMessage(line),
  }));
}

export { FACILITY_NAMES, SEVERITY_NAMES };
