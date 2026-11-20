const BLOCK_SIZE = 512;
const decoder = new TextDecoder('utf-8');

const TYPE_NAMES = {
  '\0': 'Regular file',
  '0': 'Regular file',
  '1': 'Hard link',
  '2': 'Symbolic link',
  '3': 'Character device',
  '4': 'Block device',
  '5': 'Directory',
  '6': 'FIFO',
  '7': 'Contiguous file',
  g: 'PAX global extended header',
  x: 'PAX extended header',
  L: 'GNU long name',
  K: 'GNU long link',
};

function isZeroBlock(bytes, offset) {
  for (let index = 0; index < BLOCK_SIZE; index += 1) {
    if (bytes[offset + index] !== 0) return false;
  }
  return true;
}

function readString(bytes, offset, length) {
  const end = offset + length;
  let terminator = offset;
  while (terminator < end && bytes[terminator] !== 0) terminator += 1;
  return decoder.decode(bytes.subarray(offset, terminator));
}

function readDataString(bytes) {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  return decoder.decode(bytes.subarray(0, end));
}

function malformed(field, entryOffset) {
  return new Error(`Malformed ${field} field at TAR offset ${entryOffset}.`);
}

function parseOctal(bytes, offset, length, field, entryOffset) {
  const fieldBytes = bytes.subarray(offset, offset + length);
  let start = 0;
  let end = fieldBytes.length;
  while (start < end && (fieldBytes[start] === 0 || fieldBytes[start] === 32)) start += 1;
  while (end > start && (fieldBytes[end - 1] === 0 || fieldBytes[end - 1] === 32)) end -= 1;
  if (start === end) return 0;
  let value = 0;
  for (let index = start; index < end; index += 1) {
    const byte = fieldBytes[index];
    if (byte < 48 || byte > 55) throw malformed(field, entryOffset);
    value = value * 8 + byte - 48;
    if (!Number.isSafeInteger(value)) throw malformed(field, entryOffset);
  }
  return value;
}

function calculateChecksum(header, signed) {
  let checksum = 0;
  for (let index = 0; index < BLOCK_SIZE; index += 1) {
    const byte = index >= 148 && index < 156 ? 32 : header[index];
    checksum += signed && byte > 127 ? byte - 256 : byte;
  }
  return checksum;
}

function parsePaxRecords(data, entryOffset) {
  const records = {};
  let cursor = 0;
  while (cursor < data.length) {
    let space = cursor;
    while (space < data.length && data[space] !== 32) space += 1;
    if (space === data.length) throw malformed('PAX record length', entryOffset);
    const lengthText = decoder.decode(data.subarray(cursor, space));
    if (!/^[1-9]\d*$/.test(lengthText)) throw malformed('PAX record length', entryOffset);
    const recordLength = Number(lengthText);
    if (!Number.isSafeInteger(recordLength) || recordLength <= space - cursor + 1) {
      throw malformed('PAX record length', entryOffset);
    }
    const end = cursor + recordLength;
    if (end > data.length || data[end - 1] !== 10) throw malformed('PAX record', entryOffset);
    const record = decoder.decode(data.subarray(space + 1, end - 1));
    const equals = record.indexOf('=');
    if (equals <= 0) throw malformed('PAX record', entryOffset);
    records[record.slice(0, equals)] = record.slice(equals + 1);
    cursor = end;
  }
  return records;
}

function readHeader(bytes, offset) {
  const header = bytes.subarray(offset, offset + BLOCK_SIZE);
  const size = parseOctal(header, 124, 12, 'size', offset);
  const storedChecksum = parseOctal(header, 148, 8, 'checksum', offset);
  const unsignedChecksum = calculateChecksum(header, false);
  const signedChecksum = calculateChecksum(header, true);
  const checksumValid = storedChecksum === unsignedChecksum || storedChecksum === signedChecksum;
  if (!checksumValid) throw new Error(`Invalid checksum at TAR offset ${offset}.`);

  const magic = readString(header, 257, 6);
  const version = readString(header, 263, 2);
  const prefix = readString(header, 345, 155);
  const rawName = readString(header, 0, 100);
  const typeflag = String.fromCharCode(header[156] || 0);
  const format = magic === 'ustar' && version === '00'
    ? 'ustar (POSIX.1-1988)'
    : magic === 'ustar ' ? 'GNU tar' : 'legacy v7';
  const name = prefix && rawName ? `${prefix}/${rawName}` : rawName || prefix;

  return {
    name,
    mode: parseOctal(header, 100, 8, 'mode', offset),
    uid: parseOctal(header, 108, 8, 'uid', offset),
    gid: parseOctal(header, 116, 8, 'gid', offset),
    size,
    mtime: parseOctal(header, 136, 12, 'mtime', offset),
    checksum: storedChecksum,
    checksumValid,
    typeflag,
    type: TYPE_NAMES[typeflag] ?? `Unknown (${JSON.stringify(typeflag)})`,
    linkname: readString(header, 157, 100),
    magic,
    version,
    format,
    uname: readString(header, 265, 32),
    gname: readString(header, 297, 32),
    deviceMajor: parseOctal(header, 329, 8, 'device major', offset),
    deviceMinor: parseOctal(header, 337, 8, 'device minor', offset),
  };
}

function applyPax(entry, records) {
  if (records.path !== undefined) entry.name = records.path;
  if (records.linkpath !== undefined) entry.linkname = records.linkpath;
  for (const field of ['size', 'uid', 'gid', 'mtime']) {
    if (records[field] !== undefined) entry.pax[field] = records[field];
  }
}

/**
 * Parses TAR headers without extracting archive data. All reads are bounded to the supplied bytes.
 *
 * @param {ArrayBuffer|Uint8Array} input - Complete TAR archive bytes.
 * @returns {{entries: Array<object>, endOfArchive: boolean}}
 * @throws {Error} When headers, numbers, checksums, or data ranges are malformed.
 */
export function parseTarArchive(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = [];
  let offset = 0;
  let zeroBlocks = 0;
  let globalPax = {};
  let nextPax = null;
  let nextLongName = null;
  let nextLongLink = null;

  while (offset < bytes.length) {
    if (bytes.length - offset < BLOCK_SIZE) {
      throw new Error(`Truncated TAR header at offset ${offset}.`);
    }
    if (isZeroBlock(bytes, offset)) {
      zeroBlocks += 1;
      offset += BLOCK_SIZE;
      if (zeroBlocks === 2) return { entries, endOfArchive: true };
      continue;
    }
    zeroBlocks = 0;
    const headerOffset = offset;
    const entry = { ...readHeader(bytes, offset), offset: headerOffset, pax: {} };
    offset += BLOCK_SIZE;
    const blocks = Math.ceil(entry.size / BLOCK_SIZE);
    const dataLength = blocks * BLOCK_SIZE;
    if (!Number.isSafeInteger(dataLength) || dataLength > bytes.length - offset) {
      throw new Error(`Truncated data for TAR entry at offset ${headerOffset}.`);
    }
    const data = bytes.subarray(offset, offset + entry.size);
    offset += dataLength;

    if (entry.typeflag === 'x' || entry.typeflag === 'g') {
      const records = parsePaxRecords(data, headerOffset);
      entry.pax = records;
      if (entry.typeflag === 'g') globalPax = { ...globalPax, ...records };
      else nextPax = records;
    } else if (entry.typeflag === 'L' || entry.typeflag === 'K') {
      const value = readDataString(data);
      if (entry.typeflag === 'L') nextLongName = value;
      else nextLongLink = value;
    } else {
      applyPax(entry, globalPax);
      if (nextPax) applyPax(entry, nextPax);
      if (nextLongName !== null) entry.name = nextLongName;
      if (nextLongLink !== null) entry.linkname = nextLongLink;
      nextPax = null;
      nextLongName = null;
      nextLongLink = null;
    }
    entries.push(entry);
  }
  return { entries, endOfArchive: false };
}

/**
 * Formats a byte count for display.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatTarSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}
