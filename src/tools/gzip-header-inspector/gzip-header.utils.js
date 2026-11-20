const GZIP_MAGIC = [0x1f, 0x8b];
const FIXED_HEADER_LENGTH = 10;
const TRAILER_LENGTH = 8;

const FLAG_NAMES = [
  [0x01, 'FTEXT'],
  [0x02, 'FHCRC'],
  [0x04, 'FEXTRA'],
  [0x08, 'FNAME'],
  [0x10, 'FCOMMENT'],
];

const OS_NAMES = {
  0: 'FAT filesystem',
  1: 'Amiga',
  2: 'VMS',
  3: 'Unix',
  4: 'VM/CMS',
  5: 'Atari TOS',
  6: 'HPFS filesystem',
  7: 'Macintosh',
  8: 'Z-System',
  9: 'CP/M',
  10: 'TOPS-20',
  11: 'NTFS filesystem',
  12: 'QDOS',
  13: 'Acorn RISCOS',
  255: 'Unknown',
};

function requireBytes(bytes, offset, length, label, limit = bytes.length) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0
    || offset + length > limit) {
    throw new Error(`Truncated GZIP file: ${label} is incomplete.`);
  }
}

function readNullTerminated(bytes, offset, label, limit) {
  let end = offset;
  while (end < limit && bytes[end] !== 0) {
    end += 1;
  }
  if (end === limit) {
    throw new Error(`Malformed GZIP header: ${label} is not null-terminated.`);
  }
  return {
    value: new TextDecoder('latin1').decode(bytes.subarray(offset, end)),
    nextOffset: end + 1,
  };
}

function parseExtraSubfields(bytes, offset, length) {
  const end = offset + length;
  const subfields = [];
  let cursor = offset;

  while (cursor < end) {
    requireBytes(bytes, cursor, 4, 'extra subfield header', end);
    const identifier = String.fromCharCode(bytes[cursor], bytes[cursor + 1]);
    const dataLength = bytes[cursor + 2] | (bytes[cursor + 3] << 8);
    cursor += 4;
    requireBytes(bytes, cursor, dataLength, 'extra subfield data', end);
    subfields.push({ identifier, length: dataLength });
    cursor += dataLength;
  }

  return subfields;
}

/**
 * Parses the first RFC 1952 GZIP member header and the file's final trailer.
 * @param {ArrayBuffer|Uint8Array} input GZIP file bytes.
 * @returns {object} Parsed header and trailer values.
 * @throws {Error} When the input is not a complete, well-formed GZIP header.
 */
export function parseGzipHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  requireBytes(bytes, 0, FIXED_HEADER_LENGTH + TRAILER_LENGTH, 'fixed header and trailer');
  if (bytes[0] !== GZIP_MAGIC[0] || bytes[1] !== GZIP_MAGIC[1]) {
    throw new Error('Not a GZIP file: expected magic bytes 1F 8B.');
  }

  const compressionMethod = bytes[2];
  if (compressionMethod !== 8) {
    throw new Error(
      `Unsupported GZIP compression method: ${compressionMethod}. Expected 8 (deflate).`
    );
  }

  const flags = bytes[3];
  const reservedFlags = flags & 0xe0;
  if (reservedFlags !== 0) {
    throw new Error(
      `Malformed GZIP header: reserved flag bits are set (0x${reservedFlags.toString(16)}).`
    );
  }

  const trailerOffset = bytes.length - TRAILER_LENGTH;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = FIXED_HEADER_LENGTH;
  const optional = { extra: null, filename: null, comment: null, headerCrc16: null };

  if (flags & 0x04) {
    requireBytes(bytes, cursor, 2, 'extra field length', trailerOffset);
    const length = view.getUint16(cursor, true);
    cursor += 2;
    requireBytes(bytes, cursor, length, 'extra field', trailerOffset);
    optional.extra = {
      length,
      subfields: parseExtraSubfields(bytes, cursor, length),
    };
    cursor += length;
  }
  if (flags & 0x08) {
    const field = readNullTerminated(bytes, cursor, 'original filename', trailerOffset);
    optional.filename = field.value;
    cursor = field.nextOffset;
  }
  if (flags & 0x10) {
    const field = readNullTerminated(bytes, cursor, 'comment', trailerOffset);
    optional.comment = field.value;
    cursor = field.nextOffset;
  }
  if (flags & 0x02) {
    requireBytes(bytes, cursor, 2, 'header CRC16', trailerOffset);
    optional.headerCrc16 = view.getUint16(cursor, true);
    cursor += 2;
  }

  return {
    compressionMethod,
    flags: FLAG_NAMES.filter(([bit]) => flags & bit).map(([, name]) => name),
    modificationTime: view.getUint32(4, true),
    extraFlags: bytes[8],
    operatingSystem: { value: bytes[9], name: OS_NAMES[bytes[9]] ?? 'Reserved' },
    optional,
    headerLength: cursor,
    trailer: {
      crc32: view.getUint32(trailerOffset, true),
      inputSize: view.getUint32(trailerOffset + 4, true),
    },
  };
}

/**
 * Formats a Unix timestamp as an ISO date, or identifies the RFC 1952 zero value.
 * @param {number} timestamp Unix timestamp in seconds.
 * @returns {string} Human-readable UTC date.
 */
export function formatModificationTime(timestamp) {
  if (timestamp === 0) return 'Not specified';
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Formats an unsigned integer as an eight-character hexadecimal value.
 * @param {number} value Value to format.
 * @returns {string} Uppercase hexadecimal string.
 */
export function formatHex32(value) {
  return `0x${value.toString(16).padStart(8, '0').toUpperCase()}`;
}
