// A deterministic placeholder glyph shown for control and non-ASCII-printable
// bytes in the byte-inspection table, so the display column always has a
// stable, single-character width regardless of the underlying byte value.
const NON_PRINTABLE_GLYPH = '·';

/**
 * Encodes arbitrary JavaScript text into its raw UTF-8 bytes.
 *
 * @param {string} text - The text to encode.
 * @returns {Uint8Array} The UTF-8 byte sequence for the text.
 * @throws {TypeError} When `text` is not a string.
 */
export function textToBytes(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  return new TextEncoder().encode(text);
}

/**
 * Formats a byte sequence as space-separated, uppercase, two-digit hex pairs.
 *
 * @param {Uint8Array} bytes - The bytes to format.
 * @returns {string} The hex representation, e.g. "48 65 6C 6C 6F".
 */
export function bytesToHexString(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/**
 * Encodes text directly into an uppercase, space-separated hex byte string.
 *
 * @param {string} text - The text to encode.
 * @returns {string} The uppercase hex representation of the text's UTF-8 bytes.
 * @throws {TypeError} When `text` is not a string.
 */
export function textToHex(text) {
  return bytesToHexString(textToBytes(text));
}

/**
 * Parses a hexadecimal byte stream, allowing ordinary ASCII whitespace
 * (spaces, tabs, newlines, carriage returns, form feeds, vertical tabs)
 * between bytes.
 *
 * @param {string} input - The hexadecimal text to parse.
 * @returns {Uint8Array} The parsed bytes, in their original order.
 * @throws {TypeError} When `input` is not a string.
 * @throws {Error} When the input contains a non-hex character, or an odd
 *   number of hex digits (each byte requires exactly two digits).
 */
export function parseHexBytes(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  const digits = input.replace(/[ \t\n\r\f\v]/g, '');
  if (digits.length === 0) {
    return new Uint8Array(0);
  }

  const invalidChar = digits.match(/[^0-9A-Fa-f]/);
  if (invalidChar) {
    throw new Error(
      `Invalid character "${invalidChar[0]}" in hex input. Use only 0-9, A-F, and whitespace.`
    );
  }
  if (digits.length % 2 !== 0) {
    throw new Error(
      'Hex input has an odd number of digits. Each byte needs exactly two hex digits.'
    );
  }

  const bytes = new Uint8Array(digits.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Decodes a byte sequence as strict UTF-8 text, rejecting malformed or
 * truncated multibyte sequences instead of silently substituting them.
 *
 * @param {Uint8Array} bytes - The bytes to decode.
 * @returns {string} The decoded text.
 * @throws {Error} When the bytes are not well-formed UTF-8.
 */
export function decodeBytesToText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      'The byte sequence is not valid UTF-8. It may be truncated or contain corrupted bytes.'
    );
  }
}

/**
 * Parses a hexadecimal byte stream and decodes it as strict UTF-8 text.
 *
 * @param {string} input - The hexadecimal text to parse and decode.
 * @returns {string} The decoded text.
 * @throws {Error} When the input is not valid hex, or the resulting bytes
 *   are not well-formed UTF-8.
 */
export function hexToText(input) {
  return decodeBytesToText(parseHexBytes(input));
}

/**
 * Returns a single-character display for a byte: its printable ASCII
 * character, or a deterministic safe glyph for control and non-ASCII bytes
 * (including the leading/continuation bytes of multibyte UTF-8 sequences,
 * which are not meaningful as standalone characters).
 *
 * @param {number} byte - The byte value (0-255).
 * @returns {string} A single display character.
 */
export function getByteDisplay(byte) {
  if (byte >= 0x20 && byte <= 0x7e) {
    return String.fromCharCode(byte);
  }
  return NON_PRINTABLE_GLYPH;
}

/**
 * Builds one inspection row per byte, in original order.
 *
 * @param {Uint8Array} bytes - The bytes to describe.
 * @returns {Array<{offset: number, hex: string, decimal: number,
 *   binary: string, display: string}>} One row per byte, with a zero-based
 *   offset, `0xNN` hex, unsigned decimal, eight-bit binary, and a
 *   printable-character display.
 */
export function buildByteRows(bytes) {
  return Array.from(bytes, (byte, offset) => ({
    offset,
    hex: `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`,
    decimal: byte,
    binary: byte.toString(2).padStart(8, '0'),
    display: getByteDisplay(byte),
  }));
}

/** Sample text used by the "Load sample" action in Text-to-Hex mode. */
export const SAMPLE_TEXT = 'Hex Inspector 안녕 🔍';

/** Sample hex byte stream used by the "Load sample" action in Hex-to-Text mode. */
export const SAMPLE_HEX = textToHex(SAMPLE_TEXT);
