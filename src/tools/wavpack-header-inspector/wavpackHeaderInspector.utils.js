const BLOCK_HEADER_SIZE = 32;
const SIGNATURE = 'wvpk';
const UNKNOWN_SAMPLE_COUNT = 0xffffffff;

const BYTES_STORED_MASK = 0x3;
const MONO_FLAG = 0x4;
const HYBRID_FLAG = 0x8;
const JOINT_STEREO_FLAG = 0x10;
const CROSS_DECORR_FLAG = 0x20;
const HYBRID_SHAPE_FLAG = 0x40;
const FLOAT_DATA_FLAG = 0x80;
const EXTRA_BITS_FLAG = 0x100;
const HYBRID_BITRATE_FLAG = 0x200;
const HYBRID_BALANCE_FLAG = 0x400;
const INITIAL_BLOCK_FLAG = 0x800;
const FINAL_BLOCK_FLAG = 0x1000;
const FALSE_STEREO_FLAG = 0x40000000;
const NEW_SHAPING_FLAG = 0x20000000;
const SAMPLE_RATE_SHIFT = 23;
const SAMPLE_RATE_MASK = 0xf;

const SAMPLE_RATES = [
  6000, 8000, 9600, 11025, 12000, 16000, 22050, 24000,
  32000, 44100, 48000, 64000, 88200, 96000, 176400, 192000,
];

/**
 * Reads a four-character ASCII identifier from a DataView.
 *
 * @param {DataView} view - Source data.
 * @param {number} offset - Byte offset of the identifier.
 * @returns {string} The decoded identifier.
 */
function readFourCC(view, offset) {
  let value = '';
  for (let index = 0; index < 4; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

/**
 * Formats the WavPack file format version for display (e.g. 0x0410 -> "4.16").
 *
 * @param {number} version - Raw 16-bit version field.
 * @returns {string} A human-readable version label.
 */
export function formatVersion(version) {
  const major = (version >> 8) & 0xff;
  const minor = version & 0xff;
  return `${major}.${minor}`;
}

/**
 * Decodes the WavPack block flags bitfield into named, display-ready fields.
 *
 * @param {number} flags - Raw 32-bit flags value.
 * @returns {object} Decoded flag information.
 */
export function decodeFlags(flags) {
  const bytesPerSample = (flags & BYTES_STORED_MASK) + 1;
  const isMono = Boolean(flags & MONO_FLAG);
  const isFalseStereo = Boolean(flags & FALSE_STEREO_FLAG);
  const channelMode = isMono
    ? 'Mono'
    : isFalseStereo ? 'False stereo (shared channel data)' : 'Stereo';
  const sampleRateIndex = (flags >>> SAMPLE_RATE_SHIFT) & SAMPLE_RATE_MASK;
  const sampleRate = sampleRateIndex < SAMPLE_RATES.length ? SAMPLE_RATES[sampleRateIndex] : null;

  return {
    raw: flags,
    bytesPerSample,
    isFloatData: Boolean(flags & FLOAT_DATA_FLAG),
    channelMode,
    isMono,
    isFalseStereo,
    isHybrid: Boolean(flags & HYBRID_FLAG),
    isJointStereo: Boolean(flags & JOINT_STEREO_FLAG),
    isCrossDecorrelation: Boolean(flags & CROSS_DECORR_FLAG),
    isHybridShape: Boolean(flags & HYBRID_SHAPE_FLAG),
    hasExtraBits: Boolean(flags & EXTRA_BITS_FLAG),
    isHybridBitrateNoise: Boolean(flags & HYBRID_BITRATE_FLAG),
    isHybridBalanceNoise: Boolean(flags & HYBRID_BALANCE_FLAG),
    isInitialBlock: Boolean(flags & INITIAL_BLOCK_FLAG),
    isFinalBlock: Boolean(flags & FINAL_BLOCK_FLAG),
    isNewShaping: Boolean(flags & NEW_SHAPING_FLAG),
    sampleRateIndex,
    sampleRate,
    sampleRateLabel: sampleRate === null ? 'Unknown / defined elsewhere' : `${sampleRate} Hz`,
  };
}

/**
 * Parses a 32-byte WavPack (version 4.x) block header from file bytes.
 * Never throws: malformed or truncated input returns a structured error
 * result instead, so callers can render diagnostics without a try/catch.
 *
 * @param {ArrayBuffer} buffer - The file bytes to inspect.
 * @returns {{valid: boolean, error?: string, warnings?: string[]}} The parsed header,
 * or a structured error describing why parsing failed.
 */
export function parseWavpackHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    return { valid: false, error: 'Expected WavPack file bytes as an ArrayBuffer.' };
  }
  if (buffer.byteLength < BLOCK_HEADER_SIZE) {
    return {
      valid: false,
      error:
        `File is too short to contain a WavPack block header: expected at least ` +
        `${BLOCK_HEADER_SIZE} bytes, found ${buffer.byteLength}.`,
    };
  }

  const view = new DataView(buffer);
  const signature = readFourCC(view, 0);
  if (signature !== SIGNATURE) {
    return {
      valid: false,
      error:
        `Invalid WavPack file: expected magic signature "${SIGNATURE}", found ` +
        `"${signature.replace(/[^\x20-\x7e]/g, '?')}".`,
    };
  }

  const ckSize = view.getUint32(4, true);
  const version = view.getUint16(8, true);
  const trackNo = view.getUint8(10);
  const indexNo = view.getUint8(11);
  const totalSamplesRaw = view.getUint32(12, true);
  const blockIndex = view.getUint32(16, true);
  const blockSamples = view.getUint32(20, true);
  const flags = view.getUint32(24, true);
  const crc = view.getUint32(28, true);

  const totalSamples = totalSamplesRaw === UNKNOWN_SAMPLE_COUNT ? -1 : totalSamplesRaw;
  const totalSamplesLabel = totalSamples === -1 ? 'Unknown' : String(totalSamples);

  const warnings = [];
  const declaredBlockLength = ckSize + 8;
  if (declaredBlockLength > buffer.byteLength) {
    warnings.push(
      `Block declares ${declaredBlockLength} total bytes (ckSize=${ckSize} + 8), but the ` +
        `uploaded data only contains ${buffer.byteLength} bytes. The block payload is truncated.`
    );
  }

  return {
    valid: true,
    signature,
    ckSize,
    declaredBlockLength,
    availableLength: buffer.byteLength,
    version,
    versionLabel: formatVersion(version),
    trackNo,
    indexNo,
    totalSamples,
    totalSamplesLabel,
    blockIndex,
    blockSamples,
    flags: decodeFlags(flags),
    crc,
    warnings,
  };
}
