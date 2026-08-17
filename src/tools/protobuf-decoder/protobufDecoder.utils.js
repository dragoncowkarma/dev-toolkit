export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_RECURSION_DEPTH = 32;

const UINT64_MASK = (1n << 64n) - 1n;
const INT64_SIGN = 1n << 63n;

/**
 * Converts bytes to lowercase hexadecimal without separators.
 * @param {Uint8Array} bytes Bytes to format.
 * @returns {string} Hexadecimal representation.
 */
export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Parses a hexadecimal payload with tolerated whitespace, colons, hyphens, and a 0x prefix.
 * @param {string} input Raw user input.
 * @returns {{bytes: Uint8Array}|{error: string}} Parsed bytes or a specific error.
 */
export function parseHexPayload(input) {
  const compact = input.replace(/[\s:-]/g, '');
  const value = compact.startsWith('0x') || compact.startsWith('0X') ? compact.slice(2) : compact;

  if (!value) return { error: 'Hex input is empty.' };
  if (!/^[0-9a-fA-F]+$/.test(value)) {
    return { error: 'Hex input contains non-hexadecimal characters.' };
  }
  if (value.length % 2 !== 0) return { error: 'Hex input has an odd number of digits.' };

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return { bytes };
}

/**
 * Parses standard Base64 or Base64url input, with optional padding and whitespace.
 * @param {string} input Raw user input.
 * @returns {{bytes: Uint8Array}|{error: string}} Parsed bytes or a specific error.
 */
export function parseBase64Payload(input) {
  const compact = input.replace(/\s/g, '');
  if (!compact) return { error: 'Base64 input is empty.' };
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(compact)) {
    return { error: 'Base64 input contains invalid characters.' };
  }

  const paddingIndex = compact.indexOf('=');
  if (paddingIndex !== -1 && compact.length % 4 !== 0) {
    return { error: 'Base64 input has invalid padding.' };
  }
  const unpadded = compact.replace(/=+$/, '');
  if (unpadded.length % 4 === 1) return { error: 'Base64 input has an invalid length.' };

  const normalized = `${unpadded.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat(
    (4 - (unpadded.length % 4)) % 4,
  )}`;
  try {
    const binary = atob(normalized);
    return { bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
  } catch {
    return { error: 'Base64 input is malformed.' };
  }
}

/**
 * Parses a payload using an explicit or deterministic automatically selected transport format.
 * Auto selects hexadecimal when its tolerated separators leave only hexadecimal digits; it selects
 * Base64 otherwise. This makes an ambiguous value such as "deadbeef" consistently hexadecimal.
 * @param {string} input Raw user input.
 * @param {'auto'|'hex'|'base64'} selectedFormat Format selected by the user.
 * @returns {{bytes: Uint8Array, format: 'hex'|'base64'}|{error: string, format: 'hex'|'base64'}}
 * Parsed bytes or a specific error with the resolved format.
 */
export function parsePayload(input, selectedFormat = 'auto') {
  const compactHex = input.replace(/[\s:-]/g, '');
  const hexCandidate = compactHex.replace(/^0x/i, '');
  const resolvedFormat = selectedFormat === 'auto'
    ? (/^[0-9a-fA-F]*$/.test(hexCandidate) ? 'hex' : 'base64')
    : selectedFormat;
  const result = resolvedFormat === 'hex' ? parseHexPayload(input) : parseBase64Payload(input);

  return { ...result, format: resolvedFormat };
}

function errorAt(offset, message) {
  return { error: `${message} at byte offset ${offset}.`, offset };
}

function readVarint(bytes, startOffset) {
  let value = 0n;
  for (let byteIndex = 0; byteIndex < 10; byteIndex += 1) {
    const offset = startOffset + byteIndex;
    if (offset >= bytes.length) return errorAt(offset, 'Truncated varint');
    const byte = bytes[offset];
    if (byteIndex === 9 && byte > 1) return errorAt(offset, 'Overlong varint');
    value |= BigInt(byte & 0x7f) << BigInt(byteIndex * 7);
    if ((byte & 0x80) === 0) return { value, nextOffset: offset + 1 };
  }

  const overflowOffset = startOffset + 10;
  if (overflowOffset < bytes.length && (bytes[overflowOffset] & 0x80) !== 0) {
    return errorAt(overflowOffset, 'Overlong varint (more than 10 bytes)');
  }
  return errorAt(overflowOffset, 'Truncated or overlong varint');
}

function unsignedLittleEndian(bytes) {
  let value = 0n;
  for (let index = 0; index < bytes.length; index += 1) {
    value |= BigInt(bytes[index]) << BigInt(index * 8);
  }
  return value;
}

function signed64(value) {
  return value & INT64_SIGN ? value - (1n << 64n) : value;
}

function signed32(value) {
  return value & 0x80000000 ? value - 0x100000000 : value;
}

function decodeFields(bytes, depth, maxDepth) {
  if (depth > maxDepth) return errorAt(0, `Maximum recursion depth (${maxDepth}) exceeded`);
  const fields = [];
  let offset = 0;

  while (offset < bytes.length) {
    const fieldOffset = offset;
    const tag = readVarint(bytes, offset);
    if ('error' in tag) return tag;
    offset = tag.nextOffset;
    const fieldNumberBigInt = tag.value >> 3n;
    const wireType = Number(tag.value & 7n);
    if (fieldNumberBigInt === 0n) return errorAt(fieldOffset, 'Invalid field number 0');
    if (fieldNumberBigInt > 536870911n) {
      return errorAt(fieldOffset, 'Field number exceeds protobuf maximum');
    }
    if (wireType === 3 || wireType === 4) {
      return errorAt(fieldOffset, `Unsupported deprecated group wire type ${wireType}`);
    }
    if (wireType === 6 || wireType === 7) {
      return errorAt(fieldOffset, `Invalid wire type ${wireType}`);
    }

    const field = {
      fieldNumber: Number(fieldNumberBigInt),
      wireType,
      wireTypeName: ['VARINT', 'I64', 'LEN', 'SGROUP', 'EGROUP', 'I32'][wireType],
      offset: fieldOffset,
      interpretations: {},
    };

    if (wireType === 0) {
      const value = readVarint(bytes, offset);
      if ('error' in value) return value;
      offset = value.nextOffset;
      const unsigned = value.value & UINT64_MASK;
      field.interpretations = {
        uint64: unsigned.toString(),
        int64: signed64(unsigned).toString(),
        sint64: ((unsigned >> 1n) ^ -(unsigned & 1n)).toString(),
      };
    } else if (wireType === 1) {
      if (offset + 8 > bytes.length) return errorAt(offset, 'Truncated I64 value');
      const valueBytes = bytes.slice(offset, offset + 8);
      const value = unsignedLittleEndian(valueBytes);
      const view = new DataView(valueBytes.buffer, valueBytes.byteOffset, valueBytes.byteLength);
      field.interpretations = {
        fixed64: value.toString(),
        sfixed64: signed64(value).toString(),
        double: String(view.getFloat64(0, true)),
      };
      offset += 8;
    } else if (wireType === 5) {
      if (offset + 4 > bytes.length) return errorAt(offset, 'Truncated I32 value');
      const valueBytes = bytes.slice(offset, offset + 4);
      const view = new DataView(valueBytes.buffer, valueBytes.byteOffset, valueBytes.byteLength);
      const value = view.getUint32(0, true);
      field.interpretations = {
        fixed32: String(value),
        sfixed32: String(signed32(value)),
        float: String(view.getFloat32(0, true)),
      };
      offset += 4;
    } else if (wireType === 2) {
      const length = readVarint(bytes, offset);
      if ('error' in length) return length;
      offset = length.nextOffset;
      if (length.value > BigInt(bytes.length - offset)) {
        return errorAt(
          offset,
          `Length-delimited value overruns the buffer (length ${length.value})`,
        );
      }
      const lengthNumber = Number(length.value);
      const valueBytes = bytes.slice(offset, offset + lengthNumber);
      offset += lengthNumber;
      field.interpretations.rawHex = bytesToHex(valueBytes);

      try {
        field.interpretations.string = new TextDecoder('utf-8', { fatal: true }).decode(valueBytes);
      } catch {
        // Invalid UTF-8 is a normal ambiguity, not an error in the protobuf payload.
      }
      const nested = decodeFields(valueBytes, depth + 1, maxDepth);
      if (!('error' in nested)) field.interpretations.submessage = nested.fields;
      if ('error' in nested && nested.error.includes('Maximum recursion depth')) return nested;
      field.bestGuess = field.interpretations.submessage?.length
        ? 'submessage'
        : ('string' in field.interpretations ? 'string' : 'rawHex');
    }
    fields.push(field);
  }

  return { fields };
}

/**
 * Decodes raw Protocol Buffers wire-format bytes without requiring a schema. It never throws.
 * @param {Uint8Array} bytes Payload to decode.
 * @param {{maxDepth?: number, maxInputBytes?: number}} options Safety limits.
 * @returns {{fields: Array<object>}|{error: string, offset: number}} Decoded tree or error.
 */
export function decodeProtobuf(bytes, options = {}) {
  try {
    if (!(bytes instanceof Uint8Array)) return errorAt(0, 'Payload must be a Uint8Array');
    const maxInputBytes = options.maxInputBytes ?? MAX_INPUT_BYTES;
    const maxDepth = options.maxDepth ?? MAX_RECURSION_DEPTH;
    if (bytes.length > maxInputBytes) {
      return errorAt(0, `Payload too large (${bytes.length} bytes; limit ${maxInputBytes})`);
    }
    return decodeFields(bytes, 0, maxDepth);
  } catch {
    return errorAt(0, 'Unable to decode protobuf payload');
  }
}

/**
 * Formats a decoded field tree into readable plain text for clipboard copying.
 * @param {Array<object>} fields Decoded field tree.
 * @returns {string} Plain-text tree.
 */
export function formatDecodedTree(fields) {
  function format(items, indent) {
    return items.flatMap((field) => {
      const prefix = ' '.repeat(indent);
      const lines = [
        `${prefix}Field ${field.fieldNumber} ${field.wireTypeName} (offset ${field.offset})`,
      ];
      Object.entries(field.interpretations).forEach(([name, value]) => {
        if (name === 'submessage') {
          lines.push(`${prefix}  submessage:`);
          lines.push(...format(value, indent + 4));
        } else {
          lines.push(`${prefix}  ${name}=${JSON.stringify(value)}`);
        }
      });
      return lines;
    });
  }
  return format(fields, 0).join('\n');
}
