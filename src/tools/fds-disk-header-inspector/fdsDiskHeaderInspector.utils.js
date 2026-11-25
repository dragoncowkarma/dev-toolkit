export const FWNES_HEADER_SIZE = 16;
export const FDS_SIDE_SIZE = 65500;
export const FDS_BLOCK1_SIZE = 56;
export const FDS_BLOCK1_CODE = 0x01;
export const FDS_VERIFICATION_STRING = '*NINTENDO-HVC*';
export const MAX_INSPECTED_SIDES = 32;
export const UNKNOWN_VALUE = 'Unknown';

const FWNES_MAGIC_BYTES = [0x46, 0x44, 0x53, 0x1a];
const VERIFICATION_BYTES = Array.from(
  FDS_VERIFICATION_STRING,
  (char) => char.charCodeAt(0),
);

const OFFSET_BLOCK_CODE = 0x00;
const OFFSET_VERIFICATION_START = 0x01;
const OFFSET_VERIFICATION_END = 0x0f;
const OFFSET_MAKER_CODE = 0x0f;
const OFFSET_GAME_NAME_START = 0x10;
const OFFSET_GAME_NAME_END = 0x13;
const OFFSET_GAME_VERSION = 0x14;
const OFFSET_SIDE_NUMBER = 0x15;
const OFFSET_DISK_NUMBER = 0x16;
const OFFSET_DISK_TYPE = 0x17;
const MIN_PARSED_FIELDS_END = 0x18;

const FDS_MAKER_CODES = Object.freeze({
  0x01: 'Nintendo',
  0x08: 'Capcom',
  0x0a: 'Jaleco',
  0x18: 'Hudson Soft',
  0x49: 'Irem',
  0x4a: 'Gakken',
  0x8b: 'Bullet-Proof Software',
  0x99: 'Pack-In-Video',
  0x9b: 'Tecmo',
  0x9c: 'Imagineer',
  0xa2: 'Scorpion Soft',
  0xa4: 'Konami',
  0xa6: 'Kawada',
  0xa7: 'Takara',
  0xa8: 'Royal Industries',
  0xac: 'Toei Animation',
  0xaf: 'Namco',
  0xb1: 'ASCII',
  0xb2: 'Bandai',
  0xb3: 'Soft Pro',
  0xb6: 'HAL Laboratory',
  0xbb: 'Sunsoft',
  0xbc: 'Toshiba EMI',
  0xc0: 'Taito',
  0xc1: 'Sunsoft / Ask Kodansha',
  0xc2: 'Kemco',
  0xc3: 'Square',
  0xc4: 'Tokuma Shoten',
  0xc5: 'Data East',
  0xc6: 'Tonkin House',
  0xc7: 'East Cube',
  0xca: 'Konami / Ultra',
  0xcb: 'NTVIC / VAP',
  0xcc: 'Use Co., Ltd.',
  0xce: 'Pony Canyon',
  0xd1: 'Sofel',
  0xd2: 'Bothtec',
  0xdb: 'Hiro Co., Ltd.',
  0xe7: 'Athena',
  0xeb: 'Atlus',
});

const SCOPE_NOTE =
  'Checks are limited to the optional 16-byte fwNES header, file-size side layout, ' +
  'and Block 1 metadata (first 56 bytes) of each inspected side. Remaining blocks, ' +
  'CRCs, and disk contents are not verified.';

/**
 * Formats a single byte value as uppercase 2-digit hex with a 0x prefix.
 *
 * @param {number} value - Byte value (0-255).
 * @returns {string} Formatted hex byte (e.g. "0x01").
 */
export function formatHexByte(value) {
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
}

/**
 * Formats a byte offset as uppercase 6-digit hex with a 0x prefix.
 *
 * @param {number} offset - Byte offset into the image.
 * @returns {string} Formatted hex offset (e.g. "0x000010").
 */
export function formatHexOffset(offset) {
  return `0x${offset.toString(16).toUpperCase().padStart(6, '0')}`;
}

/**
 * Formats a byte count using grouping separators and a B suffix.
 *
 * @param {number} bytes - Non-negative byte length.
 * @returns {string} Formatted byte count (e.g. "65,500 B").
 */
export function formatByteCount(bytes) {
  return `${bytes.toLocaleString('en-US')} B`;
}

function hasFwNesMagic(bytes) {
  if (bytes.length < FWNES_MAGIC_BYTES.length) {
    return false;
  }
  return FWNES_MAGIC_BYTES.every((expected, index) => bytes[index] === expected);
}

function isPrintableAscii(byte) {
  return byte >= 0x20 && byte <= 0x7e;
}

function decodeVerificationString(slice) {
  let result = '';
  for (const byte of slice) {
    result += isPrintableAscii(byte) ? String.fromCharCode(byte) : '.';
  }
  return result;
}

function decodeGameName(slice) {
  let raw = '';
  for (const byte of slice) {
    if (!isPrintableAscii(byte)) {
      return UNKNOWN_VALUE;
    }
    raw += String.fromCharCode(byte);
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : UNKNOWN_VALUE;
}

function formatMakerCode(code) {
  const name = FDS_MAKER_CODES[code] ?? UNKNOWN_VALUE;
  return `${formatHexByte(code)} (${name})`;
}

function formatSideNumber(code) {
  if (code === 0x00) {
    return 'Side A (0x00)';
  }
  if (code === 0x01) {
    return 'Side B (0x01)';
  }
  return `${UNKNOWN_VALUE} (${formatHexByte(code)})`;
}

function formatDiskType(code) {
  if (code === 0x00) {
    return 'FMC - Normal card (0x00)';
  }
  if (code === 0x01) {
    return 'FSC - Card with shutter (0x01)';
  }
  return `${UNKNOWN_VALUE} (${formatHexByte(code)})`;
}

/**
 * Parses the optional 16-byte fwNES FDS header from the leading bytes of an image.
 *
 * @param {Uint8Array} bytes - Leading slice of the file (up to 16 bytes).
 * @param {number} [totalFileSize=bytes.length] - Full file size in bytes.
 * @returns {{
 *   present: boolean,
 *   truncatedSignature: boolean,
 *   size: number,
 *   sideCount: number|null,
 *   hasNonZeroPadding: boolean,
 * }} Parsed fwNES header metadata.
 */
export function parseFwNesHeader(bytes, totalFileSize = bytes.length) {
  const magicMatches = hasFwNesMagic(bytes);
  if (!magicMatches) {
    return {
      present: false,
      truncatedSignature: false,
      size: 0,
      sideCount: null,
      hasNonZeroPadding: false,
    };
  }

  if (totalFileSize < FWNES_HEADER_SIZE || bytes.length < FWNES_HEADER_SIZE) {
    return {
      present: false,
      truncatedSignature: true,
      size: 0,
      sideCount: null,
      hasNonZeroPadding: false,
    };
  }

  let hasNonZeroPadding = false;
  for (let index = 5; index < FWNES_HEADER_SIZE; index += 1) {
    if (bytes[index] !== 0) {
      hasNonZeroPadding = true;
      break;
    }
  }

  return {
    present: true,
    truncatedSignature: false,
    size: FWNES_HEADER_SIZE,
    sideCount: bytes[4],
    hasNonZeroPadding,
  };
}

/**
 * Parses Block 1 (Disk Info Block) metadata from the leading bytes of one FDS disk side.
 * Fields whose bytes are missing or unreadable are reported as "Unknown".
 *
 * @param {Uint8Array} bytes - Up to 56 bytes from the start of a disk side.
 * @param {object} [options] - Side layout metadata.
 * @param {number} [options.sideIndex=0] - Zero-based side index.
 * @param {number} [options.offset=0] - Byte offset of this side within the file.
 * @param {boolean} [options.isCompleteSide=true] - Whether a full 65,500-byte side exists.
 * @param {number} [options.availableBytes=bytes.length] - Bytes available for this side.
 * @returns {object} Parsed Block 1 metadata and per-side check results.
 */
export function parseFdsBlock1(bytes, options = {}) {
  const {
    sideIndex = 0,
    offset = 0,
    isCompleteSide = true,
    availableBytes = bytes.length,
  } = options;

  const blockCodeRaw = bytes.length > OFFSET_BLOCK_CODE ? bytes[OFFSET_BLOCK_CODE] : null;
  const blockCodeValid = blockCodeRaw === FDS_BLOCK1_CODE;
  let blockCode = UNKNOWN_VALUE;
  if (blockCodeRaw !== null) {
    blockCode = blockCodeValid
      ? `${formatHexByte(blockCodeRaw)} (Disk info block)`
      : `${formatHexByte(blockCodeRaw)} (Expected 0x01)`;
  }

  let verificationString = UNKNOWN_VALUE;
  let verificationValid = false;
  const hasVerificationBytes = bytes.length >= OFFSET_VERIFICATION_END;
  if (hasVerificationBytes) {
    const verificationSlice = bytes.subarray(
      OFFSET_VERIFICATION_START,
      OFFSET_VERIFICATION_END,
    );
    verificationString = decodeVerificationString(verificationSlice);
    verificationValid = VERIFICATION_BYTES.every(
      (expected, index) => verificationSlice[index] === expected,
    );
  }

  const makerCodeRaw = bytes.length > OFFSET_MAKER_CODE ? bytes[OFFSET_MAKER_CODE] : null;
  const makerCode = makerCodeRaw !== null ? formatMakerCode(makerCodeRaw) : UNKNOWN_VALUE;

  const gameName = bytes.length >= OFFSET_GAME_NAME_END
    ? decodeGameName(bytes.subarray(OFFSET_GAME_NAME_START, OFFSET_GAME_NAME_END))
    : UNKNOWN_VALUE;

  const gameVersionRaw = bytes.length > OFFSET_GAME_VERSION
    ? bytes[OFFSET_GAME_VERSION]
    : null;
  const gameVersion = gameVersionRaw !== null
    ? `${gameVersionRaw} (${formatHexByte(gameVersionRaw)})`
    : UNKNOWN_VALUE;

  const sideNumberRaw = bytes.length > OFFSET_SIDE_NUMBER ? bytes[OFFSET_SIDE_NUMBER] : null;
  const sideNumber = sideNumberRaw !== null ? formatSideNumber(sideNumberRaw) : UNKNOWN_VALUE;

  const diskNumberRaw = bytes.length > OFFSET_DISK_NUMBER ? bytes[OFFSET_DISK_NUMBER] : null;
  const diskNumber = diskNumberRaw !== null
    ? `Disk ${diskNumberRaw + 1} (${formatHexByte(diskNumberRaw)})`
    : UNKNOWN_VALUE;

  const diskTypeRaw = bytes.length > OFFSET_DISK_TYPE ? bytes[OFFSET_DISK_TYPE] : null;
  const diskType = diskTypeRaw !== null ? formatDiskType(diskTypeRaw) : UNKNOWN_VALUE;

  const issues = [];
  if (!isCompleteSide) {
    issues.push(
      `Incomplete side: ${formatByteCount(availableBytes)} available ` +
        `(expected ${formatByteCount(FDS_SIDE_SIZE)}).`,
    );
  }
  if (bytes.length < MIN_PARSED_FIELDS_END) {
    issues.push(
      'Block 1 is truncated; unreadable fields are reported as Unknown.',
    );
  }
  if (blockCodeRaw !== null && !blockCodeValid) {
    issues.push(
      `Block code is ${formatHexByte(blockCodeRaw)} instead of expected 0x01.`,
    );
  }
  if (hasVerificationBytes && !verificationValid) {
    issues.push(
      `Verification string "${verificationString}" does not match ${FDS_VERIFICATION_STRING}.`,
    );
  }

  return {
    sideIndex,
    offset,
    isCompleteSide,
    availableBytes,
    bytesInspected: bytes.length,
    blockCodeRaw,
    blockCode,
    blockCodeValid,
    verificationString,
    verificationValid,
    makerCodeRaw,
    makerCode,
    gameName,
    gameVersionRaw,
    gameVersion,
    sideNumberRaw,
    sideNumber,
    diskNumberRaw,
    diskNumber,
    diskTypeRaw,
    diskType,
    headerBlockMatched: blockCodeValid && verificationValid,
    issues,
  };
}

/**
 * Reads a bounded byte range from a File or Blob without loading the entire file.
 *
 * @param {File|Blob} file - Source file or blob.
 * @param {number} start - Inclusive start byte offset.
 * @param {number} end - Exclusive end byte offset.
 * @returns {Promise<Uint8Array>} Resolves with the requested byte slice.
 */
export function readBoundedSlice(file, start, end) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, Math.min(end, file.size));
  const slice = file.slice(safeStart, safeEnd);

  if (typeof slice.arrayBuffer === 'function') {
    return slice
      .arrayBuffer()
      .then((buffer) => new Uint8Array(buffer))
      .catch(() => {
        throw new Error('Failed to read the selected file.');
      });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(slice);
  });
}

function buildWarnings(report) {
  const warnings = [];
  const {
    isEmpty,
    fwNesHeader,
    derivedSideCount,
    trailingBytes,
    omittedSideCount,
    sides,
  } = report;

  if (isEmpty) {
    warnings.push('File is empty (0 B). No fwNES header or disk side data was found.');
    return warnings;
  }

  if (fwNesHeader.truncatedSignature) {
    warnings.push(
      'File starts with FDS\\x1A signature bytes but is shorter than a 16-byte fwNES header.',
    );
  }

  if (fwNesHeader.present && fwNesHeader.hasNonZeroPadding) {
    warnings.push('fwNES header bytes 0x05-0x0F contain non-zero padding.');
  }

  if (fwNesHeader.present && fwNesHeader.sideCount !== derivedSideCount) {
    warnings.push(
      `fwNES header reports ${fwNesHeader.sideCount} side(s), but file size contains ` +
        `${derivedSideCount} complete 65,500-byte side(s).`,
    );
  }

  if (trailingBytes > 0) {
    warnings.push(
      `${formatByteCount(trailingBytes)} of trailing data does not form a complete ` +
        '65,500-byte disk side.',
    );
  }

  if (omittedSideCount > 0) {
    warnings.push(
      `Inspection is bounded to the first ${MAX_INSPECTED_SIDES} side slot(s); ` +
        `${omittedSideCount} additional slot(s) were not read.`,
    );
  }

  const hasBlockMismatch = sides.some((side) => !side.headerBlockMatched);
  if (hasBlockMismatch) {
    warnings.push(
      'One or more inspected sides did not match Block 1 code 0x01 or *NINTENDO-HVC*.',
    );
  }

  return warnings;
}

/**
 * Inspects a local FDS disk image File or Blob using bounded byte slices.
 * Reads at most 16 bytes for the optional fwNES header and up to 56 bytes (Block 1)
 * per disk side, capped at MAX_INSPECTED_SIDES slots.
 *
 * @param {File|Blob} file - Local FDS disk image to inspect.
 * @returns {Promise<object>} Structured inspection report.
 */
export async function inspectFdsFile(file) {
  if (!file || typeof file.slice !== 'function' || typeof file.size !== 'number') {
    throw new TypeError('Expected a File or Blob to inspect.');
  }

  const fileName = typeof file.name === 'string' && file.name.trim()
    ? file.name
    : 'Unnamed file';
  const fileSize = file.size;

  if (fileSize === 0) {
    const emptyReport = {
      fileName,
      fileSize: 0,
      isEmpty: true,
      fwNesHeader: {
        present: false,
        truncatedSignature: false,
        size: 0,
        sideCount: null,
        hasNonZeroPadding: false,
      },
      payloadSize: 0,
      derivedSideCount: 0,
      trailingBytes: 0,
      inspectedSideCount: 0,
      omittedSideCount: 0,
      sides: [],
      scopeNote: SCOPE_NOTE,
    };
    return {
      ...emptyReport,
      warnings: buildWarnings(emptyReport),
    };
  }

  const headerProbeLength = Math.min(fileSize, FWNES_HEADER_SIZE);
  const headerProbe = await readBoundedSlice(file, 0, headerProbeLength);
  const fwNesHeader = parseFwNesHeader(headerProbe, fileSize);

  const payloadSize = fileSize - fwNesHeader.size;
  const derivedSideCount = Math.floor(payloadSize / FDS_SIDE_SIZE);
  const trailingBytes = payloadSize % FDS_SIDE_SIZE;
  const totalSlots = derivedSideCount + (trailingBytes > 0 ? 1 : 0);
  const slotsToInspect = Math.min(totalSlots, MAX_INSPECTED_SIDES);
  const omittedSideCount = Math.max(0, totalSlots - slotsToInspect);

  const sides = [];
  for (let sideIndex = 0; sideIndex < slotsToInspect; sideIndex += 1) {
    const offset = fwNesHeader.size + sideIndex * FDS_SIDE_SIZE;
    const isCompleteSide = sideIndex < derivedSideCount;
    const availableBytes = isCompleteSide ? FDS_SIDE_SIZE : trailingBytes;
    const readLength = Math.min(availableBytes, FDS_BLOCK1_SIZE);
    const blockBytes = await readBoundedSlice(file, offset, offset + readLength);
    sides.push(
      parseFdsBlock1(blockBytes, {
        sideIndex,
        offset,
        isCompleteSide,
        availableBytes,
      }),
    );
  }

  const report = {
    fileName,
    fileSize,
    isEmpty: false,
    fwNesHeader,
    payloadSize,
    derivedSideCount,
    trailingBytes,
    inspectedSideCount: sides.length,
    omittedSideCount,
    sides,
    scopeNote: SCOPE_NOTE,
  };

  return {
    ...report,
    warnings: buildWarnings(report),
  };
}
