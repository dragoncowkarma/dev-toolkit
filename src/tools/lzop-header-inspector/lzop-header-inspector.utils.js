/**
 * LZOP container header parser and inspection utilities.
 */

export const LZOP_MAGIC = new Uint8Array([0x89, 0x4c, 0x5a, 0x4f, 0x00, 0x0d, 0x0a, 0x1a, 0x0a]);

export const FLAGS = {
  F_ADLER32_D: 0x00000001,
  F_ADLER32_C: 0x00000002,
  F_STDIN: 0x00000004,
  F_STDOUT: 0x00000008,
  F_NAME_DEFAULT: 0x00000010,
  F_DOSISH: 0x00000020,
  F_H_EXTRA_FIELD: 0x00000040,
  F_H_GMTDIFF: 0x00000080,
  F_CRC32_D: 0x00000100,
  F_CRC32_C: 0x00000200,
  F_MULTIPART: 0x00000400,
  F_H_FILTER: 0x00000800,
  F_H_CRC32: 0x00001000,
  F_H_PATH: 0x00002000,
  F_MASK: 0x00003fff,
  F_OS_MASK: 0xff000000,
  F_CS_MASK: 0x00f00000,
};

export const OS_NAMES = {
  0: 'FAT (DOS, OS/2, Win95)',
  1: 'Amiga',
  2: 'VMS',
  3: 'Unix',
  4: 'VM/CMS',
  5: 'Atari',
  6: 'OS/2',
  7: 'Mac OS 9',
  8: 'Z-System',
  9: 'CP/M',
  10: 'TOPS-20',
  11: 'NTFS (Win NT/2000/XP)',
  12: 'QDOS',
  13: 'Acorn',
  14: 'VFAT (Win32)',
  15: 'MFS',
  16: 'BeOS',
  17: 'Tandem',
};

export const CHARSET_NAMES = {
  0: 'Native',
  1: 'Latin-1',
  2: 'DOS',
  3: 'Win32',
  4: 'Win16',
  5: 'UTF-8',
};

export const METHODS = {
  1: 'LZO1X-1',
  2: 'LZO1X-1(15)',
  3: 'LZO1X-999',
};

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

/**
 * Computes standard IEEE 802.3 CRC-32 checksum.
 * @param {Uint8Array} bytes
 * @returns {number} 32-bit unsigned integer
 */
export function computeCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Computes standard Adler-32 checksum.
 * @param {Uint8Array} bytes
 * @returns {number} 32-bit unsigned integer
 */
export function computeAdler32(bytes) {
  let s1 = 1;
  let s2 = 0;
  const MOD = 65521;
  for (let i = 0; i < bytes.length; i++) {
    s1 = (s1 + bytes[i]) % MOD;
    s2 = (s2 + s1) % MOD;
  }
  return (((s2 << 16) | s1) >>> 0);
}

/**
 * Formats a 16-bit hex version number into a human-readable string
 * (e.g. 0x1030 -> "1.03 (0x1030)").
 * In lzop, version numbers are formatted as ((v >> 12) & 0xf).(v & 0xfff).
 * @param {number} version
 * @returns {string}
 */
export function formatVersion(version) {
  if (typeof version !== 'number' || Number.isNaN(version)) {
    return '0.00';
  }
  const major = ((version >> 12) & 0xf).toString(16);
  let minor = (version & 0xfff).toString(16).padStart(3, '0');
  if (minor.endsWith('0')) {
    minor = minor.slice(0, -1);
  }
  return `${major}.${minor} (0x${version.toString(16).padStart(4, '0')})`;
}

/**
 * Formats a file size in bytes to a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || bytes < 0) return '0 B';
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
 * Formats a POSIX file mode (st_mode) to permissions string (e.g., "-rw-r--r-- (0100644)").
 * @param {number} mode
 * @returns {string}
 */
export function formatMode(mode) {
  if (typeof mode !== 'number') return 'Unknown';
  if (mode === 0) return '0 (None / STDIN)';
  const octal = (mode & 0o777777).toString(8).padStart(6, '0');
  const type = mode & 0o170000;
  let typeChar = '-';
  if (type === 0o040000) typeChar = 'd';
  else if (type === 0o120000) typeChar = 'l';
  else if (type === 0o060000) typeChar = 'b';
  else if (type === 0o020000) typeChar = 'c';
  else if (type === 0o010000) typeChar = 'p';
  else if (type === 0o140000) typeChar = 's';

  const perms = [
    (mode & 0o400) ? 'r' : '-',
    (mode & 0o200) ? 'w' : '-',
    (mode & 0o100) ? 'x' : '-',
    (mode & 0o040) ? 'r' : '-',
    (mode & 0o020) ? 'w' : '-',
    (mode & 0o010) ? 'x' : '-',
    (mode & 0o004) ? 'r' : '-',
    (mode & 0o002) ? 'w' : '-',
    (mode & 0o001) ? 'x' : '-',
  ].join('');

  return `${typeChar}${perms} (0${octal})`;
}

/**
 * Formats unix timestamp in seconds to ISO string or "Not set".
 * @param {bigint|number} seconds
 * @returns {string}
 */
export function formatTimestamp(seconds) {
  const val = typeof seconds === 'bigint' ? seconds : BigInt(seconds || 0);
  if (val === 0n) {
    return 'Not set (0)';
  }
  try {
    const millis = Number(val) * 1000;
    const date = new Date(millis);
    if (Number.isNaN(date.getTime())) {
      return `Invalid timestamp (${val.toString()})`;
    }
    return date.toISOString();
  } catch {
    return `Invalid timestamp (${val.toString()})`;
  }
}

/**
 * Parses the 32-bit flags field.
 * @param {number} flags
 * @returns {object}
 */
export function parseFlags(flags) {
  const osId = (flags >>> 24) & 0xff;
  const charsetId = (flags >>> 20) & 0x0f;
  const osName = OS_NAMES[osId] || `Unknown OS (${osId})`;
  const charsetName = CHARSET_NAMES[charsetId] || `Unknown Charset (${charsetId})`;

  const booleanFlags = {
    adler32D: (flags & FLAGS.F_ADLER32_D) !== 0,
    adler32C: (flags & FLAGS.F_ADLER32_C) !== 0,
    stdin: (flags & FLAGS.F_STDIN) !== 0,
    stdout: (flags & FLAGS.F_STDOUT) !== 0,
    nameDefault: (flags & FLAGS.F_NAME_DEFAULT) !== 0,
    dosish: (flags & FLAGS.F_DOSISH) !== 0,
    extraField: (flags & FLAGS.F_H_EXTRA_FIELD) !== 0,
    gmtDiff: (flags & FLAGS.F_H_GMTDIFF) !== 0,
    crc32D: (flags & FLAGS.F_CRC32_D) !== 0,
    crc32C: (flags & FLAGS.F_CRC32_C) !== 0,
    multipart: (flags & FLAGS.F_MULTIPART) !== 0,
    hasFilter: (flags & FLAGS.F_H_FILTER) !== 0,
    headerCrc32: (flags & FLAGS.F_H_CRC32) !== 0,
    hasPath: (flags & FLAGS.F_H_PATH) !== 0,
  };

  const activeFlagsList = [];
  if (booleanFlags.adler32D) activeFlagsList.push('F_ADLER32_D (Adler-32 data check)');
  if (booleanFlags.adler32C) activeFlagsList.push('F_ADLER32_C (Adler-32 compressed check)');
  if (booleanFlags.stdin) activeFlagsList.push('F_STDIN (Compressed from stdin)');
  if (booleanFlags.stdout) activeFlagsList.push('F_STDOUT (Decompress to stdout)');
  if (booleanFlags.nameDefault) activeFlagsList.push('F_NAME_DEFAULT (Default filename)');
  if (booleanFlags.dosish) activeFlagsList.push('F_DOSISH (DOS file conventions)');
  if (booleanFlags.extraField) activeFlagsList.push('F_H_EXTRA_FIELD (Extra field present)');
  if (booleanFlags.gmtDiff) activeFlagsList.push('F_H_GMTDIFF (GMT difference stored)');
  if (booleanFlags.crc32D) activeFlagsList.push('F_CRC32_D (CRC-32 data check)');
  if (booleanFlags.crc32C) activeFlagsList.push('F_CRC32_C (CRC-32 compressed check)');
  if (booleanFlags.multipart) activeFlagsList.push('F_MULTIPART (Multipart archive)');
  if (booleanFlags.hasFilter) activeFlagsList.push('F_H_FILTER (Filter present)');
  if (booleanFlags.headerCrc32) activeFlagsList.push('F_H_CRC32 (CRC-32 header checksum)');
  else activeFlagsList.push('Header Checksum: Adler-32');
  if (booleanFlags.hasPath) activeFlagsList.push('F_H_PATH (Filename contains path)');

  return {
    raw: flags,
    hex: '0x' + (flags >>> 0).toString(16).padStart(8, '0'),
    osId,
    osName,
    charsetId,
    charsetName,
    booleanFlags,
    activeFlagsList,
  };
}

/**
 * Converts a hex string (ignoring whitespace) into a Uint8Array.
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('Hex input must be a string.');
  }
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length === 0) {
    return new Uint8Array(0);
  }
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd number of nibbles.');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts a Uint8Array into a hex string.
 * @param {Uint8Array} bytes
 * @param {string} [delimiter=' ']
 * @returns {string}
 */
export function bytesToHex(bytes, delimiter = ' ') {
  if (!bytes) return '';
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(delimiter);
}

/**
 * Reads only the header slice of an uploaded File using FileReader.
 * @param {File|Blob} file
 * @param {number} [sliceSize=65536]
 * @returns {Promise<Uint8Array>}
 */
export function readHeaderSlice(file, sliceSize = 65536) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided.'));
      return;
    }
    const slice = file.slice(0, sliceSize);
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file slice.'));
    };
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Parses and validates an LZOP container header.
 * @param {Uint8Array|ArrayBuffer|string} input
 * @returns {object} Parsed header structure
 */
export function parseLzopHeader(input) {
  let bytes;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (typeof input === 'string') {
    bytes = hexToBytes(input);
  } else {
    throw new TypeError('Input must be a Uint8Array, ArrayBuffer, or hex string.');
  }

  if (bytes.length < 9) {
    throw new Error(
      `Truncated LZOP header: input is ${bytes.length} bytes, ` +
        'expected at least 9 bytes for magic signature.'
    );
  }

  // Verify 9-byte magic: 89 4C 5A 4F 00 0D 0A 1A 0A
  for (let i = 0; i < 9; i++) {
    if (bytes[i] !== LZOP_MAGIC[i]) {
      throw new Error(
        'Invalid LZOP magic signature. Expected 89 4C 5A 4F 00 0D 0A 1A 0A.'
      );
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 9;

  function ensureBytes(needed, fieldName) {
    if (offset + needed > bytes.length) {
      throw new Error(
        `Truncated LZOP header: reached end of input while reading ${fieldName} ` +
          `(offset ${offset}, needed ${needed} bytes, total ${bytes.length} bytes).`
      );
    }
  }

  // 1. Version (16-bit BE)
  ensureBytes(2, 'lzop version');
  const version = view.getUint16(offset);
  offset += 2;
  if (version < 0x0900) {
    throw new Error(
      `Unsupported LZOP version: 0x${version.toString(16).padStart(4, '0')}. ` +
        'Version must be at least 0.90 (0x0900).'
    );
  }

  // 2. Library version (16-bit BE)
  ensureBytes(2, 'library version');
  const libVersion = view.getUint16(offset);
  offset += 2;

  // 3. Version needed to extract (16-bit BE, present if version >= 0x0940)
  let versionNeededToExtract = 0x0900;
  if (version >= 0x0940) {
    ensureBytes(2, 'version needed to extract');
    versionNeededToExtract = view.getUint16(offset);
    offset += 2;
    if (versionNeededToExtract < 0x0900) {
      throw new Error(
        `Unsupported extract version: 0x${versionNeededToExtract.toString(16).padStart(4, '0')}. ` +
          'Minimum version is 0.90 (0x0900).'
      );
    }
  }

  // 4. Method (8-bit)
  ensureBytes(1, 'compression method');
  const method = view.getUint8(offset);
  offset += 1;
  if (method <= 0) {
    throw new Error(
      `Invalid compression method: ${method}. Compression method must be greater than 0.`
    );
  }
  const methodName = METHODS[method] || `Unknown (${method})`;

  // 5. Level (8-bit, present if version >= 0x0940)
  let level = 0;
  if (version >= 0x0940) {
    ensureBytes(1, 'compression level');
    level = view.getUint8(offset);
    offset += 1;
  } else {
    level = method === 1 ? 3 : (method === 2 ? 1 : (method === 3 ? 9 : 0));
  }

  // 6. Flags (32-bit BE)
  ensureBytes(4, 'flags');
  const flags = view.getUint32(offset);
  offset += 4;
  const parsedFlags = parseFlags(flags);

  // 7. Filter (32-bit BE, present if F_H_FILTER)
  let filter = null;
  if (parsedFlags.booleanFlags.hasFilter) {
    ensureBytes(4, 'filter');
    filter = view.getUint32(offset);
    offset += 4;
  }

  // 8. Mode (32-bit BE)
  ensureBytes(4, 'file mode');
  const mode = view.getUint32(offset);
  offset += 4;

  // 9. Mtime low (32-bit BE)
  ensureBytes(4, 'mtime low');
  let mtimeLow = view.getUint32(offset);
  offset += 4;

  // 10. Mtime high (32-bit BE, present if version >= 0x0940)
  let mtimeHigh = 0;
  if (version >= 0x0940) {
    ensureBytes(4, 'mtime high');
    mtimeHigh = view.getUint32(offset);
    offset += 4;
  }

  if (version < 0x0120) {
    if (mtimeLow === 0xffffffff) {
      mtimeLow = 0;
    }
    mtimeHigh = 0;
  }
  const mtimeSeconds = (BigInt(mtimeHigh) << 32n) | BigInt(mtimeLow);

  // 11. Filename length (8-bit)
  ensureBytes(1, 'filename length');
  const nameLen = view.getUint8(offset);
  offset += 1;

  // 12. Filename (nameLen bytes)
  let fileName = '';
  if (nameLen > 0) {
    ensureBytes(nameLen, 'filename');
    const nameBytes = bytes.slice(offset, offset + nameLen);
    offset += nameLen;
    if (parsedFlags.charsetId === 1) {
      // Latin-1
      let s = '';
      for (let i = 0; i < nameBytes.length; i++) {
        s += String.fromCharCode(nameBytes[i]);
      }
      fileName = s;
    } else {
      fileName = new TextDecoder('utf-8', { fatal: false }).decode(nameBytes);
    }
  }

  // 13. Header Checksum (32-bit BE)
  const headerContentEnd = offset;
  ensureBytes(4, 'header checksum');
  const headerChecksum = view.getUint32(offset);
  offset += 4;

  const headerContentBytes = bytes.slice(9, headerContentEnd);
  const isCrc32 = parsedFlags.booleanFlags.headerCrc32;
  const computedChecksum = isCrc32
    ? computeCrc32(headerContentBytes)
    : computeAdler32(headerContentBytes);

  if (headerChecksum !== computedChecksum) {
    const expectedHex = '0x' + computedChecksum.toString(16).padStart(8, '0');
    const foundHex = '0x' + headerChecksum.toString(16).padStart(8, '0');
    const type = isCrc32 ? 'CRC32' : 'Adler32';
    throw new Error(
      `Header checksum mismatch: expected ${expectedHex}, found ${foundHex} (${type}).`
    );
  }

  // 14. Optional Extra Field
  let extraField = null;
  if (parsedFlags.booleanFlags.extraField) {
    ensureBytes(4, 'extra field length');
    const extraFieldLen = view.getUint32(offset);
    offset += 4;
    ensureBytes(extraFieldLen, 'extra field data');
    const extraFieldData = bytes.slice(offset, offset + extraFieldLen);
    offset += extraFieldLen;
    ensureBytes(4, 'extra field checksum');
    const extraFieldChecksum = view.getUint32(offset);
    offset += 4;

    const extraLenBytes = new Uint8Array(4);
    new DataView(extraLenBytes.buffer).setUint32(0, extraFieldLen);
    const extraContent = new Uint8Array(4 + extraFieldLen);
    extraContent.set(extraLenBytes, 0);
    extraContent.set(extraFieldData, 4);

    const computedExtraChecksum = isCrc32
      ? computeCrc32(extraContent)
      : computeAdler32(extraContent);

    if (extraFieldChecksum !== computedExtraChecksum) {
      const expHex = '0x' + computedExtraChecksum.toString(16).padStart(8, '0');
      const fndHex = '0x' + extraFieldChecksum.toString(16).padStart(8, '0');
      const type = isCrc32 ? 'CRC32' : 'Adler32';
      throw new Error(
        `Extra field checksum mismatch: expected ${expHex}, found ${fndHex} (${type}).`
      );
    }

    extraField = {
      length: extraFieldLen,
      dataHex: bytesToHex(extraFieldData),
      checksum: '0x' + extraFieldChecksum.toString(16).padStart(8, '0'),
      valid: true,
    };
  }

  return {
    magic: {
      bytes: '89 4C 5A 4F 00 0D 0A 1A 0A',
      valid: true,
    },
    version: {
      raw: version,
      formatted: formatVersion(version),
    },
    libVersion: {
      raw: libVersion,
      formatted: formatVersion(libVersion),
    },
    versionNeededToExtract: {
      raw: versionNeededToExtract,
      formatted: formatVersion(versionNeededToExtract),
    },
    method: {
      raw: method,
      name: methodName,
    },
    level: {
      raw: level,
      formatted: level > 0 ? `Level ${level}` : 'Default (0)',
    },
    flags: parsedFlags,
    filter: filter !== null ? {
      raw: filter,
      hex: '0x' + filter.toString(16).padStart(8, '0'),
    } : null,
    mode: {
      raw: mode,
      octal: '0' + (mode & 0o777777).toString(8).padStart(6, '0'),
      permissions: formatMode(mode),
    },
    mtime: {
      low: mtimeLow,
      high: mtimeHigh,
      seconds: mtimeSeconds.toString(),
      formatted: formatTimestamp(mtimeSeconds),
    },
    fileName: {
      length: nameLen,
      name: fileName,
    },
    checksum: {
      type: isCrc32 ? 'CRC32' : 'Adler32',
      raw: headerChecksum,
      hex: '0x' + headerChecksum.toString(16).padStart(8, '0'),
      computedHex: '0x' + computedChecksum.toString(16).padStart(8, '0'),
      valid: true,
    },
    extraField,
    headerSize: offset,
  };
}

/**
 * Builds a valid LZOP container header for testing or sample demonstration.
 * @param {object} [options={}]
 * @returns {Uint8Array}
 */
export function buildLzopHeader(options = {}) {
  const {
    version = 0x1030,
    libVersion = 0x2080,
    extractVersion = 0x0940,
    method = 1,
    level = 3,
    flags = 0x03000000,
    filter = null,
    mode = 0o100644,
    mtimeLow = 1700000000,
    mtimeHigh = 0,
    fileName = 'sample.txt',
    useCrc32 = false,
    extraFieldData = null,
  } = options;

  let finalFlags = flags;
  if (useCrc32) {
    finalFlags |= FLAGS.F_H_CRC32;
  }
  if (filter !== null) {
    finalFlags |= FLAGS.F_H_FILTER;
  }
  if (extraFieldData !== null) {
    finalFlags |= FLAGS.F_H_EXTRA_FIELD;
  }

  const parts = [];
  function push16(val) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, val);
    parts.push(b);
  }
  function push32(val) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, val);
    parts.push(b);
  }
  function push8(val) {
    parts.push(new Uint8Array([val & 0xff]));
  }

  // Version
  push16(version);
  // Lib Version
  push16(libVersion);
  // Extract Version (if >= 0x0940)
  if (version >= 0x0940) {
    push16(extractVersion);
  }
  // Method
  push8(method);
  // Level (if >= 0x0940)
  if (version >= 0x0940) {
    push8(level);
  }
  // Flags
  push32(finalFlags);
  // Filter
  if (finalFlags & FLAGS.F_H_FILTER) {
    push32(filter ?? 0);
  }
  // Mode
  push32(mode);
  // Mtime low
  push32(mtimeLow);
  // Mtime high (if >= 0x0940)
  if (version >= 0x0940) {
    push32(mtimeHigh);
  }
  // File Name
  let nameBytes;
  if ((finalFlags & FLAGS.F_CS_MASK) === 0x00100000) {
    // Latin-1
    nameBytes = new Uint8Array(fileName.length);
    for (let i = 0; i < fileName.length; i++) {
      nameBytes[i] = fileName.charCodeAt(i) & 0xff;
    }
  } else {
    nameBytes = new TextEncoder().encode(fileName);
  }
  push8(nameBytes.length);
  if (nameBytes.length > 0) {
    parts.push(nameBytes);
  }

  const totalLen = parts.reduce((acc, p) => acc + p.length, 0);
  const headerContent = new Uint8Array(totalLen);
  let cur = 0;
  for (const part of parts) {
    headerContent.set(part, cur);
    cur += part.length;
  }

  const chk = (finalFlags & FLAGS.F_H_CRC32)
    ? computeCrc32(headerContent)
    : computeAdler32(headerContent);

  const checksumBytes = new Uint8Array(4);
  new DataView(checksumBytes.buffer).setUint32(0, chk);

  let extraPart = new Uint8Array(0);
  if (extraFieldData !== null) {
    const extraLen = extraFieldData.length;
    const lenB = new Uint8Array(4);
    new DataView(lenB.buffer).setUint32(0, extraLen);
    const content = new Uint8Array(4 + extraLen);
    content.set(lenB, 0);
    content.set(extraFieldData, 4);
    const extraChk = (finalFlags & FLAGS.F_H_CRC32)
      ? computeCrc32(content)
      : computeAdler32(content);
    const chkB = new Uint8Array(4);
    new DataView(chkB.buffer).setUint32(0, extraChk);
    extraPart = new Uint8Array(4 + extraLen + 4);
    extraPart.set(lenB, 0);
    extraPart.set(extraFieldData, 4);
    extraPart.set(chkB, 4 + extraLen);
  }

  const fullHeader = new Uint8Array(9 + headerContent.length + 4 + extraPart.length);
  fullHeader.set(LZOP_MAGIC, 0);
  fullHeader.set(headerContent, 9);
  fullHeader.set(checksumBytes, 9 + headerContent.length);
  if (extraPart.length > 0) {
    fullHeader.set(extraPart, 9 + headerContent.length + 4);
  }

  return fullHeader;
}

export const SAMPLE_LZOP_BYTES = buildLzopHeader({
  fileName: 'example.tar',
  method: 1,
  level: 3,
  version: 0x1030,
  libVersion: 0x2080,
  mode: 0o100644,
  mtimeLow: 1700000000,
});

export const SAMPLE_LZOP_HEX = bytesToHex(SAMPLE_LZOP_BYTES);
