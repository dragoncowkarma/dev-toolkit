/** Maximum accepted input length (characters). Guards against synchronous UI
 * freezes when a user pastes a very large payload (see #226 for the prior
 * Base58 fix pattern). */
export const MAX_INPUT_LENGTH = 50000;

/** International Morse Code table for letters, digits and common punctuation. */
const MORSE_TABLE = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  0: '-----',
  1: '.----',
  2: '..---',
  3: '...--',
  4: '....-',
  5: '.....',
  6: '-....',
  7: '--...',
  8: '---..',
  9: '----.',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  "'": '.----.',
  '!': '-.-.--',
  '/': '-..-.',
  '(': '-.--.',
  ')': '-.--.-',
  '&': '.-...',
  ':': '---...',
  ';': '-.-.-.',
  '=': '-...-',
  '+': '.-.-.',
  '-': '-....-',
  _: '..--.-',
  '"': '.-..-.',
  $: '...-..-',
  '@': '.--.-.',
};

const REVERSE_MORSE_TABLE = new Map(
  Object.entries(MORSE_TABLE).map(([char, code]) => [code, char])
);

/**
 * Encodes plain text into International Morse Code.
 * Letters within a word are separated by a single space; words are
 * separated by " / ".
 * @param {string} text - The plain text to encode.
 * @returns {string} The Morse-encoded result.
 * @throws {Error} When the input contains an unsupported character or exceeds the length guard.
 */
export function encodeToMorse(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (text.length > MAX_INPUT_LENGTH) {
    throw new Error(`Input exceeds the ${MAX_INPUT_LENGTH.toLocaleString()} character limit.`);
  }
  if (text.trim() === '') {
    return '';
  }

  const words = text.trim().split(/\s+/);
  const encodedWords = words.map((word) => {
    const letters = Array.from(word.toUpperCase());
    return letters
      .map((char) => {
        const code = MORSE_TABLE[char];
        if (!code) {
          throw new Error(`Unsupported character for Morse encoding: "${char}"`);
        }
        return code;
      })
      .join(' ');
  });
  return encodedWords.join(' / ');
}

/**
 * Decodes International Morse Code back into plain text. Tolerant of extra
 * whitespace, and accepts both "/" and runs of 2+ spaces as word separators.
 * @param {string} morse - The Morse code to decode.
 * @returns {string} The decoded plain text (uppercase).
 * @throws {Error} When the input has an unrecognized token, or exceeds the length guard.
 */
export function decodeFromMorse(morse) {
  if (typeof morse !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (morse.length > MAX_INPUT_LENGTH) {
    throw new Error(`Input exceeds the ${MAX_INPUT_LENGTH.toLocaleString()} character limit.`);
  }

  const trimmed = morse.trim();
  if (trimmed === '') {
    return '';
  }

  const words = trimmed
    .split('/')
    .flatMap((chunk) => chunk.split(/ {2,}/))
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  const decodedWords = words.map((word) => {
    const tokens = word.split(/\s+/).filter(Boolean);
    return tokens
      .map((token) => {
        const char = REVERSE_MORSE_TABLE.get(token);
        if (!char) {
          throw new Error(`Invalid Morse code token: "${token}"`);
        }
        return char;
      })
      .join('');
  });
  return decodedWords.join(' ');
}

/**
 * Checks whether a string looks like Morse code (only contains dots, dashes,
 * slashes and whitespace) versus plain text. Used to auto-detect direction.
 * @param {string} value
 * @returns {boolean}
 */
export function looksLikeMorse(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return false;
  }
  return /^[.\-/\s]+$/.test(trimmed);
}
