const SECTION_NAMES = {
  0: 'Custom',
  1: 'Type',
  2: 'Import',
  3: 'Function',
  4: 'Table',
  5: 'Memory',
  6: 'Global',
  7: 'Export',
  8: 'Start',
  9: 'Element',
  10: 'Code',
  11: 'Data',
};

const EXTERNAL_KINDS = ['function', 'table', 'memory', 'global'];
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function parseError(message) {
  return new Error(`Invalid WebAssembly module: ${message}`);
}

function toByteArray(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError('WebAssembly data must be an ArrayBuffer or byte array.');
}

function ensureAvailable(cursor, end, count, description) {
  if (count > end - cursor.offset) {
    throw parseError(`truncated ${description}.`);
  }
}

function readByte(bytes, cursor, end, description) {
  ensureAvailable(cursor, end, 1, description);
  const value = bytes[cursor.offset];
  cursor.offset += 1;
  return value;
}

function readUnsignedLeb128(bytes, cursor, end, description) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = readByte(bytes, cursor, end, description);
    value += (byte & 0x7f) * (2 ** (index * 7));
    if ((byte & 0x80) === 0) {
      if (index === 4 && byte > 0x0f) {
        throw parseError(`overflowing ${description}.`);
      }
      return value;
    }
  }
  throw parseError(`malformed ${description}.`);
}

function readName(bytes, cursor, end, description) {
  const length = readUnsignedLeb128(bytes, cursor, end, `${description} length`);
  ensureAvailable(cursor, end, length, description);
  let value;
  try {
    value = textDecoder.decode(bytes.subarray(cursor.offset, cursor.offset + length));
  } catch {
    throw parseError(`invalid UTF-8 ${description}.`);
  }
  cursor.offset += length;
  return value;
}

function ensureVectorCanFit(cursor, end, count, minimumItemSize, description) {
  if (count > Math.floor((end - cursor.offset) / minimumItemSize)) {
    throw parseError(`truncated ${description}.`);
  }
}

function skipLimits(bytes, cursor, end) {
  const flags = readUnsignedLeb128(bytes, cursor, end, 'limits flags');
  if (flags > 3) throw parseError('invalid limits flags.');
  readUnsignedLeb128(bytes, cursor, end, 'minimum limit');
  if ((flags & 1) !== 0) readUnsignedLeb128(bytes, cursor, end, 'maximum limit');
}

function skipImportDescription(bytes, cursor, end, kind) {
  if (kind === 0) {
    readUnsignedLeb128(bytes, cursor, end, 'function type index');
  } else if (kind === 1) {
    readByte(bytes, cursor, end, 'table reference type');
    skipLimits(bytes, cursor, end);
  } else if (kind === 2) {
    skipLimits(bytes, cursor, end);
  } else if (kind === 3) {
    readByte(bytes, cursor, end, 'global value type');
    const mutable = readByte(bytes, cursor, end, 'global mutability');
    if (mutable > 1) throw parseError('invalid global mutability.');
  } else {
    throw parseError('unknown import kind.');
  }
}

function parseImports(bytes, cursor, end) {
  const count = readUnsignedLeb128(bytes, cursor, end, 'import count');
  // Every import has two length fields, a kind, and at least one descriptor byte.
  ensureVectorCanFit(cursor, end, count, 4, 'import entries');
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const moduleName = readName(bytes, cursor, end, 'import module name');
    const name = readName(bytes, cursor, end, 'import name');
    const kind = readByte(bytes, cursor, end, 'import kind');
    skipImportDescription(bytes, cursor, end, kind);
    entries.push({ name: `${moduleName}.${name}`, kind: EXTERNAL_KINDS[kind] });
  }
  return { count, entries };
}

function parseExports(bytes, cursor, end) {
  const count = readUnsignedLeb128(bytes, cursor, end, 'export count');
  // Every export has a name length, a kind, and an index, even with an empty name.
  ensureVectorCanFit(cursor, end, count, 3, 'export entries');
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const name = readName(bytes, cursor, end, 'export name');
    const kind = readByte(bytes, cursor, end, 'export kind');
    if (kind > 3) throw parseError('unknown export kind.');
    readUnsignedLeb128(bytes, cursor, end, 'export index');
    entries.push({ name, kind: EXTERNAL_KINDS[kind] });
  }
  return { count, entries };
}

function parseSectionPayload(id, bytes, cursor, end) {
  if (id === 0 || id === 8) return {};
  if (id === 2) return parseImports(bytes, cursor, end);
  if (id === 7) return parseExports(bytes, cursor, end);
  return { count: readUnsignedLeb128(bytes, cursor, end, 'section item count') };
}

/**
 * Parses the header and top-level sections of a WebAssembly binary module.
 *
 * @param {ArrayBuffer|Uint8Array} input - Raw WebAssembly module bytes.
 * @returns {{version: number, sections: Array<object>}} Parsed module metadata.
 * @throws {Error} When the module is malformed, truncated, or unsupported.
 */
export function parseWasmModule(input) {
  const bytes = toByteArray(input);
  if (bytes.length < 8) throw parseError('truncated module header.');
  if (bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    throw new Error('Not a WebAssembly file: expected the \\0asm magic number.');
  }
  const version = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
  if (version !== 1) {
    throw new Error(`Unsupported WebAssembly version ${version}. Only version 1 is supported.`);
  }

  const cursor = { offset: 8 };
  const sections = [];
  while (cursor.offset < bytes.length) {
    const offset = cursor.offset;
    const id = readByte(bytes, cursor, bytes.length, 'section id');
    const byteSize = readUnsignedLeb128(bytes, cursor, bytes.length, 'section size');
    const payloadOffset = cursor.offset;
    if (id > 11) throw parseError(`unknown section id ${id}.`);
    ensureAvailable(cursor, bytes.length, byteSize, 'section payload');
    const end = payloadOffset + byteSize;
    const details = parseSectionPayload(id, bytes, cursor, end);
    if (cursor.offset > end) throw parseError('section payload exceeds its declared size.');
    cursor.offset = end;
    sections.push({ id, name: SECTION_NAMES[id], offset, byteSize, ...details });
  }
  return { version, sections };
}
