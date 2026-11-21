const SIGNATURE_BYTES = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
const SIGNATURE_HEADER_SIZE = 32;
const START_HEADER_OFFSET = 32n;

/**
 * Parses the fixed plaintext signature header at the beginning of a 7-Zip archive.
 *
 * @param {ArrayBuffer} buffer - The archive bytes to inspect.
 * @returns {object} Parsed fields, validation state, and readable warnings.
 */
export function parse7zSignatureHeader(buffer) {
  const warnings = [];
  const byteLength = buffer instanceof ArrayBuffer ? buffer.byteLength : 0;
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array();
  const view = buffer instanceof ArrayBuffer ? new DataView(buffer) : null;

  if (!view) {
    warnings.push('The selected data could not be read as an archive file.');
  }
  if (byteLength < SIGNATURE_HEADER_SIZE) {
    warnings.push(
      `File is truncated: a 7z signature header requires ${SIGNATURE_HEADER_SIZE} bytes.`
    );
  }

  const hasSignature = byteLength >= SIGNATURE_BYTES.length;
  const is7z = hasSignature && SIGNATURE_BYTES.every((byte, index) => bytes[index] === byte);
  if (!hasSignature) {
    warnings.push('Signature is truncated: the 7z magic value requires 6 bytes.');
  } else if (!is7z) {
    warnings.push('Invalid 7z signature: this file does not begin with the 7z magic bytes.');
  }

  const majorVersion = readByte(bytes, 6, 'Major version', warnings);
  const minorVersion = readByte(bytes, 7, 'Minor version', warnings);
  const startHeaderCrc = readUint32(view, byteLength, 8, 'StartHeader CRC', warnings);
  const nextHeaderOffset = readUint64(view, byteLength, 12, 'NextHeaderOffset', warnings);
  const nextHeaderSize = readUint64(view, byteLength, 20, 'NextHeaderSize', warnings);
  const nextHeaderCrc = readUint32(view, byteLength, 28, 'NextHeader CRC', warnings);
  const nextHeaderEnd = getNextHeaderEnd(nextHeaderOffset, nextHeaderSize);
  const nextHeaderFits = nextHeaderEnd === null ? null : nextHeaderEnd <= BigInt(byteLength);

  if (nextHeaderFits === false) {
    warnings.push('Next header range exceeds the actual file length.');
  }

  return {
    byteLength,
    is7z,
    warnings,
    version:
      majorVersion === null || minorVersion === null ? null : `${majorVersion}.${minorVersion}`,
    startHeaderCrc,
    nextHeaderOffset,
    nextHeaderSize,
    nextHeaderCrc,
    nextHeaderFits,
  };
}

function readByte(bytes, offset, label, warnings) {
  if (bytes.length <= offset) {
    warnings.push(
      `${label} is unavailable because the file ends before byte ${offset + 1}.`
    );
    return null;
  }
  return bytes[offset];
}

function readUint32(view, byteLength, offset, label, warnings) {
  if (!view || byteLength < offset + 4) {
    warnings.push(`${label} is unavailable because its 4-byte field is truncated.`);
    return null;
  }
  return view.getUint32(offset, true);
}

function readUint64(view, byteLength, offset, label, warnings) {
  if (!view || byteLength < offset + 8) {
    warnings.push(`${label} is unavailable because its 8-byte field is truncated.`);
    return null;
  }
  return view.getBigUint64(offset, true);
}

function getNextHeaderEnd(nextHeaderOffset, nextHeaderSize) {
  if (nextHeaderOffset === null || nextHeaderSize === null) {
    return null;
  }
  return START_HEADER_OFFSET + nextHeaderOffset + nextHeaderSize;
}

/**
 * Formats an unsigned integer CRC as an eight-digit hexadecimal value.
 *
 * @param {number|null} value - CRC value to format.
 * @returns {string} A display-safe CRC value.
 */
export function formatCrc32(value) {
  return value === null ? 'Unavailable' : `0x${value.toString(16).padStart(8, '0').toUpperCase()}`;
}

/**
 * Formats a parsed 64-bit archive value without losing precision.
 *
 * @param {bigint|null} value - 64-bit value to format.
 * @returns {string} A decimal display value.
 */
export function formatUint64(value) {
  return value === null ? 'Unavailable' : value.toString();
}
