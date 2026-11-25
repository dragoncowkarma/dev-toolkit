/**
 * Vectrex Cartridge ROM Header Inspector Utilities
 *
 * Vectrex ROM header format (at offset 0x0000):
 * - Bytes 0..5: Signature prefix "g GCE " (0x67, 0x20, 0x47, 0x43, 0x45, 0x20)
 * - String up to 0x80: Copyright / Developer string (e.g. "g GCE 1982\x80")
 * - 2 bytes: Music pointer (16-bit big-endian, e.g. 0xFD0D)
 * - 4 bytes: Splash text parameters:
 *     - Height (signed int8, e.g. -8 / 0xF8)
 *     - Width (signed int8, e.g. 80 / 0x50)
 *     - Rel Y (signed int8, e.g. 32 / 0x20)
 *     - Rel X (signed int8, e.g. -85 / 0xAB)
 * - String up to 0x80: Title string (e.g. "MINE STORM\x80")
 * - 1 byte: 0x00 header terminator
 */

export const VECTREX_SIGNATURE = 'g GCE ';
export const VECTREX_STRING_TERMINATOR = 0x80;
export const VECTREX_HEADER_TERMINATOR = 0x00;
export const MAX_HEADER_PREFIX_BYTES = 512;
export const MAX_ROM_SIZE_BYTES = 32 * 1024; // 32 KiB (32768 bytes)
export const MIN_HEADER_BYTES = 15; // Minimum possible header size

/**
 * Common Vectrex BIOS music addresses mapped to titles.
 */
export const KNOWN_BIOS_MUSIC = {
  0xfd0d: 'Power-On / Mine Storm',
  0xfd1d: 'Berzerk',
  0xfe38: 'Armor..Attack',
  0xfe76: 'Clean Sweep',
  0xfeb6: 'Star Hawk',
  0xfec6: 'Rip Off',
  0xfef8: 'Hyperchase',
  0xff16: 'Scramble',
  0xff44: 'Fortress of Narzod',
  0xff62: 'Bedlam',
  0xff7a: 'Polar Rescue',
  0xff8f: 'Solar Quest',
};

/**
 * Checks whether an integer is a positive power of two.
 *
 * @param {number} n
 * @returns {boolean}
 */
export function isPowerOfTwo(n) {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/**
 * Converts an unsigned 8-bit byte into a signed 8-bit integer (-128..127).
 *
 * @param {number} byte
 * @returns {number}
 */
export function toSignedInt8(byte) {
  const normalized = byte & 0xff;
  return normalized > 127 ? normalized - 256 : normalized;
}

/**
 * Formats a number as a hexadecimal string with a dollar sign ($XXXX).
 *
 * @param {number} value
 * @param {number} [digits=2]
 * @returns {string}
 */
export function formatHex(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '';
  }
  return `$${(value >>> 0).toString(16).toUpperCase().padStart(digits, '0')}`;
}

/**
 * Formats byte count into a human-readable size string.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Generates a formatted hex dump view for a byte array.
 *
 * @param {Uint8Array|number[]} bytes
 * @param {number} [bytesPerLine=16]
 * @returns {string}
 */
export function formatHexDump(bytes, bytesPerLine = 16) {
  if (!bytes || bytes.length === 0) return '';
  const lines = [];
  for (let i = 0; i < bytes.length; i += bytesPerLine) {
    const chunk = bytes.slice(i, i + bytesPerLine);
    const hexParts = [];
    let asciiPart = '';
    for (let j = 0; j < bytesPerLine; j++) {
      if (j < chunk.length) {
        const b = chunk[j];
        hexParts.push(b.toString(16).toUpperCase().padStart(2, '0'));
        asciiPart += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
      } else {
        hexParts.push('  ');
      }
    }
    const offsetStr = i.toString(16).toUpperCase().padStart(4, '0');
    lines.push(`${offsetStr}: ${hexParts.join(' ')} | ${asciiPart}`);
  }
  return lines.join('\n');
}

/**
 * Parses and validates a Vectrex cartridge ROM header from a prefix buffer.
 *
 * @param {Uint8Array|ArrayBuffer|number[]} data - Header prefix bytes.
 * @param {number} [fileSize=null] - Full ROM file size in bytes.
 * @returns {object} Parsed header fields, flags, errors, and warnings.
 */
export function parseVectrexHeader(data, fileSize = null) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
  const actualFileSize = typeof fileSize === 'number' ? fileSize : bytes.length;

  const errors = [];
  const warnings = [];
  const flags = {
    tooSmall: false,
    missingSignature: false,
    missingTerminator: false,
    notPowerOfTwo: false,
    exceeds32KiB: false,
  };

  // Flag file size constraints
  if (actualFileSize < MIN_HEADER_BYTES || bytes.length < MIN_HEADER_BYTES) {
    flags.tooSmall = true;
    errors.push(
      `File is too small for a valid Vectrex header (minimum ${MIN_HEADER_BYTES} bytes required).`
    );
  }

  if (!isPowerOfTwo(actualFileSize)) {
    flags.notPowerOfTwo = true;
    warnings.push(`File size (${actualFileSize} bytes) is not a power of two.`);
  }

  if (actualFileSize > MAX_ROM_SIZE_BYTES) {
    flags.exceeds32KiB = true;
    warnings.push(
      `File size (${actualFileSize} bytes) exceeds standard Vectrex cartridge limit of 32 KiB.`
    );
  }

  // Validate signature prefix: "g GCE "
  const sigBytes = Array.from(bytes.slice(0, 6));
  const sigStr = String.fromCharCode(...sigBytes);
  if (bytes.length < 6 || sigStr !== VECTREX_SIGNATURE) {
    flags.missingSignature = true;
    errors.push(
      `Missing signature: Expected '${VECTREX_SIGNATURE}' at start of header.`
    );
  }

  // Find copyright string terminator (0x80)
  let copyrightEnd = -1;
  const maxCopyrightScan = Math.min(bytes.length, 64);
  for (let i = 0; i < maxCopyrightScan; i++) {
    if (bytes[i] === VECTREX_STRING_TERMINATOR) {
      copyrightEnd = i;
      break;
    }
    // If a non-ASCII byte appears after the signature, copyright is missing its terminator
    if (i >= 6 && (bytes[i] < 32 || bytes[i] > 126)) {
      break;
    }
  }

  if (copyrightEnd === -1) {
    flags.missingTerminator = true;
    flags.tooSmall = true;
    errors.push('Missing terminator: Copyright string is not terminated by 0x80.');
    return {
      valid: false,
      fileSize: actualFileSize,
      flags,
      errors,
      warnings,
      copyright:
        bytes.length > 0
          ? String.fromCharCode(...bytes.slice(0, Math.min(bytes.length, 32)))
          : '',
      copyrightNotice: '',
      musicPointer: null,
      musicPointerHex: '',
      musicName: null,
      titleHeight: null,
      titleHeightRaw: null,
      titleWidth: null,
      titleWidthRaw: null,
      titleRelY: null,
      titleRelYRaw: null,
      titleRelX: null,
      titleRelXRaw: null,
      title: '',
      headerSize: bytes.length,
    };
  }

  const copyrightBytes = bytes.slice(0, copyrightEnd);
  const copyright = String.fromCharCode(...copyrightBytes);
  const copyrightNotice = copyright.startsWith(VECTREX_SIGNATURE)
    ? copyright.slice(VECTREX_SIGNATURE.length).trim()
    : copyright;

  let offset = copyrightEnd + 1;

  // Read 16-bit big-endian music pointer
  if (offset + 2 > bytes.length) {
    flags.tooSmall = true;
    errors.push('Truncated header: File ended before music pointer.');
    return {
      valid: false,
      fileSize: actualFileSize,
      flags,
      errors,
      warnings,
      copyright,
      copyrightNotice,
      musicPointer: null,
      musicPointerHex: '',
      musicName: null,
      titleHeight: null,
      titleHeightRaw: null,
      titleWidth: null,
      titleWidthRaw: null,
      titleRelY: null,
      titleRelYRaw: null,
      titleRelX: null,
      titleRelXRaw: null,
      title: '',
      headerSize: offset,
    };
  }

  const musicPointer = (bytes[offset] << 8) | bytes[offset + 1];
  const musicPointerHex = formatHex(musicPointer, 4);
  const musicName = KNOWN_BIOS_MUSIC[musicPointer] || null;
  offset += 2;

  // Read splash text display parameters (height, width, rel Y, rel X)
  if (offset + 4 > bytes.length) {
    flags.tooSmall = true;
    errors.push('Truncated header: File ended before text display parameters.');
    return {
      valid: false,
      fileSize: actualFileSize,
      flags,
      errors,
      warnings,
      copyright,
      copyrightNotice,
      musicPointer,
      musicPointerHex,
      musicName,
      titleHeight: null,
      titleHeightRaw: null,
      titleWidth: null,
      titleWidthRaw: null,
      titleRelY: null,
      titleRelYRaw: null,
      titleRelX: null,
      titleRelXRaw: null,
      title: '',
      headerSize: offset,
    };
  }

  const titleHeightRaw = bytes[offset];
  const titleWidthRaw = bytes[offset + 1];
  const titleRelYRaw = bytes[offset + 2];
  const titleRelXRaw = bytes[offset + 3];

  const titleHeight = toSignedInt8(titleHeightRaw);
  const titleWidth = toSignedInt8(titleWidthRaw);
  const titleRelY = toSignedInt8(titleRelYRaw);
  const titleRelX = toSignedInt8(titleRelXRaw);
  offset += 4;

  // Find title string terminator (0x80)
  let titleEnd = -1;
  const maxTitleScan = Math.min(bytes.length, offset + 128);
  for (let i = offset; i < maxTitleScan; i++) {
    if (bytes[i] === VECTREX_STRING_TERMINATOR) {
      titleEnd = i;
      break;
    }
    // If non-printable ASCII before 0x80, title terminator is missing
    if (bytes[i] < 32 || bytes[i] > 126) {
      break;
    }
  }

  if (titleEnd === -1) {
    flags.missingTerminator = true;
    flags.tooSmall = true;
    errors.push('Missing terminator: Title string is not terminated by 0x80.');
    return {
      valid: false,
      fileSize: actualFileSize,
      flags,
      errors,
      warnings,
      copyright,
      copyrightNotice,
      musicPointer,
      musicPointerHex,
      musicName,
      titleHeight,
      titleHeightRaw,
      titleWidth,
      titleWidthRaw,
      titleRelY,
      titleRelYRaw,
      titleRelX,
      titleRelXRaw,
      title: String.fromCharCode(...bytes.slice(offset)),
      headerSize: bytes.length,
    };
  }

  const titleBytes = bytes.slice(offset, titleEnd);
  const title = String.fromCharCode(...titleBytes);
  offset = titleEnd + 1;

  // Verify header terminator 0x00 immediately following title terminator
  if (offset >= bytes.length) {
    flags.missingTerminator = true;
    flags.tooSmall = true;
    errors.push('Missing terminator: Header terminator 0x00 missing after title string.');
    return {
      valid: false,
      fileSize: actualFileSize,
      flags,
      errors,
      warnings,
      copyright,
      copyrightNotice,
      musicPointer,
      musicPointerHex,
      musicName,
      titleHeight,
      titleHeightRaw,
      titleWidth,
      titleWidthRaw,
      titleRelY,
      titleRelYRaw,
      titleRelX,
      titleRelXRaw,
      title,
      headerSize: offset,
    };
  }

  if (bytes[offset] !== VECTREX_HEADER_TERMINATOR) {
    flags.missingTerminator = true;
    errors.push(
      `Missing terminator: Expected 0x00 after title string, found ${formatHex(bytes[offset])}.`
    );
  }

  const headerSize = offset + 1;
  const valid =
    errors.length === 0 &&
    !flags.missingSignature &&
    !flags.missingTerminator &&
    !flags.tooSmall;

  return {
    valid,
    fileSize: actualFileSize,
    headerSize,
    copyright,
    copyrightNotice,
    musicPointer,
    musicPointerHex,
    musicName,
    titleHeight,
    titleHeightRaw,
    titleWidth,
    titleWidthRaw,
    titleRelY,
    titleRelYRaw,
    titleRelX,
    titleRelXRaw,
    title,
    flags,
    errors,
    warnings,
  };
}

/**
 * Reads only a bounded prefix of a File or Blob, never loading the whole ROM.
 *
 * @param {File|Blob} file
 * @param {number} [maxBytes=MAX_HEADER_PREFIX_BYTES]
 * @returns {Promise<Uint8Array>}
 */
export function readRomHeaderPrefix(file, maxBytes = MAX_HEADER_PREFIX_BYTES) {
  if (!file) {
    return Promise.reject(new TypeError('File or Blob is required.'));
  }

  return new Promise((resolve, reject) => {
    try {
      const slice = file.slice(0, maxBytes);
      if (typeof slice.arrayBuffer === 'function') {
        slice.arrayBuffer().then(
          (buffer) => resolve(new Uint8Array(buffer)),
          () => readWithFileReader(slice, resolve, reject)
        );
        return;
      }
      readWithFileReader(slice, resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

function readWithFileReader(blob, resolve, reject) {
  const reader = new FileReader();
  reader.onload = () => {
    resolve(new Uint8Array(reader.result));
  };
  reader.onerror = () => reject(new Error('Failed to read ROM header.'));
  reader.readAsArrayBuffer(blob);
}

/**
 * Helper to construct a synthetic Vectrex cartridge header for testing or samples.
 *
 * @param {object} [options]
 * @returns {Uint8Array}
 */
export function buildVectrexHeader({
  copyright = 'g GCE 1982',
  musicPointer = 0xfd0d,
  titleHeight = -8,
  titleWidth = 80,
  titleRelY = 32,
  titleRelX = -85,
  title = 'MINE STORM',
  omitCopyrightTerminator = false,
  omitMusicPointer = false,
  omitTextParams = false,
  omitTitleTerminator = false,
  omitHeaderTerminator = false,
  corruptHeaderTerminator = false,
  totalRomSize = null,
} = {}) {
  const bytes = [];

  // Copyright string
  for (let i = 0; i < copyright.length; i++) {
    bytes.push(copyright.charCodeAt(i));
  }
  if (!omitCopyrightTerminator) {
    bytes.push(VECTREX_STRING_TERMINATOR);
  }

  // Music pointer (16-bit big-endian)
  if (!omitMusicPointer) {
    bytes.push((musicPointer >> 8) & 0xff);
    bytes.push(musicPointer & 0xff);
  }

  // Text display parameters
  if (!omitTextParams) {
    bytes.push(titleHeight & 0xff);
    bytes.push(titleWidth & 0xff);
    bytes.push(titleRelY & 0xff);
    bytes.push(titleRelX & 0xff);
  }

  // Title string
  for (let i = 0; i < title.length; i++) {
    bytes.push(title.charCodeAt(i));
  }
  if (!omitTitleTerminator) {
    bytes.push(VECTREX_STRING_TERMINATOR);
  }

  // Header terminator (0x00)
  if (corruptHeaderTerminator) {
    bytes.push(0x55);
  } else if (!omitHeaderTerminator) {
    bytes.push(VECTREX_HEADER_TERMINATOR);
  }

  if (typeof totalRomSize === 'number' && totalRomSize > bytes.length) {
    const fullRom = new Uint8Array(totalRomSize);
    fullRom.set(bytes);
    return fullRom;
  }

  return new Uint8Array(bytes);
}
