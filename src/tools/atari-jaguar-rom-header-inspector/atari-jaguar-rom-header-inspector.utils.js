/**
 * Maximum header region read from the cartridge file.
 * Set to 2048 bytes to cover the cartridge start address at ROM offset 0x404
 * (1028 bytes) both for raw dumps (.j64) and copier-headered (.jag) ROMs
 * (512 + 1028 = 1540 bytes).
 */
export const HEADER_SLICE_SIZE = 2048;

/**
 * Minimum header size required to read CD marker and following fields.
 */
export const MIN_HEADER_SIZE = 40;

/**
 * Standard ASCII CD boot-track marker string (space terminator).
 */
export const MARKER_BOOT_TRACK = 'ATARI APPROVED DATA HEADER ATRI ';

/**
 * Standard ASCII CD track 2 marker string (exclamation terminator).
 */
export const MARKER_TRACK_2 = 'ATARI APPROVED DATA HEADER ATRI!';

/**
 * Default marker text reference for backwards compatibility.
 */
export const MARKER_TEXT = MARKER_TRACK_2;

/**
 * Supported 32-byte header markers.
 */
export const SUPPORTED_MARKERS = [MARKER_TRACK_2, MARKER_BOOT_TRACK];

/**
 * Cartridge start address offset within Jaguar cartridge ROM space.
 * MAME and Jaguar hardware documentation locate the cart start address at 0x800404,
 * which is offset 0x404 (1028 bytes) in the cartridge ROM.
 */
export const CART_START_OFFSET = 0x404;

/**
 * Standard copier header size (512 bytes).
 */
export const COPIER_HEADER_SIZE = 512;

/**
 * Atari Jaguar Cartridge ROM base address in 68000 address space (0x00800000).
 */
export const CART_ROM_BASE = 0x00800000;

/**
 * Maximum cartridge ROM size supported by the Jaguar memory architecture (8 MB).
 */
export const CART_MAX_ROM_SIZE = 8388608;

/**
 * Upper address limit for Jaguar cartridge space (0x00FFFFFF).
 */
export const CART_ROM_END = CART_ROM_BASE + CART_MAX_ROM_SIZE - 1;

const SIZE_CLASSES = [
  { bytes: 524288, label: '512 KB' },
  { bytes: 1048576, label: '1 MB' },
  { bytes: 2097152, label: '2 MB' },
  { bytes: 3145728, label: '3 MB' },
  { bytes: 4194304, label: '4 MB' },
  { bytes: 6291456, label: '6 MB' },
  { bytes: 8388608, label: '8 MB' },
];

function swap16String(str) {
  let swapped = '';
  for (let i = 0; i < str.length; i += 2) {
    swapped += str[i + 1] + str[i];
  }
  return swapped;
}

const SWAPPED_SUPPORTED_MARKERS = SUPPORTED_MARKERS.map(swap16String);

/**
 * Reads up to 2048 bytes of the cartridge ROM header from a File or Blob.
 *
 * @param {Blob|File} file - Uploaded file or blob.
 * @returns {Promise<Uint8Array>} Raw bytes of the header region.
 */
export async function readFileHeader(file) {
  if (!file) {
    throw new Error('No file provided.');
  }
  const slice = file.slice(0, HEADER_SLICE_SIZE);
  if (typeof slice.arrayBuffer === 'function') {
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    };
    reader.onerror = () => {
      reject(new Error('Failed to read the selected file.'));
    };
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Detects the size class label from either the header ROM size field or file size.
 *
 * @param {number|null} romSizeField - 32-bit ROM size field from the header.
 * @param {number} [fileSize] - Total file size in bytes.
 * @returns {string} Detected size class (e.g. '1 MB', '2 MB') or 'Unknown'.
 */
export function detectSizeClass(romSizeField, fileSize) {
  if (typeof romSizeField === 'number' && romSizeField > 0) {
    const match = SIZE_CLASSES.find((entry) => entry.bytes === romSizeField);
    if (match) {
      return match.label;
    }
  }
  if (typeof fileSize === 'number' && fileSize > 0) {
    const match = SIZE_CLASSES.find(
      (entry) => entry.bytes === fileSize || entry.bytes + COPIER_HEADER_SIZE === fileSize,
    );
    if (match) {
      return match.label;
    }
  }
  return 'Unknown';
}

/**
 * Searches for complete standard or byte-swapped Atari Jaguar header marker in bytes.
 *
 * @param {Uint8Array} bytes - Header bytes.
 * @returns {{ offset: number, swapped: boolean, marker: string } | null}
 */
export function findHeaderOffset(bytes) {
  if (!bytes || bytes.length < MIN_HEADER_SIZE) {
    return null;
  }
  let ascii = '';
  for (let i = 0; i < bytes.length; i++) {
    ascii += String.fromCharCode(bytes[i]);
  }

  let bestMatch = null;

  for (let i = 0; i < SUPPORTED_MARKERS.length; i++) {
    const standard = SUPPORTED_MARKERS[i];
    let idx = ascii.indexOf(standard);
    while (idx !== -1) {
      if (!bestMatch || idx < bestMatch.offset) {
        bestMatch = { offset: idx, swapped: false, marker: standard };
      }
      idx = ascii.indexOf(standard, idx + 1);
    }

    const swapped = SWAPPED_SUPPORTED_MARKERS[i];
    let swapIdx = ascii.indexOf(swapped);
    while (swapIdx !== -1) {
      if (!bestMatch || swapIdx < bestMatch.offset) {
        bestMatch = { offset: swapIdx, swapped: true, marker: standard };
      }
      swapIdx = ascii.indexOf(swapped, swapIdx + 1);
    }
  }

  return bestMatch;
}

/**
 * Validates whether an address is a plausible Atari Jaguar cartridge boot/start address.
 *
 * Cartridge ROM space begins at 0x00800000. When file size indicates a known ROM image
 * size, the start address must fall within the ROM's mapped range. Otherwise, it must
 * fall within the Jaguar cartridge address space (0x00800000 - 0x00FFFFFF).
 *
 * @param {number} address - Decoded 32-bit start address.
 * @param {number} [fileSize] - Total file size in bytes.
 * @returns {boolean} True if address is a valid cartridge address.
 */
export function isValidCartridgeAddress(address, fileSize) {
  if (typeof address !== 'number' || !Number.isInteger(address) || address <= 0) {
    return false;
  }
  if (address < CART_ROM_BASE || address > CART_ROM_END) {
    return false;
  }
  if (typeof fileSize === 'number' && fileSize >= 524288) {
    const isCopier = fileSize % 524288 === COPIER_HEADER_SIZE;
    const romSize = isCopier ? fileSize - COPIER_HEADER_SIZE : fileSize;
    if (address >= CART_ROM_BASE + romSize) {
      return false;
    }
  }
  return true;
}

/**
 * Decodes and validates cartridge start address at a specific byte offset.
 *
 * @param {Uint8Array} bytes - Header bytes.
 * @param {number} offset - Byte offset to read from.
 * @param {number} [fileSize] - Total file size in bytes.
 * @returns {number|null} Decoded start address or null if invalid.
 */
function decodeCartridgeAddressAt(bytes, offset, fileSize) {
  if (!bytes || bytes.length < offset + 4) {
    return null;
  }

  const raw =
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0;

  const swapped =
    ((bytes[offset + 1] << 24) |
      (bytes[offset] << 16) |
      (bytes[offset + 3] << 8) |
      bytes[offset + 2]) >>>
    0;

  if (isValidCartridgeAddress(raw, fileSize)) {
    return raw;
  }

  if (isValidCartridgeAddress(swapped, fileSize)) {
    return swapped;
  }

  return null;
}

/**
 * Extracts cartridge start address from ROM offset 0x404 (and 512 + 0x404 for copier headers).
 * Probes the copier-header offset directly at most once without unbounded recursion.
 *
 * @param {Uint8Array} bytes - Header bytes.
 * @param {number} [fileSize] - Total file size in bytes.
 * @returns {number|null} Start address or null if invalid.
 */
export function extractCartridgeStartAddress(bytes, fileSize) {
  if (!bytes || bytes.length < CART_START_OFFSET + 4) {
    return null;
  }

  const isCopierSized =
    typeof fileSize === 'number' &&
    (fileSize % 524288 === COPIER_HEADER_SIZE || fileSize % 1048576 === COPIER_HEADER_SIZE);

  const primaryOffset = isCopierSized
    ? COPIER_HEADER_SIZE + CART_START_OFFSET
    : CART_START_OFFSET;
  const fallbackOffset = isCopierSized
    ? CART_START_OFFSET
    : COPIER_HEADER_SIZE + CART_START_OFFSET;

  const primaryAddress = decodeCartridgeAddressAt(bytes, primaryOffset, fileSize);
  if (primaryAddress !== null) {
    return primaryAddress;
  }

  // Probe the alternate offset at most once (e.g. copier header fallback or absent raw address)
  if (bytes.length >= fallbackOffset + 4) {
    return decodeCartridgeAddressAt(bytes, fallbackOffset, fileSize);
  }

  return null;
}

/**
 * Parses Atari Jaguar ROM header bytes and returns inspected fields.
 *
 * @param {Uint8Array} bytes - Header bytes (up to 2048 bytes).
 * @param {number} [fileSize] - Full file size in bytes.
 * @returns {object} Parsed header fields.
 * @throws {Error} If the file or header is truncated.
 */
export function parseJaguarRomHeader(bytes, fileSize) {
  if (!bytes || bytes.length === 0) {
    throw new Error('Truncated file: file is empty.');
  }

  if (bytes.length < MIN_HEADER_SIZE) {
    throw new Error('Truncated file: header is smaller than 40 bytes.');
  }

  if (typeof fileSize === 'number') {
    if (fileSize === 0) {
      throw new Error('Truncated file: file is empty.');
    }
    if (fileSize < MIN_HEADER_SIZE) {
      throw new Error(
        'Truncated file: file size is smaller than the minimum 40-byte header.',
      );
    }
  }

  const markerMatch = findHeaderOffset(bytes);

  if (!markerMatch) {
    const cartStart = extractCartridgeStartAddress(bytes, fileSize);
    const validBoot =
      typeof cartStart === 'number' && isValidCartridgeAddress(cartStart, fileSize);
    const bootAddress = validBoot ? cartStart : null;
    const bootAddressHex = validBoot
      ? `0x${cartStart.toString(16).toUpperCase().padStart(8, '0')}`
      : 'Unknown';

    return {
      marker: 'Unknown',
      markerPresent: false,
      bootAddress,
      bootAddressHex,
      romSizeField: null,
      romSizeFormatted: 'Unknown',
      sizeClass: detectSizeClass(null, fileSize),
    };
  }

  const { offset, swapped, marker } = markerMatch;

  if (offset + MIN_HEADER_SIZE > bytes.length) {
    throw new Error('Truncated file: incomplete header fields.');
  }

  if (typeof fileSize === 'number' && fileSize < offset + MIN_HEADER_SIZE) {
    throw new Error('Truncated file: file cuts off header fields.');
  }

  let slice = bytes.subarray(offset, offset + MIN_HEADER_SIZE);
  if (swapped) {
    const unswapped = new Uint8Array(MIN_HEADER_SIZE);
    for (let j = 0; j < MIN_HEADER_SIZE; j += 2) {
      unswapped[j] = slice[j + 1];
      unswapped[j + 1] = slice[j];
    }
    slice = unswapped;
  }

  const rawBootAddress =
    ((slice[32] << 24) | (slice[33] << 16) | (slice[34] << 8) | slice[35]) >>>
    0;

  const validBootAddress =
    rawBootAddress !== 0 && rawBootAddress !== 0xffffffff;
  const bootAddress = validBootAddress ? rawBootAddress : null;
  const bootAddressHex = validBootAddress
    ? `0x${rawBootAddress.toString(16).toUpperCase().padStart(8, '0')}`
    : 'Unknown';

  // The longword at offset+36 in a CD boot-track header is the boot-code length
  // in bytes (maximum 64 KB), not a cartridge ROM size header. We report
  // romSizeField as Unknown to avoid mislabeling CD boot-code length as ROM size.
  const sizeClass = detectSizeClass(null, fileSize);

  return {
    marker,
    markerPresent: true,
    bootAddress,
    bootAddressHex,
    romSizeField: null,
    romSizeFormatted: 'Unknown',
    sizeClass,
  };
}

/**
 * Formats a byte size into human-readable text.
 *
 * @param {number} bytes - Number of bytes.
 * @returns {string} Formatted size (e.g. '2.0 MB').
 */
export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || bytes < 0) return 'Unknown';
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
