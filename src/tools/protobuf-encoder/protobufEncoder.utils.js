const WIRE_TYPES = new Map([
  ['varint', 0],
  ['64-bit', 1],
  ['i64', 1],
  ['length-delimited', 2],
  ['len', 2],
  ['32-bit', 5],
  ['i32', 5],
]);

const MAX_FIELD_NUMBER = 536870911;

/**
 * Encodes an unsigned integer using protobuf's base-128 varint representation.
 *
 * @param {bigint} value Non-negative integer to encode.
 * @returns {number[]} Encoded bytes.
 */
export function encodeVarint(value) {
  const bytes = [];
  let remaining = value;
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
  return bytes;
}

/**
 * Converts a JSON-safe non-negative integer into BigInt, returning a useful error on failure.
 *
 * @param {unknown} value Value supplied by the user.
 * @param {string} label Field-specific label for errors.
 * @param {bigint} maximum Inclusive upper bound.
 * @returns {{value: bigint}|{error: string}}
 */
function parseUnsignedInteger(value, label, maximum) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
    return { error: `${label} must be a non-negative safe integer or decimal string.` };
  }
  if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'bigint') {
    return { error: `${label} must be a non-negative integer.` };
  }

  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return { error: `${label} must not be empty.` };
  try {
    const parsed = BigInt(normalized);
    if (parsed < 0n || parsed > maximum) {
      return { error: `${label} must be between 0 and ${maximum.toString()}.` };
    }
    return { value: parsed };
  } catch {
    return { error: `${label} must be a non-negative integer.` };
  }
}

/**
 * Converts a hex string to bytes.
 *
 * @param {string} value Hexadecimal data.
 * @returns {{bytes: Uint8Array}|{error: string}}
 */
function parseHex(value) {
  const cleaned = value.replace(/\s/g, '').replace(/^0x/i, '');
  if (cleaned.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(cleaned)) {
    return { error: 'Byte value hex must contain complete hexadecimal byte pairs.' };
  }
  if (cleaned === '') return { bytes: new Uint8Array() };
  return {
    bytes: Uint8Array.from(cleaned.match(/../g), (pair) => Number.parseInt(pair, 16)),
  };
}

/**
 * Converts standard Base64 or Base64URL data to bytes.
 *
 * @param {string} value Base64 data.
 * @returns {{bytes: Uint8Array}|{error: string}}
 */
function parseBase64(value) {
  const normalized = value.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    return { error: 'Byte value base64 contains invalid characters.' };
  }
  if (normalized === '') return { bytes: new Uint8Array() };
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    return { bytes: Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)) };
  } catch {
    return { error: 'Byte value base64 is malformed.' };
  }
}

/**
 * Reads an input JSON document into a list of field definitions.
 *
 * @param {string} input JSON text entered by the user.
 * @returns {{fields: unknown[]}|{error: string}}
 */
export function parseProtobufFields(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return { error: 'Enter a JSON array of protobuf field definitions.' };
  }
  try {
    const parsed = JSON.parse(input);
    const fields = Array.isArray(parsed) ? parsed : parsed?.fields;
    if (!Array.isArray(fields)) {
      return { error: 'JSON must be an array, or an object with a "fields" array.' };
    }
    return { fields };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown JSON error';
    return { error: `Invalid JSON: ${message}` };
  }
}

/**
 * Gets bytes for a length-delimited field value.
 *
 * Strings are UTF-8 text. Use {"hex":"..."}, {"base64":"..."}, or
 * {"fields":[...]} for raw bytes, Base64 data, and an embedded message.
 *
 * @param {unknown} value Field value.
 * @param {string} label Field-specific label for errors.
 * @returns {{bytes: Uint8Array}|{error: string}}
 */
function encodeLengthDelimitedValue(value, label) {
  if (typeof value === 'string') return { bytes: new TextEncoder().encode(value) };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: `${label} must be text or an object with hex, base64, or fields.` };
  }
  if (typeof value.hex === 'string') return parseHex(value.hex);
  if (typeof value.base64 === 'string') return parseBase64(value.base64);
  if (Array.isArray(value.fields)) return encodeProtobufFields(value.fields);
  return { error: `${label} must have a hex, base64, or fields property.` };
}

/**
 * Extracts the lossless raw interpretation from a protobuf decoder field.
 *
 * @param {object} definition Decoder-style field definition.
 * @param {number} wireType Resolved protobuf wire type.
 * @param {string} label Field-specific label for errors.
 * @returns {{value: unknown}|{error: string}}
 */
function resolveFieldValue(definition, wireType, label) {
  if (Object.hasOwn(definition, 'value')) return { value: definition.value };
  const interpretations = definition.interpretations;
  if (!interpretations || typeof interpretations !== 'object') {
    return { error: `${label} must include a value.` };
  }

  const valueKey = {
    0: 'uint64',
    1: 'fixed64',
    2: 'rawHex',
    5: 'fixed32',
  }[wireType];
  const rawValue = interpretations[valueKey];
  if (rawValue === undefined) {
    return { error: `${label} must include a value or a decoder interpretation.` };
  }
  return wireType === 2 ? { value: { hex: rawValue } } : { value: rawValue };
}

/**
 * Encodes one schema-less protobuf field definition without throwing.
 *
 * Supported field keys are field (or fieldNumber), wireType, and value.
 *
 * @param {unknown} definition Field definition.
 * @param {number} index Zero-based index used in error messages.
 * @returns {{bytes: Uint8Array}|{error: string}}
 */
export function encodeProtobufField(definition, index = 0) {
  const fieldLabel = `Field ${index + 1}`;
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    return { error: `${fieldLabel} must be an object.` };
  }

  const rawNumber = definition.field ?? definition.fieldNumber ?? definition.number;
  const numberResult = parseUnsignedInteger(
    rawNumber,
    `${fieldLabel} number`,
    BigInt(MAX_FIELD_NUMBER),
  );
  if ('error' in numberResult || numberResult.value === 0n) {
    return 'error' in numberResult
      ? numberResult
      : { error: `${fieldLabel} number must be between 1 and ${MAX_FIELD_NUMBER}.` };
  }

  const rawWireType = definition.wireType ?? definition.type;
  const wireType = Number.isInteger(rawWireType)
    ? rawWireType
    : WIRE_TYPES.get(String(rawWireType ?? '').toLowerCase());
  if (wireType === undefined) {
    return {
      error: `${fieldLabel} wireType must be varint, 64-bit, length-delimited, or 32-bit.`,
    };
  }
  if (![0, 1, 2, 5].includes(wireType)) {
    return {
      error: `${fieldLabel} wireType must be varint, 64-bit, length-delimited, or 32-bit.`,
    };
  }
  const valueLabel = `${fieldLabel} value`;
  const valueResult = resolveFieldValue(definition, wireType, valueLabel);
  if ('error' in valueResult) return valueResult;

  const tag = encodeVarint((numberResult.value << 3n) | BigInt(wireType));
  let valueBytes;
  if (wireType === 0) {
    const parsed = parseUnsignedInteger(valueResult.value, valueLabel, (1n << 64n) - 1n);
    if ('error' in parsed) return parsed;
    valueBytes = encodeVarint(parsed.value);
  } else if (wireType === 2) {
    const parsed = encodeLengthDelimitedValue(valueResult.value, valueLabel);
    if ('error' in parsed) return parsed;
    valueBytes = [...encodeVarint(BigInt(parsed.bytes.length)), ...parsed.bytes];
  } else {
    const width = wireType === 1 ? 8 : 4;
    const parsed = parseUnsignedInteger(
      valueResult.value,
      valueLabel,
      (1n << BigInt(width * 8)) - 1n,
    );
    if ('error' in parsed) return parsed;
    valueBytes = Array.from({ length: width }, (_, offset) =>
      Number((parsed.value >> BigInt(offset * 8)) & 0xffn),
    );
  }
  return { bytes: Uint8Array.from([...tag, ...valueBytes]) };
}

/**
 * Encodes a sequence of protobuf field definitions, preserving repeated fields.
 *
 * @param {unknown[]} fields Field definitions.
 * @returns {{bytes: Uint8Array}|{error: string}}
 */
export function encodeProtobufFields(fields) {
  const output = [];
  for (let index = 0; index < fields.length; index += 1) {
    const result = encodeProtobufField(fields[index], index);
    if ('error' in result) return result;
    output.push(...result.bytes);
  }
  return { bytes: Uint8Array.from(output) };
}

/**
 * Formats raw protobuf bytes for display and copy.
 *
 * @param {Uint8Array} bytes Encoded protobuf bytes.
 * @returns {{hex: string, base64: string, base64url: string}}
 */
export function formatProtobufBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return {
    hex: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' '),
    base64,
    base64url: base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  };
}

/**
 * Parses and encodes JSON field definitions, returning errors for UI display.
 *
 * @param {string} input JSON text entered by the user.
 * @returns {{bytes: Uint8Array, hex: string, base64: string, base64url: string}|{error: string}}
 */
export function encodeProtobufJson(input) {
  const parsed = parseProtobufFields(input);
  if ('error' in parsed) return parsed;
  const encoded = encodeProtobufFields(parsed.fields);
  if ('error' in encoded) return encoded;
  return { bytes: encoded.bytes, ...formatProtobufBytes(encoded.bytes) };
}
