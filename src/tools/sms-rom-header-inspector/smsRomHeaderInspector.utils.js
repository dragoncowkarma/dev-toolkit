/**
 * Utility functions and constants for inspecting Sega Master System and
 * Sega Game Gear ROM headers.
 */

export const SIGNATURE = 'TMR SEGA';
export const SIGNATURE_BYTES = Object.freeze([0x54, 0x4d, 0x52, 0x20, 0x53, 0x45, 0x47, 0x41]);

export const HEADER_OFFSETS = Object.freeze([0x7ff0, 0x3ff0, 0x1ff0]);

export const REGION_CODES = Object.freeze({
  0x3: 'SMS Japan',
  0x4: 'SMS Export',
  0x5: 'GG Japan',
  0x6: 'GG Export',
  0x7: 'GG International',
});

export const ROM_SIZE_CODES = Object.freeze({
  0xa: 8 * 1024,
  0xb: 16 * 1024,
  0xc: 32 * 1024,
  0xd: 48 * 1024,
  0xe: 64 * 1024,
  0xf: 128 * 1024,
  0x0: 256 * 1024,
  0x1: 512 * 1024,
  0x2: 1024 * 1024,
});

export const ROM_SIZE_LABELS = Object.freeze({
  0xa: '8 KB',
  0xb: '16 KB',
  0xc: '32 KB',
  0xd: '48 KB',
  0xe: '64 KB',
  0xf: '128 KB',
  0x0: '256 KB',
  0x1: '512 KB',
  0x2: '1 MB',
});

/**
 * Standard checksum ranges defined by the ROM size code according to Sega BIOS specifications.
 * Ranges represent [start, end) half-open intervals to sum.
 */
export const CHECKSUM_RANGES = Object.freeze({
  0xa: Object.freeze([[0, 0x1ff0]]),
  0xb: Object.freeze([[0, 0x3ff0]]),
  0xc: Object.freeze([[0, 0x7ff0]]),
  0xd: Object.freeze([[0, 0xbff0]]),
  0xe: Object.freeze([[0, 0x7ff0], [0x8000, 0x10000]]),
  0xf: Object.freeze([[0, 0x7ff0], [0x8000, 0x20000]]),
  0x0: Object.freeze([[0, 0x7ff0], [0x8000, 0x40000]]),
  0x1: Object.freeze([[0, 0x7ff0], [0x8000, 0x80000]]),
  0x2: Object.freeze([[0, 0x7ff0], [0x8000, 0x100000]]),
});

const DEFAULT_CHUNK_SIZE = 16 * 1024;

/**
 * Reads a Blob as an ArrayBuffer, using Blob.arrayBuffer when available
 * or falling back to FileReader.
 *
 * @param {Blob} blob
 * @returns {Promise<ArrayBuffer>}
 */
export function readBlobAsArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
      reader.readAsArrayBuffer(blob);
    });
  }
  return Promise.reject(new Error('FileReader or Blob.arrayBuffer not available'));
}

/**
 * Formats a byte size into human readable string.
 *
 * @param {number} bytes Number of bytes.
 * @returns {string} Formatted size string.
 */
export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Formats a 16-bit integer as a 4-digit hexadecimal string prefixed with 0x.
 *
 * @param {number} value Number to format.
 * @returns {string} Formatted hex string.
 */
export function formatHex16(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0x0000';
  }
  return `0x${(value & 0xffff).toString(16).padStart(4, '0').toUpperCase()}`;
}

/**
 * Checks if a byte slice starts with the TMR SEGA ASCII signature.
 *
 * @param {Uint8Array|number[]} bytes Array of bytes to check.
 * @returns {boolean} True if signature matches.
 */
export function matchesSignature(bytes) {
  if (!bytes || bytes.length < 8) {
    return false;
  }
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== SIGNATURE_BYTES[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Decodes the 2.5-byte BCD product code from the header.
 * Byte 12 contains lower BCD digits, Byte 13 contains middle BCD digits,
 * and the upper nibble of Byte 14 contains the high digit.
 *
 * @param {number} byte12 Byte at relative offset 0x0C.
 * @param {number} byte13 Byte at relative offset 0x0D.
 * @param {number} byte14 Byte at relative offset 0x0E.
 * @returns {object} Decoded product code details.
 */
export function parseProductCode(byte12, byte13, byte14) {
  const b12 = byte12 ?? 0;
  const b13 = byte13 ?? 0;
  const b14 = byte14 ?? 0;

  const high = (b14 >> 4) & 0x0f;
  const midHigh = (b13 >> 4) & 0x0f;
  const midLow = b13 & 0x0f;
  const lowHigh = (b12 >> 4) & 0x0f;
  const lowLow = b12 & 0x0f;

  const isBcd = midHigh <= 9 && midLow <= 9 && lowHigh <= 9 && lowLow <= 9;
  let code = '';
  if (isBcd) {
    if (high > 0) {
      code = `${high}${midHigh}${midLow}${lowHigh}${lowLow}`;
    } else {
      code = `${midHigh}${midLow}${lowHigh}${lowLow}`;
    }
  } else {
    const rawHex = `${high.toString(16)}${midHigh.toString(16)}` +
      `${midLow.toString(16)}${lowHigh.toString(16)}${lowLow.toString(16)}`;
    code = rawHex.toUpperCase();
  }

  return {
    code,
    highNibble: high,
    bcdBytes: [b12, b13],
    isBcd,
  };
}

/**
 * Synchronously parses a 16-byte Sega Master System ROM header.
 *
 * @param {Uint8Array|ArrayBuffer|number[]} rawBytes 16 bytes of header data.
 * @param {object} [options] Parsing options.
 * @param {number} [options.headerOffset=0x7ff0] Offset where header was located.
 * @param {number} [options.fileSize] Real file size for bounds verification.
 * @returns {object} Parsed header object with diagnostics.
 */
export function parseSmsHeader(rawBytes, options = {}) {
  const diagnostics = [];
  if (!rawBytes || rawBytes.length < 16) {
    return {
      valid: false,
      signature: '',
      reservedBytes: [0, 0],
      checksum: 0,
      productCode: '',
      version: 0,
      regionCode: 0,
      region: 'Unknown',
      romSizeCode: 0,
      romSizeBytes: null,
      romSizeLabel: 'Unknown',
      headerOffset: options.headerOffset ?? 0,
      fileSize: options.fileSize ?? 0,
      rawBytes: [],
      diagnostics: ['Header data is too short (less than 16 bytes)'],
    };
  }

  const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
  const signatureBytes = bytes.slice(0, 8);
  const signature = String.fromCharCode(...signatureBytes);
  const hasValidSignature = matchesSignature(signatureBytes);

  if (!hasValidSignature) {
    diagnostics.push("Missing 'TMR SEGA' signature");
  }

  const reservedBytes = [bytes[8], bytes[9]];
  const checksum = bytes[10] | (bytes[11] << 8);

  const productCodeInfo = parseProductCode(bytes[12], bytes[13], bytes[14]);
  const version = bytes[14] & 0x0f;

  const regionCode = (bytes[15] >> 4) & 0x0f;
  const romSizeCode = bytes[15] & 0x0f;

  const region = REGION_CODES[regionCode] || null;
  if (!region) {
    diagnostics.push(`Unknown region code: 0x${regionCode.toString(16).toUpperCase()}`);
  }

  const romSizeBytes = ROM_SIZE_CODES[romSizeCode] ?? null;
  const romSizeLabel = ROM_SIZE_LABELS[romSizeCode] ?? null;
  if (romSizeBytes === null) {
    diagnostics.push(`Unknown ROM size code: 0x${romSizeCode.toString(16).toUpperCase()}`);
  }

  const headerOffset = options.headerOffset ?? 0x7ff0;
  const fileSize = options.fileSize ?? null;

  if (fileSize !== null && typeof fileSize === 'number') {
    if (fileSize < headerOffset + 16) {
      diagnostics.push(
        `Truncated file: size is ${fileSize} bytes, smaller than header ` +
        `offset 0x${headerOffset.toString(16).toUpperCase()}`
      );
    } else if (romSizeBytes !== null && fileSize < romSizeBytes) {
      diagnostics.push(
        `Truncated file: size is ${fileSize} bytes, expected at least ${romSizeBytes} bytes`
      );
    }
  }

  return {
    valid: hasValidSignature,
    signature,
    reservedBytes,
    checksum,
    productCode: productCodeInfo.code,
    productCodeDetails: productCodeInfo,
    version,
    regionCode,
    region: region || `Unknown (0x${regionCode.toString(16).toUpperCase()})`,
    romSizeCode,
    romSizeBytes,
    romSizeLabel: romSizeLabel || `Unknown (0x${romSizeCode.toString(16).toUpperCase()})`,
    headerOffset,
    fileSize,
    rawBytes: Array.from(bytes.slice(0, 16)),
    diagnostics,
  };
}

/**
 * Reads a bounded 16-byte slice from a File, Blob, or buffer.
 *
 * @param {Blob|File|Uint8Array|ArrayBuffer} file Source file or buffer.
 * @param {number} offset Start byte offset.
 * @returns {Promise<Uint8Array|null>} 16-byte header slice or null if out of bounds.
 */
export async function readHeaderSlice(file, offset) {
  if (!file) {
    return null;
  }

  if (typeof Blob !== 'undefined' && file instanceof Blob) {
    if (file.size < offset + 16) {
      return null;
    }
    const sliceBlob = file.slice(offset, offset + 16);
    const buffer = await readBlobAsArrayBuffer(sliceBlob);
    return new Uint8Array(buffer);
  }

  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
  if (bytes.length < offset + 16) {
    return null;
  }
  return bytes.slice(offset, offset + 16);
}

/**
 * Searches for a valid TMR SEGA header across standard offsets.
 *
 * @param {Blob|File|Uint8Array|ArrayBuffer} file Source file or buffer.
 * @param {object} [options] Search options.
 * @param {number[]} [options.offsets=HEADER_OFFSETS] Offsets to check.
 * @param {number} [options.fileSize] Total file size.
 * @returns {Promise<{offset: number, bytes: Uint8Array}|null>}
 */
/**
 * Determines layout priority rank for a given header offset and file size.
 * Lower value indicates higher priority (closer to expected hardware/BIOS layout).
 *
 * @param {number} offset Candidate header offset.
 * @param {number} [fileSize] Total ROM file size in bytes.
 * @returns {number} Layout priority rank (0 = highest).
 */
export function getHeaderOffsetPriority(offset, fileSize) {
  if (typeof fileSize === 'number' && fileSize > 0) {
    if (fileSize >= 0x8000) {
      if (offset === 0x7ff0) return 0;
      if (offset === 0x3ff0) return 1;
      if (offset === 0x1ff0) return 2;
      return 3;
    }
    if (fileSize >= 0x4000) {
      if (offset === 0x3ff0) return 0;
      if (offset === 0x1ff0) return 1;
      if (offset === 0x7ff0) return 2;
      return 3;
    }
    if (offset === 0x1ff0) return 0;
    if (offset === 0x3ff0) return 1;
    if (offset === 0x7ff0) return 2;
    return 3;
  }
  if (offset === 0x7ff0) return 0;
  if (offset === 0x3ff0) return 1;
  if (offset === 0x1ff0) return 2;
  return 3;
}

/**
 * Prioritizes candidate header search offsets according to ROM size and layout.
 * For >= 32 KB ROMs, 0x7FF0 is standard, followed by 0x3FF0 and 0x1FF0.
 * For 16 KB ROMs, 0x3FF0 is standard, followed by 0x1FF0.
 * For 8 KB ROMs, 0x1FF0 is standard.
 *
 * @param {number} fileSize Total ROM size in bytes.
 * @param {readonly number[]} [offsets=HEADER_OFFSETS] Offsets to prioritize.
 * @returns {number[]} Offsets ordered by ROM layout priority.
 */
export function getCandidateHeaderOffsets(fileSize, offsets = HEADER_OFFSETS) {
  return [...offsets].sort(
    (a, b) => getHeaderOffsetPriority(a, fileSize) - getHeaderOffsetPriority(b, fileSize)
  );
}

/**
 * Searches for a valid TMR SEGA header across standard offsets.
 * When multiple signatures are present, selects the candidate matching
 * the ROM size layout priority without letting plausible metadata at earlier
 * arbitrary data offsets override the actual expected header location.
 * Metadata validity is only used as a tiebreaker for equal layout priorities.
 *
 * @param {Blob|File|Uint8Array|ArrayBuffer} file Source file or buffer.
 * @param {object} [options] Search options.
 * @param {number[]} [options.offsets=HEADER_OFFSETS] Offsets to check.
 * @param {number} [options.fileSize] Total file size.
 * @returns {Promise<{offset: number, bytes: Uint8Array}|null>}
 */
export async function findSmsHeader(file, options = {}) {
  const offsets = options.offsets || HEADER_OFFSETS;
  const realFileSize = options.fileSize ?? file?.size ?? file?.byteLength ?? file?.length ?? 0;
  const prioritizedOffsets = getCandidateHeaderOffsets(realFileSize, offsets);

  const candidates = [];
  for (const offset of prioritizedOffsets) {
    if (realFileSize > 0 && realFileSize < offset + 16) {
      continue;
    }
    const slice = await readHeaderSlice(file, offset);
    if (slice && matchesSignature(slice)) {
      candidates.push({ offset, bytes: slice });
    }
  }

  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  // When multiple signatures exist, ROM layout priority is the primary decider.
  // Candidates at the expected layout offset (e.g. 0x7FF0 for >= 32 KB ROMs)
  // must not be overridden by earlier arbitrary ROM data with plausible metadata.
  // Metadata validity is only used as a tiebreaker for equal layout priorities.
  const scored = candidates.map((cand, index) => {
    const priority = getHeaderOffsetPriority(cand.offset, realFileSize);
    const regionCode = (cand.bytes[15] >> 4) & 0x0f;
    const romSizeCode = cand.bytes[15] & 0x0f;
    let score = 0;
    if (REGION_CODES[regionCode] !== undefined) score += 2;
    if (ROM_SIZE_CODES[romSizeCode] !== undefined) score += 2;
    return { cand, priority, score, index };
  });

  scored.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });

  return scored[0].cand;
}

/**
 * Recomputes the 16-bit little-endian checksum over the ranges specified by the
 * ROM size code in accordance with Sega Master System BIOS rules.
 *
 * @param {Blob|File|Uint8Array|ArrayBuffer} fileOrBytes ROM file or buffer.
 * @param {number} romSizeCode ROM size code (0..15).
 * @param {object} [options] Checksum options.
 * @param {number} [options.chunkSize] Bounded slice chunk size.
 * @returns {Promise<{
 *   computedChecksum: number|null,
 *   bytesProcessed: number,
 *   isTruncated: boolean,
 *   error?: string
 * }>}
 */
export async function computeSmsChecksum(fileOrBytes, romSizeCode, options = {}) {
  const ranges = CHECKSUM_RANGES[romSizeCode];
  if (!ranges) {
    return {
      computedChecksum: null,
      bytesProcessed: 0,
      isTruncated: false,
      error: `Unknown ROM size code: 0x${(romSizeCode ?? 0).toString(16).toUpperCase()}`,
    };
  }

  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const expectedBytes = ranges.reduce((acc, [start, end]) => acc + (end - start), 0);
  let sum = 0;
  let totalBytesProcessed = 0;

  if (typeof Blob !== 'undefined' && fileOrBytes instanceof Blob) {
    const fileSize = fileOrBytes.size;

    for (const [rangeStart, rangeEnd] of ranges) {
      if (rangeStart >= fileSize) {
        continue;
      }
      const clampedEnd = Math.min(rangeEnd, fileSize);
      for (let offset = rangeStart; offset < clampedEnd; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, clampedEnd);
        const sliceBlob = fileOrBytes.slice(offset, end);
        const buffer = await readBlobAsArrayBuffer(sliceBlob);
        const chunk = new Uint8Array(buffer);
        for (let i = 0; i < chunk.length; i++) {
          sum = (sum + chunk[i]) & 0xffff;
        }
        totalBytesProcessed += chunk.length;
      }
    }

    return {
      computedChecksum: sum,
      bytesProcessed: totalBytesProcessed,
      isTruncated: totalBytesProcessed < expectedBytes,
    };
  }

  const bytes = fileOrBytes instanceof Uint8Array ? fileOrBytes : new Uint8Array(fileOrBytes);
  const fileSize = bytes.length;

  for (const [rangeStart, rangeEnd] of ranges) {
    if (rangeStart >= fileSize) {
      continue;
    }
    const clampedEnd = Math.min(rangeEnd, fileSize);
    for (let pos = rangeStart; pos < clampedEnd; pos++) {
      sum = (sum + bytes[pos]) & 0xffff;
      totalBytesProcessed++;
    }
  }

  return {
    computedChecksum: sum,
    bytesProcessed: totalBytesProcessed,
    isTruncated: totalBytesProcessed < expectedBytes,
  };
}

/**
 * Inspects a Sega Master System / Game Gear ROM file using bounded slices.
 *
 * @param {Blob|File|Uint8Array|ArrayBuffer} file ROM file or buffer.
 * @param {object} [options] Inspection options.
 * @returns {Promise<object>} Complete inspection results and diagnostics.
 */
export async function inspectSmsRom(file, options = {}) {
  const realFileSize = options.fileSize ?? file?.size ?? file?.byteLength ?? file?.length ?? 0;
  const headerInfo = await findSmsHeader(file, { ...options, fileSize: realFileSize });

  if (!headerInfo) {
    const diagnostics = [
      "Missing 'TMR SEGA' signature at offsets 0x1FF0, 0x3FF0, 0x7FF0",
    ];
    if (realFileSize > 0 && realFileSize < 0x2000) {
      diagnostics.push(
        `Truncated file: size is ${realFileSize} bytes, smaller than minimum ROM size (8192 bytes)`
      );
    }
    return {
      valid: false,
      fileSize: realFileSize,
      headerOffset: null,
      header: null,
      computedChecksum: null,
      checksumValid: false,
      checksumStatus: 'Missing header',
      diagnostics,
    };
  }

  const header = parseSmsHeader(headerInfo.bytes, {
    headerOffset: headerInfo.offset,
    fileSize: realFileSize,
  });

  let computedChecksum = null;
  let checksumValid = false;
  let checksumStatus = 'Not evaluated';

  if (header.romSizeBytes !== null) {
    if (realFileSize > 0 && realFileSize < header.romSizeBytes) {
      checksumStatus = 'Mismatch (truncated file)';
      checksumValid = false;
    } else {
      const checksumResult = await computeSmsChecksum(file, header.romSizeCode, {
        chunkSize: options.chunkSize,
      });

      computedChecksum = checksumResult.computedChecksum;
      if (computedChecksum !== null) {
        checksumValid = computedChecksum === header.checksum;
        checksumStatus = checksumValid ? 'Match' : 'Mismatch';
        if (!checksumValid) {
          header.diagnostics.push(
            `Checksum mismatch: stored ${formatHex16(header.checksum)}, ` +
            `computed ${formatHex16(computedChecksum)}`
          );
        }
      }
    }
  } else {
    checksumStatus = 'Unknown ROM size';
  }

  return {
    valid: header.valid,
    fileSize: realFileSize,
    headerOffset: headerInfo.offset,
    header,
    computedChecksum,
    checksumValid,
    checksumStatus,
    diagnostics: header.diagnostics,
  };
}

/**
 * Formats a comprehensive text summary of the inspection result.
 * Handles every diagnostic state including missing headers.
 *
 * @param {object} inspection Inspection result from inspectSmsRom.
 * @returns {string} Formatted text summary.
 */
export function generateSummary(inspection) {
  if (!inspection) {
    return 'No ROM inspected.';
  }

  const lines = [
    '=== Sega Master System / Game Gear ROM Header ===',
    `File Size: ${formatFileSize(inspection.fileSize || 0)} (${inspection.fileSize || 0} bytes)`,
  ];

  if (!inspection.header) {
    lines.push('Header: Not found');
    lines.push('Status: Invalid ROM');
  } else {
    const h = inspection.header;
    const activeOffset = inspection.headerOffset ?? h.headerOffset ?? 0;
    const offsetHex = `0x${activeOffset.toString(16).toUpperCase()}`;
    lines.push(`Header Offset: ${offsetHex}`);
    lines.push(`Signature: ${h.signature}`);
    lines.push(`Product Code: ${h.productCode || 'None'}`);
    lines.push(`Version: ${h.version}`);
    lines.push(`Region: ${h.region} (Code: 0x${h.regionCode.toString(16).toUpperCase()})`);
    lines.push(`ROM Size: ${h.romSizeLabel} (Code: 0x${h.romSizeCode.toString(16).toUpperCase()})`);
    lines.push(`Checksum: ${formatHex16(h.checksum)}`);
    lines.push(
      `Computed Checksum: ${
        inspection.computedChecksum !== null ? formatHex16(inspection.computedChecksum) : 'N/A'
      } (${inspection.checksumStatus})`
    );
    const isClean = inspection.valid &&
      inspection.checksumValid &&
      inspection.diagnostics.length === 0;
    lines.push(`Status: ${isClean ? 'Valid' : 'Has Diagnostics'}`);
  }

  const diagnostics = inspection.diagnostics || [];
  if (diagnostics.length > 0) {
    lines.push('Diagnostics:');
    diagnostics.forEach((d) => lines.push(`  - ${d}`));
  } else {
    lines.push('Diagnostics: None');
  }

  return lines.join('\n');
}

/**
 * Helper to construct mock SMS/GG ROM bytes for testing and demonstration.
 *
 * @param {object} [options]
 * @returns {Uint8Array} Generated ROM bytes.
 */
export function createMockSmsRom({
  signature = SIGNATURE,
  reserved = [0x00, 0x00],
  checksum = null,
  productCode = 53412,
  version = 0,
  regionCode = 0x4,
  romSizeCode = 0xc,
  headerOffset = 0x7ff0,
  totalSize = 32 * 1024,
  fillByte = 0x00,
} = {}) {
  const rom = new Uint8Array(totalSize);
  rom.fill(fillByte);

  if (headerOffset + 16 <= totalSize && signature) {
    for (let i = 0; i < signature.length && i < 8; i++) {
      rom[headerOffset + i] = signature.charCodeAt(i);
    }

    rom[headerOffset + 8] = reserved[0] ?? 0;
    rom[headerOffset + 9] = reserved[1] ?? 0;

    const high = Math.floor(productCode / 10000) & 0x0f;
    const mid = Math.floor((productCode / 100) % 100);
    const low = productCode % 100;

    const b12 = (((Math.floor(low / 10) % 10) & 0x0f) << 4) | ((low % 10) & 0x0f);
    const b13 = (((Math.floor(mid / 10) % 10) & 0x0f) << 4) | ((mid % 10) & 0x0f);
    const b14 = ((high & 0x0f) << 4) | (version & 0x0f);

    rom[headerOffset + 12] = b12;
    rom[headerOffset + 13] = b13;
    rom[headerOffset + 14] = b14;

    rom[headerOffset + 15] = ((regionCode & 0x0f) << 4) | (romSizeCode & 0x0f);

    if (checksum !== null) {
      rom[headerOffset + 10] = checksum & 0xff;
      rom[headerOffset + 11] = (checksum >> 8) & 0xff;
    } else {
      const ranges = CHECKSUM_RANGES[romSizeCode];
      if (ranges) {
        let sum = 0;
        for (const [start, end] of ranges) {
          const actualEnd = Math.min(end, totalSize);
          for (let i = start; i < actualEnd; i++) {
            sum = (sum + rom[i]) & 0xffff;
          }
        }
        rom[headerOffset + 10] = sum & 0xff;
        rom[headerOffset + 11] = (sum >> 8) & 0xff;
      }
    }
  }

  return rom;
}
