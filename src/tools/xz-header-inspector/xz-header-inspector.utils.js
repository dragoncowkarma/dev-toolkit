const XZ_MAGIC = [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00];
const CHECK_TYPES = { 0: "None", 1: "CRC32", 4: "CRC64", 10: "SHA-256" };
const CHECK_SIZES = { 0: 0, 1: 4, 4: 8, 10: 32 };
const LZMA2_FILTER_ID = 0x21;

/** Calculates the IEEE CRC-32 used by XZ metadata. */
export function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function fail(message) {
  throw new Error(`Invalid XZ stream: ${message}`);
}

function requireBytes(bytes, offset, count, context) {
  if (offset + count > bytes.length) fail(`truncated ${context}.`);
}

function readUint32LE(bytes, offset, context) {
  requireBytes(bytes, offset, 4, context);
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function readVli(bytes, offset, context) {
  let value = 0;
  let multiplier = 1;
  for (let index = 0; index < 9; index += 1) {
    requireBytes(bytes, offset + index, 1, context);
    const byte = bytes[offset + index];
    value += (byte & 0x7f) * multiplier;
    if (!Number.isSafeInteger(value)) fail(`${context} is too large.`);
    if ((byte & 0x80) === 0) {
      if (index > 0 && byte === 0) fail(`${context} is not minimally encoded.`);
      return { value, nextOffset: offset + index + 1 };
    }
    multiplier *= 128;
  }
  fail(`${context} exceeds the XZ VLI length limit.`);
}

function validateCrc(bytes, dataStart, dataEnd, crcOffset, context) {
  const expected = readUint32LE(bytes, crcOffset, `${context} CRC32`);
  const actual = crc32(bytes.slice(dataStart, dataEnd));
  if (actual !== expected) {
    const expectedHex = expected.toString(16).padStart(8, "0");
    const actualHex = actual.toString(16).padStart(8, "0");
    fail(
      `${context} CRC32 mismatch (expected 0x${expectedHex}, calculated 0x${actualHex}).`,
    );
  }
}

function parseStreamHeader(bytes) {
  requireBytes(bytes, 0, 12, "stream header");
  if (!XZ_MAGIC.every((byte, index) => bytes[index] === byte))
    fail("missing XZ magic bytes.");
  if (bytes[6] !== 0) fail("stream flags contain a non-zero reserved byte.");
  const checkType = bytes[7];
  if (!CHECK_TYPES[checkType])
    fail(`unsupported stream check type ${checkType}.`);
  validateCrc(bytes, 6, 8, 8, "stream flags");
  return { checkType, checkName: CHECK_TYPES[checkType] };
}

function parseBlockHeader(bytes, offset, number) {
  requireBytes(bytes, offset, 1, `block ${number} header`);
  const headerSize = (bytes[offset] + 1) * 4;
  requireBytes(bytes, offset, headerSize, `block ${number} header`);
  validateCrc(
    bytes,
    offset,
    offset + headerSize - 4,
    offset + headerSize - 4,
    `block ${number} header`,
  );
  const flags = bytes[offset + 1];
  if ((flags & 0x3c) !== 0)
    fail(`block ${number} flags contain reserved bits.`);
  const filterCount = (flags & 0x03) + 1;
  let cursor = offset + 2;
  let compressedSize;
  let uncompressedSize;
  if (flags & 0x40)
    ({ value: compressedSize, nextOffset: cursor } = readVli(
      bytes,
      cursor,
      `block ${number} compressed size`,
    ));
  if (flags & 0x80)
    ({ value: uncompressedSize, nextOffset: cursor } = readVli(
      bytes,
      cursor,
      `block ${number} uncompressed size`,
    ));
  const filters = [];
  for (let index = 0; index < filterCount; index += 1) {
    const id = readVli(bytes, cursor, `block ${number} filter ID`);
    const propertiesSize = readVli(
      bytes,
      id.nextOffset,
      `block ${number} filter properties size`,
    );
    cursor = propertiesSize.nextOffset;
    requireBytes(
      bytes,
      cursor,
      propertiesSize.value,
      `block ${number} filter properties`,
    );
    const properties = Array.from(
      bytes.slice(cursor, cursor + propertiesSize.value),
    );
    cursor += propertiesSize.value;
    filters.push({
      id: id.value,
      name: id.value === LZMA2_FILTER_ID ? "LZMA2" : `Filter ${id.value}`,
      properties,
      lzma2Property:
        id.value === LZMA2_FILTER_ID && properties.length === 1
          ? properties[0]
          : null,
    });
  }
  if (cursor > offset + headerSize - 4)
    fail(`block ${number} header fields exceed its declared size.`);
  if (bytes.slice(cursor, offset + headerSize - 4).some((byte) => byte !== 0))
    fail(`block ${number} header padding is not zero.`);
  return { headerSize, compressedSize, uncompressedSize, filters };
}

function parseIndex(bytes, offset, footerOffset) {
  if (bytes[offset] !== 0) fail("Index indicator byte is missing.");
  let cursor = offset + 1;
  const count = readVli(bytes, cursor, "Index record count");
  cursor = count.nextOffset;
  const records = [];
  for (let index = 0; index < count.value; index += 1) {
    const unpadded = readVli(
      bytes,
      cursor,
      `Index record ${index + 1} unpadded size`,
    );
    const uncompressed = readVli(
      bytes,
      unpadded.nextOffset,
      `Index record ${index + 1} uncompressed size`,
    );
    cursor = uncompressed.nextOffset;
    records.push({
      unpaddedSize: unpadded.value,
      uncompressedSize: uncompressed.value,
    });
  }
  const padding = (4 - ((cursor - offset) % 4)) % 4;
  requireBytes(bytes, cursor, padding + 4, "Index padding and CRC32");
  if (bytes.slice(cursor, cursor + padding).some((byte) => byte !== 0))
    fail("Index padding is not zero.");
  const crcOffset = cursor + padding;
  if (crcOffset + 4 !== footerOffset)
    fail("Index size does not match the Stream Footer backward size.");
  validateCrc(bytes, offset, crcOffset, crcOffset, "Index");
  return { records, size: footerOffset - offset };
}

/** Parses XZ stream metadata without reading or decompressing block payload contents. */
export function inspectXz(bytesLike) {
  const bytes =
    bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike);
  if (bytes.length < 24)
    fail("stream is too short to contain a header and footer.");
  const footerOffset = bytes.length - 12;
  requireBytes(bytes, footerOffset, 12, "Stream Footer");
  if (bytes[footerOffset + 10] !== 0x59 || bytes[footerOffset + 11] !== 0x5a)
    fail("Stream Footer magic bytes are missing.");
  validateCrc(
    bytes,
    footerOffset + 4,
    footerOffset + 10,
    footerOffset,
    "Stream Footer",
  );
  const backwardSize = readUint32LE(
    bytes,
    footerOffset + 4,
    "Stream Footer backward size",
  );
  const indexSize = (backwardSize + 1) * 4;
  const indexOffset = footerOffset - indexSize;
  if (indexOffset < 12)
    fail("Stream Footer backward size points before the stream header.");
  const header = parseStreamHeader(bytes);
  if (
    bytes[footerOffset + 8] !== 0 ||
    bytes[footerOffset + 9] !== header.checkType
  )
    fail("Stream Footer flags do not match Stream Header flags.");
  const index = parseIndex(bytes, indexOffset, footerOffset);
  const blocks = [];
  let cursor = 12;
  while (cursor < indexOffset) {
    const block = parseBlockHeader(bytes, cursor, blocks.length + 1);
    blocks.push(block);
    if (block.compressedSize === undefined) {
      block.payloadLocation =
        "Compressed size is absent; payload is intentionally not scanned.";
      break;
    }
    const checkSize = CHECK_SIZES[header.checkType];
    const payloadEnd = cursor + block.headerSize + block.compressedSize;
    const padding = (4 - (block.compressedSize % 4)) % 4;
    const nextOffset = payloadEnd + padding + checkSize;
    if (nextOffset > indexOffset)
      fail(`block ${blocks.length} payload exceeds the Index.`);
    block.payloadLocation = `${block.compressedSize} compressed bytes skipped`;
    cursor = nextOffset;
  }
  return {
    checkType: header.checkType,
    checkName: header.checkName,
    blocks,
    index,
    backwardSize,
  };
}

function pushUint32(target, value) {
  target.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function vli(value) {
  const result = [];
  do {
    result.push((value & 0x7f) | (value > 0x7f ? 0x80 : 0));
    value = Math.floor(value / 128);
  } while (value);
  return result;
}

/** Creates a small structurally valid XZ sample for local inspection and tests. */
export function createSampleXz({ checkType = 1, blocks = 1 } = {}) {
  const result = [...XZ_MAGIC, 0, checkType];
  pushUint32(result, crc32(result.slice(6)));
  const indexRecords = [];
  for (let index = 0; index < blocks; index += 1) {
    const header = [12, 0x40, 1, LZMA2_FILTER_ID, 1, 22, 0, 0];
    header[0] = 2;
    pushUint32(header, crc32(header));
    result.push(
      ...header,
      0xaa + index,
      0,
      0,
      0,
      ...Array(CHECK_SIZES[checkType]).fill(0),
    );
    indexRecords.push({
      unpaddedSize: header.length + 1 + CHECK_SIZES[checkType],
      uncompressedSize: 1,
    });
  }
  const indexStart = result.length;
  result.push(0, ...vli(indexRecords.length));
  for (const record of indexRecords)
    result.push(...vli(record.unpaddedSize), ...vli(record.uncompressedSize));
  while ((result.length - indexStart) % 4 !== 0) result.push(0);
  pushUint32(result, crc32(result.slice(indexStart)));
  const indexSize = result.length - indexStart;
  const footerData = [];
  pushUint32(footerData, indexSize / 4 - 1);
  footerData.push(0, checkType);
  pushUint32(result, crc32(footerData));
  result.push(...footerData, 0x59, 0x5a);
  return new Uint8Array(result);
}
