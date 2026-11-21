const XZ_MAGIC = [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00];
const FOOTER_MAGIC = [0x59, 0x5a];
const MAX_VLI_BYTES = 9;
const CHECK_NAMES = {
  0: 'None',
  1: 'CRC32',
  4: 'CRC64',
  10: 'SHA-256',
};

function fail(message) {
  throw new Error(`Invalid XZ stream: ${message}`);
}

function requireBytes(bytes, offset, count, label) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + count > bytes.length) {
    fail(`truncated ${label} at offset ${offset}.`);
  }
}

function readByte(bytes, offset, label) {
  requireBytes(bytes, offset, 1, label);
  return bytes[offset];
}

function readUint32LE(bytes, offset, label) {
  requireBytes(bytes, offset, 4, label);
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readVli(bytes, offset, limit, label) {
  let value = 0n;
  let shift = 0n;
  let cursor = offset;

  for (let index = 0; index < MAX_VLI_BYTES; index += 1) {
    if (cursor >= limit) fail(`truncated ${label} VLI at offset ${cursor}.`);
    const byte = readByte(bytes, cursor, `${label} VLI`);
    cursor += 1;
    value |= BigInt(byte & 0x7f) << shift;

    if ((byte & 0x80) === 0) {
      if (index > 0 && (byte & 0x7f) === 0) {
        fail(`non-canonical ${label} VLI at offset ${offset}.`);
      }
      return { value, nextOffset: cursor };
    }
    shift += 7n;
  }

  fail(`${label} VLI exceeds the 9-byte XZ limit at offset ${offset}.`);
}

function readCrc32(bytes, offset, label) {
  return readUint32LE(bytes, offset, label);
}

function parseStreamHeader(bytes) {
  requireBytes(bytes, 0, 12, 'Stream Header');
  for (let index = 0; index < XZ_MAGIC.length; index += 1) {
    if (readByte(bytes, index, 'Stream Header magic') !== XZ_MAGIC[index]) {
      fail('bad Stream Header magic bytes.');
    }
  }
  const flags0 = readByte(bytes, 6, 'Stream Flags');
  const checkId = readByte(bytes, 7, 'Stream Flags');
  if (flags0 !== 0 || checkId > 15) fail('invalid Stream Flags.');

  return {
    magic: 'FD 37 7A 58 5A 00',
    checkId,
    checkName: CHECK_NAMES[checkId] ?? `Unknown (${checkId})`,
    crc32: readCrc32(bytes, 8, 'Stream Header CRC32'),
    endOffset: 12,
  };
}

function parseFooter(bytes) {
  const offset = bytes.length - 12;
  requireBytes(bytes, offset, 12, 'Stream Footer');
  if (
    readByte(bytes, offset + 10, 'Stream Footer magic') !== FOOTER_MAGIC[0] ||
    readByte(bytes, offset + 11, 'Stream Footer magic') !== FOOTER_MAGIC[1]
  ) {
    fail('bad Stream Footer magic bytes.');
  }
  const flags0 = readByte(bytes, offset + 8, 'Stream Footer Flags');
  const checkId = readByte(bytes, offset + 9, 'Stream Footer Flags');
  if (flags0 !== 0 || checkId > 15) fail('invalid Stream Footer Flags.');
  const backwardSize = readUint32LE(bytes, offset + 4, 'Backward Size');
  const indexSize = (backwardSize + 1) * 4;
  if (!Number.isSafeInteger(indexSize) || indexSize > offset) {
    fail('Backward Size points outside the stream.');
  }
  return {
    crc32: readCrc32(bytes, offset, 'Stream Footer CRC32'),
    backwardSize,
    checkId,
    checkName: CHECK_NAMES[checkId] ?? `Unknown (${checkId})`,
    magic: '59 5A',
    indexStart: offset - indexSize,
    offset,
  };
}

function parseIndex(bytes, start, end) {
  if (start < 12 || start >= end) fail('invalid Index location.');
  if (readByte(bytes, start, 'Index Indicator') !== 0) fail('missing Index Indicator.');
  const crcOffset = end - 4;
  requireBytes(bytes, crcOffset, 4, 'Index CRC32');
  let cursor = start + 1;
  const count = readVli(bytes, cursor, crcOffset, 'Index Record Count');
  cursor = count.nextOffset;
  if (count.value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('Index Record Count is too large to inspect safely.');
  }
  const records = [];
  for (let recordIndex = 0; recordIndex < Number(count.value); recordIndex += 1) {
    const unpaddedSize = readVli(
      bytes, cursor, crcOffset, `Index Record ${recordIndex + 1} Unpadded Size`
    );
    cursor = unpaddedSize.nextOffset;
    const uncompressedSize = readVli(
      bytes,
      cursor,
      crcOffset,
      `Index Record ${recordIndex + 1} Uncompressed Size`
    );
    cursor = uncompressedSize.nextOffset;
    records.push({ unpaddedSize: unpaddedSize.value, uncompressedSize: uncompressedSize.value });
  }
  while (cursor < crcOffset) {
    if (readByte(bytes, cursor, 'Index padding') !== 0) {
      fail('Index padding must contain zero bytes.');
    }
    cursor += 1;
  }
  if (cursor !== crcOffset) fail('Index records extend into its CRC32.');
  return {
    recordCount: count.value,
    records,
    crc32: readCrc32(bytes, crcOffset, 'Index CRC32'),
  };
}

function parseBlockHeader(bytes, offset, blockEnd) {
  const sizeByte = readByte(bytes, offset, 'Block Header Size');
  if (sizeByte === 0) {
    fail(`unexpected Index Indicator while reading Block Header at offset ${offset}.`);
  }
  const headerSize = (sizeByte + 1) * 4;
  if (offset + headerSize > blockEnd) fail(`truncated Block Header at offset ${offset}.`);
  const headerEnd = offset + headerSize;
  const flags = readByte(bytes, offset + 1, 'Block Flags');
  if ((flags & 0xf0) !== 0) fail(`reserved Block Flags are set at offset ${offset + 1}.`);
  const filterCount = (flags & 0x03) + 1;
  const hasCompressedSize = (flags & 0x04) !== 0;
  const hasUncompressedSize = (flags & 0x08) !== 0;
  let cursor = offset + 2;
  let compressedSize = null;
  let uncompressedSize = null;
  if (hasCompressedSize) {
    const value = readVli(bytes, cursor, headerEnd - 4, 'Block Compressed Size');
    compressedSize = value.value;
    cursor = value.nextOffset;
  }
  if (hasUncompressedSize) {
    const value = readVli(bytes, cursor, headerEnd - 4, 'Block Uncompressed Size');
    uncompressedSize = value.value;
    cursor = value.nextOffset;
  }
  const filters = [];
  for (let filterIndex = 0; filterIndex < filterCount; filterIndex += 1) {
    const id = readVli(bytes, cursor, headerEnd - 4, `Filter ${filterIndex + 1} ID`);
    cursor = id.nextOffset;
    const propertiesSize = readVli(
      bytes, cursor, headerEnd - 4, `Filter ${filterIndex + 1} properties size`
    );
    cursor = propertiesSize.nextOffset;
    if (propertiesSize.value > BigInt(headerEnd - 4 - cursor)) {
      fail(`truncated Filter ${filterIndex + 1} properties at offset ${cursor}.`);
    }
    const propertyLength = Number(propertiesSize.value);
    requireBytes(bytes, cursor, propertyLength, `Filter ${filterIndex + 1} properties`);
    filters.push({ id: id.value, propertiesSize: propertiesSize.value });
    cursor += propertyLength;
  }
  while (cursor < headerEnd - 4) {
    if (readByte(bytes, cursor, 'Block Header padding') !== 0) {
      fail(`Block Header padding must contain zero bytes at offset ${cursor}.`);
    }
    cursor += 1;
  }
  if (cursor !== headerEnd - 4) fail(`Block Header fields overlap CRC32 at offset ${offset}.`);
  return {
    headerSize,
    flags,
    compressedSize,
    uncompressedSize,
    filters,
    crc32: readCrc32(bytes, headerEnd - 4, 'Block Header CRC32'),
  };
}

/**
 * Parses the structural headers of a single XZ stream without decompressing payload data.
 * @param {ArrayBuffer|Uint8Array} input - XZ file bytes.
 * @returns {{streamHeader: object, blocks: object[], index: object, streamFooter: object}}
 */
export function parseXzHeaders(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 24) fail('stream is shorter than the required header and footer.');
  const streamHeader = parseStreamHeader(bytes);
  const streamFooter = parseFooter(bytes);
  if (streamFooter.indexStart < streamHeader.endOffset) fail('Index overlaps the Stream Header.');
  if (streamHeader.checkId !== streamFooter.checkId) {
    fail('Stream Header and Footer Check IDs differ.');
  }
  const index = parseIndex(bytes, streamFooter.indexStart, streamFooter.offset);
  const blocks = [];
  let cursor = streamHeader.endOffset;
  for (const [blockIndex, record] of index.records.entries()) {
    if (record.unpaddedSize > BigInt(Number.MAX_SAFE_INTEGER)) {
      fail(`Block ${blockIndex + 1} Unpadded Size is too large to inspect safely.`);
    }
    const unpaddedSize = Number(record.unpaddedSize);
    if (unpaddedSize === 0) fail(`Block ${blockIndex + 1} has an empty Unpadded Size.`);
    const blockEnd = cursor + unpaddedSize;
    if (!Number.isSafeInteger(blockEnd) || blockEnd > streamFooter.indexStart) {
      fail(`Block ${blockIndex + 1} extends into the Index or past end of input.`);
    }
    const header = parseBlockHeader(bytes, cursor, blockEnd);
    if (header.headerSize > unpaddedSize) {
      fail(`Block ${blockIndex + 1} is smaller than its header.`);
    }
    const payloadSize = BigInt(unpaddedSize - header.headerSize);
    if (header.compressedSize !== null && header.compressedSize !== payloadSize) {
      fail(`Block ${blockIndex + 1} compressed size does not match its Index record.`);
    }
    blocks.push({
      number: blockIndex + 1,
      ...header,
      payloadSize,
      unpaddedSize: record.unpaddedSize,
      indexUncompressedSize: record.uncompressedSize,
    });
    cursor = blockEnd;
    const padding = (4 - (unpaddedSize % 4)) % 4;
    requireBytes(bytes, cursor, padding, `Block ${blockIndex + 1} padding`);
    for (let paddingIndex = 0; paddingIndex < padding; paddingIndex += 1) {
      if (readByte(bytes, cursor + paddingIndex, `Block ${blockIndex + 1} padding`) !== 0) {
        fail(`Block ${blockIndex + 1} padding must contain zero bytes.`);
      }
    }
    cursor += padding;
  }
  if (cursor !== streamFooter.indexStart) fail('Block area does not end at the Index.');
  return { streamHeader, blocks, index, streamFooter };
}

/**
 * Formats a parsed integer for display without losing BigInt precision.
 * @param {number|bigint} value
 * @returns {string}
 */
export function formatXzValue(value) {
  return typeof value === 'bigint' ? value.toString() : value.toString();
}
