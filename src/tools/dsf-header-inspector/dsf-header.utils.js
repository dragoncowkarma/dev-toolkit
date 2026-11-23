const DSD_CHUNK_SIZE = 28;
const FMT_CHUNK_SIZE = 52;
const DATA_HEADER_SIZE = 12;

/**
 * Reads and validates a DSD Stream File header from raw bytes.
 * @param {ArrayBuffer} buffer - Complete contents of a local DSF file.
 * @returns {object} Parsed DSF header fields and derived values.
 * @throws {Error} When the input is truncated or is not a supported DSF header.
 */
export function parseDsfHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('Expected an ArrayBuffer containing a DSF file.');
  }

  const view = new DataView(buffer);
  ensureRange(view, 0, DSD_CHUNK_SIZE, 'DSD header');
  ensureMagic(view, 0, 'DSD ', 'DSD header');

  const dsdChunkSize = readUint64(view, 4, 'DSD chunk size');
  if (dsdChunkSize !== DSD_CHUNK_SIZE) {
    throw new Error(`Invalid DSD chunk size: expected ${DSD_CHUNK_SIZE}, got ${dsdChunkSize}.`);
  }

  const fileSize = readUint64(view, 12, 'total file size');
  if (fileSize > buffer.byteLength) {
    throw new Error('The declared total file size extends past the available file data.');
  }

  const metadataPointer = readUint64(view, 20, 'metadata pointer');
  if (metadataPointer !== 0 && metadataPointer >= buffer.byteLength) {
    throw new Error('The metadata pointer extends past the available file data.');
  }

  const fmtOffset = DSD_CHUNK_SIZE;
  ensureRange(view, fmtOffset, FMT_CHUNK_SIZE, 'fmt header');
  ensureMagic(view, fmtOffset, 'fmt ', 'fmt header');
  const fmtChunkSize = readUint64(view, fmtOffset + 4, 'fmt chunk size');
  if (fmtChunkSize !== FMT_CHUNK_SIZE) {
    throw new Error(`Invalid fmt chunk size: expected ${FMT_CHUNK_SIZE}, got ${fmtChunkSize}.`);
  }

  const formatVersion = view.getUint32(fmtOffset + 12, true);
  const formatId = view.getUint32(fmtOffset + 16, true);
  const channelType = view.getUint32(fmtOffset + 20, true);
  const channelCount = view.getUint32(fmtOffset + 24, true);
  const samplingFrequency = view.getUint32(fmtOffset + 28, true);
  const bitsPerSample = view.getUint32(fmtOffset + 32, true);
  const sampleCount = readUint64(view, fmtOffset + 36, 'sample count');
  const blockSizePerChannel = view.getUint32(fmtOffset + 44, true);
  const reserved = view.getUint32(fmtOffset + 48, true);

  if (samplingFrequency === 0) {
    throw new Error('Invalid sampling frequency: it must be greater than zero.');
  }

  const dataOffset = fmtOffset + FMT_CHUNK_SIZE;
  ensureRange(view, dataOffset, DATA_HEADER_SIZE, 'data header');
  ensureMagic(view, dataOffset, 'data', 'data header');
  const dataChunkSize = readUint64(view, dataOffset + 4, 'data chunk size');
  if (dataChunkSize < DATA_HEADER_SIZE) {
    throw new Error(`Invalid data chunk size: it must be at least ${DATA_HEADER_SIZE}.`);
  }
  if (dataChunkSize > buffer.byteLength - dataOffset) {
    throw new Error('The declared data chunk size extends past the available file data.');
  }

  return {
    dsdChunkSize,
    fileSize,
    metadataPointer,
    formatVersion,
    formatId,
    channelType,
    channelCount,
    samplingFrequency,
    bitsPerSample,
    sampleCount,
    blockSizePerChannel,
    reserved,
    dataChunkSize,
    audioPayloadSize: dataChunkSize - DATA_HEADER_SIZE,
    durationSeconds: sampleCount / samplingFrequency,
  };
}

function ensureRange(view, offset, length, label) {
  if (offset < 0 || length < 0 || offset + length > view.byteLength) {
    throw new Error(`Truncated ${label}: expected ${length} bytes at offset ${offset}.`);
  }
}

function ensureMagic(view, offset, expected, label) {
  const actual = String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
  if (actual !== expected) {
    throw new Error(`Invalid ${label} magic: expected "${expected}".`);
  }
}

function readUint64(view, offset, label) {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is too large to inspect safely.`);
  }
  return Number(value);
}

/**
 * Formats a byte count for display.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Formats a duration in seconds as a compact time string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'Unknown';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  return `${minutes}:${remainingSeconds.toFixed(3).padStart(6, '0')}`;
}
