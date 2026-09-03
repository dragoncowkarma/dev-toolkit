export const DEFAULT_NANOID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
export const DEFAULT_NANOID_LENGTH = 21;
export const DEFAULT_CUID2_LENGTH = 24;
export const DEFAULT_BATCH_SIZE = 1;
export const MAX_IDENTIFIER_LENGTH = 128;
export const MAX_BATCH_SIZE = 100;

const CUID2_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const CUID2_PATTERN = /^[a-z][a-z0-9]{23}$/;

/**
 * Returns a securely random unsigned byte array.
 * @param {number} size
 * @returns {Uint8Array}
 */
function getSecureRandomBytes(size) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random number generation is not available in this browser.');
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(size));
}

/**
 * Ensures a NanoID alphabet contains unique printable characters.
 * @param {string} alphabet
 * @returns {string}
 */
export function normalizeNanoIdAlphabet(alphabet) {
  if (typeof alphabet !== 'string') {
    throw new TypeError('The NanoID alphabet must be a string.');
  }
  const value = alphabet.trim();
  const characters = Array.from(value);
  if (characters.length < 2 || characters.length > 128) {
    throw new Error('Use a NanoID alphabet between 2 and 128 characters.');
  }
  if (/\s/.test(value) || new Set(characters).size !== characters.length) {
    throw new Error('Use unique NanoID alphabet characters without whitespace.');
  }
  return value;
}

/**
 * Clamps a requested identifier length to the supported UI and generator range.
 * @param {number|string} value
 * @returns {number}
 */
export function clampIdentifierLength(value) {
  const numericValue = Number.parseInt(value, 10);
  if (!Number.isFinite(numericValue)) return DEFAULT_NANOID_LENGTH;
  return Math.min(Math.max(numericValue, 1), MAX_IDENTIFIER_LENGTH);
}

/**
 * Clamps a requested batch size to the supported UI and generator range.
 * @param {number|string} value
 * @returns {number}
 */
export function clampBatchSize(value) {
  const numericValue = Number.parseInt(value, 10);
  if (!Number.isFinite(numericValue)) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.max(numericValue, 1), MAX_BATCH_SIZE);
}

/**
 * Generates a cryptographically secure NanoID without modulo bias.
 *
 * Random bytes outside the largest multiple of the alphabet size are discarded,
 * so each alphabet character has an equal chance of being selected.
 * @param {number} [length=DEFAULT_NANOID_LENGTH]
 * @param {string} [alphabet=DEFAULT_NANOID_ALPHABET]
 * @returns {string}
 */
export function generateNanoId(
  length = DEFAULT_NANOID_LENGTH,
  alphabet = DEFAULT_NANOID_ALPHABET
) {
  const normalizedLength = clampIdentifierLength(length);
  const normalizedAlphabet = normalizeNanoIdAlphabet(alphabet);
  const alphabetCharacters = Array.from(normalizedAlphabet);
  const maxValidByte = 256 - (256 % alphabetCharacters.length);
  let identifier = '';

  while (identifier.length < normalizedLength) {
    const randomBytes = getSecureRandomBytes(normalizedLength - identifier.length);
    for (const byte of randomBytes) {
      if (byte < maxValidByte) {
        identifier += alphabetCharacters[byte % alphabetCharacters.length];
      }
      if (identifier.length === normalizedLength) break;
    }
  }
  return identifier;
}

/**
 * Generates a CUID2-shaped identifier from a secure random source.
 *
 * CUID2 defaults to 24 lowercase alphanumeric characters and starts with a
 * letter. The 23 random base-36 characters provide over 118 bits of entropy.
 * @returns {string}
 */
export function generateCuid2() {
  const firstCharacter = generateNanoId(1, CUID2_ALPHABET.slice(0, 26));
  return firstCharacter + generateNanoId(DEFAULT_CUID2_LENGTH - 1, CUID2_ALPHABET);
}

/**
 * Generates a newline-separated batch of identifiers.
 * @param {'nanoid'|'cuid2'} format
 * @param {number|string} batchSize
 * @param {{ length?: number|string, alphabet?: string }} [options]
 * @returns {string}
 */
export function generateIdentifierBatch(format, batchSize, options = {}) {
  const size = clampBatchSize(batchSize);
  const generator =
    format === 'cuid2'
      ? generateCuid2
      : () => generateNanoId(options.length, options.alphabet);
  return Array.from({ length: size }, generator).join('\n');
}

/**
 * Inspects a value against supplied NanoID settings and the CUID2 default shape.
 * @param {string} value
 * @param {{ nanoIdAlphabet?: string, nanoIdLength?: number|string }} [options]
 * @returns {{ format: 'NanoID'|'CUID2'|'Neither', length: number, alphabet: string }}
 */
export function inspectIdentifier(value, options = {}) {
  const input = typeof value === 'string' ? value.trim() : '';
  const nanoIdAlphabet = options.nanoIdAlphabet ?? DEFAULT_NANOID_ALPHABET;
  const requestedLength = options.nanoIdLength ?? DEFAULT_NANOID_LENGTH;
  const nanoIdLength = clampIdentifierLength(requestedLength);
  const nanoIdCharacters = new Set(nanoIdAlphabet);
  const matchesNanoId =
    input.length === nanoIdLength && [...input].every((character) => nanoIdCharacters.has(character));

  if (matchesNanoId) {
    return { format: 'NanoID', length: input.length, alphabet: nanoIdAlphabet };
  }
  if (CUID2_PATTERN.test(input)) {
    return { format: 'CUID2', length: input.length, alphabet: CUID2_ALPHABET };
  }
  return { format: 'Neither', length: input.length, alphabet: '' };
}
