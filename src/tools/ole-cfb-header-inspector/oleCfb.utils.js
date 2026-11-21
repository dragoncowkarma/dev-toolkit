/**
 * OLE Compound File Binary (CFB / OLE2) parser and header inspector utilities.
 * Client-side only pure module operating on ArrayBuffer.
 */

export const CFB_SIGNATURE = Object.freeze([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

export const SPECIAL_SECTOR = Object.freeze({
  MAX_REGULAR: 0xfffffffa,
  RESERVED: 0xfffffffb,
  DIFSECT: 0xfffffffc,
  FATSECT: 0xfffffffd,
  ENDOFCHAIN: 0xfffffffe,
  FREESECT: 0xffffffff,
});

/**
 * Checks whether the given byte sequence matches the 8-byte OLE CFB signature.
 *
 * @param {Uint8Array} bytes - First 8 bytes of the file.
 * @returns {boolean} True if signature matches.
 */
export function isValidCfbSignature(bytes) {
  if (!bytes || bytes.length < 8) return false;
  return CFB_SIGNATURE.every((expectedByte, index) => bytes[index] === expectedByte);
}

/**
 * Formats a byte array into space-separated uppercase hex pairs.
 *
 * @param {Uint8Array|number[]} bytes - Bytes to format.
 * @returns {string} Formatted hex string.
 */
export function formatHexBytes(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

/**
 * Formats a 16-byte CLSID into a canonical registry GUID string.
 *
 * @param {Uint8Array} bytes - 16 bytes CLSID.
 * @returns {string} Formatted GUID string, e.g. {00000000-0000-0000-0000-000000000000}.
 */
export function formatClsid(bytes) {
  if (!bytes || bytes.length < 16) {
    return '{00000000-0000-0000-0000-000000000000}';
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, 16);
  const data1 = view.getUint32(0, true).toString(16).toUpperCase().padStart(8, '0');
  const data2 = view.getUint16(4, true).toString(16).toUpperCase().padStart(4, '0');
  const data3 = view.getUint16(6, true).toString(16).toUpperCase().padStart(4, '0');
  const data4Part1 = Array.from(bytes.slice(8, 10))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join('');
  const data4Part2 = Array.from(bytes.slice(10, 16))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join('');
  return `{${data1}-${data2}-${data3}-${data4Part1}-${data4Part2}}`;
}

/**
 * Formats a 32-bit sector index into a human-readable string.
 *
 * @param {number} sector - 32-bit sector index or special constant.
 * @returns {string} Formatted sector string.
 */
export function formatSectorLocation(sector) {
  if (sector === SPECIAL_SECTOR.ENDOFCHAIN) {
    return '0xFFFFFFFE (ENDOFCHAIN)';
  }
  if (sector === SPECIAL_SECTOR.FREESECT) {
    return '0xFFFFFFFF (FREESECT)';
  }
  if (sector === SPECIAL_SECTOR.FATSECT) {
    return '0xFFFFFFFD (FATSECT)';
  }
  if (sector === SPECIAL_SECTOR.DIFSECT) {
    return '0xFFFFFFFC (DIFSECT)';
  }
  if (sector === SPECIAL_SECTOR.RESERVED) {
    return '0xFFFFFFFB (RESERVED)';
  }
  const hex = '0x' + sector.toString(16).toUpperCase().padStart(8, '0');
  return `Sector ${sector} (${hex})`;
}

/**
 * Formats a file byte count into a human-readable size string.
 *
 * @param {number} bytes - Number of bytes.
 * @returns {string} Formatted size string (e.g. "12.3 KB").
 */
export function formatFileSize(bytes) {
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
 * Parses an OLE Compound File Binary (CFB) header from an ArrayBuffer or typed array.
 *
 * @param {ArrayBuffer|ArrayBufferView} input - The raw file buffer.
 * @returns {object} The parsed header properties.
 * @throws {TypeError} If input is not an ArrayBuffer or typed array.
 * @throws {Error} If header is truncated, invalid, or violates bounds checks.
 */
export function parseOleCfbHeader(input) {
  if (!input || !(input instanceof ArrayBuffer || ArrayBuffer.isView(input))) {
    throw new TypeError('Input must be an ArrayBuffer or TypedArray view.');
  }

  const byteLength = input.byteLength;
  if (byteLength < 512) {
    throw new Error('Truncated file: buffer size is smaller than the minimum 512-byte CFB header.');
  }

  const buffer = input instanceof ArrayBuffer ? input : input.buffer;
  const byteOffset = input instanceof ArrayBuffer ? 0 : input.byteOffset;
  const view = new DataView(buffer, byteOffset, byteLength);
  const u8 = new Uint8Array(buffer, byteOffset, byteLength);

  // Validate magic signature: D0 CF 11 E0 A1 B1 1A E1
  const headerSignatureBytes = u8.slice(0, 8);
  if (!isValidCfbSignature(headerSignatureBytes)) {
    throw new Error(
      'Invalid OLE CFB file signature: magic bytes do not match CFBF specification.',
    );
  }

  // Header CLSID (offset 8, 16 bytes)
  const clsidBytes = u8.slice(8, 24);
  const clsid = formatClsid(clsidBytes);

  // Minor version (offset 24, 2 bytes uint16le)
  const minorVersion = view.getUint16(24, true);

  // Major version (offset 26, 2 bytes uint16le: 3 or 4)
  const majorVersion = view.getUint16(26, true);
  if (majorVersion !== 3 && majorVersion !== 4) {
    throw new Error(
      `Unsupported CFB major version: ${majorVersion} (expected version 3 or 4).`,
    );
  }

  // Byte order (offset 28, 2 bytes uint16le: must be 0xFFFE)
  const byteOrder = view.getUint16(28, true);
  if (byteOrder !== 0xfffe) {
    const hex = '0x' + byteOrder.toString(16).toUpperCase().padStart(4, '0');
    throw new Error(`Invalid byte order: ${hex} (expected 0xFFFE for little-endian).`);
  }

  // Sector shift (offset 30, 2 bytes uint16le: 9 for v3, 12 for v4)
  const sectorShift = view.getUint16(30, true);
  const expectedSectorShift = majorVersion === 3 ? 9 : 12;
  if (sectorShift !== expectedSectorShift) {
    throw new Error(
      `Invalid sector shift ${sectorShift} for major version ${majorVersion}: ` +
        `expected ${expectedSectorShift} (${1 << expectedSectorShift} bytes).`,
    );
  }
  const sectorSize = 1 << sectorShift;

  // Mini sector shift (offset 32, 2 bytes uint16le: must be 6)
  const miniSectorShift = view.getUint16(32, true);
  if (miniSectorShift !== 6) {
    throw new Error(
      `Invalid mini-sector shift ${miniSectorShift}: expected 6 (64 bytes).`,
    );
  }
  const miniSectorSize = 1 << miniSectorShift;

  // Reserved (offset 34, 6 bytes)
  const reservedBytes = u8.slice(34, 40);

  // For version 4, header sector is 4096 bytes and padding bytes 512..4095 must be zero
  if (majorVersion === 4) {
    if (byteLength < sectorSize) {
      throw new Error(
        'Truncated file: CFB version 4 requires at least 4096 bytes for the header sector.',
      );
    }
    for (let i = 512; i < sectorSize; i++) {
      if (u8[i] !== 0) {
        throw new Error(
          `Invalid CFB version 4 header: sector padding from byte 512 to 4095 ` +
            `must be zero (non-zero byte found at offset ${i}).`,
        );
      }
    }
  }

  // Number of directory sectors (offset 40, 4 bytes uint32le)
  const numDirectorySectors = view.getUint32(40, true);
  if (majorVersion === 3 && numDirectorySectors !== 0) {
    throw new Error(
      `Invalid directory sector count (${numDirectorySectors}) for version 3: must be 0.`,
    );
  }

  // Number of FAT sectors (offset 44, 4 bytes uint32le)
  const numFatSectors = view.getUint32(44, true);

  // First directory sector location (offset 48, 4 bytes uint32le)
  const firstDirectorySectorLocation = view.getUint32(48, true);

  // Transaction signature number (offset 52, 4 bytes uint32le)
  const transactionSignatureNumber = view.getUint32(52, true);

  // Mini stream cutoff size (offset 56, 4 bytes uint32le: must be 4096)
  const miniStreamCutoffSize = view.getUint32(56, true);
  if (miniStreamCutoffSize !== 4096) {
    throw new Error(
      `Invalid mini stream cutoff size: ${miniStreamCutoffSize} bytes (expected 4096 bytes).`,
    );
  }

  // First mini FAT sector location (offset 60, 4 bytes uint32le)
  const firstMiniFatSectorLocation = view.getUint32(60, true);

  // Number of mini FAT sectors (offset 64, 4 bytes uint32le)
  const numMiniFatSectors = view.getUint32(64, true);

  // First DIFAT sector location (offset 68, 4 bytes uint32le)
  const firstDifatSectorLocation = view.getUint32(68, true);

  // Number of DIFAT sectors (offset 72, 4 bytes uint32le)
  const numDifatSectors = view.getUint32(72, true);

  // Bounds checking against available file capacity
  const maxAvailableSectors = Math.max(0, Math.floor(byteLength / sectorSize) - 1);

  if (numFatSectors > maxAvailableSectors) {
    throw new Error(
      `Declared FAT sector count (${numFatSectors}) exceeds total available sectors ` +
        `(${maxAvailableSectors}).`,
    );
  }

  if (numMiniFatSectors > maxAvailableSectors) {
    throw new Error(
      `Declared mini FAT sector count (${numMiniFatSectors}) exceeds total available ` +
        `sectors (${maxAvailableSectors}).`,
    );
  }

  if (numDifatSectors > maxAvailableSectors) {
    throw new Error(
      `Declared DIFAT sector count (${numDifatSectors}) exceeds total available sectors ` +
        `(${maxAvailableSectors}).`,
    );
  }

  if (numDirectorySectors > maxAvailableSectors) {
    throw new Error(
      `Declared directory sector count (${numDirectorySectors}) exceeds total available ` +
        `sectors (${maxAvailableSectors}).`,
    );
  }

  const maxSectorLabel = maxAvailableSectors > 0 ? maxAvailableSectors - 1 : 'none';

  if (
    firstDirectorySectorLocation <= SPECIAL_SECTOR.MAX_REGULAR &&
    firstDirectorySectorLocation >= maxAvailableSectors
  ) {
    throw new Error(
      `Declared first directory sector location (${firstDirectorySectorLocation}) ` +
        `exceeds file bounds (max sector: ${maxSectorLabel}).`,
    );
  }

  if (
    firstMiniFatSectorLocation <= SPECIAL_SECTOR.MAX_REGULAR &&
    firstMiniFatSectorLocation >= maxAvailableSectors
  ) {
    throw new Error(
      `Declared first mini FAT sector location (${firstMiniFatSectorLocation}) ` +
        `exceeds file bounds (max sector: ${maxSectorLabel}).`,
    );
  }

  if (
    firstDifatSectorLocation <= SPECIAL_SECTOR.MAX_REGULAR &&
    firstDifatSectorLocation >= maxAvailableSectors
  ) {
    throw new Error(
      `Declared first DIFAT sector location (${firstDifatSectorLocation}) ` +
        `exceeds file bounds (max sector: ${maxSectorLabel}).`,
    );
  }

  // First 109 DIFAT entries in the header (offset 76..512)
  const difatEntries = [];
  const activeDifatEntries = [];
  for (let i = 0; i < 109; i++) {
    const entrySector = view.getUint32(76 + i * 4, true);
    difatEntries.push(entrySector);
    if (entrySector !== SPECIAL_SECTOR.FREESECT) {
      if (entrySector > SPECIAL_SECTOR.MAX_REGULAR) {
        throw new Error(
          `Invalid DIFAT entry at index ${i}: reserved sector marker ` +
            `${formatSectorLocation(entrySector)} cannot be a FAT sector location.`,
        );
      }
      if (entrySector >= maxAvailableSectors) {
        throw new Error(
          `DIFAT entry at index ${i} (sector ${entrySector}) exceeds file bounds ` +
            `(max sector: ${maxSectorLabel}).`,
        );
      }
      activeDifatEntries.push({ index: i, sector: entrySector });
    }
  }

  return {
    fileSize: byteLength,
    fileSizeFormatted: formatFileSize(byteLength),
    magicHex: formatHexBytes(headerSignatureBytes),
    clsid,
    minorVersion,
    majorVersion,
    byteOrder,
    byteOrderFormatted: `0x${byteOrder.toString(16).toUpperCase()} (Little-Endian)`,
    sectorShift,
    sectorSize,
    miniSectorShift,
    miniSectorSize,
    reservedHex: formatHexBytes(reservedBytes),
    numDirectorySectors,
    numFatSectors,
    firstDirectorySectorLocation,
    firstDirectorySectorLocationFormatted: formatSectorLocation(firstDirectorySectorLocation),
    transactionSignatureNumber,
    miniStreamCutoffSize,
    firstMiniFatSectorLocation,
    firstMiniFatSectorLocationFormatted: formatSectorLocation(firstMiniFatSectorLocation),
    numMiniFatSectors,
    firstDifatSectorLocation,
    firstDifatSectorLocationFormatted: formatSectorLocation(firstDifatSectorLocation),
    numDifatSectors,
    difatEntries,
    activeDifatEntries,
    maxAvailableSectors,
  };
}

/**
 * Creates a valid minimal CFB header buffer for testing or demonstrations.
 *
 * @param {object} [options={}] - Custom overrides for header fields.
 * @returns {ArrayBuffer} 512-byte (or custom size) CFB buffer.
 */
export function createMinimalCfbBuffer(options = {}) {
  const major = options.majorVersion ?? 3;
  const defaultShift = major === 4 ? 12 : 9;
  const defaultSize = major === 4 ? 4096 : 512;
  const size = options.size ?? defaultSize;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // CFB magic: D0 CF 11 E0 A1 B1 1A E1
  CFB_SIGNATURE.forEach((byte, idx) => {
    u8[idx] = byte;
  });

  // Header CLSID: offset 8, 16 bytes zeroes
  if (options.clsidBytes) {
    u8.set(options.clsidBytes, 8);
  }

  // Minor version (offset 24): default 0x003E
  view.setUint16(24, options.minorVersion ?? 0x003e, true);
  // Major version (offset 26): 3 or 4
  view.setUint16(26, major, true);
  // Byte order (offset 28): default 0xFFFE
  view.setUint16(28, options.byteOrder ?? 0xfffe, true);
  // Sector shift (offset 30)
  view.setUint16(30, options.sectorShift ?? defaultShift, true);
  // Mini sector shift (offset 32): default 6
  view.setUint16(32, options.miniSectorShift ?? 6, true);
  // Reserved (offset 34..39): 6 bytes zero
  // Number of directory sectors (offset 40)
  view.setUint32(40, options.numDirectorySectors ?? 0, true);
  // Number of FAT sectors (offset 44)
  view.setUint32(44, options.numFatSectors ?? 0, true);
  // First directory sector location (offset 48): default 0xFFFFFFFE (ENDOFCHAIN)
  view.setUint32(48, options.firstDirectorySectorLocation ?? SPECIAL_SECTOR.ENDOFCHAIN, true);
  // Transaction signature (offset 52)
  view.setUint32(52, options.transactionSignatureNumber ?? 0, true);
  // Mini stream cutoff size (offset 56): default 4096
  view.setUint32(56, options.miniStreamCutoffSize ?? 4096, true);
  // First mini FAT sector location (offset 60): default 0xFFFFFFFE
  view.setUint32(60, options.firstMiniFatSectorLocation ?? SPECIAL_SECTOR.ENDOFCHAIN, true);
  // Number of mini FAT sectors (offset 64)
  view.setUint32(64, options.numMiniFatSectors ?? 0, true);
  // First DIFAT sector location (offset 68): default 0xFFFFFFFE
  view.setUint32(68, options.firstDifatSectorLocation ?? SPECIAL_SECTOR.ENDOFCHAIN, true);
  // Number of DIFAT sectors (offset 72)
  view.setUint32(72, options.numDifatSectors ?? 0, true);

  // DIFAT entries (offset 76..512, 109 entries): default 0xFFFFFFFF (FREESECT)
  for (let i = 0; i < 109; i++) {
    const entry =
      options.difatEntries && options.difatEntries[i] !== undefined
        ? options.difatEntries[i]
        : SPECIAL_SECTOR.FREESECT;
    view.setUint32(76 + i * 4, entry, true);
  }

  return buffer;
}
