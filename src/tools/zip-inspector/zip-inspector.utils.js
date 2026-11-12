const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;

/** Error raised when a ZIP archive cannot be safely inspected. */
export class ZipInspectorError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ZipInspectorError';
  }
}

function requireRange(bytes, offset, length, context) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > bytes.length) {
    throw new ZipInspectorError(`${context} is truncated or extends beyond the file.`);
  }
}

function uint64(view, offset) {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ZipInspectorError('ZIP64 value is too large for browser-safe inspection.');
  }
  return Number(value);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Decodes a ZIP filename, preserving invalid byte sequences visibly instead of mangling them.
 * @param {Uint8Array} bytes
 * @returns {{ value: string, usedFallback: boolean }}
 */
export function decodeEntryName(bytes) {
  try {
    return { value: new TextDecoder('utf-8', { fatal: true }).decode(bytes), usedFallback: false };
  } catch {
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return { value: `hex:${hex} (Base64: ${bytesToBase64(bytes)})`, usedFallback: true };
  }
}

function formatDosDateTime(date, time) {
  const day = date & 0x1f;
  const month = (date >> 5) & 0x0f;
  const year = ((date >> 9) & 0x7f) + 1980;
  const seconds = (time & 0x1f) * 2;
  const minutes = (time >> 5) & 0x3f;
  const hours = (time >> 11) & 0x1f;
  if (!day || !month || month > 12 || hours > 23 || minutes > 59 || seconds > 59) {
    return 'Invalid DOS timestamp';
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ` +
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:` +
    `${String(seconds).padStart(2, '0')}`;
}

/**
 * Returns a readable ZIP compression method label.
 * @param {number} method
 * @returns {string}
 */
export function compressionMethodName(method) {
  if (method === 0) return 'Stored';
  if (method === 8) return 'Deflate';
  return 'Other';
}

function findEocd(view) {
  const start = Math.max(0, view.byteLength - 0xffff - 22);
  for (let offset = view.byteLength - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === view.byteLength) return offset;
  }
  throw new ZipInspectorError('EOCD record was not found or is malformed.');
}

function readZip64Extra(extra, needs) {
  let position = 0;
  while (position + 4 <= extra.length) {
    const id = extra[position] | (extra[position + 1] << 8);
    const length = extra[position + 2] | (extra[position + 3] << 8);
    position += 4;
    if (position + length > extra.length) {
      throw new ZipInspectorError('Central directory extra field is truncated.');
    }
    if (id === 1) {
      const view = new DataView(extra.buffer, extra.byteOffset + position, length);
      let cursor = 0;
      const values = {};
      for (const key of needs) {
        if (cursor + 8 > length) throw new ZipInspectorError('ZIP64 extra field is truncated.');
        values[key] = uint64(view, cursor);
        cursor += 8;
      }
      return values;
    }
    position += length;
  }
  throw new ZipInspectorError('ZIP64 entry is missing its required ZIP64 extra field.');
}

function readZip64Eocd(view, eocdOffset) {
  if (eocdOffset < 20 || view.getUint32(eocdOffset - 20, true) !== ZIP64_LOCATOR_SIGNATURE) {
    throw new ZipInspectorError('ZIP64 archive is missing its ZIP64 EOCD locator.');
  }
  const zip64Offset = uint64(view, eocdOffset - 12);
  requireRange(new Uint8Array(view.buffer), zip64Offset, 56, 'ZIP64 EOCD record');
  if (view.getUint32(zip64Offset, true) !== ZIP64_EOCD_SIGNATURE) {
    throw new ZipInspectorError('ZIP64 EOCD record has an invalid signature.');
  }
  return {
    entryCount: uint64(view, zip64Offset + 32),
    centralDirectorySize: uint64(view, zip64Offset + 40),
    centralDirectoryOffset: uint64(view, zip64Offset + 48),
  };
}

/**
 * Parses ZIP container metadata without reading or decompressing entry contents.
 * @param {ArrayBuffer} buffer
 * @returns {{ eocd: object, entries: object[], zip64: boolean }}
 */
export function inspectZip(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('ZIP input must be an ArrayBuffer.');
  }
  if (buffer.byteLength < 22) {
    throw new ZipInspectorError('File is too small to contain an EOCD record.');
  }
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocdOffset = findEocd(view);
  const commentLength = view.getUint16(eocdOffset + 20, true);
  const rawCount = view.getUint16(eocdOffset + 10, true);
  const rawSize = view.getUint32(eocdOffset + 12, true);
  const rawOffset = view.getUint32(eocdOffset + 16, true);
  const zip64 = rawCount === 0xffff || rawSize === 0xffffffff || rawOffset === 0xffffffff;
  const directory = zip64
    ? readZip64Eocd(view, eocdOffset)
    : { entryCount: rawCount, centralDirectorySize: rawSize, centralDirectoryOffset: rawOffset };
  if (directory.centralDirectoryOffset + directory.centralDirectorySize > eocdOffset) {
    throw new ZipInspectorError('Central directory offset or size is outside the ZIP file.');
  }
  const commentBytes = bytes.slice(eocdOffset + 22, eocdOffset + 22 + commentLength);
  const comment = decodeEntryName(commentBytes);
  const entries = [];
  let position = directory.centralDirectoryOffset;
  const directoryEnd = position + directory.centralDirectorySize;
  for (let index = 0; index < directory.entryCount; index += 1) {
    requireRange(bytes, position, 46, `Central directory entry ${index + 1}`);
    if (
      position + 46 > directoryEnd ||
      view.getUint32(position, true) !== CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw new ZipInspectorError(`Central directory entry ${index + 1} has an invalid signature.`);
    }
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const entryCommentLength = view.getUint16(position + 32, true);
    const recordLength = 46 + nameLength + extraLength + entryCommentLength;
    requireRange(bytes, position, recordLength, `Central directory entry ${index + 1}`);
    if (position + recordLength > directoryEnd) {
      throw new ZipInspectorError(
        `Central directory entry ${index + 1} exceeds central directory bounds.`,
      );
    }
    const flags = view.getUint16(position + 8, true);
    const rawCompressedSize = view.getUint32(position + 20, true);
    const rawUncompressedSize = view.getUint32(position + 24, true);
    const rawLocalOffset = view.getUint32(position + 42, true);
    const extra = bytes.slice(position + 46 + nameLength, position + 46 + nameLength + extraLength);
    const needZip64 = [];
    if (rawUncompressedSize === 0xffffffff) needZip64.push('uncompressedSize');
    if (rawCompressedSize === 0xffffffff) needZip64.push('compressedSize');
    if (rawLocalOffset === 0xffffffff) needZip64.push('localHeaderOffset');
    const zip64Values = needZip64.length ? readZip64Extra(extra, needZip64) : {};
    const localHeaderOffset = zip64Values.localHeaderOffset ?? rawLocalOffset;
    requireRange(bytes, localHeaderOffset, 4, `Local header for entry ${index + 1}`);
    if (view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_SIGNATURE) {
      throw new ZipInspectorError(`Local header signature mismatch for entry ${index + 1}.`);
    }
    const name = decodeEntryName(bytes.slice(position + 46, position + 46 + nameLength));
    entries.push({
      name: name.value,
      nameUsedFallback: name.usedFallback,
      compressedSize: zip64Values.compressedSize ?? rawCompressedSize,
      uncompressedSize: zip64Values.uncompressedSize ?? rawUncompressedSize,
      compressionMethod: view.getUint16(position + 10, true),
      crc32: view.getUint32(position + 16, true).toString(16).padStart(8, '0').toUpperCase(),
      modified: formatDosDateTime(
        view.getUint16(position + 14, true),
        view.getUint16(position + 12, true),
      ),
      externalAttributes: `0x${view.getUint32(position + 38, true)
        .toString(16).padStart(8, '0').toUpperCase()}`,
      encrypted: Boolean(flags & 1),
      dataDescriptor: Boolean(flags & 8),
      zip64: needZip64.length > 0,
    });
    position += recordLength;
  }
  if (position !== directoryEnd) {
    throw new ZipInspectorError('Central directory size does not match its entries.');
  }
  return {
    zip64,
    eocd: { ...directory, comment: comment.value, commentUsedFallback: comment.usedFallback },
    entries,
  };
}
