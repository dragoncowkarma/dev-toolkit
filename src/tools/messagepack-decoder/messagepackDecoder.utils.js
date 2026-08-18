export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_RECURSION_DEPTH = 32;

/**
 * Converts bytes to lower-case hexadecimal without separators.
 * @param {Uint8Array} bytes Bytes to format.
 * @returns {string} Hexadecimal representation.
 */
export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Parses hexadecimal input with a 0x prefix, whitespace, colons, and hyphens allowed.
 * @param {string} input Raw user input.
 * @returns {{bytes: Uint8Array}|{error: string}} Parsed bytes or a specific error.
 */
export function parseHexPayload(input) {
  const compact = input.replace(/[\s:-]/g, '');
  const value = compact.replace(/^0x/i, '');
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
 * Parses standard Base64 or Base64url input with optional padding.
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
 * Parses an explicitly selected or deterministically auto-selected transport format.
 * @param {string} input Raw user input.
 * @param {'auto'|'hex'|'base64'} selectedFormat User-selected format.
 * @returns {{bytes: Uint8Array, format: 'hex'|'base64'}|{error: string, format: 'hex'|'base64'}}
 * Parsed bytes or a specific error and the resolved format.
 */
export function parsePayload(input, selectedFormat = 'auto') {
  const hexCandidate = input.replace(/[\s:-]/g, '').replace(/^0x/i, '');
  const format = selectedFormat === 'auto'
    ? (/^[0-9a-fA-F]*$/.test(hexCandidate) ? 'hex' : 'base64')
    : selectedFormat;
  const parsed = format === 'hex' ? parseHexPayload(input) : parseBase64Payload(input);
  return { ...parsed, format };
}

function errorAt(offset, message) {
  return { error: `${message} at byte offset ${offset}.`, offset };
}

function readUnsigned(bytes, offset, size, label) {
  if (offset + size > bytes.length) return errorAt(offset, `Truncated ${label}`);
  let value = 0n;
  for (let index = 0; index < size; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  return { value, nextOffset: offset + size };
}

function signedValue(value, bits) {
  const signBit = 1n << BigInt(bits - 1);
  return value & signBit ? value - (1n << BigInt(bits)) : value;
}

function payloadBytes(bytes, offset, length, label) {
  if (length > bytes.length - offset) {
    return errorAt(offset, `${label} overruns the buffer (length ${length})`);
  }
  return { value: bytes.slice(offset, offset + length), nextOffset: offset + length };
}

function containerFits(bytes, offset, count, valuesPerItem, label) {
  if (count > Math.floor((bytes.length - offset) / valuesPerItem)) {
    return errorAt(offset, `${label} count ${count} overruns the buffer`);
  }
  return null;
}

function timestampValue(payload) {
  let seconds;
  let nanoseconds = 0n;
  if (payload.length === 4) {
    seconds = readUnsigned(payload, 0, 4, 'timestamp seconds').value;
  } else if (payload.length === 8) {
    const packed = readUnsigned(payload, 0, 8, 'timestamp').value;
    nanoseconds = packed >> 34n;
    seconds = packed & ((1n << 34n) - 1n);
  } else if (payload.length === 12) {
    nanoseconds = readUnsigned(payload, 0, 4, 'timestamp nanoseconds').value;
    seconds = signedValue(readUnsigned(payload, 4, 8, 'timestamp seconds').value, 64);
  } else {
    return `Invalid timestamp payload length ${payload.length}`;
  }

  const milliseconds = seconds * 1000n + nanoseconds / 1000000n;
  const maxDateMilliseconds = 8640000000000000n;
  if (milliseconds < -maxDateMilliseconds || milliseconds > maxDateMilliseconds) {
    return `UTC timestamp outside JavaScript Date range (seconds ${seconds}, ns ${nanoseconds})`;
  }
  return new Date(Number(milliseconds)).toISOString();
}

function decodeString(valueBytes) {
  try {
    return { value: new TextDecoder('utf-8', { fatal: true }).decode(valueBytes) };
  } catch {
    return { value: `Invalid UTF-8 (raw hex: ${bytesToHex(valueBytes)})`, invalidUtf8: true };
  }
}

function decodeArray(bytes, valueOffset, offset, count, depth, limits, format) {
  const fitError = containerFits(bytes, offset, count, 1, 'Array');
  if (fitError) return fitError;
  const children = [];
  let nextOffset = offset;
  for (let index = 0; index < count; index += 1) {
    const child = decodeValue(bytes, nextOffset, depth + 1, limits);
    if ('error' in child) return child;
    children.push(child.node);
    nextOffset = child.nextOffset;
  }
  const node = { type: 'array', offset: valueOffset, format, value: `${count} items`, children };
  return { node, nextOffset };
}

function decodeMap(bytes, valueOffset, offset, count, depth, limits, format) {
  const fitError = containerFits(bytes, offset, count, 2, 'Map');
  if (fitError) return fitError;
  const entries = [];
  let nextOffset = offset;
  for (let index = 0; index < count; index += 1) {
    const key = decodeValue(bytes, nextOffset, depth + 1, limits);
    if ('error' in key) return key;
    const value = decodeValue(bytes, key.nextOffset, depth + 1, limits);
    if ('error' in value) return value;
    entries.push({ key: key.node, value: value.node });
    nextOffset = value.nextOffset;
  }
  const node = { type: 'map', offset: valueOffset, format, value: `${count} entries`, entries };
  return { node, nextOffset };
}

function decodeExtension(bytes, valueOffset, offset, length, format) {
  const extension = payloadBytes(bytes, offset, length + 1, 'Extension payload');
  if ('error' in extension) return extension;
  const view = new DataView(extension.value.buffer, extension.value.byteOffset, 1);
  const extensionType = view.getInt8(0);
  const payload = extension.value.slice(1);
  const node = {
    type: 'ext',
    offset: valueOffset,
    format,
    value: `type ${extensionType}, raw hex ${bytesToHex(payload)}`,
    extensionType,
    rawHex: bytesToHex(payload),
  };
  if (extensionType === -1) node.timestamp = timestampValue(payload);
  return { node, nextOffset: extension.nextOffset };
}

function decodeLengthPrefixed(bytes, offset, lengthSize, label) {
  const length = readUnsigned(bytes, offset, lengthSize, `${label} length`);
  if ('error' in length) return length;
  if (length.value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return errorAt(offset, `${label} length exceeds safe browser limits`);
  }
  return { length: Number(length.value), nextOffset: length.nextOffset };
}

function decodeValue(bytes, offset, depth, limits) {
  if (depth > limits.maxDepth) {
    return errorAt(offset, `Maximum recursion depth (${limits.maxDepth}) exceeded`);
  }
  if (offset >= bytes.length) return errorAt(offset, 'Truncated MessagePack value');
  const formatByte = bytes[offset];
  const format = `0x${formatByte.toString(16).padStart(2, '0')}`;
  const primitive = (type, value, nextOffset, extra = {}) => ({
    node: { type, offset, format, value: String(value), ...extra },
    nextOffset,
  });

  if (formatByte <= 0x7f) {
    return primitive('uint', formatByte, offset + 1, { formatName: 'positive fixint' });
  }
  if (formatByte >= 0xe0) {
    return primitive('int', formatByte - 256, offset + 1, { formatName: 'negative fixint' });
  }
  if (formatByte >= 0xa0 && formatByte <= 0xbf) {
    const length = formatByte & 0x1f;
    const payload = payloadBytes(bytes, offset + 1, length, 'String payload');
    if ('error' in payload) return payload;
    const string = decodeString(payload.value);
    return primitive('str', string.value, payload.nextOffset, {
      formatName: 'fixstr', rawHex: bytesToHex(payload.value), ...string,
    });
  }
  if (formatByte >= 0x90 && formatByte <= 0x9f) {
    return decodeArray(bytes, offset, offset + 1, formatByte & 0x0f, depth, limits, 'fixarray');
  }
  if (formatByte >= 0x80 && formatByte <= 0x8f) {
    return decodeMap(bytes, offset, offset + 1, formatByte & 0x0f, depth, limits, 'fixmap');
  }

  if (formatByte === 0xc0) return primitive('nil', 'null', offset + 1);
  if (formatByte === 0xc1) {
    return errorAt(offset, 'Reserved MessagePack format byte 0xc1 is not valid');
  }
  if (formatByte === 0xc2 || formatByte === 0xc3) {
    return primitive('bool', formatByte === 0xc3, offset + 1);
  }

  const fixedLengths = { 0xd4: 1, 0xd5: 2, 0xd6: 4, 0xd7: 8, 0xd8: 16 };
  if (formatByte in fixedLengths) {
    return decodeExtension(
      bytes,
      offset,
      offset + 1,
      fixedLengths[formatByte],
      `fixext${fixedLengths[formatByte]}`,
    );
  }

  const integerFormats = {
    0xcc: ['uint', 1, false, 'uint8'], 0xcd: ['uint', 2, false, 'uint16'],
    0xce: ['uint', 4, false, 'uint32'], 0xcf: ['uint', 8, false, 'uint64'],
    0xd0: ['int', 1, true, 'int8'], 0xd1: ['int', 2, true, 'int16'],
    0xd2: ['int', 4, true, 'int32'], 0xd3: ['int', 8, true, 'int64'],
  };
  if (formatByte in integerFormats) {
    const [type, size, signed, formatName] = integerFormats[formatByte];
    const raw = readUnsigned(bytes, offset + 1, size, formatName);
    if ('error' in raw) return raw;
    const value = signed ? signedValue(raw.value, size * 8) : raw.value;
    return primitive(type, value, raw.nextOffset, { formatName });
  }

  if (formatByte === 0xca || formatByte === 0xcb) {
    const size = formatByte === 0xca ? 4 : 8;
    const raw = payloadBytes(bytes, offset + 1, size, 'Float payload');
    if ('error' in raw) return raw;
    const view = new DataView(raw.value.buffer, raw.value.byteOffset, raw.value.byteLength);
    const type = size === 4 ? 'float32' : 'float64';
    return primitive(type, size === 4 ? view.getFloat32(0) : view.getFloat64(0), raw.nextOffset);
  }

  const lengthFormats = {
    0xc4: ['bin', 1, 'bin8'], 0xc5: ['bin', 2, 'bin16'], 0xc6: ['bin', 4, 'bin32'],
    0xc7: ['ext', 1, 'ext8'], 0xc8: ['ext', 2, 'ext16'], 0xc9: ['ext', 4, 'ext32'],
    0xd9: ['str', 1, 'str8'], 0xda: ['str', 2, 'str16'], 0xdb: ['str', 4, 'str32'],
    0xdc: ['array', 2, 'array16'], 0xdd: ['array', 4, 'array32'],
    0xde: ['map', 2, 'map16'], 0xdf: ['map', 4, 'map32'],
  };
  const descriptor = lengthFormats[formatByte];
  if (!descriptor) return errorAt(offset, `Unsupported MessagePack format byte ${format}`);
  const [type, lengthSize, formatName] = descriptor;
  const length = decodeLengthPrefixed(bytes, offset + 1, lengthSize, formatName);
  if ('error' in length) return length;
  if (type === 'array') {
    return decodeArray(bytes, offset, length.nextOffset, length.length, depth, limits, formatName);
  }
  if (type === 'map') {
    return decodeMap(bytes, offset, length.nextOffset, length.length, depth, limits, formatName);
  }
  if (type === 'ext') {
    return decodeExtension(bytes, offset, length.nextOffset, length.length, formatName);
  }
  const payload = payloadBytes(bytes, length.nextOffset, length.length, `${type} payload`);
  if ('error' in payload) return payload;
  if (type === 'bin') {
    const rawHex = bytesToHex(payload.value);
    return primitive('bin', rawHex, payload.nextOffset, { formatName, rawHex });
  }
  const string = decodeString(payload.value);
  return primitive('str', string.value, payload.nextOffset, {
    formatName,
    rawHex: bytesToHex(payload.value),
    ...string,
  });
}

/**
 * Decodes a self-describing MessagePack value without throwing.
 * @param {Uint8Array} bytes MessagePack payload.
 * @param {{maxDepth?: number, maxInputBytes?: number}} options Safety limits.
 * @returns {{node: object}|{error: string, offset: number}} Decoded tree or a precise error.
 */
export function decodeMessagePack(bytes, options = {}) {
  try {
    if (!(bytes instanceof Uint8Array)) return errorAt(0, 'Payload must be a Uint8Array');
    const maxInputBytes = options.maxInputBytes ?? MAX_INPUT_BYTES;
    const maxDepth = options.maxDepth ?? MAX_RECURSION_DEPTH;
    if (bytes.length === 0) return errorAt(0, 'MessagePack payload is empty');
    if (bytes.length > maxInputBytes) {
      return errorAt(0, `Payload too large (${bytes.length} bytes; limit ${maxInputBytes})`);
    }
    const decoded = decodeValue(bytes, 0, 0, { maxDepth });
    if ('error' in decoded) return decoded;
    if (decoded.nextOffset !== bytes.length) {
      return errorAt(decoded.nextOffset, 'Trailing bytes remain after the top-level value');
    }
    return { node: decoded.node };
  } catch {
    return errorAt(0, 'Unable to decode MessagePack payload');
  }
}

/**
 * Formats a decoded MessagePack tree as readable plain text.
 * @param {object} node Decoded tree root.
 * @returns {string} Plain-text representation.
 */
export function formatDecodedTree(node) {
  function format(current, indent) {
    const prefix = ' '.repeat(indent);
    const details = current.timestamp ? `; timestamp ${current.timestamp}` : '';
    const lines = [`${prefix}${current.type} (byte ${current.offset}): ${current.value}${details}`];
    if (current.children) {
      current.children.forEach((child) => lines.push(...format(child, indent + 2)));
    }
    if (current.entries) current.entries.forEach((entry, index) => {
      lines.push(`${prefix}  entry ${index}: key`);
      lines.push(...format(entry.key, indent + 4));
      lines.push(`${prefix}  entry ${index}: value`);
      lines.push(...format(entry.value, indent + 4));
    });
    return lines;
  }
  return format(node, 0).join('\n');
}
