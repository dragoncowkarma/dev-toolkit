export const MIN_ROM_SIZE = 16 * 1024; // 16 KiB
export const MAX_ROM_SIZE = 16 * 1024 * 1024; // 16 MiB
export const HEADER_OFFSET_FROM_END = 0x220; // 544 bytes before end of ROM
export const HEADER_SIZE = 0x20; // 32-byte ROM header
export const VECTOR_TABLE_SIZE = 0x200; // 512-byte V810 interrupt vector table
export const VECTOR_SLOT_SIZE = 0x10; // 16 bytes per vector slot
export const VECTOR_SLOT_COUNT = VECTOR_TABLE_SIZE / VECTOR_SLOT_SIZE; // 32 slots
export const RESET_VECTOR_SLOT_INDEX = 31; // 0xFFFFFFF0 (size - 0x10)

const TITLE_LENGTH = 20;
const RESERVED_OFFSET = 0x14;
const RESERVED_LENGTH = 5;
const MAKER_OFFSET = 0x19;
const MAKER_LENGTH = 2;
const GAME_CODE_OFFSET = 0x1b;
const GAME_CODE_LENGTH = 4;
const VERSION_OFFSET = 0x1f;

const ALPHANUMERIC_UPPER = /^[0-9A-Z]+$/;

// Nintendo 2-character ASCII licensee/maker codes cited from Pan Docs
// ("The Cartridge Header — New licensee code",
// https://gbdev.io/pandocs/The_Cartridge_Header.html#01440145--new-licensee-code).
// Unlisted codes degrade safely to "Unknown".
const KNOWN_MAKERS = Object.freeze({
  '01': 'Nintendo',
  '18': 'Hudson Soft',
  '28': 'Kemco',
});

const KNOWN_REGIONS = Object.freeze({
  A: 'All Regions',
  D: 'Germany',
  E: 'North America',
  F: 'France',
  I: 'Italy',
  J: 'Japan',
  P: 'Europe',
  S: 'Spain',
});

const KNOWN_SYSTEM_PREFIXES = Object.freeze({
  V: 'Virtual Boy',
});

const NAMED_VECTORS = Object.freeze([
  { index: 0, name: 'Key Interrupt (INT0)', address: '0xFFFFFE00' },
  { index: 1, name: 'Timer Interrupt (INT1)', address: '0xFFFFFE10' },
  { index: 2, name: 'Expansion Port (INT2)', address: '0xFFFFFE20' },
  { index: 3, name: 'Link Port (INT3)', address: '0xFFFFFE30' },
  { index: 4, name: 'VIP Interrupt (INT4)', address: '0xFFFFFE40' },
  { index: 24, name: 'Zero Division', address: '0xFFFFFF80' },
  { index: 25, name: 'Invalid Opcode', address: '0xFFFFFF90' },
  { index: 26, name: 'Trap 00h-0Fh', address: '0xFFFFFFA0' },
  { index: 27, name: 'Trap 10h-1Fh', address: '0xFFFFFFB0' },
  { index: 28, name: 'Address Trap', address: '0xFFFFFFC0' },
  { index: 29, name: 'Floating-Point Exception', address: '0xFFFFFFD0' },
  { index: 30, name: 'Duplexed Exception', address: '0xFFFFFFE0' },
  { index: 31, name: 'Reset Vector', address: '0xFFFFFFF0' },
]);

/**
 * Checks whether a byte count is a positive power of two.
 *
 * @param {number} size - Byte length to test.
 * @returns {boolean} True if `size` is a positive integer power of two.
 */
export function isPowerOfTwo(size) {
  return Number.isInteger(size) && size > 0 && (size & (size - 1)) === 0;
}

/**
 * Formats a byte sequence as uppercase space-separated hex pairs.
 *
 * @param {Uint8Array} bytes - Bytes to format.
 * @returns {string} Space-separated hex string.
 */
export function formatHexBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/**
 * Formats a byte offset as a prefixed uppercase hexadecimal string.
 *
 * @param {number} offset - Non-negative byte offset.
 * @returns {string} Formatted offset (e.g. `0x003DE0`).
 */
export function formatOffset(offset) {
  return `0x${offset.toString(16).toUpperCase().padStart(6, '0')}`;
}

/**
 * Formats a ROM byte size using binary KiB/MiB units alongside exact byte count.
 *
 * @param {number} bytes - ROM size in bytes.
 * @returns {string} Human-readable ROM size.
 */
export function formatRomSize(bytes) {
  const exact = `${bytes.toLocaleString('en-US')} bytes`;
  if (bytes >= 1024 * 1024 && bytes % (1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024)} MiB (${exact})`;
  }
  if (bytes >= 1024 && bytes % 1024 === 0) {
    return `${bytes / 1024} KiB (${exact})`;
  }
  return exact;
}

/**
 * Decodes ASCII text when every byte is in the printable ASCII range (0x20-0x7E).
 *
 * @param {Uint8Array} bytes - Bytes to decode.
 * @returns {string|null} ASCII string, or null if any byte is outside printable ASCII.
 */
function decodePrintableAscii(bytes) {
  let result = '';
  for (const byte of bytes) {
    if (byte < 0x20 || byte > 0x7e) {
      return null;
    }
    result += String.fromCharCode(byte);
  }
  return result;
}

/**
 * Checks whether a decoded string contains ASCII control characters.
 *
 * @param {string} text - Text to inspect.
 * @returns {boolean} True if any control character is present.
 */
function hasControlChars(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Decodes the 20-byte Virtual Boy game title as ASCII or Shift-JIS.
 * Returns Unknown instead of guessing when bytes are empty or invalid.
 *
 * @param {Uint8Array} bytes - 20-byte title slice.
 * @returns {{
 *   value: string|null,
 *   display: string,
 *   encoding: string,
 *   rawHex: string,
 *   valid: boolean,
 * }}
 */
export function decodeGameTitle(bytes) {
  const rawHex = formatHexBytes(bytes);

  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 0x00 || bytes[end - 1] === 0x20)) {
    end -= 1;
  }

  if (end === 0) {
    return {
      value: null,
      display: 'Unknown',
      encoding: 'Unknown',
      rawHex,
      valid: false,
    };
  }

  const trimmed = bytes.subarray(0, end);
  const ascii = decodePrintableAscii(trimmed);
  if (ascii !== null) {
    return {
      value: ascii,
      display: ascii,
      encoding: 'ASCII',
      rawHex,
      valid: true,
    };
  }

  for (const byte of trimmed) {
    if (byte < 0x20 || byte === 0x7f) {
      return {
        value: null,
        display: 'Unknown',
        encoding: 'Unknown',
        rawHex,
        valid: false,
      };
    }
  }

  try {
    const decoder = new TextDecoder('shift-jis', { fatal: true });
    const decoded = decoder.decode(trimmed);
    if (!decoded || hasControlChars(decoded)) {
      return {
        value: null,
        display: 'Unknown',
        encoding: 'Unknown',
        rawHex,
        valid: false,
      };
    }
    return {
      value: decoded,
      display: decoded,
      encoding: 'Shift-JIS',
      rawHex,
      valid: true,
    };
  } catch {
    return {
      value: null,
      display: 'Unknown',
      encoding: 'Unknown',
      rawHex,
      valid: false,
    };
  }
}

/**
 * Inspects the 5 reserved header bytes (offset +0x14 to +0x18).
 *
 * @param {Uint8Array} bytes - 5-byte reserved slice.
 * @returns {{ rawHex: string, allZero: boolean, status: string }}
 */
export function decodeReservedBytes(bytes) {
  const rawHex = formatHexBytes(bytes);
  const allZero = bytes.every((byte) => byte === 0x00);
  return {
    rawHex,
    allZero,
    status: allZero ? 'All zero (standard)' : 'Non-zero',
  };
}

/**
 * Decodes the 2-character ASCII maker code (offset +0x19 to +0x1A).
 *
 * @param {Uint8Array} bytes - 2-byte maker code slice.
 * @returns {{
 *   code: string|null,
 *   name: string,
 *   display: string,
 *   rawHex: string,
 *   valid: boolean,
 * }}
 */
export function decodeMakerCode(bytes) {
  const rawHex = formatHexBytes(bytes);
  const ascii = decodePrintableAscii(bytes);

  if (ascii === null || !ALPHANUMERIC_UPPER.test(ascii)) {
    return {
      code: null,
      name: 'Unknown',
      display: 'Unknown',
      rawHex,
      valid: false,
    };
  }

  const name = KNOWN_MAKERS[ascii] ?? 'Unknown';
  const display = name === 'Unknown' ? `${ascii} (Unknown)` : `${ascii} — ${name}`;
  return {
    code: ascii,
    name,
    display,
    rawHex,
    valid: true,
  };
}

/**
 * Decodes the 4-character ASCII game code (offset +0x1B to +0x1E).
 *
 * @param {Uint8Array} bytes - 4-byte game code slice.
 * @returns {{
 *   code: string|null,
 *   systemCode: string|null,
 *   system: string,
 *   gameId: string,
 *   regionCode: string|null,
 *   region: string,
 *   display: string,
 *   rawHex: string,
 *   valid: boolean,
 * }}
 */
export function decodeGameCode(bytes) {
  const rawHex = formatHexBytes(bytes);
  const ascii = decodePrintableAscii(bytes);

  if (ascii === null || !ALPHANUMERIC_UPPER.test(ascii)) {
    return {
      code: null,
      systemCode: null,
      system: 'Unknown',
      gameId: 'Unknown',
      regionCode: null,
      region: 'Unknown',
      display: 'Unknown',
      rawHex,
      valid: false,
    };
  }

  const systemCode = ascii[0];
  const system = KNOWN_SYSTEM_PREFIXES[systemCode] ?? 'Unknown';
  const gameId = ascii.slice(1, 3);
  const regionCode = ascii[3];
  const region = KNOWN_REGIONS[regionCode] ?? 'Unknown';

  return {
    code: ascii,
    systemCode,
    system,
    gameId,
    regionCode,
    region,
    display: ascii,
    rawHex,
    valid: true,
  };
}

/**
 * Decodes the single ROM version byte (offset +0x1F).
 *
 * @param {number} byte - Unsigned byte value (0-255).
 * @returns {{ value: number, label: string, rawHex: string, display: string }}
 */
export function decodeVersionByte(byte) {
  const rawHex = `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  const label = `1.${byte}`;
  return {
    value: byte,
    label,
    rawHex,
    display: `${label} (${rawHex})`,
  };
}

/**
 * Checks whether a 16-byte vector slot contains non-blank instruction data.
 * Slots filled entirely with 0x00 or 0xFF are treated as unpopulated.
 *
 * @param {Uint8Array} slotBytes - 16-byte vector slot.
 * @returns {boolean} True if populated.
 */
function isVectorSlotPopulated(slotBytes) {
  let allZero = true;
  let allFf = true;
  for (const byte of slotBytes) {
    if (byte !== 0x00) allZero = false;
    if (byte !== 0xff) allFf = false;
    if (!allZero && !allFf) return true;
  }
  return false;
}

/**
 * Inspects the 512-byte NEC V810 interrupt vector table at `size - 0x200`.
 *
 * @param {Uint8Array} bytes - 512-byte vector table slice.
 * @param {number} tableOffset - Byte offset of the vector table in the ROM.
 * @returns {{
 *   present: boolean,
 *   status: string,
 *   offset: number,
 *   offsetHex: string,
 *   size: number,
 *   populatedSlots: number,
 *   totalSlots: number,
 *   hasResetVector: boolean,
 *   resetVectorHex: string,
 *   activeNamedVectors: Array<{ name: string, address: string }>,
 * }}
 */
export function inspectInterruptVectorTable(bytes, tableOffset) {
  const populatedFlags = new Array(VECTOR_SLOT_COUNT).fill(false);
  let populatedSlots = 0;

  for (let index = 0; index < VECTOR_SLOT_COUNT; index += 1) {
    const start = index * VECTOR_SLOT_SIZE;
    const slot = bytes.subarray(start, start + VECTOR_SLOT_SIZE);
    if (isVectorSlotPopulated(slot)) {
      populatedFlags[index] = true;
      populatedSlots += 1;
    }
  }

  const hasResetVector = populatedFlags[RESET_VECTOR_SLOT_INDEX];
  const resetStart = RESET_VECTOR_SLOT_INDEX * VECTOR_SLOT_SIZE;
  const resetVectorHex = formatHexBytes(
    bytes.subarray(resetStart, resetStart + VECTOR_SLOT_SIZE),
  );

  const activeNamedVectors = NAMED_VECTORS
    .filter((entry) => populatedFlags[entry.index])
    .map(({ name, address }) => ({ name, address }));

  const present = populatedSlots > 0;
  let status = 'Not detected (blank)';
  if (hasResetVector) {
    status = 'Present';
  } else if (present) {
    status = 'Partial (Reset vector blank)';
  }

  return {
    present,
    status,
    offset: tableOffset,
    offsetHex: formatOffset(tableOffset),
    size: VECTOR_TABLE_SIZE,
    populatedSlots,
    totalSlots: VECTOR_SLOT_COUNT,
    hasResetVector,
    resetVectorHex,
    activeNamedVectors,
  };
}

/**
 * Validates that a Virtual Boy ROM byte size is within bounds and a power of two.
 *
 * @param {number} romSize - Byte length to validate.
 * @throws {Error} When the size is smaller than 16 KiB, larger than 16 MiB,
 *   or not a power of two.
 */
export function validateRomSize(romSize) {
  if (romSize < MIN_ROM_SIZE) {
    throw new Error(
      `ROM file is too small (${romSize.toLocaleString('en-US')} bytes). ` +
      'Virtual Boy ROMs must be at least 16 KiB (16,384 bytes) ' +
      'to contain a valid header at size - 0x220.',
    );
  }

  if (romSize > MAX_ROM_SIZE) {
    throw new Error(
      `ROM file is too large (${romSize.toLocaleString('en-US')} bytes). ` +
      'Virtual Boy ROMs cannot exceed 16 MiB (16,777,216 bytes).',
    );
  }

  if (!isPowerOfTwo(romSize)) {
    throw new Error(
      `Invalid ROM size (${romSize.toLocaleString('en-US')} bytes): ` +
      'Virtual Boy ROM sizes must be a power of two between 16 KiB and 16 MiB.',
    );
  }
}

/**
 * Parses a Nintendo Virtual Boy ROM image and extracts its cartridge header
 * (located at `size - 0x220`) and interrupt vector table status.
 *
 * @param {Uint8Array|ArrayBuffer} input - Raw ROM bytes, or only the final
 *   0x220 bytes (header + vector table) of the ROM.
 * @param {number} [originalRomSize] - Size of the original ROM file. Defaults
 *   to the input length (full ROM). When larger than the input, the input is
 *   treated as the ROM tail and absolute offsets are computed from this size.
 * @returns {{
 *   romSize: number,
 *   romSizeLabel: string,
 *   headerOffset: number,
 *   headerOffsetHex: string,
 *   title: ReturnType<typeof decodeGameTitle>,
 *   reserved: ReturnType<typeof decodeReservedBytes>,
 *   maker: ReturnType<typeof decodeMakerCode>,
 *   gameCode: ReturnType<typeof decodeGameCode>,
 *   version: ReturnType<typeof decodeVersionByte>,
 *   vectorTable: ReturnType<typeof inspectInterruptVectorTable>,
 * }}
 * @throws {Error} When the file is smaller than 16 KiB, larger than 16 MiB,
 *   or not a power-of-two size, or when the tail is shorter than 0x220 bytes
 *   or inconsistent with the original size.
 */
export function parseVirtualBoyRomHeader(input, originalRomSize) {
  const bytes = input instanceof Uint8Array
    ? input
    : input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : null;

  if (!bytes) {
    throw new TypeError('ROM data must be a Uint8Array or ArrayBuffer.');
  }

  const romSize = originalRomSize ?? bytes.length;
  validateRomSize(romSize);

  if (bytes.length < HEADER_OFFSET_FROM_END || bytes.length > romSize) {
    throw new Error(
      `Incomplete ROM tail (${bytes.length.toLocaleString('en-US')} bytes). ` +
      `Expected the final ${HEADER_OFFSET_FROM_END} bytes of the ROM.`,
    );
  }

  // Absolute ROM offset of bytes[0]; 0 when the full ROM was supplied.
  const base = romSize - bytes.length;
  const headerOffset = romSize - HEADER_OFFSET_FROM_END;
  const header = bytes.subarray(headerOffset - base, headerOffset - base + HEADER_SIZE);
  const vectorTableOffset = romSize - VECTOR_TABLE_SIZE;
  const vectorBytes = bytes.subarray(vectorTableOffset - base, bytes.length);

  return {
    romSize,
    romSizeLabel: formatRomSize(romSize),
    headerOffset,
    headerOffsetHex: formatOffset(headerOffset),
    title: decodeGameTitle(header.subarray(0, TITLE_LENGTH)),
    reserved: decodeReservedBytes(
      header.subarray(RESERVED_OFFSET, RESERVED_OFFSET + RESERVED_LENGTH),
    ),
    maker: decodeMakerCode(header.subarray(MAKER_OFFSET, MAKER_OFFSET + MAKER_LENGTH)),
    gameCode: decodeGameCode(
      header.subarray(GAME_CODE_OFFSET, GAME_CODE_OFFSET + GAME_CODE_LENGTH),
    ),
    version: decodeVersionByte(header[VERSION_OFFSET]),
    vectorTable: inspectInterruptVectorTable(vectorBytes, vectorTableOffset),
  };
}

/**
 * Reads a File or Blob completely in the browser as a Uint8Array.
 *
 * @param {File|Blob} file - Selected ROM file.
 * @returns {Promise<Uint8Array>} Resolves with the raw bytes.
 */
export function readFileAsBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    };
    reader.onerror = () => reject(new Error('Failed to read the selected ROM file.'));
    reader.readAsArrayBuffer(file);
  });
}
