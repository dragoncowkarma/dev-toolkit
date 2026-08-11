const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SUPPORTED_ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-512'];
const MIN_DIGITS = 6;
const MAX_DIGITS = 8;
const DEFAULT_PERIOD = 30;

function errorResult(error) {
  return { bytes: null, error };
}

function validateDigits(digits) {
  if (!Number.isInteger(digits) || digits < MIN_DIGITS || digits > MAX_DIGITS) {
    throw new RangeError('Digits must be an integer from 6 to 8.');
  }
}

function validatePeriod(period) {
  if (!Number.isInteger(period) || period <= 0) {
    throw new RangeError('Period must be a positive integer.');
  }
}

function normalizeAlgorithm(algorithm) {
  const compact = String(algorithm).toUpperCase().replace(/-/g, '');
  const normalized = compact === 'SHA1' ? 'SHA-1' : compact === 'SHA256'
    ? 'SHA-256' : compact === 'SHA512' ? 'SHA-512' : null;
  if (!normalized || !SUPPORTED_ALGORITHMS.includes(normalized)) {
    throw new RangeError('Algorithm must be SHA-1, SHA-256, or SHA-512.');
  }
  return normalized;
}

function parsePositiveInteger(value, name, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new RangeError(`${name} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
  return parsed;
}

function counterBytes(counter) {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new RangeError('Counter must be a non-negative safe integer.');
  }
  let value = BigInt(counter);
  const bytes = new Uint8Array(8);
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(value & 255n);
    value >>= 8n;
  }
  return bytes;
}

function decodeLabel(pathname) {
  try {
    return decodeURIComponent(pathname.replace(/^\/+/, ''));
  } catch {
    throw new RangeError('The otpauth label is not valid URL encoding.');
  }
}

/**
 * Decodes a standard RFC 4648 Base32 value without throwing for malformed input.
 * @param {string} input - Padded or unpadded Base32 text.
 * @returns {{bytes: Uint8Array | null, error: string | null}} Decoded bytes or an error.
 */
export function base32Decode(input) {
  if (typeof input !== 'string') return errorResult('Base32 input must be a string.');
  const cleaned = input.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z2-7]*={0,6}$/.test(cleaned)) {
    return errorResult('Base32 input contains characters outside A–Z and 2–7.');
  }
  const paddingIndex = cleaned.indexOf('=');
  const body = paddingIndex === -1 ? cleaned : cleaned.slice(0, paddingIndex);
  const padding = paddingIndex === -1 ? '' : cleaned.slice(paddingIndex);
  const validRemainders = [0, 2, 4, 5, 7];
  if (!validRemainders.includes(body.length % 8)) {
    return errorResult('Base32 input has an incomplete final byte group.');
  }
  const expectedPadding = body.length % 8 === 0 ? 0 : 8 - (body.length % 8);
  if (padding && (body.length % 8 === 0 || padding.length !== expectedPadding)) {
    return errorResult('Base32 padding is malformed.');
  }

  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (const character of body) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return { bytes: Uint8Array.from(bytes), error: null };
}

/**
 * Encodes bytes as uppercase, unpadded RFC 4648 Base32.
 * @param {Uint8Array} bytes - Bytes to encode.
 * @returns {string} The unpadded Base32 representation.
 */
export function base32Encode(bytes) {
  let buffer = 0;
  let bits = 0;
  let output = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

/**
 * Creates a new random Base32 secret with Web Crypto.
 * @param {number} [byteLength=20] - Number of random source bytes.
 * @returns {string} An uppercase, unpadded Base32 secret.
 */
export function generateRandomSecret(byteLength = 20) {
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new RangeError('Secret length must be a positive integer.');
  }
  if (!globalThis.crypto?.getRandomValues) throw new Error('Web Crypto API is unavailable.');
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/**
 * Returns the RFC 6238 counter for an explicit timestamp.
 * @param {number} timestampMs - Unix timestamp in milliseconds.
 * @param {number} [period=30] - Step duration in seconds.
 * @returns {number} The integer time-step counter.
 */
export function counterForTime(timestampMs, period = DEFAULT_PERIOD) {
  validatePeriod(period);
  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    throw new RangeError('Timestamp must be a non-negative finite number.');
  }
  return Math.floor(timestampMs / (period * 1000));
}

/**
 * Returns the whole seconds remaining in an explicit time step.
 * @param {number} timestampMs - Unix timestamp in milliseconds.
 * @param {number} [period=30] - Step duration in seconds.
 * @returns {number} Seconds remaining, from zero through period minus one.
 */
export function secondsRemaining(timestampMs, period = DEFAULT_PERIOD) {
  validatePeriod(period);
  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    throw new RangeError('Timestamp must be a non-negative finite number.');
  }
  return period - 1 - (Math.floor(timestampMs / 1000) % period);
}

/**
 * Generates an RFC 4226 HMAC-based one-time password.
 * @param {Uint8Array} secretBytes - Decoded shared-secret bytes.
 * @param {number} counter - Non-negative HOTP counter.
 * @param {{digits?: number, algorithm?: string}} [options] - HOTP settings.
 * @returns {Promise<string>} The zero-padded one-time code.
 */
export async function hotp(secretBytes, counter, { digits = 6, algorithm = 'SHA-1' } = {}) {
  validateDigits(digits);
  const hash = normalizeAlgorithm(algorithm);
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API is unavailable.');
  const key = await globalThis.crypto.subtle.importKey(
    'raw', secretBytes, { name: 'HMAC', hash: { name: hash } }, false, ['sign']
  );
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign('HMAC', key, counterBytes(counter))
  );
  const offset = signature[signature.length - 1] & 15;
  const binary = ((signature[offset] & 127) << 24) | (signature[offset + 1] << 16)
    | (signature[offset + 2] << 8) | signature[offset + 3];
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

/**
 * Generates an RFC 6238 time-based one-time password from an explicit timestamp.
 * @param {Uint8Array} secretBytes - Decoded shared-secret bytes.
 * @param {{digits?: number, algorithm?: string, period?: number, timestampMs: number}} options
 *   TOTP settings.
 * @returns {Promise<string>} The zero-padded one-time code.
 */
export async function totp(
  secretBytes,
  { digits = 6, algorithm = 'SHA-1', period = DEFAULT_PERIOD, timestampMs } = {}
) {
  if (timestampMs === undefined) throw new TypeError('timestampMs is required for TOTP.');
  return hotp(secretBytes, counterForTime(timestampMs, period), { digits, algorithm });
}

/**
 * Parses a Key URI format otpauth provisioning URI without throwing on malformed input.
 * @param {string} uri - An otpauth://totp or otpauth://hotp URI.
 * @returns {{type: string|null, label: string, issuer: string, secret: string,
 * algorithm: string,
 * digits: number|null, period: number|null, counter: number|null,
 * error: string|null}} Parsed fields.
 */
export function parseOtpAuthUri(uri) {
  const empty = {
    type: null, label: '', issuer: '', secret: '', algorithm: 'SHA-1', digits: 6,
    period: DEFAULT_PERIOD, counter: null, error: null,
  };
  if (typeof uri !== 'string' || !uri.trim()) {
    return { ...empty, error: 'Enter an otpauth URI.' };
  }
  try {
    const parsed = new URL(uri.trim());
    const type = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'otpauth:' || !['totp', 'hotp'].includes(type)) {
      throw new RangeError('URI must use the otpauth://totp or otpauth://hotp format.');
    }
    const secret = parsed.searchParams.get('secret')?.trim() ?? '';
    if (!secret) throw new RangeError('The otpauth URI is missing a secret.');
    const label = decodeLabel(parsed.pathname);
    const issuer = parsed.searchParams.get('issuer') ?? '';
    const algorithm = normalizeAlgorithm(parsed.searchParams.get('algorithm') ?? 'SHA-1');
    const digits = parsePositiveInteger(parsed.searchParams.get('digits'), 'Digits', 6);
    validateDigits(digits);
    const period = parsePositiveInteger(
      parsed.searchParams.get('period'), 'Period', DEFAULT_PERIOD
    );
    validatePeriod(period);
    const counter = type === 'hotp'
      ? parsePositiveInteger(parsed.searchParams.get('counter'), 'Counter', null) : null;
    if (type === 'hotp' && counter === null) {
      throw new RangeError('HOTP otpauth URIs require a counter.');
    }
    return { type, label, issuer, secret, algorithm, digits, period, counter, error: null };
  } catch (reason) {
    return { ...empty, error: reason.message || 'The otpauth URI could not be parsed.' };
  }
}

/**
 * Builds a Key URI format otpauth provisioning URI.
 * @param {{type: string, label: string, issuer?: string, secret: string, algorithm?: string,
 * digits?: number, period?: number, counter?: number}} fields - Provisioning fields.
 * @returns {string} A URI parseable by {@link parseOtpAuthUri}.
 */
export function buildOtpAuthUri({
  type,
  label,
  issuer = '',
  secret,
  algorithm = 'SHA-1',
  digits = 6,
  period = DEFAULT_PERIOD,
  counter,
}) {
  if (!['totp', 'hotp'].includes(type)) throw new RangeError('Type must be totp or hotp.');
  if (!secret?.trim()) throw new RangeError('A secret is required.');
  validateDigits(digits);
  validatePeriod(period);
  const parameters = new URLSearchParams({ secret: secret.trim() });
  if (issuer) parameters.set('issuer', issuer);
  if (algorithm !== 'SHA-1') parameters.set('algorithm', normalizeAlgorithm(algorithm));
  if (digits !== 6) parameters.set('digits', String(digits));
  if (type === 'totp' && period !== DEFAULT_PERIOD) parameters.set('period', String(period));
  if (type === 'hotp') {
    if (!Number.isSafeInteger(counter) || counter < 0) {
      throw new RangeError('HOTP URIs require a non-negative safe counter.');
    }
    parameters.set('counter', String(counter));
  }
  return `otpauth://${type}/${encodeURIComponent(label || '')}?${parameters.toString()}`;
}
