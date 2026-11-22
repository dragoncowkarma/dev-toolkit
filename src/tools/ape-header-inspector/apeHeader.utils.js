const MAGIC = 'MAC ';
const MODERN_VERSION = 3980;
const MODERN_DESCRIPTOR_SIZE = 52;
const MODERN_HEADER_SIZE = 24;
const LEGACY_HEADER_SIZE = 32;

/**
 * Reads an unsigned integer after ensuring the requested bytes are available.
 * @param {DataView} view
 * @param {number} offset
 * @param {number} size
 * @param {string} fieldName
 * @returns {number}
 */
function readUnsigned(view, offset, size, fieldName) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + size > view.byteLength) {
    throw new Error(`Truncated APE file: cannot read ${fieldName}.`);
  }
  if (size === 2) return view.getUint16(offset, true);
  return view.getUint32(offset, true);
}

/**
 * Ensures a declared section fits inside the source file.
 * @param {number} offset
 * @param {number|bigint} length
 * @param {number} fileLength
 * @param {string} fieldName
 * @returns {number}
 */
function boundedEnd(offset, length, fileLength, fieldName) {
  const sectionLength = BigInt(length);
  const sectionEnd = BigInt(offset) + sectionLength;
  if (sectionEnd > BigInt(fileLength)) {
    throw new Error(`Invalid APE file: ${fieldName} extends past the end of the file.`);
  }
  return Number(sectionEnd);
}

/**
 * Converts a byte count into a compact display value.
 * @param {bigint} value
 * @returns {string}
 */
function formatByteCount(value) {
  return `${value.toString()} bytes`;
}

/**
 * Parses a Monkey's Audio (APE) descriptor and header from raw bytes.
 * @param {ArrayBuffer} buffer
 * @returns {{layout: string, version: number, fields: Array<{label: string, value: string}>}}
 */
export function parseApeHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('APE data must be an ArrayBuffer.');
  }

  const view = new DataView(buffer);
  if (view.byteLength < 6) {
    throw new Error('Truncated APE file: a signature and version are required.');
  }

  const signature = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (signature !== MAGIC) {
    throw new Error('Invalid APE file: expected the "MAC " signature.');
  }

  const version = readUnsigned(view, 4, 2, 'version');
  if (version >= MODERN_VERSION) {
    return parseModernHeader(view, version);
  }
  return parseLegacyHeader(view, version);
}

/**
 * Parses version 3.98 and newer APE descriptors and headers.
 * @param {DataView} view
 * @param {number} version
 * @returns {{layout: string, version: number, fields: Array<{label: string, value: string}>}}
 */
function parseModernHeader(view, version) {
  if (view.byteLength < MODERN_DESCRIPTOR_SIZE) {
    throw new Error('Truncated APE file: the modern descriptor requires 52 bytes.');
  }

  const descriptorBytes = readUnsigned(view, 8, 4, 'descriptor length');
  const headerBytes = readUnsigned(view, 12, 4, 'header length');
  const seekTableBytes = readUnsigned(view, 16, 4, 'seek table length');
  const wavHeaderBytes = readUnsigned(view, 20, 4, 'WAV header length');
  const frameDataLow = readUnsigned(view, 24, 4, 'APE frame data length');
  const frameDataHigh = readUnsigned(view, 28, 4, 'high APE frame data length');
  const terminatingDataBytes = readUnsigned(view, 32, 4, 'terminating data length');

  if (descriptorBytes < MODERN_DESCRIPTOR_SIZE) {
    throw new Error('Invalid APE file: descriptor length is smaller than 52 bytes.');
  }
  if (headerBytes < MODERN_HEADER_SIZE) {
    throw new Error('Invalid APE file: header length is smaller than 24 bytes.');
  }

  const headerOffset = boundedEnd(0, descriptorBytes, view.byteLength, 'descriptor');
  const headerEnd = boundedEnd(headerOffset, headerBytes, view.byteLength, 'header');
  const seekTableEnd = boundedEnd(headerEnd, seekTableBytes, view.byteLength, 'seek table');
  const wavHeaderEnd = boundedEnd(seekTableEnd, wavHeaderBytes, view.byteLength, 'WAV header');
  const frameDataBytes = (BigInt(frameDataHigh) << 32n) | BigInt(frameDataLow);
  const frameDataEnd = boundedEnd(wavHeaderEnd, frameDataBytes, view.byteLength, 'APE frame data');
  boundedEnd(frameDataEnd, terminatingDataBytes, view.byteLength, 'terminating data');

  const compressionLevel = readUnsigned(view, headerOffset, 2, 'compression level');
  const formatFlags = readUnsigned(view, headerOffset + 2, 2, 'format flags');
  const blocksPerFrame = readUnsigned(view, headerOffset + 4, 4, 'blocks per frame');
  const finalFrameBlocks = readUnsigned(view, headerOffset + 8, 4, 'final frame blocks');
  const totalFrames = readUnsigned(view, headerOffset + 12, 4, 'total frames');
  const bitsPerSample = readUnsigned(view, headerOffset + 16, 2, 'bits per sample');
  const channels = readUnsigned(view, headerOffset + 18, 2, 'channel count');
  const sampleRate = readUnsigned(view, headerOffset + 20, 4, 'sample rate');

  return {
    layout: 'Modern (3.98+ descriptor and header)',
    version,
    fields: [
      { label: 'Signature', value: MAGIC },
      { label: 'Version', value: String(version) },
      { label: 'Compression level', value: String(compressionLevel) },
      { label: 'Format flags', value: `0x${formatFlags.toString(16).padStart(4, '0')}` },
      { label: 'Descriptor length', value: formatByteCount(BigInt(descriptorBytes)) },
      { label: 'Header length', value: formatByteCount(BigInt(headerBytes)) },
      { label: 'Seek table length', value: formatByteCount(BigInt(seekTableBytes)) },
      { label: 'WAV header length', value: formatByteCount(BigInt(wavHeaderBytes)) },
      { label: 'Total frames', value: String(totalFrames) },
      { label: 'Final frame blocks', value: String(finalFrameBlocks) },
      { label: 'Blocks per frame', value: String(blocksPerFrame) },
      { label: 'Channels', value: String(channels) },
      { label: 'Sample rate', value: `${sampleRate} Hz` },
      { label: 'Bits per sample', value: String(bitsPerSample) },
      { label: 'APE frame data length', value: formatByteCount(frameDataBytes) },
      { label: 'Terminating data length', value: formatByteCount(BigInt(terminatingDataBytes)) },
    ],
  };
}

/**
 * Parses the embedded-header layout used before APE version 3.98.
 * @param {DataView} view
 * @param {number} version
 * @returns {{layout: string, version: number, fields: Array<{label: string, value: string}>}}
 */
function parseLegacyHeader(view, version) {
  if (view.byteLength < LEGACY_HEADER_SIZE) {
    throw new Error('Truncated APE file: the legacy header requires 32 bytes.');
  }

  const compressionLevel = readUnsigned(view, 6, 2, 'compression level');
  const formatFlags = readUnsigned(view, 8, 2, 'format flags');
  const channels = readUnsigned(view, 10, 2, 'channel count');
  const sampleRate = readUnsigned(view, 12, 4, 'sample rate');
  const wavHeaderBytes = readUnsigned(view, 16, 4, 'WAV header length');
  const terminatingDataBytes = readUnsigned(view, 20, 4, 'terminating data length');
  const totalFrames = readUnsigned(view, 24, 4, 'total frames');
  const finalFrameBlocks = readUnsigned(view, 28, 4, 'final frame blocks');
  const wavHeaderEnd = boundedEnd(
    LEGACY_HEADER_SIZE,
    wavHeaderBytes,
    view.byteLength,
    'WAV header'
  );
  const remainingBytes = view.byteLength - wavHeaderEnd;
  if (terminatingDataBytes > remainingBytes) {
    throw new Error(
      'Invalid APE file: terminating data extends past the end of the file.'
    );
  }

  return {
    layout: 'Legacy (pre-3.98 embedded header)',
    version,
    fields: [
      { label: 'Signature', value: MAGIC },
      { label: 'Version', value: String(version) },
      { label: 'Compression level', value: String(compressionLevel) },
      { label: 'Format flags', value: `0x${formatFlags.toString(16).padStart(4, '0')}` },
      { label: 'Channels', value: String(channels) },
      { label: 'Sample rate', value: `${sampleRate} Hz` },
      { label: 'WAV header length', value: formatByteCount(BigInt(wavHeaderBytes)) },
      { label: 'Total frames', value: String(totalFrames) },
      { label: 'Final frame blocks', value: String(finalFrameBlocks) },
      { label: 'Terminating data length', value: formatByteCount(BigInt(terminatingDataBytes)) },
    ],
  };
}
