export const UUID_VERSIONS = Object.freeze({
  V4: 'v4',
  V7: 'v7',
});

export const DEFAULT_BATCH_SIZE = 5;
export const MIN_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 100;

const UUID_COMPACT_PATTERN = /^[0-9a-f]{32}$/i;
const UUID_HYPHENATED_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_V7_TIMESTAMP = 0xffffffffffff;

function randomBytes(length) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random generation is not available in this browser.');
  }

  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function bytesToUuid(bytes) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function compactUuid(uuid) {
  if (typeof uuid !== 'string') return '';

  const hasOpeningBrace = uuid.startsWith('{');
  const hasClosingBrace = uuid.endsWith('}');
  if (hasOpeningBrace !== hasClosingBrace) return '';

  const unwrapped = hasOpeningBrace ? uuid.slice(1, -1) : uuid;
  if (
    !UUID_COMPACT_PATTERN.test(unwrapped) &&
    !UUID_HYPHENATED_PATTERN.test(unwrapped)
  ) {
    return '';
  }

  return unwrapped.replaceAll('-', '');
}

/**
 * Generates an RFC 9562 UUID version 4 using the browser's cryptographic RNG.
 *
 * @returns {string} A canonical lowercase UUID.
 */
export function generateUuidV4() {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

/**
 * Generates an RFC 9562 UUID version 7 using a 48-bit Unix epoch timestamp.
 *
 * @param {number} [timestamp=Date.now()] Milliseconds since the Unix epoch.
 * @returns {string} A canonical lowercase UUID.
 */
export function generateUuidV7(timestamp = Date.now()) {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > MAX_V7_TIMESTAMP
  ) {
    throw new RangeError('UUID v7 timestamp must be a non-negative 48-bit integer.');
  }

  const bytes = randomBytes(16);
  let remainingTimestamp = BigInt(timestamp);

  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(remainingTimestamp & 0xffn);
    remainingTimestamp >>= 8n;
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

/**
 * Generates one UUID of the requested version.
 *
 * @param {'v4' | 'v7'} [version=UUID_VERSIONS.V4]
 * @returns {string} A canonical lowercase UUID.
 */
export function generateUuid(version = UUID_VERSIONS.V4) {
  if (version === UUID_VERSIONS.V4) return generateUuidV4();
  if (version === UUID_VERSIONS.V7) return generateUuidV7();
  throw new RangeError(`Unsupported UUID version: ${version}`);
}

/**
 * Generates a batch of UUIDs.
 *
 * @param {number} [count=DEFAULT_BATCH_SIZE] Number of UUIDs from 1 through 100.
 * @param {'v4' | 'v7'} [version=UUID_VERSIONS.V4]
 * @returns {string[]} Canonical lowercase UUIDs.
 */
export function generateUuidBatch(
  count = DEFAULT_BATCH_SIZE,
  version = UUID_VERSIONS.V4
) {
  if (!Number.isInteger(count) || count < MIN_BATCH_SIZE || count > MAX_BATCH_SIZE) {
    throw new RangeError(
      `UUID batch size must be an integer from ${MIN_BATCH_SIZE} to ${MAX_BATCH_SIZE}.`
    );
  }

  return Array.from({ length: count }, () => generateUuid(version));
}

/**
 * Formats a UUID using GUID-compatible display options.
 *
 * @param {string} uuid UUID with optional hyphens and braces.
 * @param {object} [options]
 * @param {boolean} [options.uppercase=false]
 * @param {boolean} [options.hyphens=true]
 * @param {boolean} [options.braces=false]
 * @returns {string} The formatted UUID.
 */
export function formatUuid(
  uuid,
  { uppercase = false, hyphens = true, braces = false } = {}
) {
  const compact = compactUuid(uuid);
  if (!UUID_COMPACT_PATTERN.test(compact)) {
    throw new TypeError('Invalid UUID value.');
  }

  const withHyphens = hyphens
    ? [
      compact.slice(0, 8),
      compact.slice(8, 12),
      compact.slice(12, 16),
      compact.slice(16, 20),
      compact.slice(20),
    ].join('-')
    : compact;
  const withCase = uppercase ? withHyphens.toUpperCase() : withHyphens.toLowerCase();
  return braces ? `{${withCase}}` : withCase;
}

/**
 * Checks UUID structure, RFC variant, and optionally a required version.
 *
 * @param {unknown} uuid UUID with optional hyphens and braces.
 * @param {'v4' | 'v7'} [version] Required UUID version.
 * @returns {boolean} Whether the value is a valid supported UUID.
 */
export function isValidUuid(uuid, version) {
  const compact = compactUuid(uuid);
  if (!UUID_COMPACT_PATTERN.test(compact)) return false;

  const detectedVersion = `v${compact[12].toLowerCase()}`;
  const hasRfcVariant = ['8', '9', 'a', 'b'].includes(compact[16].toLowerCase());
  const isSupportedVersion = Object.values(UUID_VERSIONS).includes(detectedVersion);

  return hasRfcVariant && isSupportedVersion && (!version || version === detectedVersion);
}
