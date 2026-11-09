const RIFF_HEADER_SIZE = 12;
const CHUNK_HEADER_SIZE = 8;

/**
 * Reads a four-character ASCII identifier from a DataView.
 *
 * @param {DataView} view - Source data.
 * @param {number} offset - Byte offset of the identifier.
 * @returns {string} The decoded identifier.
 */
function readChunkId(view, offset) {
  let identifier = '';
  for (let index = 0; index < 4; index += 1) {
    identifier += String.fromCharCode(view.getUint8(offset + index));
  }
  return identifier;
}

/**
 * Returns a readable label for a WAVE audio format code.
 *
 * @param {number} formatCode - The unsigned 16-bit WAVE format code.
 * @returns {string} The display label.
 */
export function formatAudioFormat(formatCode) {
  if (formatCode === 1) return 'PCM (1)';
  if (formatCode === 3) return 'IEEE float (3)';
  return `Unknown (0x${formatCode.toString(16).padStart(4, '0').toUpperCase()})`;
}

/**
 * Formats a duration in seconds for display.
 *
 * @param {number} seconds - Duration in seconds.
 * @returns {string} A readable duration string.
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Unavailable';
  if (seconds < 60) return `${seconds.toFixed(2)} seconds`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

/**
 * Parses a RIFF/WAVE file header and its top-level chunks.
 *
 * @param {ArrayBuffer} buffer - The file bytes to inspect.
 * @returns {{riffSize: number, chunks: Array, format: object|null, data: object|null}}
 * @throws {Error} When the file is not a complete RIFF/WAVE container.
 */
export function parseWavHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('Expected WAV file bytes as an ArrayBuffer.');
  }
  if (buffer.byteLength < RIFF_HEADER_SIZE) {
    throw new Error('File is too short to contain a RIFF/WAVE header.');
  }

  const view = new DataView(buffer);
  if (readChunkId(view, 0) !== 'RIFF') {
    throw new Error('Invalid WAV file: missing RIFF magic bytes.');
  }
  if (readChunkId(view, 8) !== 'WAVE') {
    throw new Error('Invalid WAV file: RIFF format identifier must be WAVE.');
  }

  const riffSize = view.getUint32(4, true);
  const chunks = [];
  let format = null;
  let data = null;
  let offset = RIFF_HEADER_SIZE;

  while (offset < view.byteLength) {
    if (view.byteLength - offset < CHUNK_HEADER_SIZE) {
      throw new Error(`Truncated chunk header at byte offset ${offset}.`);
    }

    const id = readChunkId(view, offset);
    const size = view.getUint32(offset + 4, true);
    const payloadOffset = offset + CHUNK_HEADER_SIZE;
    const payloadEnd = payloadOffset + size;
    if (payloadEnd > view.byteLength) {
      throw new Error(`Truncated ${id} chunk at byte offset ${offset}: expected ${size} bytes.`);
    }

    const chunk = { id, offset, size };
    chunks.push(chunk);
    if (id === 'fmt ' && format === null) {
      if (size < 16) {
        throw new Error(`Invalid fmt chunk at byte offset ${offset}: expected at least 16 bytes.`);
      }
      const audioFormat = view.getUint16(payloadOffset, true);
      const channels = view.getUint16(payloadOffset + 2, true);
      const sampleRate = view.getUint32(payloadOffset + 4, true);
      const byteRate = view.getUint32(payloadOffset + 8, true);
      const blockAlign = view.getUint16(payloadOffset + 12, true);
      const bitsPerSample = view.getUint16(payloadOffset + 14, true);
      format = {
        audioFormat,
        audioFormatLabel: formatAudioFormat(audioFormat),
        channels,
        sampleRate,
        byteRate,
        blockAlign,
        bitsPerSample,
      };
    }
    if (id === 'data' && data === null) {
      data = { size };
    }

    offset = payloadEnd;
    if (size % 2 === 1) {
      if (offset >= view.byteLength) {
        throw new Error(`Truncated padding byte after ${id} chunk at byte offset ${offset}.`);
      }
      offset += 1;
    }
  }

  if (format && data && format.audioFormat === 1) {
    const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8);
    data.duration = bytesPerSecond > 0 ? data.size / bytesPerSecond : null;
  } else if (data) {
    data.duration = null;
  }

  return { riffSize, chunks, format, data };
}
