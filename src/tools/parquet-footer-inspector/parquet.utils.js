/* eslint-disable max-len */
const COMPACT_TYPES = {
  STOP: 0,
  TRUE: 1,
  FALSE: 2,
  BYTE: 3,
  I16: 4,
  I32: 5,
  I64: 6,
  DOUBLE: 7,
  BINARY: 8,
  LIST: 9,
  SET: 10,
  MAP: 11,
  STRUCT: 12,
};

const TYPES = ['BOOLEAN', 'INT32', 'INT64', 'INT96', 'FLOAT', 'DOUBLE', 'BYTE_ARRAY', 'FIXED_LEN_BYTE_ARRAY'];
const REPETITIONS = ['REQUIRED', 'OPTIONAL', 'REPEATED'];
const CODECS = ['UNCOMPRESSED', 'SNAPPY', 'GZIP', 'LZO', 'BROTLI', 'LZ4', 'ZSTD', 'LZ4_RAW'];
const ENCODINGS = ['PLAIN', 'PLAIN_DICTIONARY', 'RLE', 'BIT_PACKED', 'DELTA_BINARY_PACKED', 'DELTA_LENGTH_BYTE_ARRAY', 'DELTA_BYTE_ARRAY', 'RLE_DICTIONARY', 'BYTE_STREAM_SPLIT'];

class FooterError extends Error {}

class CompactReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
    this.decoder = new TextDecoder('utf-8', { fatal: true });
  }

  byte(label) {
    if (this.offset >= this.bytes.length) throw new FooterError(`Truncated ${label}.`);
    return this.bytes[this.offset++];
  }

  varint(label) {
    let value = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      const next = this.byte(label);
      value |= BigInt(next & 0x7f) << shift;
      if (!(next & 0x80)) return value;
    }
    throw new FooterError(`Malformed ${label} varint.`);
  }

  integer(label) {
    const value = this.varint(label);
    return (value >> 1n) ^ (-(value & 1n));
  }

  number(label) {
    const value = this.integer(label);
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      return value.toString();
    }
    return Number(value);
  }

  binary(label) {
    const length = Number(this.varint(`${label} length`));
    if (!Number.isSafeInteger(length) || length > this.bytes.length - this.offset) {
      throw new FooterError(`Truncated ${label}.`);
    }
    const value = this.decoder.decode(this.bytes.slice(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }
}

function fieldHeader(reader, previousId, label) {
  const header = reader.byte(label);
  if (header === COMPACT_TYPES.STOP) return null;
  const delta = header >> 4;
  return {
    id: delta ? previousId + delta : Number(reader.varint(`${label} field id`)),
    type: header & 0x0f,
  };
}

function list(reader, label, item) {
  const header = reader.byte(`${label} list header`);
  let size = header >> 4;
  const type = header & 0x0f;
  if (size === 15) size = Number(reader.varint(`${label} list length`));
  if (!Number.isSafeInteger(size) || size > 100000) throw new FooterError(`Invalid ${label} list length.`);
  return Array.from({ length: size }, () => item(type));
}

function skip(reader, type, label) {
  if (type === COMPACT_TYPES.TRUE || type === COMPACT_TYPES.FALSE) return;
  if ([COMPACT_TYPES.BYTE, COMPACT_TYPES.I16, COMPACT_TYPES.I32, COMPACT_TYPES.I64].includes(type)) {
    reader.varint(label);
  } else if (type === COMPACT_TYPES.DOUBLE) {
    for (let index = 0; index < 8; index += 1) reader.byte(label);
  } else if (type === COMPACT_TYPES.BINARY) {
    reader.binary(label);
  } else if (type === COMPACT_TYPES.LIST || type === COMPACT_TYPES.SET) {
    list(reader, label, (itemType) => skip(reader, itemType, label));
  } else if (type === COMPACT_TYPES.STRUCT) {
    let previousId = 0;
    let field;
    while ((field = fieldHeader(reader, previousId, label))) {
      previousId = field.id;
      skip(reader, field.type, label);
    }
  } else if (type === COMPACT_TYPES.MAP) {
    const count = Number(reader.varint(`${label} map length`));
    if (count) {
      const kinds = reader.byte(`${label} map types`);
      for (let index = 0; index < count; index += 1) {
        skip(reader, kinds >> 4, label);
        skip(reader, kinds & 0x0f, label);
      }
    }
  } else {
    throw new FooterError(`Unsupported ${label} field type.`);
  }
}

function struct(reader, label, fields) {
  const result = {};
  let previousId = 0;
  let field;
  while ((field = fieldHeader(reader, previousId, label))) {
    previousId = field.id;
    const decode = fields[field.id];
    if (decode) result[decode[0]] = decode[1](field.type);
    else skip(reader, field.type, `${label} field ${field.id}`);
  }
  return result;
}

function enumValue(values, value) {
  return values[value] ?? `UNKNOWN (${value})`;
}

function parseSchemaElement(reader) {
  return struct(reader, 'schema element', {
    1: ['type', () => enumValue(TYPES, reader.number('schema type'))],
    3: ['repetition', () => enumValue(REPETITIONS, reader.number('schema repetition type'))],
    4: ['name', () => reader.binary('schema name')],
    5: ['children', () => reader.number('schema child count')],
  });
}

function parseColumnMetadata(reader) {
  return struct(reader, 'column metadata', {
    2: ['encodings', () => list(reader, 'encodings', () => enumValue(ENCODINGS, reader.number('encoding'))) ],
    4: ['codec', () => enumValue(CODECS, reader.number('codec'))],
    6: ['uncompressedSize', () => reader.number('uncompressed size')],
    7: ['compressedSize', () => reader.number('compressed size')],
  });
}

function parseColumnChunk(reader) {
  return struct(reader, 'column chunk', {
    3: ['metadata', () => parseColumnMetadata(reader)],
  });
}

function parseRowGroup(reader) {
  return struct(reader, 'row group', {
    1: ['columns', () => list(reader, 'column chunks', () => parseColumnChunk(reader))],
    2: ['totalByteSize', () => reader.number('row group total byte size')],
    3: ['numRows', () => reader.number('row group row count')],
  });
}

function parseKeyValue(reader) {
  return struct(reader, 'key/value metadata', {
    1: ['key', () => reader.binary('metadata key')],
    2: ['value', () => reader.binary('metadata value')],
  });
}

function schemaTree(elements) {
  let index = 0;
  function consume(depth) {
    const element = elements[index++];
    if (!element) throw new FooterError('Schema declares more children than the footer contains.');
    const childCount = Number(element.children ?? 0);
    const children = Array.from({ length: childCount }, () => consume(depth + 1));
    return { ...element, nesting: depth, children };
  }
  const root = elements.length ? consume(0) : null;
  if (index !== elements.length) throw new FooterError('Schema contains unlinked elements.');
  return root;
}

/**
 * Parses an Apache Parquet file footer without reading any column data.
 * @param {ArrayBuffer} buffer - The complete local Parquet file bytes.
 * @returns {{metadata: object|null, error: string|null, warnings: string[]}}
 */
export function parseParquetFooter(buffer) {
  const bytes = new Uint8Array(buffer);
  const result = { metadata: null, error: null, warnings: [] };
  if (bytes.length < 12) {
    result.error = 'File is too short to contain a Parquet footer.';
    return result;
  }
  const magicAt = (offset) => String.fromCharCode(...bytes.slice(offset, offset + 4)) === 'PAR1';
  if (!magicAt(0)) {
    result.error = 'Missing leading PAR1 magic bytes.';
    return result;
  }
  if (!magicAt(bytes.length - 4)) {
    result.error = 'Missing trailing PAR1 magic bytes.';
    return result;
  }
  const lengthOffset = bytes.length - 8;
  const footerLength = new DataView(buffer, lengthOffset, 4).getUint32(0, true);
  const footerStart = lengthOffset - footerLength;
  if (footerStart < 4) {
    result.error = 'Footer length points outside the file.';
    return result;
  }
  try {
    const reader = new CompactReader(bytes.slice(footerStart, lengthOffset));
    const file = struct(reader, 'file metadata', {
      1: ['version', () => reader.number('format version')],
      2: ['schemaElements', () => list(reader, 'schema', () => parseSchemaElement(reader))],
      3: ['numRows', () => reader.number('file row count')],
      4: ['rowGroups', () => list(reader, 'row groups', () => parseRowGroup(reader))],
      5: ['keyValueMetadata', () => list(reader, 'key/value metadata', () => parseKeyValue(reader))],
      6: ['createdBy', () => reader.binary('created_by')],
    });
    if (reader.offset !== reader.bytes.length) result.warnings.push('Footer has trailing metadata bytes.');
    const schema = schemaTree(file.schemaElements ?? []);
    result.metadata = {
      version: file.version,
      createdBy: file.createdBy ?? null,
      numRows: file.numRows,
      schema,
      rowGroups: (file.rowGroups ?? []).map((group) => ({
        totalByteSize: group.totalByteSize,
        numRows: group.numRows,
        columnChunks: (group.columns ?? []).map((column) => column.metadata ?? {}),
      })),
      keyValueMetadata: file.keyValueMetadata ?? [],
    };
  } catch (error) {
    result.error = error instanceof FooterError ? error.message : 'Could not parse the Parquet footer.';
  }
  return result;
}

/**
 * Reads and parses a local Parquet File using the browser File API only.
 * @param {File|Blob} file
 * @returns {Promise<{metadata: object|null, error: string|null, warnings: string[]}>}
 */
export async function inspectParquetFile(file) {
  try {
    return parseParquetFooter(await file.arrayBuffer());
  } catch {
    return { metadata: null, error: 'Unable to read the selected file.', warnings: [] };
  }
}
