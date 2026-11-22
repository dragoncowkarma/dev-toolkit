const HEADER_SIZE = 16;
const TRAINER_SIZE = 512;
const PRG_UNIT_SIZE = 16 * 1024;
const CHR_UNIT_SIZE = 8 * 1024;

const TIMING_MODES = ['NTSC', 'PAL', 'Multi-region', 'Dendy'];
const CONSOLE_TYPES = ['NES/Famicom', 'Vs. System', 'PlayChoice-10', 'Extended'];

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError('ROM data must be an ArrayBuffer or Uint8Array.');
}

function nes2RomSize(lowByte, highNibble, unitSize) {
  if (highNibble !== 0x0f) {
    return ((highNibble << 8) | lowByte) * unitSize;
  }
  const exponent = lowByte >> 2;
  const multiplier = (lowByte & 0x03) * 2 + 1;
  return 2 ** exponent * multiplier;
}

function ramSize(shiftCount) {
  return shiftCount === 0 ? 0 : 64 << shiftCount;
}

function legacyTvSystem(byte9) {
  return byte9 & 0x01 ? 'PAL' : 'NTSC';
}

/**
 * Parses and validates the 16-byte header of an iNES or NES 2.0 ROM image.
 *
 * @param {ArrayBuffer|Uint8Array} input - Complete ROM file bytes.
 * @returns {object} Parsed, display-ready ROM metadata.
 * @throws {Error} When the file is not a complete, valid iNES image.
 */
export function parseNesRomHeader(input) {
  const bytes = asBytes(input);
  if (bytes.length < HEADER_SIZE) {
    throw new Error('ROM is truncated: an iNES header requires at least 16 bytes.');
  }
  if (bytes[0] !== 0x4e || bytes[1] !== 0x45 || bytes[2] !== 0x53 || bytes[3] !== 0x1a) {
    throw new Error('Invalid NES ROM: the iNES magic signature (NES\\x1A) is missing.');
  }

  const flags6 = bytes[6];
  const flags7 = bytes[7];
  const hasTrainer = Boolean(flags6 & 0x04);
  if (hasTrainer && bytes.length < HEADER_SIZE + TRAINER_SIZE) {
    throw new Error('ROM is truncated: the trainer flag requires 512 bytes after the header.');
  }

  const formatBits = (flags7 >> 2) & 0x03;
  const isNes2 = formatBits === 0x02;
  const isArchaic = !isNes2 && bytes.slice(12, 16).some((byte) => byte !== 0);
  const format = isNes2 ? 'NES 2.0' : isArchaic ? 'Archaic iNES' : 'iNES 1.0';
  const prgHigh = bytes[9] & 0x0f;
  const chrHigh = bytes[9] >> 4;
  const prgRomSize = isNes2
    ? nes2RomSize(bytes[4], prgHigh, PRG_UNIT_SIZE)
    : bytes[4] * PRG_UNIT_SIZE;
  const chrRomSize = isNes2
    ? nes2RomSize(bytes[5], chrHigh, CHR_UNIT_SIZE)
    : bytes[5] * CHR_UNIT_SIZE;
  const expectedFileSize = HEADER_SIZE + (hasTrainer ? TRAINER_SIZE : 0) + prgRomSize + chrRomSize;
  if (!Number.isSafeInteger(expectedFileSize) || bytes.length !== expectedFileSize) {
    throw new Error(
      `ROM size does not match its header: expected ${expectedFileSize} bytes, `
        + `received ${bytes.length}.`
    );
  }

  const mapperNumber = isNes2
    ? (flags6 >> 4) | (flags7 & 0xf0) | ((bytes[8] & 0x0f) << 8)
    : isArchaic ? flags6 >> 4 : (flags6 >> 4) | (flags7 & 0xf0);
  const consoleCode = flags7 & 0x03;
  const extendedConsoleType = isNes2 && consoleCode === 0x03 ? bytes[13] & 0x0f : null;
  const vsSystem = isNes2 && consoleCode === 0x01
    ? { hardwareType: bytes[13] >> 4, ppuType: bytes[13] & 0x0f }
    : null;

  return {
    format,
    fileSize: bytes.length,
    expectedFileSize,
    prgRomSize,
    chrRomSize,
    prgRomUnits: bytes[4],
    chrRomUnits: bytes[5],
    mapperNumber,
    submapper: isNes2 ? bytes[8] >> 4 : null,
    mirroring: flags6 & 0x08 ? 'Four-screen VRAM' : flags6 & 0x01 ? 'Vertical' : 'Horizontal',
    hasBattery: Boolean(flags6 & 0x02),
    hasTrainer,
    hasFourScreenVram: Boolean(flags6 & 0x08),
    consoleType: CONSOLE_TYPES[consoleCode],
    extendedConsoleType,
    cpuPpuTiming: isNes2 ? TIMING_MODES[bytes[12] & 0x03] : legacyTvSystem(bytes[9]),
    vsSystem,
    legacyPrgRamSize: isNes2 ? null : bytes[8] * CHR_UNIT_SIZE,
    prgRamSize: isNes2 ? ramSize(bytes[10] & 0x0f) : null,
    prgNvramSize: isNes2 ? ramSize(bytes[10] >> 4) : null,
    chrRamSize: isNes2 ? ramSize(bytes[11] & 0x0f) : null,
    chrNvramSize: isNes2 ? ramSize(bytes[11] >> 4) : null,
  };
}

/**
 * Formats a byte count for concise display in the inspector.
 *
 * @param {number} bytes - Byte count.
 * @returns {string} Human-readable byte count.
 */
export function formatRomSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
