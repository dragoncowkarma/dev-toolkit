const DNS_LOOKUP_MECHANISMS = new Set(['a', 'include', 'exists', 'mx', 'ptr']);
const DMARC_POLICIES = new Set(['none', 'quarantine', 'reject']);
const RECORD_TYPES = new Set(['spf', 'dkim', 'dmarc']);

/**
 * @typedef {object} ParserResult
 * @property {string} recordType
 * @property {object[]} fields
 * @property {object[]} mechanisms
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * Removes TXT-string quote boundaries while retaining the record's contents.
 * @param {string} record
 * @returns {string}
 */
function normalizeRecord(record) {
  return record.trim().replace(/"\s*"/g, '').replace(/^"|"$/g, '').trim();
}

/**
 * Produces one consistent parser result shape.
 * @param {string} recordType
 * @param {string[]} errors
 * @returns {ParserResult}
 */
function createResult(recordType, errors = []) {
  return { recordType, fields: [], mechanisms: [], errors, warnings: [] };
}

/**
 * Detects an email-authentication record type from its version prefix.
 * @param {string} record
 * @returns {'spf'|'dkim'|'dmarc'|''}
 */
export function detectRecordType(record) {
  const normalized = normalizeRecord(record).toLowerCase();
  if (/^v=spf1(?:\s|$)/.test(normalized)) return 'spf';
  if (/^v=dkim1(?:\s*;|$)/.test(normalized)) return 'dkim';
  if (/^v=dmarc1(?:\s*;|$)/.test(normalized)) return 'dmarc';
  return '';
}

/**
 * Checks whether a value is padded Base64 after allowing DNS-folding whitespace.
 * @param {string} value
 * @returns {boolean}
 */
export function isWellFormedBase64(value) {
  const compact = value.replace(/\s/g, '');
  return compact.length > 0 && compact.length % 4 === 0
    && /^[A-Za-z0-9+/]*={0,2}$/.test(compact);
}

/**
 * Parses semicolon-separated tag=value segments.
 * @param {string} record
 * @param {{errors: string[]}} result
 * @returns {Map<string, string>}
 */
function parseTags(record, result) {
  const tags = new Map();
  for (const segment of record.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) {
      result.errors.push(`Malformed tag segment: "${trimmed}".`);
      continue;
    }
    const name = trimmed.slice(0, separator).trim().toLowerCase();
    const value = trimmed.slice(separator + 1).trim();
    if (tags.has(name)) {
      result.warnings.push(`Duplicate ${name} tag; the final value is used.`);
    }
    tags.set(name, value);
    result.fields.push({ name, value });
  }
  return tags;
}

/**
 * Parses and validates an SPF record without performing DNS lookups.
 * @param {string} record
 * @returns {ParserResult}
 */
export function parseSpfRecord(record) {
  const normalized = normalizeRecord(record);
  const result = createResult('spf');
  const terms = normalized.split(/\s+/).filter(Boolean);

  if (terms[0]?.toLowerCase() !== 'v=spf1') {
    result.errors.push('SPF records must begin with v=spf1.');
    return result;
  }

  let allCount = 0;
  let dnsLookupCount = 0;
  for (const term of terms.slice(1)) {
    const modifier = term.match(/^([a-z][a-z0-9_-]*)=(.+)$/i);
    if (modifier) {
      const [, name, value] = modifier;
      const normalizedName = name.toLowerCase();
      result.mechanisms.push({ qualifier: '', name: normalizedName, value, modifier: true });
      if (normalizedName === 'redirect' || normalizedName === 'exp') dnsLookupCount += 1;
      continue;
    }

    const match = term.match(/^([+\-~?]?)([a-z0-9]+)(?::([^/]+))?(\/\d{1,3})?(\/\d{1,3})?$/i);
    if (!match) {
      result.errors.push(`Malformed SPF mechanism: "${term}".`);
      continue;
    }
    const [, rawQualifier, rawName, rawValue = '', cidr4 = '', cidr6 = ''] = match;
    const qualifier = rawQualifier || '+';
    const name = rawName.toLowerCase();
    const value = `${rawValue}${cidr4}${cidr6}`;
    result.mechanisms.push({ qualifier, name, value, modifier: false });
    if (DNS_LOOKUP_MECHANISMS.has(name)) dnsLookupCount += 1;
    if (name === 'all') allCount += 1;
  }

  result.fields.push({ name: 'dns-lookups', value: String(dnsLookupCount) });
  if (dnsLookupCount > 10) {
    result.warnings.push(
      `SPF performs ${dnsLookupCount} DNS lookups; RFC 7208 permits at most 10.`
    );
  }
  if (allCount > 1) result.warnings.push('SPF contains multiple all mechanisms.');
  return result;
}

/**
 * Parses and validates a DKIM key record without performing DNS lookups.
 * @param {string} record
 * @returns {ParserResult}
 */
export function parseDkimRecord(record) {
  const normalized = normalizeRecord(record);
  const result = createResult('dkim');
  const tags = parseTags(normalized, result);

  if (tags.get('v')?.toLowerCase() !== 'dkim1') {
    result.errors.push('DKIM records must include v=DKIM1.');
  }
  if (!tags.has('p')) {
    result.errors.push('DKIM records must include a p= public key tag.');
  } else if (tags.get('p') === '') {
    result.warnings.push('DKIM p= is empty: this selector has a revoked public key.');
  } else if (!isWellFormedBase64(tags.get('p'))) {
    result.errors.push('DKIM p= must contain well-formed Base64 public-key data.');
  }
  return result;
}

/**
 * Validates a DMARC aggregate or forensic reporting address.
 * @param {string} value
 * @returns {boolean}
 */
export function isWellFormedMailtoUri(value) {
  const match = /^mailto:([^!\s,?]+@[^!\s,?]+)(?:!\d+[kmg]?)?$/i.exec(value);
  return Boolean(match && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(match[1]));
}

/**
 * Parses and validates a DMARC record without performing DNS lookups.
 * @param {string} record
 * @returns {ParserResult}
 */
export function parseDmarcRecord(record) {
  const normalized = normalizeRecord(record);
  const result = createResult('dmarc');
  const tags = parseTags(normalized, result);

  if (tags.get('v')?.toLowerCase() !== 'dmarc1') {
    result.errors.push('DMARC records must include v=DMARC1.');
  }
  for (const name of ['p', 'sp']) {
    if (tags.has(name) && !DMARC_POLICIES.has(tags.get(name).toLowerCase())) {
      result.errors.push(`DMARC ${name}= must be none, quarantine, or reject.`);
    }
  }
  if (!tags.has('p')) result.errors.push('DMARC records must include a p= policy tag.');

  if (tags.has('pct')) {
    const percentage = Number(tags.get('pct'));
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
      result.errors.push('DMARC pct= must be an integer from 0 to 100.');
    }
  }
  for (const name of ['rua', 'ruf']) {
    if (!tags.has(name)) continue;
    const addresses = tags.get(name).split(',').map((address) => address.trim());
    if (!addresses.length || addresses.some((address) => !isWellFormedMailtoUri(address))) {
      result.errors.push(
        `DMARC ${name}= must contain one or more well-formed mailto: URIs.`
      );
    }
  }
  return result;
}

/**
 * Parses a DNS email-authentication TXT record with optional record-type selection.
 * @param {string} input
 * @param {'auto'|'spf'|'dkim'|'dmarc'} selectedType
 * @returns {ParserResult}
 */
export function parseEmailAuthenticationRecord(input, selectedType = 'auto') {
  if (typeof input !== 'string' || input.trim() === '') {
    return createResult(
      selectedType === 'auto' ? '' : selectedType,
      ['Enter a TXT record to parse.']
    );
  }
  const recordType = selectedType === 'auto' ? detectRecordType(input) : selectedType;
  if (!RECORD_TYPES.has(recordType)) {
    return createResult('', ['Unable to detect SPF, DKIM, or DMARC from the v= prefix.']);
  }
  if (recordType === 'spf') return parseSpfRecord(input);
  if (recordType === 'dkim') return parseDkimRecord(input);
  return parseDmarcRecord(input);
}
