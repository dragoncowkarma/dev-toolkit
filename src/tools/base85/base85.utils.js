const ASCII85_FIRST_CHAR_CODE = 33;
const ASCII85_LAST_CHAR_CODE = 117;
const BASE = 85;
const MAX_UINT32 = 0xffffffff;

export const Z85_ALPHABET =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';

const Z85_DIGITS = new Map(
  Array.from(Z85_ALPHABET, (character, index) => [character, index])
);

/**
 * Checks whether a value is a Uint8Array across realms.
 * @param {unknown} value
 * @returns {boolean}
 */
function isUint8Array(value) {
  return (
    value instanceof Uint8Array ||
    (Boolean(value) && Object.prototype.toString.call(value) === '[object Uint8Array]')
  );
}

/**
 * Removes whitespace permitted in Adobe Ascii85 data.
 * @param {string} value
 * @returns {string}
 */
function stripWhitespace(value) {
  return value.replace(/\s/g, '');
}

/**
 * Converts exactly four bytes into five base-85 digits.
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {string|((digit: number) => string)} alphabet
 * @returns {string}
 */
function encodeFullBlock(bytes, offset, alphabet) {
  let value = 0;
  for (let index = 0; index < 4; index += 1) {
    value = value * 256 + (bytes[offset + index] ?? 0);
  }

  const digits = Array(5);
  for (let index = 4; index >= 0; index -= 1) {
    const digit = value % BASE;
    digits[index] = typeof alphabet === 'string' ? alphabet[digit] : alphabet(digit);
    value = Math.floor(value / BASE);
  }
  return digits.join('');
}

/**
 * Decodes a five-character Base85 group into four bytes.
 * @param {string} group
 * @param {(character: string) => number|undefined} digitForCharacter
 * @param {string} codecName
 * @returns {Uint8Array}
 */
function decodeFullBlock(group, digitForCharacter, codecName) {
  let value = 0;
  for (const character of group) {
    const digit = digitForCharacter(character);
    if (digit === undefined) {
      throw new Error(
        `${codecName} input contains an invalid character: '${character}'.`
      );
    }
    value = value * BASE + digit;
  }

  if (value > MAX_UINT32) {
    throw new Error(`${codecName} input contains a group larger than four bytes.`);
  }

  return Uint8Array.of(
    Math.floor(value / 0x1000000),
    Math.floor(value / 0x10000) % 256,
    Math.floor(value / 0x100) % 256,
    value % 256
  );
}

/**
 * Encodes bytes as Adobe/Ascii85 data.
 * @param {Uint8Array} bytes
 * @param {{ delimiters?: boolean }} [options]
 * @returns {string}
 */
export function encodeBytesToAscii85(bytes, { delimiters = true } = {}) {
  if (!isUint8Array(bytes)) {
    throw new TypeError('Input must be a Uint8Array.');
  }

  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 4) {
    const remaining = Math.min(4, bytes.length - offset);
    const block = encodeFullBlock(bytes, offset, ascii85CharacterForDigit);
    if (remaining === 4 && block === '!!!!!') {
      output += 'z';
    } else {
      output += remaining === 4 ? block : block.slice(0, remaining + 1);
    }
  }

  return delimiters ? `<~${output}~>` : output;
}

/**
 * Gets an Ascii85 character for a base-85 digit.
 * @param {number} digit
 * @returns {string}
 */
function ascii85CharacterForDigit(digit) {
  return String.fromCharCode(ASCII85_FIRST_CHAR_CODE + digit);
}

/**
 * Gets an Ascii85 digit for a character.
 * @param {string} character
 * @returns {number|undefined}
 */
function ascii85DigitForCharacter(character) {
  const code = character.charCodeAt(0);
  if (code < ASCII85_FIRST_CHAR_CODE || code > ASCII85_LAST_CHAR_CODE) {
    return undefined;
  }
  return code - ASCII85_FIRST_CHAR_CODE;
}

/**
 * Decodes Adobe/Ascii85 data into bytes. Delimiters are optional.
 * @param {string} input
 * @returns {Uint8Array}
 */
export function decodeAscii85ToBytes(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string.');
  }

  const cleaned = stripWhitespace(input);
  const hasOpeningDelimiter = cleaned.startsWith('<~');
  const hasClosingDelimiter = cleaned.endsWith('~>');
  if (hasOpeningDelimiter !== hasClosingDelimiter) {
    throw new Error('Ascii85 delimiters must use both "<~" and "~>".');
  }

  const body = hasOpeningDelimiter ? cleaned.slice(2, -2) : cleaned;
  const bytes = [];
  let group = '';

  for (const character of body) {
    if (character === 'z') {
      if (group.length !== 0) {
        throw new Error('Ascii85 "z" shorthand must appear between complete groups.');
      }
      bytes.push(0, 0, 0, 0);
      continue;
    }

    if (ascii85DigitForCharacter(character) === undefined) {
      throw new Error(`Ascii85 input contains an invalid character: '${character}'.`);
    }

    group += character;
    if (group.length === 5) {
      bytes.push(...decodeFullBlock(group, ascii85DigitForCharacter, 'Ascii85'));
      group = '';
    }
  }

  if (group.length === 1) {
    throw new Error('Ascii85 input has an incomplete final group.');
  }
  if (group.length > 1) {
    const paddedGroup = `${group}${'u'.repeat(5 - group.length)}`;
    const decodedBlock = decodeFullBlock(
      paddedGroup,
      ascii85DigitForCharacter,
      'Ascii85'
    );
    bytes.push(...decodedBlock.slice(0, group.length - 1));
  }

  return Uint8Array.from(bytes);
}

/**
 * Encodes bytes using ZeroMQ's Z85 alphabet.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function encodeBytesToZ85(bytes) {
  if (!isUint8Array(bytes)) {
    throw new TypeError('Input must be a Uint8Array.');
  }
  if (bytes.length % 4 !== 0) {
    throw new Error(
      'Z85 encoding requires an input length that is a multiple of 4 bytes.'
    );
  }

  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 4) {
    output += encodeFullBlock(bytes, offset, Z85_ALPHABET);
  }
  return output;
}

/**
 * Decodes ZeroMQ Z85 data into bytes.
 * @param {string} input
 * @returns {Uint8Array}
 */
export function decodeZ85ToBytes(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string.');
  }

  if (input.length % 5 !== 0) {
    throw new Error('Z85 input length must be a multiple of 5 characters.');
  }

  const bytes = [];
  for (let offset = 0; offset < input.length; offset += 5) {
    const group = input.slice(offset, offset + 5);
    bytes.push(
      ...decodeFullBlock(group, (character) => Z85_DIGITS.get(character), 'Z85')
    );
  }
  return Uint8Array.from(bytes);
}

/**
 * Encodes UTF-8 text into Base85 data.
 * @param {string} input
 * @param {{ variant?: 'ascii85'|'z85', delimiters?: boolean }} [options]
 * @returns {string}
 */
export function encodeToBase85(
  input,
  { variant = 'ascii85', delimiters = true } = {}
) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string.');
  }

  const bytes = new TextEncoder().encode(input);
  if (variant === 'ascii85') return encodeBytesToAscii85(bytes, { delimiters });
  if (variant === 'z85') return encodeBytesToZ85(bytes);
  throw new Error('Unsupported Base85 variant.');
}

/**
 * Decodes Base85 data into UTF-8 text.
 * @param {string} input
 * @param {{ variant?: 'ascii85'|'z85' }} [options]
 * @returns {string}
 */
export function decodeFromBase85(input, { variant = 'ascii85' } = {}) {
  if (variant !== 'ascii85' && variant !== 'z85') {
    throw new Error('Unsupported Base85 variant.');
  }
  const bytes = variant === 'ascii85'
    ? decodeAscii85ToBytes(input)
    : decodeZ85ToBytes(input);

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Decoded data is not valid UTF-8 text.');
  }
}
