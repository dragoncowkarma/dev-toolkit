const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

/** Error raised when a Bencode document cannot be parsed or serialized. */
export class BencodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BencodeError';
  }
}

/**
 * Converts an array of bytes to lower-case hexadecimal.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts raw bytes to Base64 without changing their contents.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Compares byte strings using the unsigned raw-byte ordering Bencode requires.
 * @param {Uint8Array} left
 * @param {Uint8Array} right
 * @returns {number}
 */
export function compareBytes(left, right) {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function inputToBytes(input) {
  if (isByteArray(input)) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof input === 'string') return UTF8_ENCODER.encode(input);
  throw new TypeError('Bencode input must be text or raw bytes.');
}

function isByteArray(value) {
  return ArrayBuffer.isView(value) && value.BYTES_PER_ELEMENT === 1;
}

function parseByteString(bytes, start) {
  let cursor = start;
  if (bytes[cursor] === 45) {
    throw new BencodeError(`String length cannot be negative at byte ${start}.`);
  }
  if (bytes[cursor] < 48 || bytes[cursor] > 57) {
    throw new BencodeError(`Expected a numeric string length at byte ${start}.`);
  }
  while (bytes[cursor] >= 48 && bytes[cursor] <= 57) cursor += 1;
  if (bytes[cursor] !== 58) {
    throw new BencodeError(`Expected ':' after string length at byte ${start}.`);
  }
  const digits = new TextDecoder().decode(bytes.slice(start, cursor));
  if (digits.length > 1 && digits.startsWith('0')) {
    throw new BencodeError(`String length must not contain leading zeroes at byte ${start}.`);
  }
  const length = Number(digits);
  if (!Number.isSafeInteger(length)) {
    throw new BencodeError(`String length is too large at byte ${start}.`);
  }
  const valueStart = cursor + 1;
  const valueEnd = valueStart + length;
  if (valueEnd > bytes.length) {
    throw new BencodeError(`String at byte ${start} ends before its declared length.`);
  }
  return { value: bytes.slice(valueStart, valueEnd), cursor: valueEnd };
}

function parseInteger(bytes, start) {
  let cursor = start + 1;
  while (cursor < bytes.length && bytes[cursor] !== 101) cursor += 1;
  if (cursor === bytes.length) {
    throw new BencodeError(`Unterminated integer at byte ${start}.`);
  }
  const token = new TextDecoder().decode(bytes.slice(start + 1, cursor));
  if (!/^(?:0|-?[1-9]\d*)$/.test(token)) {
    throw new BencodeError(`Invalid integer at byte ${start}.`);
  }
  const integer = BigInt(token);
  const value =
    integer <= BigInt(Number.MAX_SAFE_INTEGER) && integer >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(integer)
      : integer;
  return { value, cursor: cursor + 1 };
}

function parseValue(bytes, start) {
  if (start >= bytes.length) {
    throw new BencodeError('Unexpected end of input.');
  }
  const marker = bytes[start];
  if (marker === 105) return parseInteger(bytes, start);
  if (marker >= 48 && marker <= 57) return parseByteString(bytes, start);
  if (marker === 108) {
    const values = [];
    let cursor = start + 1;
    while (cursor < bytes.length && bytes[cursor] !== 101) {
      const parsed = parseValue(bytes, cursor);
      values.push(parsed.value);
      cursor = parsed.cursor;
    }
    if (cursor === bytes.length) throw new BencodeError(`Unterminated list at byte ${start}.`);
    return { value: values, cursor: cursor + 1 };
  }
  if (marker === 100) {
    const dictionary = new Map();
    let cursor = start + 1;
    let previousKey = null;
    while (cursor < bytes.length && bytes[cursor] !== 101) {
      const key = parseByteString(bytes, cursor);
      if (previousKey !== null && compareBytes(previousKey, key.value) >= 0) {
        throw new BencodeError(`Dictionary keys must be sorted and unique at byte ${cursor}.`);
      }
      const parsed = parseValue(bytes, key.cursor);
      dictionary.set(key.value, parsed.value);
      previousKey = key.value;
      cursor = parsed.cursor;
    }
    if (cursor === bytes.length) {
      throw new BencodeError(`Unterminated dictionary at byte ${start}.`);
    }
    return { value: dictionary, cursor: cursor + 1 };
  }
  if (marker === 45) {
    throw new BencodeError(`String length cannot be negative at byte ${start}.`);
  }
  throw new BencodeError(`Unexpected token at byte ${start}.`);
}

/**
 * Decodes a complete Bencode document. Byte strings are returned as Uint8Array
 * values and dictionaries as Maps so raw bytes are never silently corrupted.
 * @param {string|Uint8Array|ArrayBuffer} input
 * @returns {unknown}
 */
export function decodeBencode(input) {
  const bytes = inputToBytes(input);
  if (bytes.length === 0) throw new BencodeError('Bencode input is empty.');
  const parsed = parseValue(bytes, 0);
  if (parsed.cursor !== bytes.length) {
    throw new BencodeError(`Unexpected trailing data at byte ${parsed.cursor}.`);
  }
  return parsed.value;
}

function descriptorToBytes(value) {
  const descriptor = value.$bytes;
  if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor)) {
    throw new BencodeError('The $bytes value must contain a hex or base64 string.');
  }
  if (typeof descriptor.hex === 'string') {
    if (!/^(?:[\da-fA-F]{2})*$/.test(descriptor.hex)) {
      throw new BencodeError('Byte-string hex must contain complete hexadecimal pairs.');
    }
    return Uint8Array.from(
      descriptor.hex.match(/.{2}/g) ?? [],
      (pair) => Number.parseInt(pair, 16)
    );
  }
  if (typeof descriptor.base64 === 'string') {
    const base64 = descriptor.base64.replace(/\s/g, '');
    if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw new BencodeError('Byte-string base64 is invalid.');
    }
    try {
      return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    } catch {
      throw new BencodeError('Byte-string base64 is invalid.');
    }
  }
  throw new BencodeError('The $bytes value must contain a hex or base64 string.');
}

function appendBytes(target, bytes) {
  target.push(...bytes);
}

function encodeValue(value, target) {
  if (isByteArray(value)) {
    appendBytes(target, UTF8_ENCODER.encode(`${value.length}:`));
    appendBytes(target, value);
    return;
  }
  if (typeof value === 'string') {
    encodeValue(UTF8_ENCODER.encode(value), target);
    return;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || Object.is(value, -0))) {
      throw new BencodeError('Bencode integers must be safe, non-negative-zero integers.');
    }
    appendBytes(target, UTF8_ENCODER.encode(`i${value}e`));
    return;
  }
  if (Array.isArray(value)) {
    target.push(108);
    for (const item of value) encodeValue(item, target);
    target.push(101);
    return;
  }
  if (value instanceof Map) {
    const entries = Array.from(value, ([key, item]) => {
      const keyBytes = isByteArray(key) ? key : UTF8_ENCODER.encode(String(key));
      return { keyBytes, item };
    }).sort((left, right) => compareBytes(left.keyBytes, right.keyBytes));
    target.push(100);
    for (const entry of entries) {
      encodeValue(entry.keyBytes, target);
      encodeValue(entry.item, target);
    }
    target.push(101);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    if (Object.hasOwn(value, '$bytes')) {
      encodeValue(descriptorToBytes(value), target);
      return;
    }
    const entries = Object.entries(value).map(([key, item]) => ({
      keyBytes: UTF8_ENCODER.encode(key),
      item,
    })).sort((left, right) => compareBytes(left.keyBytes, right.keyBytes));
    target.push(100);
    for (const entry of entries) {
      encodeValue(entry.keyBytes, target);
      encodeValue(entry.item, target);
    }
    target.push(101);
    return;
  }
  throw new BencodeError(
    'Bencode values must be integers, strings, byte strings, lists, or dictionaries.'
  );
}

/**
 * Encodes a JavaScript value as canonical Bencode bytes.
 * @param {unknown} value
 * @returns {Uint8Array}
 */
export function encodeBencode(value) {
  const bytes = [];
  encodeValue(value, bytes);
  return Uint8Array.from(bytes);
}

function displayByteString(bytes) {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    return { $bytes: { hex: bytesToHex(bytes), base64: bytesToBase64(bytes) } };
  }
}

function valueToDisplay(value) {
  if (isByteArray(value)) return displayByteString(value);
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(valueToDisplay);
  if (value instanceof Map) {
    const entries = Array.from(value, ([key, item]) => ({
      key: displayByteString(key),
      value: valueToDisplay(item),
    }));
    if (entries.every((entry) => typeof entry.key === 'string')) {
      // A null prototype preserves keys such as "__proto__" as data rather
      // than invoking Object.prototype's legacy setter while formatting an
      // untrusted torrent dictionary for display.
      const output = Object.create(null);
      for (const entry of entries) {
        if (Object.hasOwn(output, entry.key)) return { $dictionary: entries };
        output[entry.key] = entry.value;
      }
      return output;
    }
    return { $dictionary: entries };
  }
  return value;
}

/**
 * Formats a decoded Bencode tree as readable JSON, retaining invalid UTF-8 as
 * a hex/base64 byte descriptor.
 * @param {unknown} value
 * @returns {string}
 */
export function formatBencodeValue(value) {
  return JSON.stringify(valueToDisplay(value), null, 2);
}

/**
 * Parses JSON-like editor input for the Bencode encoder.
 * @param {string} input
 * @returns {unknown}
 */
export function parseBencodeJson(input) {
  try {
    return JSON.parse(input);
  } catch {
    throw new BencodeError('Input must be valid JSON. Use {"$bytes":{"hex":"ff"}} for raw bytes.');
  }
}

/**
 * Displays Bencode bytes as text when valid UTF-8, otherwise as an explicit
 * raw-byte descriptor suitable for inspection.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function formatEncodedBencode(bytes) {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    return JSON.stringify(
      { $bencode: { hex: bytesToHex(bytes), base64: bytesToBase64(bytes) } },
      null,
      2
    );
  }
}
