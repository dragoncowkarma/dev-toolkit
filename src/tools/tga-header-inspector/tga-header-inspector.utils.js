export const TGA_HEADER_SIZE = 18;
export const TGA_FOOTER_SIZE = 26;
export const TGA_SIGNATURE = 'TRUEVISION-XFILE.';

const IMAGE_TYPE_LABELS = {
  0: 'No image data',
  1: 'Uncompressed color-mapped',
  2: 'Uncompressed true-color',
  3: 'Uncompressed black-and-white (grayscale)',
  9: 'RLE color-mapped',
  10: 'RLE true-color',
  11: 'RLE black-and-white (grayscale)',
};

const INTERLEAVING_LABELS = {
  0: 'None',
  1: 'Two-way (even/odd)',
  2: 'Four-way',
  3: 'Reserved',
};

/** Error thrown when a buffer cannot be parsed as a TGA file. */
export class TgaParseError extends Error {}

/**
 * Resolves a human-readable label for a TGA image type code.
 * @param {number} code - The Image Type byte value.
 * @returns {string} A descriptive label for the image type.
 */
export function getImageTypeLabel(code) {
  return IMAGE_TYPE_LABELS[code] ?? `Unknown (code ${code})`;
}

/**
 * Resolves a human-readable label for a TGA color map type code.
 * @param {number} code - The Color Map Type byte value.
 * @returns {string} A descriptive label for the color map type.
 */
export function getColorMapTypeLabel(code) {
  if (code === 0) return 'No color map';
  if (code === 1) return 'Color map present';
  return `Reserved/custom (code ${code})`;
}

/**
 * Formats a byte count into a human-readable string (e.g. "12.3 KB").
 * @param {number} bytes
 * @returns {string}
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
 * Reads a NUL-terminated byte string starting at `start`, up to `maxLen` bytes,
 * decoding bytes as Latin-1 and trimming surrounding whitespace.
 * @param {DataView} view
 * @param {number} start
 * @param {number} maxLen
 * @returns {string}
 */
function readCString(view, start, maxLen) {
  const bytes = [];
  for (let i = 0; i < maxLen; i += 1) {
    const byte = view.getUint8(start + i);
    if (byte === 0) break;
    bytes.push(byte);
  }
  return bytes.map((byte) => String.fromCharCode(byte)).join('').trim();
}

/**
 * Checks whether the last 26 bytes of the buffer carry the TGA 2.0
 * "TRUEVISION-XFILE.\0" footer signature.
 * @param {DataView} view
 * @param {number} size
 * @returns {boolean}
 */
function hasFooterSignature(view, size) {
  if (size < TGA_HEADER_SIZE + TGA_FOOTER_SIZE) return false;
  const sigStart = size - 18;
  const bytes = [];
  for (let i = 0; i < 18; i += 1) {
    bytes.push(view.getUint8(sigStart + i));
  }
  const text = bytes
    .slice(0, 17)
    .map((byte) => String.fromCharCode(byte))
    .join('');
  return text === TGA_SIGNATURE && bytes[17] === 0;
}

/**
 * Parses the TGA 2.0 extension area, decoding only the fields present within
 * the file's bounds. Fields that would read past the end of the buffer are
 * skipped rather than throwing.
 * @param {DataView} view
 * @param {number} offset - Byte offset of the extension area within the file.
 * @param {number} size - Total file size in bytes.
 * @returns {object} Decoded extension area attributes.
 */
function parseExtensionArea(view, offset, size) {
  const fits = (fieldOffset, length) => offset + fieldOffset + length <= size;

  const extensionSize = fits(0, 2) ? view.getUint16(offset, true) : null;
  const authorName = fits(2, 41) ? readCString(view, offset + 2, 41) || null : null;

  const comments = [];
  for (let i = 0; i < 4; i += 1) {
    const lineOffset = 43 + i * 81;
    if (fits(lineOffset, 81)) {
      const line = readCString(view, offset + lineOffset, 81);
      if (line) comments.push(line);
    }
  }

  let timestamp = null;
  if (fits(367, 12)) {
    const month = view.getUint16(offset + 367, true);
    const day = view.getUint16(offset + 369, true);
    const year = view.getUint16(offset + 371, true);
    const hour = view.getUint16(offset + 373, true);
    const minute = view.getUint16(offset + 375, true);
    const second = view.getUint16(offset + 377, true);
    if (month || day || year || hour || minute || second) {
      timestamp = { month, day, year, hour, minute, second };
    }
  }

  let aspectRatio = null;
  if (fits(474, 4)) {
    const numerator = view.getUint16(offset + 474, true);
    const denominator = view.getUint16(offset + 476, true);
    if (denominator !== 0) {
      aspectRatio = { numerator, denominator, value: numerator / denominator };
    }
  }

  const attributesType = fits(494, 1) ? view.getUint8(offset + 494) : null;

  return { extensionSize, authorName, comments, timestamp, aspectRatio, attributesType };
}

/**
 * Parses the TGA 2.0 footer (last 26 bytes), including best-effort decoding
 * of the extension area when its offset is present and in-bounds.
 * @param {DataView} view
 * @param {number} size
 * @param {string[]} warnings - Collector for non-fatal parsing warnings.
 * @returns {object|null} The decoded footer, or `null` if no footer is present.
 */
function parseFooter(view, size, warnings) {
  if (!hasFooterSignature(view, size)) return null;

  const footerStart = size - TGA_FOOTER_SIZE;
  const extensionAreaOffset = view.getUint32(footerStart, true);
  const developerDirectoryOffset = view.getUint32(footerStart + 4, true);

  let extensionArea = null;
  if (extensionAreaOffset !== 0) {
    if (extensionAreaOffset < TGA_HEADER_SIZE || extensionAreaOffset + 2 > size) {
      warnings.push(
        'Extension area offset points outside of the file; skipping extension area.'
      );
    } else {
      extensionArea = parseExtensionArea(view, extensionAreaOffset, size);
    }
  }

  return { extensionAreaOffset, developerDirectoryOffset, extensionArea };
}

/**
 * Parses a Truevision TGA (TARGA) file's 18-byte header, optional ID field,
 * optional color map, and TGA 2.0 footer/extension area if present.
 * @param {ArrayBuffer} buffer - The raw file bytes.
 * @returns {{header: object, footer: object|null, warnings: string[]}}
 *   The decoded header, footer (or `null`), and any non-fatal warnings.
 * @throws {TgaParseError} When the buffer is too small to hold a valid header.
 */
export function parseTgaHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('Input must be an ArrayBuffer.');
  }

  const size = buffer.byteLength;
  if (size < TGA_HEADER_SIZE) {
    throw new TgaParseError(
      `File is too small to be a valid TGA file: ${size} byte(s) found, ` +
        `at least ${TGA_HEADER_SIZE} are required for the header.`
    );
  }

  const view = new DataView(buffer);
  const warnings = [];

  const idLength = view.getUint8(0);
  const colorMapTypeCode = view.getUint8(1);
  const imageTypeCode = view.getUint8(2);
  const colorMapFirstEntryIndex = view.getUint16(3, true);
  const colorMapLength = view.getUint16(5, true);
  const colorMapEntrySize = view.getUint8(7);
  const xOrigin = view.getUint16(8, true);
  const yOrigin = view.getUint16(10, true);
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const pixelDepth = view.getUint8(16);
  const descriptorByte = view.getUint8(17);

  if (width === 0 || height === 0) {
    warnings.push(`Image has invalid dimensions: ${width}x${height}.`);
  }

  const idFieldEnd = TGA_HEADER_SIZE + idLength;
  let imageId = null;
  if (idLength > 0) {
    if (idFieldEnd > size) {
      warnings.push('Image ID field extends beyond the end of the file; it may be truncated.');
    } else {
      imageId = readCString(view, TGA_HEADER_SIZE, idLength) || null;
    }
  }

  const colorMapByteCount =
    colorMapLength * Math.ceil(colorMapEntrySize / 8);
  const colorMapEnd = Math.min(idFieldEnd, size) + colorMapByteCount;
  if (colorMapLength > 0 && colorMapEnd > size) {
    warnings.push('Color map data appears to be truncated.');
  }

  const header = {
    idLength,
    imageId,
    colorMapType: { value: colorMapTypeCode, label: getColorMapTypeLabel(colorMapTypeCode) },
    imageType: { value: imageTypeCode, label: getImageTypeLabel(imageTypeCode) },
    colorMap: {
      firstEntryIndex: colorMapFirstEntryIndex,
      length: colorMapLength,
      entrySize: colorMapEntrySize,
    },
    image: {
      xOrigin,
      yOrigin,
      width,
      height,
      pixelDepth,
      descriptor: {
        raw: descriptorByte,
        alphaBits: descriptorByte & 0x0f,
        horizontalOrigin: (descriptorByte >> 4) & 1 ? 'right' : 'left',
        verticalOrigin: (descriptorByte >> 5) & 1 ? 'top' : 'bottom',
        interleaving: INTERLEAVING_LABELS[(descriptorByte >> 6) & 0x03],
      },
    },
  };

  const footer = parseFooter(view, size, warnings);

  return { header, footer, warnings };
}
