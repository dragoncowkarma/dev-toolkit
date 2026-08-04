export const MIN_PASSWORD_LENGTH = 4;
export const MAX_PASSWORD_LENGTH = 128;
export const MIN_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 20;
export const DEFAULT_PASSWORD_LENGTH = 16;
export const DEFAULT_BATCH_SIZE = 1;

export const CHARACTER_SETS = Object.freeze({
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?/~`',
});

export const DEFAULT_OPTIONS = Object.freeze({
  lowercase: true,
  uppercase: true,
  numbers: true,
  symbols: true,
  excludeAmbiguous: false,
});

const AMBIGUOUS_CHARACTERS = new Set(['0', 'O', '1', 'l', 'I']);

function secureRandomValues(values) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random generation is not available in this browser.');
  }
  return globalThis.crypto.getRandomValues(values);
}

function assertRange(value, minimum, maximum, name) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
}

/**
 * Builds the configured password character pool.
 *
 * @param {object} options Character set selections.
 * @returns {string} The usable character pool, or an empty string when none are selected.
 */
export function getCharacterPool(options = DEFAULT_OPTIONS) {
  const selected = ['lowercase', 'uppercase', 'numbers', 'symbols']
    .filter((name) => options[name])
    .map((name) => CHARACTER_SETS[name])
    .join('');

  return options.excludeAmbiguous
    ? [...selected].filter((character) => !AMBIGUOUS_CHARACTERS.has(character)).join('')
    : selected;
}

/**
 * Returns an unbiased random index in a range using rejection sampling.
 *
 * @param {number} upperBound Exclusive upper bound, from 1 through 256.
 * @param {(values: Uint8Array) => Uint8Array} [getRandomValues] Secure random byte source.
 * @returns {number} An unbiased index.
 */
export function getUnbiasedRandomIndex(upperBound, getRandomValues = secureRandomValues) {
  assertRange(upperBound, 1, 256, 'Character pool length');
  const limit = 256 - (256 % upperBound);
  const values = new Uint8Array(1);
  let value;

  do {
    getRandomValues(values);
    value = values[0];
  } while (value >= limit);

  return value % upperBound;
}

/**
 * Generates one cryptographically secure password from the selected character sets.
 *
 * @param {object} configuration Password length, options, and optional test random source.
 * @returns {string} A generated password.
 */
export function generatePassword({
  length = DEFAULT_PASSWORD_LENGTH,
  options = DEFAULT_OPTIONS,
  getRandomValues = secureRandomValues,
} = {}) {
  assertRange(length, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, 'Password length');
  const characterPool = getCharacterPool(options);
  if (!characterPool) {
    throw new Error('Select at least one character set before generating a password.');
  }

  return Array.from({ length }, () =>
    characterPool[getUnbiasedRandomIndex(characterPool.length, getRandomValues)]
  ).join('');
}

/**
 * Generates a batch of passwords with a shared configuration.
 *
 * @param {object} configuration Password configuration.
 * @returns {string[]} Generated passwords.
 */
export function generatePasswordBatch({ batchSize = DEFAULT_BATCH_SIZE, ...configuration } = {}) {
  assertRange(batchSize, MIN_BATCH_SIZE, MAX_BATCH_SIZE, 'Batch size');
  return Array.from({ length: batchSize }, () => generatePassword(configuration));
}

/**
 * Calculates ideal password entropy in bits from length and character pool size.
 *
 * @param {number} length Password length.
 * @param {number} characterPoolSize Number of possible characters per position.
 * @returns {number} Entropy in bits.
 */
export function calculateEntropy(length, characterPoolSize) {
  if (!Number.isFinite(length) || length < 0 || !Number.isFinite(characterPoolSize)) return 0;
  if (characterPoolSize <= 1) return 0;
  return length * Math.log2(characterPoolSize);
}

/**
 * Converts entropy to a concise strength label.
 *
 * @param {number} entropy Entropy in bits.
 * @returns {'Weak'|'Fair'|'Strong'|'Very Strong'} Strength label.
 */
export function getPasswordStrength(entropy) {
  if (entropy < 40) return 'Weak';
  if (entropy < 60) return 'Fair';
  if (entropy < 80) return 'Strong';
  return 'Very Strong';
}
