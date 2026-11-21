const NEWC_HEADER_LENGTH = 110;
const ODC_HEADER_LENGTH = 76;
const TRAILER_NAME = 'TRAILER!!!';

const FILE_TYPES = {
  0o010000: 'FIFO',
  0o020000: 'Character device',
  0o040000: 'Directory',
  0o060000: 'Block device',
  0o100000: 'Regular file',
  0o120000: 'Symbolic link',
  0o140000: 'Socket',
};

function requireBytes(bytes, offset, length, context) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0
    || offset + length > bytes.length) {
    throw new Error(`Malformed CPIO archive: truncated ${context}.`);
  }
}

function readAscii(bytes, offset, length, context) {
  requireBytes(bytes, offset, length, context);
  return new TextDecoder('ascii').decode(bytes.subarray(offset, offset + length));
}

function parseNumber(value, radix, field) {
  const pattern = radix === 16 ? /^[0-9a-f]+$/i : /^[0-7]+$/;
  if (!pattern.test(value)) {
    throw new Error(`Malformed CPIO archive: invalid ${field}.`);
  }
  const parsed = Number.parseInt(value, radix);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Malformed CPIO archive: ${field} is too large.`);
  }
  return parsed;
}

function align4(value) {
  return (value + 3) & ~3;
}

function describeMode(mode) {
  const type = FILE_TYPES[mode & 0o170000] ?? 'Unknown';
  const bits = mode & 0o777;
  const permissions = [6, 3, 0].map((shift) => {
    const value = (bits >> shift) & 0o7;
    return `${value & 4 ? 'r' : '-'}${value & 2 ? 'w' : '-'}${value & 1 ? 'x' : '-'}`;
  }).join('');
  return { type, permissions: `${permissions} (${(mode & 0o7777).toString(8).padStart(4, '0')})` };
}

function formatMtime(seconds) {
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : date.toISOString();
}

function readFilename(bytes, offset, namesize) {
  if (namesize < 1) {
    throw new Error('Malformed CPIO archive: filename size must include a null terminator.');
  }
  requireBytes(bytes, offset, namesize, 'filename');
  const nameBytes = bytes.subarray(offset, offset + namesize);
  if (nameBytes[namesize - 1] !== 0) {
    throw new Error('Malformed CPIO archive: filename is not null-terminated.');
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(nameBytes.subarray(0, -1));
}

function parseNewcEntry(bytes, offset, magic) {
  requireBytes(bytes, offset, NEWC_HEADER_LENGTH, 'newc header');
  const fields = [
    'inode', 'mode', 'uid', 'gid', 'nlink', 'mtime', 'filesize', 'devmajor', 'devminor',
    'rdevmajor', 'rdevminor', 'namesize', 'checksum',
  ];
  const values = Object.fromEntries(fields.map((field, index) => [
    field,
    parseNumber(readAscii(bytes, offset + 6 + index * 8, 8, field), 16, field),
  ]));
  const nameOffset = offset + NEWC_HEADER_LENGTH;
  const name = readFilename(bytes, nameOffset, values.namesize);
  const dataOffset = align4(nameOffset + values.namesize);
  requireBytes(bytes, dataOffset, values.filesize, 'entry data');
  const nextOffset = align4(dataOffset + values.filesize);
  const { type, permissions } = describeMode(values.mode);
  return {
    entry: { ...values, name, type, permissions, mtimeDisplay: formatMtime(values.mtime) },
    nextOffset,
    trailer: name === TRAILER_NAME,
    format: magic === '070702' ? 'newc with checksum' : 'newc',
  };
}

function parseOdcEntry(bytes, offset) {
  requireBytes(bytes, offset, ODC_HEADER_LENGTH, 'odc header');
  const sixDigitFields = ['dev', 'inode', 'mode', 'uid', 'gid', 'nlink', 'rdev'];
  const values = Object.fromEntries(sixDigitFields.map((field, index) => [
    field,
    parseNumber(readAscii(bytes, offset + 6 + index * 6, 6, field), 8, field),
  ]));
  const mtime = parseNumber(readAscii(bytes, offset + 48, 11, 'mtime'), 8, 'mtime');
  const namesize = parseNumber(readAscii(bytes, offset + 59, 6, 'namesize'), 8, 'namesize');
  const filesize = parseNumber(readAscii(bytes, offset + 65, 11, 'filesize'), 8, 'filesize');
  const nameOffset = offset + ODC_HEADER_LENGTH;
  const name = readFilename(bytes, nameOffset, namesize);
  const dataOffset = nameOffset + namesize;
  requireBytes(bytes, dataOffset, filesize, 'entry data');
  const { type, permissions } = describeMode(values.mode);
  return {
    entry: {
      ...values,
      mtime,
      mtimeDisplay: formatMtime(mtime),
      filesize,
      namesize,
      devmajor: null,
      devminor: null,
      rdevmajor: null,
      rdevminor: null,
      checksum: null,
      name,
      type,
      permissions,
    },
    nextOffset: dataOffset + filesize,
    trailer: name === TRAILER_NAME,
    format: 'odc (legacy ASCII)',
  };
}

/**
 * Parses CPIO entry headers without reading or extracting their content.
 * @param {ArrayBuffer|Uint8Array} input Archive bytes.
 * @returns {{format: string, entries: object[], trailerFound: boolean}}
 */
export function parseCpioArchive(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const magic = readAscii(bytes, 0, 6, 'magic value');
  if (!['070701', '070702', '070707'].includes(magic)) {
    throw new Error(`Unsupported CPIO magic value: ${magic || '(empty)'}.`);
  }

  const entries = [];
  let offset = 0;
  let format = '';
  while (offset < bytes.length) {
    const entryMagic = readAscii(bytes, offset, 6, 'entry magic value');
    if (entryMagic !== magic) {
      throw new Error(`Malformed CPIO archive: unexpected magic at offset ${offset}.`);
    }
    const parsed = magic === '070707'
      ? parseOdcEntry(bytes, offset)
      : parseNewcEntry(bytes, offset, magic);
    format = parsed.format;
    entries.push(parsed.entry);
    if (parsed.trailer) return { format, entries, trailerFound: true };
    offset = parsed.nextOffset;
  }
  throw new Error('Malformed CPIO archive: missing TRAILER!!! end marker.');
}
