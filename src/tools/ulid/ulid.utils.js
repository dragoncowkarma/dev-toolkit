export const CROCKFORD_BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const DEFAULT_BATCH_SIZE = 1;
export const MIN_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 100;
export const MAX_ULID_TIMESTAMP = 0xffffffffffff;

const ULID_LENGTH = 26;
const TIMESTAMP_LENGTH = 10;
const RANDOMNESS_LENGTH = 16;
const MAX_RANDOMNESS = (1n << 80n) - 1n;
const BASE32_LOOKUP = new Map(
  Array.from(CROCKFORD_BASE32_ALPHABET, (character, index) => [character, index])
);

function randomBytes(length) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random generation is not available in this browser.');
  }

  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function bytesToBigInt(bytes) {
  return Array.from(bytes).reduce(
    (value, byte) => (value << 8n) | BigInt(byte),
    0n
  );
}

function bigIntToBase32(value, length) {
  let remaining = value;
  const characters = Array(length);

  for (let index = length - 1; index >= 0; index -= 1) {
    characters[index] = CROCKFORD_BASE32_ALPHABET[Number(remaining & 31n)];
    remaining >>= 5n;
  }

  return characters.join('');
}

function base32ToBigInt(value) {
  return Array.from(value).reduce(
    (result, character) => (result << 5n) | BigInt(BASE32_LOOKUP.get(character)),
    0n
  );
}

function randomnessToHex(randomness) {
  return randomness.toString(16).padStart(20, '0');
}

function assertTimestamp(timestamp) {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > MAX_ULID_TIMESTAMP
  ) {
    throw new RangeError('ULID timestamp must be a non-negative 48-bit Unix millisecond value.');
  }
}

function validateUlid(value) {
  if (typeof value !== 'string') return 'A ULID must be a string.';
  if (value.length !== ULID_LENGTH) {
    return `A ULID must contain exactly ${ULID_LENGTH} characters (received ${value.length}).`;
  }

  const invalidCharacter = Array.from(value).find(
    (character) => !BASE32_LOOKUP.has(character)
  );
  if (invalidCharacter) {
    return `"${invalidCharacter}" is not a valid Crockford Base32 character. ` +
      'Use 0-9 and A-H, J-K, M-N, P-T, V-Z.';
  }

  if (BASE32_LOOKUP.get(value[0]) > 7) {
    return 'The first ULID character must be 0-7 to fit a 48-bit timestamp.';
  }

  return '';
}

/**
 * Converts an ISO 8601 date string or Unix millisecond value to a ULID timestamp.
 *
 * @param {string} value ISO 8601 timestamp or non-negative Unix milliseconds.
 * @returns {number} Milliseconds since the Unix epoch.
 */
export function parseTimestampInput(value) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    throw new TypeError('Enter an ISO 8601 date/time or Unix milliseconds.');
  }

  const timestamp = /^\d+$/.test(trimmedValue)
    ? Number(trimmedValue)
    : Date.parse(trimmedValue);

  if (!Number.isFinite(timestamp)) {
    throw new TypeError('Enter a valid ISO 8601 date/time or Unix milliseconds.');
  }

  assertTimestamp(timestamp);
  return timestamp;
}

/**
 * Generates a ULID with a 48-bit Unix millisecond timestamp and 80-bit randomness.
 *
 * @param {number} [timestamp=Date.now()] Milliseconds since the Unix epoch.
 * @param {bigint} [randomness] Optional 80-bit randomness for deterministic generation.
 * @returns {string} An uppercase 26-character ULID.
 */
export function generateUlid(timestamp = Date.now(), randomness = bytesToBigInt(randomBytes(10))) {
  assertTimestamp(timestamp);
  if (typeof randomness !== 'bigint' || randomness < 0n || randomness > MAX_RANDOMNESS) {
    throw new RangeError('ULID randomness must be an unsigned 80-bit integer.');
  }

  return `${bigIntToBase32(BigInt(timestamp), TIMESTAMP_LENGTH)}${bigIntToBase32(
    randomness,
    RANDOMNESS_LENGTH
  )}`;
}

/**
 * Generates a batch of ULIDs sharing one timestamp.
 *
 * @param {number} [count=DEFAULT_BATCH_SIZE] Number of ULIDs from 1 through 100.
 * @param {number} [timestamp=Date.now()] Milliseconds since the Unix epoch.
 * @param {boolean} [monotonic=false] Increment randomness to preserve lexical order.
 * @returns {string[]} Generated ULIDs.
 */
export function generateUlidBatch(
  count = DEFAULT_BATCH_SIZE,
  timestamp = Date.now(),
  monotonic = false
) {
  if (!Number.isInteger(count) || count < MIN_BATCH_SIZE || count > MAX_BATCH_SIZE) {
    throw new RangeError(
      `ULID batch size must be an integer from ${MIN_BATCH_SIZE} to ${MAX_BATCH_SIZE}.`
    );
  }

  assertTimestamp(timestamp);
  if (!monotonic) {
    return Array.from({ length: count }, () => generateUlid(timestamp));
  }

  const initialRandomness = bytesToBigInt(randomBytes(10));
  if (initialRandomness + BigInt(count - 1) > MAX_RANDOMNESS) {
    throw new RangeError('ULID monotonic randomness overflow. Generate a new batch.');
  }

  return Array.from({ length: count }, (_, index) =>
    generateUlid(timestamp, initialRandomness + BigInt(index))
  );
}

/**
 * Checks whether a value is a valid, canonical-range ULID string.
 *
 * @param {unknown} value Candidate ULID value.
 * @returns {boolean} Whether the value is valid.
 */
export function isValidUlid(value) {
  return validateUlid(typeof value === 'string' ? value.toUpperCase() : value) === '';
}

/**
 * Decodes a ULID into its timestamp and randomness components.
 *
 * @param {string} value Case-insensitive ULID string.
 * @returns {object} Decoded timestamp and randomness display values.
 * @throws {TypeError} When the ULID length, characters, or timestamp range are invalid.
 */
export function decodeUlid(value) {
  const normalizedValue = typeof value === 'string' ? value.toUpperCase() : value;
  const validationError = validateUlid(normalizedValue);
  if (validationError) throw new TypeError(validationError);

  const timestamp = Number(base32ToBigInt(normalizedValue.slice(0, TIMESTAMP_LENGTH)));
  const randomnessBase32 = normalizedValue.slice(TIMESTAMP_LENGTH);
  const randomness = base32ToBigInt(randomnessBase32);
  const date = new Date(timestamp);

  return {
    ulid: normalizedValue,
    timestamp,
    iso: date.toISOString(),
    local: date.toLocaleString(),
    randomnessBase32,
    randomnessHex: randomnessToHex(randomness),
  };
}
