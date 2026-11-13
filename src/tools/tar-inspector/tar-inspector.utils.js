/**
 * TAR Archive Inspector Utilities.
 * Parses POSIX ustar and GNU TAR header metadata without decompressing or extracting.
 */

export const TAR_BLOCK_SIZE = 512;

/**
 * Standard TAR type flags.
 */
export const TYPE_FLAGS = {
  REGULAR: '0',
  REGULAR_NULL: '\0',
  HARDLINK: '1',
  SYMLINK: '2',
  CHAR_DEV: '3',
  BLOCK_DEV: '4',
  DIRECTORY: '5',
  FIFO: '6',
  CONTIGUOUS: '7',
  PAX_EXTENDED: 'x',
  PAX_GLOBAL: 'g',
  GNU_LONGLINK: 'L',
  GNU_LONGLINK_TARGET: 'K',
  GNU_SPARSE: 'S',
  GNU_VOLUME: 'V',
  GNU_DUMPDIR: 'D',
};

/**
 * Custom error class for TAR parsing failures.
 */
export class TarParseError extends Error {
  /**
   * @param {string} message
   * @param {number} [offset]
   */
  constructor(message, offset) {
    super(message);
    this.name = 'TarParseError';
    this.offset = offset;
  }
}

/**
 * Formats a byte count into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Returns a human-readable label for a given typeflag.
 * @param {string} flag
 * @returns {string}
 */
export function getEntryType(flag) {
  switch (flag) {
    case '0':
    case '\0':
    case '':
      return 'File';
    case '1':
      return 'Hard Link';
    case '2':
      return 'Symlink';
    case '3':
      return 'Character Device';
    case '4':
      return 'Block Device';
    case '5':
      return 'Directory';
    case '6':
      return 'FIFO';
    case '7':
      return 'Contiguous File';
    case 'x':
      return 'PAX Extended Header';
    case 'g':
      return 'PAX Global Header';
    case 'L':
      return 'GNU Long Name';
    case 'K':
      return 'GNU Long Link';
    case 'S':
      return 'Sparse File';
    case 'V':
      return 'Volume Header';
    case 'D':
      return 'Directory Dump';
    default:
      return `Unknown (${flag || 'none'})`;
  }
}

/**
 * Returns an icon string for a given typeflag.
 * @param {string} flag
 * @returns {string}
 */
export function getEntryIcon(flag) {
  switch (flag) {
    case '5':
    case 'D':
      return '📁';
    case '2':
    case '1':
      return '🔗';
    case '3':
    case '4':
      return '⚙';
    case '6':
      return '☵';
    case 'L':
    case 'K':
      return '🔤';
    case 'x':
    case 'g':
      return '📋';
    default:
      return '📄';
  }
}

/**
 * Formats a UNIX permission mode into an ls -l style string.
 * @param {number} mode
 * @param {string} typeflag
 * @returns {string}
 */
export function formatPermissions(mode, typeflag) {
  let typeChar = '-';
  if (typeflag === '5' || typeflag === 'D') typeChar = 'd';
  else if (typeflag === '2') typeChar = 'l';
  else if (typeflag === '1') typeChar = 'h';
  else if (typeflag === '3') typeChar = 'c';
  else if (typeflag === '4') typeChar = 'b';
  else if (typeflag === '6') typeChar = 'p';

  const uR = mode & 0o400 ? 'r' : '-';
  const uW = mode & 0o200 ? 'w' : '-';
  let uX = mode & 0o100 ? 'x' : '-';
  if (mode & 0o4000) uX = uX === 'x' ? 's' : 'S';

  const gR = mode & 0o040 ? 'r' : '-';
  const gW = mode & 0o020 ? 'w' : '-';
  let gX = mode & 0o010 ? 'x' : '-';
  if (mode & 0o2000) gX = gX === 'x' ? 's' : 'S';

  const oR = mode & 0o004 ? 'r' : '-';
  const oW = mode & 0o002 ? 'w' : '-';
  let oX = mode & 0o001 ? 'x' : '-';
  if (mode & 0o1000) oX = oX === 'x' ? 't' : 'T';

  return `${typeChar}${uR}${uW}${uX}${gR}${gW}${gX}${oR}${oW}${oX}`;
}

/**
 * Parses an octal byte slice into a number.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function parseOctalBytes(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const code = bytes[i];
    if (code === 0) break;
    str += String.fromCharCode(code);
  }
  str = str.trim();
  if (!str) return 0;
  const num = parseInt(str, 8);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Parses file size, supporting both octal and GNU base-256 binary encoding.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function parseSizeBytes(bytes) {
  if (bytes.length > 0 && (bytes[0] & 0x80) !== 0) {
    // GNU 256-base binary encoding (high bit set)
    if (bytes[0] === 0x80) {
      let size = 0;
      for (let i = 1; i < bytes.length; i += 1) {
        size = size * 256 + bytes[i];
      }
      return size;
    }
  }
  return parseOctalBytes(bytes);
}

/**
 * Reads a UTF-8 string up to the first null byte.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function readNullTerminatedString(bytes) {
  let end = 0;
  while (end < bytes.length && bytes[end] !== 0) {
    end += 1;
  }
  if (end === 0) return '';
  return new TextDecoder('utf-8').decode(bytes.subarray(0, end));
}

/**
 * Computes TAR header checksum treating offset 148..155 as ASCII spaces.
 * @param {Uint8Array} headerBytes - 512-byte header block.
 * @returns {{ unsignedSum: number, signedSum: number }}
 */
export function calculateHeaderChecksum(headerBytes) {
  let unsignedSum = 0;
  let signedSum = 0;
  for (let i = 0; i < 512; i += 1) {
    const val = (i >= 148 && i < 156) ? 32 : headerBytes[i];
    unsignedSum += val;
    signedSum += (val > 127 ? val - 256 : val);
  }
  return { unsignedSum, signedSum };
}

/**
 * Validates whether the stored checksum matches computed unsigned or signed sum.
 * @param {number} stored
 * @param {{ unsignedSum: number, signedSum: number }} computed
 * @returns {boolean}
 */
export function isChecksumValid(stored, computed) {
  return stored === computed.unsignedSum || stored === computed.signedSum;
}

/**
 * Determines whether a 512-byte block is all zeros.
 * @param {Uint8Array} buffer
 * @param {number} offset
 * @returns {boolean}
 */
export function isZeroBlock(buffer, offset) {
  const end = Math.min(offset + 512, buffer.length);
  for (let i = offset; i < end; i += 1) {
    if (buffer[i] !== 0) return false;
  }
  return true;
}

/**
 * Detects format family: POSIX ustar, GNU tar, POSIX PAX, or Legacy V7.
 * @param {string} magic
 * @param {string} version
 * @param {string} typeflag
 * @returns {string}
 */
export function detectHeaderFormat(magic, version, typeflag) {
  if (typeflag === 'x' || typeflag === 'g') {
    return 'POSIX PAX';
  }
  if (magic.startsWith('ustar')) {
    if (magic.includes(' ') || version.includes(' ')) {
      return 'GNU tar';
    }
    return 'POSIX ustar';
  }
  if (!magic || magic === '\0\0\0\0\0\0') {
    return 'V7 (Legacy)';
  }
  return 'Tar (v7/compat)';
}

/**
 * Formats a UNIX epoch timestamp (seconds) into an ISO-like UTC string.
 * @param {number} epochSeconds
 * @returns {string}
 */
export function formatMtime(epochSeconds) {
  if (!epochSeconds || epochSeconds <= 0) return '1970-01-01 00:00:00 UTC';
  try {
    const d = new Date(epochSeconds * 1000);
    if (Number.isNaN(d.getTime())) return 'Invalid Date';
    return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Parses PAX extended header records: "<length> <keyword>=<value>\n".
 * @param {Uint8Array} dataBytes
 * @returns {Record<string, string>}
 */
export function parsePaxData(dataBytes) {
  const text = new TextDecoder('utf-8').decode(dataBytes);
  const records = {};
  let pos = 0;
  while (pos < text.length) {
    const spaceIdx = text.indexOf(' ', pos);
    if (spaceIdx === -1) break;
    const lenStr = text.slice(pos, spaceIdx);
    const len = parseInt(lenStr, 10);
    if (Number.isNaN(len) || len <= 0) break;
    let line = text.slice(spaceIdx + 1, pos + len);
    if (line.endsWith('\n')) {
      line = line.slice(0, -1);
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx);
      const val = line.slice(eqIdx + 1);
      records[key] = val;
    }
    pos += len;
  }
  return records;
}

/**
 * Parses a TAR archive from a Uint8Array or ArrayBuffer.
 *
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {{
 *   entries: Array<Object>,
 *   format: string,
 *   totalSize: number,
 *   blockCount: number
 * }}
 */
export function parseTarArchive(input) {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (buffer.length === 0) {
    return { entries: [], format: 'Empty', totalSize: 0, blockCount: 0 };
  }

  if (buffer.length < TAR_BLOCK_SIZE) {
    throw new TarParseError(
      'Archive is truncated: file is smaller than minimum header size of 512 bytes.',
      0,
    );
  }

  let offset = 0;
  let consecutiveZeroBlocks = 0;
  const entries = [];
  let pendingLongName = null;
  let pendingLongLink = null;
  let globalPax = {};
  let pendingPax = null;
  let detectedFormat = null;
  let totalDataSize = 0;

  while (offset < buffer.length) {
    // Check if remaining bytes cannot form a 512-byte header block
    if (offset + TAR_BLOCK_SIZE > buffer.length) {
      if (isZeroBlock(buffer, offset)) {
        break; // Trailing zero padding is allowed
      }
      throw new TarParseError(
        `Archive is truncated: incomplete block (${buffer.length - offset} bytes) ` +
        `at offset ${offset}.`,
        offset,
      );
    }

    // Check for zero block (two consecutive zero blocks mark end-of-archive)
    if (isZeroBlock(buffer, offset)) {
      consecutiveZeroBlocks += 1;
      offset += TAR_BLOCK_SIZE;
      if (consecutiveZeroBlocks >= 2) {
        break;
      }
      continue;
    }

    consecutiveZeroBlocks = 0;
    const header = buffer.subarray(offset, offset + TAR_BLOCK_SIZE);

    // Validate Checksum
    const { unsignedSum, signedSum } = calculateHeaderChecksum(header);
    const storedChecksum = parseOctalBytes(header.subarray(148, 156));
    if (!isChecksumValid(storedChecksum, { unsignedSum, signedSum })) {
      throw new TarParseError(
        `Header checksum mismatch at offset ${offset}: expected 0o${storedChecksum.toString(8)}, ` +
        `calculated 0o${unsignedSum.toString(8)}.`,
        offset,
      );
    }

    // Parse header fields
    const rawName = readNullTerminatedString(header.subarray(0, 100));
    const mode = parseOctalBytes(header.subarray(100, 108));
    const uid = parseOctalBytes(header.subarray(108, 116));
    const gid = parseOctalBytes(header.subarray(116, 124));
    const size = parseSizeBytes(header.subarray(124, 136));
    const mtime = parseOctalBytes(header.subarray(136, 148));
    const typeflagByte = header[156];
    const typeflag = typeflagByte === 0 ? '0' : String.fromCharCode(typeflagByte);
    const rawLinkname = readNullTerminatedString(header.subarray(157, 257));
    const magic = readNullTerminatedString(header.subarray(257, 263));
    const version = readNullTerminatedString(header.subarray(263, 265));
    const uname = readNullTerminatedString(header.subarray(265, 297));
    const gname = readNullTerminatedString(header.subarray(297, 329));
    const devmajor = parseOctalBytes(header.subarray(329, 337));
    const devminor = parseOctalBytes(header.subarray(337, 345));
    const prefix = readNullTerminatedString(header.subarray(345, 500));

    const entryFormat = detectHeaderFormat(magic, version, typeflag);
    if (!detectedFormat && entryFormat !== 'Tar (v7/compat)') {
      detectedFormat = entryFormat;
    }

    const headerOffset = offset;
    offset += TAR_BLOCK_SIZE;

    const isMetaHeader =
      typeflag === TYPE_FLAGS.GNU_LONGLINK ||
      typeflag === TYPE_FLAGS.GNU_LONGLINK_TARGET ||
      typeflag === TYPE_FLAGS.PAX_EXTENDED ||
      typeflag === TYPE_FLAGS.PAX_GLOBAL;

    let effectiveSize = size;
    let displayName = rawName;
    let resolvedData = null;

    if (!isMetaHeader) {
      const effectivePax = { ...globalPax, ...(pendingPax || {}) };

      let resolvedName = rawName;
      let hasLongName = false;
      if (pendingLongName) {
        resolvedName = pendingLongName;
        hasLongName = true;
        pendingLongName = null;
      } else if (effectivePax.path) {
        resolvedName = effectivePax.path;
      } else if (prefix) {
        resolvedName = `${prefix}/${rawName}`;
      }

      let resolvedLinkname = rawLinkname;
      if (pendingLongLink) {
        resolvedLinkname = pendingLongLink;
        pendingLongLink = null;
      } else if (effectivePax.linkpath) {
        resolvedLinkname = effectivePax.linkpath;
      }

      let resolvedSize = size;
      if (effectivePax.size !== undefined) {
        const parsedSize = parseInt(effectivePax.size, 10);
        if (!Number.isNaN(parsedSize) && parsedSize >= 0) {
          resolvedSize = parsedSize;
        }
      }

      let resolvedMtime = mtime;
      if (effectivePax.mtime !== undefined) {
        const parsedMtime = parseFloat(effectivePax.mtime);
        if (!Number.isNaN(parsedMtime)) resolvedMtime = Math.floor(parsedMtime);
      }

      let resolvedUid = uid;
      if (effectivePax.uid !== undefined) {
        const parsedUid = parseInt(effectivePax.uid, 10);
        if (!Number.isNaN(parsedUid)) resolvedUid = parsedUid;
      }

      let resolvedGid = gid;
      if (effectivePax.gid !== undefined) {
        const parsedGid = parseInt(effectivePax.gid, 10);
        if (!Number.isNaN(parsedGid)) resolvedGid = parsedGid;
      }

      let resolvedUname = uname;
      if (effectivePax.uname !== undefined) {
        resolvedUname = effectivePax.uname;
      }

      let resolvedGname = gname;
      if (effectivePax.gname !== undefined) {
        resolvedGname = effectivePax.gname;
      }

      pendingPax = null;

      effectiveSize = resolvedSize;
      displayName = resolvedName;

      resolvedData = {
        resolvedName,
        hasLongName,
        resolvedLinkname,
        resolvedSize,
        resolvedMtime,
        resolvedUid,
        resolvedGid,
        resolvedUname,
        resolvedGname,
      };
    }

    // Check payload boundaries and compute padded data size from effective size
    const paddedDataSize = Math.ceil(effectiveSize / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    if (offset + paddedDataSize > buffer.length) {
      throw new TarParseError(
        `Archive is truncated: entry "${displayName || 'unnamed'}" data (${effectiveSize} bytes) ` +
        `extends beyond file end.`,
        headerOffset,
      );
    }

    // Handle GNU Long Name / Long Link extensions
    if (typeflag === TYPE_FLAGS.GNU_LONGLINK) {
      const payload = buffer.subarray(offset, offset + size);
      pendingLongName = readNullTerminatedString(payload);
      entries.push({
        id: entries.length + 1,
        name: rawName || '././@LongLink',
        rawName,
        targetName: pendingLongName,
        prefix: '',
        type: getEntryType(typeflag),
        typeflag,
        size,
        mode,
        modeOctal: (mode & 0o7777).toString(8).padStart(4, '0'),
        permissions: formatPermissions(mode, typeflag),
        uid,
        gid,
        uname,
        gname,
        mtime,
        mtimeFormatted: formatMtime(mtime),
        checksum: storedChecksum,
        checksumValid: true,
        linkname: '',
        magic,
        version,
        format: 'GNU tar',
        devmajor,
        devminor,
        offset: headerOffset,
      });
      if (!detectedFormat) detectedFormat = 'GNU tar';
    } else if (typeflag === TYPE_FLAGS.GNU_LONGLINK_TARGET) {
      const payload = buffer.subarray(offset, offset + size);
      pendingLongLink = readNullTerminatedString(payload);
      entries.push({
        id: entries.length + 1,
        name: rawName || '././@LongLink',
        rawName,
        targetName: pendingLongLink,
        prefix: '',
        type: getEntryType(typeflag),
        typeflag,
        size,
        mode,
        modeOctal: (mode & 0o7777).toString(8).padStart(4, '0'),
        permissions: formatPermissions(mode, typeflag),
        uid,
        gid,
        uname,
        gname,
        mtime,
        mtimeFormatted: formatMtime(mtime),
        checksum: storedChecksum,
        checksumValid: true,
        linkname: pendingLongLink,
        magic,
        version,
        format: 'GNU tar',
        devmajor,
        devminor,
        offset: headerOffset,
      });
      if (!detectedFormat) detectedFormat = 'GNU tar';
    } else if (typeflag === TYPE_FLAGS.PAX_EXTENDED || typeflag === TYPE_FLAGS.PAX_GLOBAL) {
      const payload = buffer.subarray(offset, offset + size);
      const parsedRecords = parsePaxData(payload);
      if (typeflag === TYPE_FLAGS.PAX_GLOBAL) {
        globalPax = { ...globalPax, ...parsedRecords };
      } else {
        pendingPax = { ...(pendingPax || {}), ...parsedRecords };
      }
      const defaultPaxName = typeflag === TYPE_FLAGS.PAX_GLOBAL
        ? 'pax_global_header'
        : 'pax_extended_header';
      entries.push({
        id: entries.length + 1,
        name: rawName || defaultPaxName,
        rawName,
        paxRecords: parsedRecords,
        prefix: '',
        type: getEntryType(typeflag),
        typeflag,
        size,
        mode,
        modeOctal: (mode & 0o7777).toString(8).padStart(4, '0'),
        permissions: formatPermissions(mode, typeflag),
        uid,
        gid,
        uname,
        gname,
        mtime,
        mtimeFormatted: formatMtime(mtime),
        checksum: storedChecksum,
        checksumValid: true,
        linkname: '',
        magic,
        version,
        format: 'POSIX PAX',
        devmajor,
        devminor,
        offset: headerOffset,
      });
      if (!detectedFormat) detectedFormat = 'POSIX PAX';
    } else {
      // Normal entry (regular file, directory, symlink, device, etc.)
      const {
        resolvedName,
        hasLongName,
        resolvedLinkname,
        resolvedSize,
        resolvedMtime,
        resolvedUid,
        resolvedGid,
        resolvedUname,
        resolvedGname,
      } = resolvedData;

      totalDataSize += resolvedSize;

      entries.push({
        id: entries.length + 1,
        name: resolvedName,
        rawName,
        hasLongName,
        prefix,
        type: getEntryType(typeflag),
        typeflag,
        size: resolvedSize,
        mode,
        modeOctal: (mode & 0o7777).toString(8).padStart(4, '0'),
        permissions: formatPermissions(mode, typeflag),
        uid: resolvedUid,
        gid: resolvedGid,
        uname: resolvedUname,
        gname: resolvedGname,
        mtime: resolvedMtime,
        mtimeFormatted: formatMtime(resolvedMtime),
        checksum: storedChecksum,
        checksumValid: true,
        linkname: resolvedLinkname,
        magic,
        version,
        format: entryFormat,
        devmajor,
        devminor,
        offset: headerOffset,
      });
    }

    offset += paddedDataSize;
  }

  return {
    entries,
    format: detectedFormat || 'POSIX ustar',
    totalSize: totalDataSize,
    blockCount: Math.ceil(buffer.length / TAR_BLOCK_SIZE),
  };
}

/**
 * Creates a valid TAR archive in-memory for testing and sample demonstration.
 * @param {Array<{
 *   name: string,
 *   content?: string|Uint8Array,
 *   typeflag?: string,
 *   linkname?: string,
 *   mode?: number,
 *   mtime?: number,
 *   uname?: string,
 *   gname?: string,
 *   prefix?: string,
 *   useGnuLongName?: boolean,
 *   headerSize?: number
 * }>} files
 * @returns {Uint8Array}
 */
export function createMockTarArchive(files) {
  const blocks = [];

  function stringToBytes(str, len) {
    const bytes = new Uint8Array(len);
    const encoded = new TextEncoder().encode(str);
    bytes.set(encoded.subarray(0, len));
    return bytes;
  }

  function numberToOctal(num, len) {
    const octalStr = num.toString(8).padStart(len - 1, '0') + '\0';
    return stringToBytes(octalStr, len);
  }

  function makeHeaderBlock({
    name,
    mode = 0o644,
    uid = 1000,
    gid = 1000,
    size = 0,
    mtime = 1700000000,
    typeflag = '0',
    linkname = '',
    magic = 'ustar\0',
    version = '00',
    uname = 'user',
    gname = 'staff',
    devmajor = 0,
    devminor = 0,
    prefix = '',
  }) {
    const block = new Uint8Array(TAR_BLOCK_SIZE);
    block.set(stringToBytes(name, 100), 0);
    block.set(numberToOctal(mode, 8), 100);
    block.set(numberToOctal(uid, 8), 108);
    block.set(numberToOctal(gid, 8), 116);
    block.set(numberToOctal(size, 12), 124);
    block.set(numberToOctal(mtime, 12), 136);

    // Pre-fill checksum with 8 spaces
    for (let i = 148; i < 156; i += 1) block[i] = 32;

    block[156] = typeflag.charCodeAt(0) || 0;
    block.set(stringToBytes(linkname, 100), 157);
    block.set(stringToBytes(magic, 6), 257);
    block.set(stringToBytes(version, 2), 263);
    block.set(stringToBytes(uname, 32), 265);
    block.set(stringToBytes(gname, 32), 297);
    if (devmajor > 0) block.set(numberToOctal(devmajor, 8), 329);
    if (devminor > 0) block.set(numberToOctal(devminor, 8), 337);
    if (prefix) block.set(stringToBytes(prefix, 155), 345);

    // Compute checksum
    let sum = 0;
    for (let i = 0; i < TAR_BLOCK_SIZE; i += 1) sum += block[i];
    const chkStr = sum.toString(8).padStart(6, '0') + '\0 ';
    block.set(stringToBytes(chkStr, 8), 148);

    return block;
  }

  for (const file of files) {
    const rawContent = file.content ?? '';
    const contentBytes = typeof rawContent === 'string'
      ? new TextEncoder().encode(rawContent)
      : rawContent;
    const payloadLength = file.typeflag === '5' ? 0 : contentBytes.length;
    const size = file.headerSize !== undefined ? file.headerSize : payloadLength;

    // GNU long filename handling
    const needsLongName = file.useGnuLongName || file.name.length > 100;
    if (needsLongName) {
      const longNameBytes = new TextEncoder().encode(file.name + '\0');
      const longHeader = makeHeaderBlock({
        name: '././@LongLink',
        size: longNameBytes.length,
        typeflag: TYPE_FLAGS.GNU_LONGLINK,
        magic: 'ustar ',
        version: ' \0',
      });
      blocks.push(longHeader);

      const paddedLongName = new Uint8Array(
        Math.ceil(longNameBytes.length / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE,
      );
      paddedLongName.set(longNameBytes);
      blocks.push(paddedLongName);
    }

    const header = makeHeaderBlock({
      name: file.name.slice(0, 100),
      mode: file.mode ?? (file.typeflag === '5' ? 0o755 : 0o644),
      size,
      mtime: file.mtime ?? 1700000000,
      typeflag: file.typeflag ?? '0',
      linkname: file.linkname ?? '',
      uname: file.uname ?? 'user',
      gname: file.gname ?? 'staff',
      prefix: file.prefix ?? '',
      magic: needsLongName ? 'ustar ' : 'ustar\0',
      version: needsLongName ? ' \0' : '00',
    });
    blocks.push(header);

    if (payloadLength > 0) {
      const paddedLen = Math.ceil(payloadLength / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
      const dataBlock = new Uint8Array(paddedLen);
      dataBlock.set(contentBytes);
      blocks.push(dataBlock);
    }
  }

  // Two 512-byte zero blocks at end of archive
  blocks.push(new Uint8Array(TAR_BLOCK_SIZE * 2));

  // Combine blocks
  const totalLength = blocks.reduce((acc, b) => acc + b.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const block of blocks) {
    result.set(block, offset);
    offset += block.length;
  }

  return result;
}
