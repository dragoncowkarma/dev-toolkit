/**
 * Amiga Fast File System (AFFS) / Old File System (OFS) inspection utilities.
 * Handles big-endian parsing, Amiga carry-wraparound bootblock checksums,
 * and root block validation.
 */

export const SECTOR_SIZE = 512;
export const MIN_FLOPPY_SECTORS = 1760;
export const MIN_FLOPPY_BYTES = MIN_FLOPPY_SECTORS * SECTOR_SIZE; // 901,120 bytes
export const AMIGA_EPOCH_MS = 252460800000; // 1978-01-01T00:00:00.000Z

/**
 * Reads a Blob or File slice as an ArrayBuffer.
 * Works across both modern browsers and test environments like JSDOM.
 *
 * @param {Blob|File} blob - Blob slice to read.
 * @returns {Promise<ArrayBuffer>} Promise resolving to ArrayBuffer.
 */
export function readBlobAsArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file slice.'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Reads a 32-bit unsigned integer in big-endian byte order.
 *
 * @param {Uint8Array} bytes - Source byte buffer.
 * @param {number} offset - Byte offset to read from.
 * @returns {number} Unsigned 32-bit integer.
 */
export function readUint32BE(bytes, offset = 0) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/**
 * Calculates the Amiga bootblock checksum with carry wraparound.
 * The first 1024 bytes (2 sectors) constitute the boot block.
 * The 4-byte checksum field at offset 4..7 is excluded during calculation.
 *
 * @param {Uint8Array} bytes - Boot block buffer (at least 1024 bytes).
 * @returns {number} Calculated 32-bit boot block checksum.
 */
export function calculateBootBlockChecksum(bytes) {
  if (!bytes || bytes.length < 1024) {
    throw new Error(
      `Boot block must be at least 1024 bytes, got ${bytes ? bytes.length : 0} bytes.`,
    );
  }
  let chk = 0;
  for (let i = 0; i < 1024; i += 4) {
    if (i === 4) continue;
    const word = readUint32BE(bytes, i);
    const oldchk = chk;
    chk = (chk + word) >>> 0;
    if (chk < oldchk) {
      chk = (chk + 1) >>> 0;
    }
  }
  return (~chk) >>> 0;
}

/**
 * Verifies the Amiga boot block checksum.
 *
 * @param {Uint8Array} bytes - Boot block buffer (at least 1024 bytes).
 * @returns {boolean} True if the stored checksum matches the carry-wraparound sum.
 */
export function verifyBootBlockChecksum(bytes) {
  if (!bytes || bytes.length < 1024) return false;
  const stored = readUint32BE(bytes, 4);
  const calculated = calculateBootBlockChecksum(bytes);
  return stored === calculated;
}

/**
 * Calculates the Amiga root block checksum (two's complement sum over 512 bytes).
 * The sum of all 32-bit words in the block modulo 2^32 must equal 0.
 *
 * @param {Uint8Array} bytes - Root block buffer (at least 512 bytes).
 * @returns {number} Expected 32-bit root block checksum.
 */
export function calculateRootBlockChecksum(bytes) {
  if (!bytes || bytes.length < 512) {
    throw new Error(
      `Root block must be at least 512 bytes, got ${bytes ? bytes.length : 0} bytes.`,
    );
  }
  let sum = 0;
  for (let i = 0; i < 512; i += 4) {
    if (i === 20) continue;
    const word = readUint32BE(bytes, i);
    sum = (sum + word) >>> 0;
  }
  return (-sum) >>> 0;
}

/**
 * Verifies that the sum of all 128 32-bit words in a root block equals zero.
 *
 * @param {Uint8Array} bytes - Root block buffer (at least 512 bytes).
 * @returns {boolean} True if the root block checksum is valid.
 */
export function verifyRootBlockChecksum(bytes) {
  if (!bytes || bytes.length < 512) return false;
  let sum = 0;
  for (let i = 0; i < 512; i += 4) {
    const word = readUint32BE(bytes, i);
    sum = (sum + word) >>> 0;
  }
  return sum === 0;
}

/**
 * Converts Amiga date stamps (days since 1978-01-01, mins, ticks) to an ISO 8601 string.
 *
 * @param {number} days - Days since January 1, 1978.
 * @param {number} mins - Minutes past midnight.
 * @param {number} ticks - Ticks past minute (50 ticks per second).
 * @returns {string} Formatted ISO date string.
 */
export function formatAmigaDate(days, mins, ticks) {
  const ms =
    AMIGA_EPOCH_MS + (days * 86400 + mins * 60) * 1000 + Math.floor((ticks * 1000) / 50);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return `Invalid Date (${days}d, ${mins}m, ${ticks}t)`;
  }
  return date.toISOString();
}

/**
 * Parses and inspects the first 1024 bytes of an Amiga boot block.
 *
 * @param {Uint8Array|ArrayBuffer} input - Boot block byte buffer.
 * @returns {object} Parsed boot block information.
 * @throws {Error} When input is empty, truncated, or has an invalid DOS magic.
 */
export function parseAffsBootBlock(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  if (!bytes || bytes.length === 0) {
    throw new Error('File is empty.');
  }
  if (bytes.length < 1024) {
    throw new Error(
      `Truncated boot block: expected 1024 bytes, got ${bytes.length} bytes.`,
    );
  }

  const isDos = bytes[0] === 0x44 && bytes[1] === 0x4f && bytes[2] === 0x53; // 'DOS'
  const magicByte = bytes[3];
  if (!isDos || magicByte < 0 || magicByte > 7) {
    const magicAscii = Array.from(bytes.slice(0, 4))
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');
    const magicHex =
      '0x' +
      Array.from(bytes.slice(0, 4))
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join('');
    const expected = 'DOS0-DOS7 (0x444F5300-0x444F5307)';
    throw new Error(
      `Invalid DOS magic: expected ${expected}, got "${magicAscii}" (${magicHex}).`,
    );
  }

  const filesystem = (magicByte & 1) === 1 ? 'FFS' : 'OFS';
  const international = magicByte >= 2;
  const dircache = magicByte === 4 || magicByte === 5;
  const longFilenames = magicByte === 6 || magicByte === 7;

  const storedChecksum = readUint32BE(bytes, 4);
  const calculatedChecksum = calculateBootBlockChecksum(bytes);
  const checksumValid = storedChecksum === calculatedChecksum;
  const rootblockPtr = readUint32BE(bytes, 8);

  return {
    magic: `DOS${magicByte}`,
    magicByte,
    dosTypeHex: `0x444F530${magicByte}`,
    filesystem,
    international,
    dircache,
    longFilenames,
    storedChecksum,
    storedChecksumHex: `0x${storedChecksum.toString(16).padStart(8, '0').toUpperCase()}`,
    calculatedChecksum,
    calculatedChecksumHex: `0x${calculatedChecksum.toString(16).padStart(8, '0').toUpperCase()}`,
    checksumValid,
    rootblockPtr,
    rootblockByteOffset: rootblockPtr * SECTOR_SIZE,
  };
}

/**
 * Parses and validates an Amiga root block (512 bytes).
 * Ensures primary type is 2 (T_SHORT), secondary type is 1 (ST_ROOT), and checksum is 0.
 * Never presents fields from an untrusted root block as valid.
 *
 * @param {Uint8Array|ArrayBuffer} input - 512-byte root block buffer.
 * @returns {object} Validated root block information.
 * @throws {Error} When truncated, primary/secondary type invalid, or checksum fails.
 */
export function parseAffsRootBlock(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  if (!bytes || bytes.length === 0) {
    throw new Error('Root block is empty.');
  }
  if (bytes.length < 512) {
    throw new Error(
      `Truncated root block: expected at least 512 bytes, got ${bytes.length} bytes.`,
    );
  }

  const primaryType = readUint32BE(bytes, 0);
  if (primaryType !== 2) {
    throw new Error(
      `Invalid root block primary type: expected 2 (T_SHORT), got ${primaryType}.`,
    );
  }

  const secondaryType = readUint32BE(bytes, 508);
  if (secondaryType !== 1) {
    throw new Error(
      `Invalid root block secondary type: expected 1 (ST_ROOT), got ${secondaryType}.`,
    );
  }

  const storedChecksum = readUint32BE(bytes, 20);
  const calculatedChecksum = calculateRootBlockChecksum(bytes);
  const checksumValid = verifyRootBlockChecksum(bytes);
  if (!checksumValid) {
    const storedHex = storedChecksum.toString(16).padStart(8, '0').toUpperCase();
    const calcHex = calculatedChecksum.toString(16).padStart(8, '0').toUpperCase();
    throw new Error(
      `Invalid root block checksum: stored 0x${storedHex}, expected 0x${calcHex}.`,
    );
  }

  // Trusted fields extraction
  const bmFlag = readUint32BE(bytes, 312);
  const bmFlagSigned = bmFlag | 0;
  let bmFlagStatus = `0x${bmFlag.toString(16).padStart(8, '0').toUpperCase()}`;
  if (bmFlagSigned === -1) {
    bmFlagStatus = 'Valid (-1 / 0xFFFFFFFF)';
  } else if (bmFlag === 0) {
    bmFlagStatus = 'Invalid (0x00000000) - needs validation';
  }

  const rawNameLen = bytes[432];
  const nameLen = Math.min(rawNameLen, 30);
  const volumeName = new TextDecoder('latin1').decode(bytes.slice(433, 433 + nameLen));

  const days = readUint32BE(bytes, 484);
  const mins = readUint32BE(bytes, 488);
  const ticks = readUint32BE(bytes, 492);
  const creationDateIso = formatAmigaDate(days, mins, ticks);

  return {
    valid: true,
    primaryType,
    secondaryType,
    storedChecksum,
    storedChecksumHex: `0x${storedChecksum.toString(16).padStart(8, '0').toUpperCase()}`,
    calculatedChecksum,
    calculatedChecksumHex: `0x${calculatedChecksum.toString(16).padStart(8, '0').toUpperCase()}`,
    checksumValid: true,
    bitmapFlag: bmFlag,
    bitmapFlagSigned: bmFlagSigned,
    bitmapFlagStatus: bmFlagStatus,
    volumeName,
    creationDate: {
      days,
      mins,
      ticks,
      iso: creationDateIso,
    },
  };
}

/**
 * Inspects a client-side File/Blob by reading only the first 1024 bytes for the boot block,
 * and optionally reading the root block sector if the file is at least 1760 sectors long.
 *
 * @param {File|Blob} file - Target Amiga disk or bootblock file.
 * @param {object} [options] - Inspection options.
 * @param {boolean} [options.readRootBlock=true] - Whether to read the root block when size allows.
 * @param {'pointer'|'midpoint'} [options.rootBlockSource='pointer'] - Sector source for root block.
 * @returns {Promise<object>} Combined inspection result.
 */
export async function inspectAffsFile(file, options = {}) {
  if (!file || file.size === 0) {
    throw new Error('File is empty.');
  }

  const { readRootBlock = true, rootBlockSource = 'pointer' } = options;

  // Read strictly the first 1024 bytes for boot block inspection
  const bootSlice = await readBlobAsArrayBuffer(file.slice(0, 1024));
  const bootBlock = parseAffsBootBlock(new Uint8Array(bootSlice));

  const totalSectors = Math.floor(file.size / SECTOR_SIZE);
  const isFloppyOrLarger = file.size >= MIN_FLOPPY_BYTES;

  let rootBlock = null;
  let rootBlockError = null;
  let targetSector = null;

  if (isFloppyOrLarger && readRootBlock) {
    const defaultMidpointSector = Math.floor(totalSectors / 2);
    const useMidpoint = rootBlockSource === 'midpoint';
    targetSector = useMidpoint ? defaultMidpointSector : bootBlock.rootblockPtr;

    if (!useMidpoint && (targetSector < 0 || targetSector >= totalSectors)) {
      rootBlockError = `Root block pointer sector ${targetSector} is out of range (0–${totalSectors - 1}).`;
    } else {
      const rootByteOffset = targetSector * SECTOR_SIZE;
      const rootSlice = await readBlobAsArrayBuffer(
        file.slice(rootByteOffset, rootByteOffset + SECTOR_SIZE),
      );
      const rootBytes = new Uint8Array(rootSlice);

      try {
        rootBlock = parseAffsRootBlock(rootBytes);
      } catch (err) {
        rootBlockError = err.message;
      }
    }
  }

  return {
    fileName: file.name || 'amiga_disk.adf',
    fileSize: file.size,
    totalSectors,
    isFloppyOrLarger,
    bootBlock,
    rootBlock,
    rootBlockError,
    targetSector,
    rootBlockSource,
  };
}

/**
 * Inspects an in-memory byte buffer (Uint8Array or ArrayBuffer).
 *
 * @param {Uint8Array|ArrayBuffer} buffer - Byte buffer.
 * @param {object} [options] - Inspection options.
 * @returns {object} Combined inspection result.
 */
export function inspectAffsBuffer(buffer, options = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  if (!bytes || bytes.length === 0) {
    throw new Error('File is empty.');
  }

  const { readRootBlock = true, rootBlockSource = 'pointer' } = options;

  const bootBlock = parseAffsBootBlock(bytes.slice(0, 1024));
  const totalSectors = Math.floor(bytes.length / SECTOR_SIZE);
  const isFloppyOrLarger = bytes.length >= MIN_FLOPPY_BYTES;

  let rootBlock = null;
  let rootBlockError = null;
  let targetSector = null;

  if (isFloppyOrLarger && readRootBlock) {
    const defaultMidpointSector = Math.floor(totalSectors / 2);
    const useMidpoint = rootBlockSource === 'midpoint';
    targetSector = useMidpoint ? defaultMidpointSector : bootBlock.rootblockPtr;

    if (!useMidpoint && (targetSector < 0 || targetSector >= totalSectors)) {
      rootBlockError = `Root block pointer sector ${targetSector} is out of range (0–${totalSectors - 1}).`;
    } else {
      const rootByteOffset = targetSector * SECTOR_SIZE;
      const rootBytes = bytes.slice(rootByteOffset, rootByteOffset + SECTOR_SIZE);

      try {
        rootBlock = parseAffsRootBlock(rootBytes);
      } catch (err) {
        rootBlockError = err.message;
      }
    }
  }

  return {
    fileSize: bytes.length,
    totalSectors,
    isFloppyOrLarger,
    bootBlock,
    rootBlock,
    rootBlockError,
    targetSector,
    rootBlockSource,
  };
}
