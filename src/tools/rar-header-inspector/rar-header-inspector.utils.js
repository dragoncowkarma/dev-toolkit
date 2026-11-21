const RAR4_SIGNATURE = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
const RAR5_SIGNATURE = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00];
const RAR5_TYPES = {
  1: 'Main Archive',
  2: 'File',
  3: 'Service',
  4: 'End of Archive',
};
const RAR4_TYPES = {
  0x73: 'Main Archive',
  0x74: 'File',
};

function hasBytes(bytes, offset, length) {
  return Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 &&
    length >= 0 && offset <= bytes.length && length <= bytes.length - offset;
}

function hex(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function readU16(bytes, offset) {
  if (!hasBytes(bytes, offset, 2)) throw new RangeError('Expected a 2-byte field.');
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  if (!hasBytes(bytes, offset, 4)) throw new RangeError('Expected a 4-byte field.');
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)) >>> 0;
}

function field(name, value) {
  return { name, value: String(value) };
}

/**
 * Reads a RAR 5 variable-length integer from a byte array.
 *
 * @param {Uint8Array} bytes Archive bytes.
 * @param {number} offset Offset of the encoded integer.
 * @returns {{value: number, length: number}} Decoded safe integer and byte length.
 * @throws {RangeError} When the encoding is truncated, too long, or unsafe.
 */
export function readVint(bytes, offset) {
  let value = 0;
  let multiplier = 1;

  for (let index = 0; index < 10; index += 1) {
    if (!hasBytes(bytes, offset + index, 1)) throw new RangeError('Truncated RAR5 vint.');
    const current = bytes[offset + index];
    const part = current & 0x7f;
    if (part > 0 && multiplier > (Number.MAX_SAFE_INTEGER - value) / part) {
      throw new RangeError('RAR5 vint exceeds the safe integer range.');
    }
    value += part * multiplier;
    if ((current & 0x80) === 0) return { value, length: index + 1 };
    multiplier *= 128;
  }
  throw new RangeError('RAR5 vint is longer than 10 bytes.');
}

function parseRar5Block(bytes, offset) {
  if (!hasBytes(bytes, offset, 5)) throw new RangeError('Truncated RAR5 block header.');
  const headerCrc = readU32(bytes, offset);
  const sizeVint = readVint(bytes, offset + 4);
  const headerStart = offset + 4 + sizeVint.length;
  const headerEnd = headerStart + sizeVint.value;
  if (!Number.isSafeInteger(headerEnd) || !hasBytes(bytes, headerStart, sizeVint.value)) {
    throw new RangeError('RAR5 header size extends beyond the archive.');
  }

  let cursor = headerStart;
  const typeVint = readVint(bytes, cursor);
  cursor += typeVint.length;
  const flagsVint = readVint(bytes, cursor);
  cursor += flagsVint.length;
  const fields = [
    field('Header CRC32', hex(headerCrc, 8)),
    field('Header size', sizeVint.value),
    field('Header type', typeVint.value),
    field('Header flags', hex(flagsVint.value, 1)),
  ];

  if (flagsVint.value & 0x01) {
    const extraSize = readVint(bytes, cursor);
    cursor += extraSize.length;
    fields.push(field('Extra area size', extraSize.value));
  }
  let dataSize = 0;
  if (flagsVint.value & 0x02) {
    const dataSizeField = readVint(bytes, cursor);
    cursor += dataSizeField.length;
    dataSize = dataSizeField.value;
    fields.push(field('Data area size', dataSize));
  }
  if (cursor > headerEnd) throw new RangeError('RAR5 fields exceed the declared header size.');

  const typeName = RAR5_TYPES[typeVint.value] ?? `Unknown RAR5 block (${typeVint.value})`;
  if (typeVint.value === 1 && cursor < headerEnd) {
    const archiveFlags = readVint(bytes, cursor);
    if (cursor + archiveFlags.length > headerEnd) {
      throw new RangeError('RAR5 fields exceed the declared header size.');
    }
    fields.push(field('Archive flags', hex(archiveFlags.value, 1)));
  } else if ((typeVint.value === 2 || typeVint.value === 3) && cursor < headerEnd) {
    const fileFlags = readVint(bytes, cursor);
    if (cursor + fileFlags.length > headerEnd) {
      throw new RangeError('RAR5 fields exceed the declared header size.');
    }
    fields.push(field('File flags', hex(fileFlags.value, 1)));
  } else if (typeVint.value === 4 && cursor < headerEnd) {
    const endFlags = readVint(bytes, cursor);
    if (cursor + endFlags.length > headerEnd) {
      throw new RangeError('RAR5 fields exceed the declared header size.');
    }
    fields.push(field('End archive flags', hex(endFlags.value, 1)));
  }

  const nextOffset = headerEnd + dataSize;
  if (!Number.isSafeInteger(nextOffset) || !hasBytes(bytes, headerEnd, dataSize)) {
    throw new RangeError('RAR5 data area extends beyond the archive.');
  }
  return { offset, size: nextOffset - offset, type: typeName, fields, nextOffset };
}

function parseRar4Block(bytes, offset) {
  if (!hasBytes(bytes, offset, 7)) throw new RangeError('Truncated RAR4 block header.');
  const headCrc = readU16(bytes, offset);
  const headType = bytes[offset + 2];
  const headFlags = readU16(bytes, offset + 3);
  const headSize = readU16(bytes, offset + 5);
  if (headSize < 7 || !hasBytes(bytes, offset, headSize)) {
    throw new RangeError('RAR4 header size extends beyond the archive.');
  }
  const fields = [
    field('HEAD_CRC', hex(headCrc, 4)),
    field('HEAD_TYPE', hex(headType, 2)),
    field('HEAD_FLAGS', hex(headFlags, 4)),
    field('HEAD_SIZE', headSize),
  ];
  let nextOffset = offset + headSize;
  if (headType === 0x74 && headSize >= 11) {
    const packedSize = readU32(bytes, offset + 7);
    fields.push(field('PACK_SIZE', packedSize));
    if (headSize >= 15) {
      fields.push(field('UNP_SIZE', readU32(bytes, offset + 11)));
    }
    if (packedSize > bytes.length - nextOffset) {
      throw new RangeError('RAR4 file data size extends beyond the archive.');
    }
    nextOffset += packedSize;
  }
  return {
    offset,
    size: nextOffset - offset,
    type: RAR4_TYPES[headType] ?? `Unknown RAR4 block (${hex(headType, 2)})`,
    fields,
    nextOffset,
  };
}

function signatureLength(bytes) {
  const matches = (signature) => signature.every((byte, index) => bytes[index] === byte);
  if (bytes.length >= RAR5_SIGNATURE.length && matches(RAR5_SIGNATURE)) {
    return RAR5_SIGNATURE.length;
  }
  if (bytes.length >= RAR4_SIGNATURE.length && matches(RAR4_SIGNATURE)) {
    return RAR4_SIGNATURE.length;
  }
  return 0;
}

/**
 * Inspects RAR 4.x or RAR 5.0 archive headers without reading file payloads.
 *
 * @param {ArrayBuffer|Uint8Array} input Archive data.
 * @returns {{format: string|null, blocks: Array<object>, errors: string[]}} Inspection result.
 */
export function inspectRarArchive(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const signatureSize = signatureLength(bytes);
  if (!signatureSize) {
    return {
      format: null,
      blocks: [],
      errors: ['The file does not have a supported RAR signature.'],
    };
  }
  const format = signatureSize === RAR5_SIGNATURE.length ? 'RAR 5.0' : 'RAR 4.x';
  const blocks = [];
  const errors = [];
  let offset = signatureSize;

  while (offset < bytes.length) {
    try {
      const block = format === 'RAR 5.0'
        ? parseRar5Block(bytes, offset)
        : parseRar4Block(bytes, offset);
      blocks.push(block);
      if (block.nextOffset <= offset) {
        throw new RangeError('Header parser made no forward progress.');
      }
      offset = block.nextOffset;
    } catch (error) {
      errors.push(`Offset ${offset}: ${error.message}`);
      break;
    }
  }
  return { format, blocks, errors };
}
