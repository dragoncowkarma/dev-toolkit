const STREAMINFO_LENGTH = 34;

const BLOCK_TYPE_NAMES = {
  0: 'STREAMINFO',
  1: 'PADDING',
  2: 'APPLICATION',
  3: 'SEEKTABLE',
  4: 'VORBIS_COMMENT',
  5: 'CUESHEET',
  6: 'PICTURE',
};

/**
 * Returns a readable FLAC metadata block type name.
 *
 * @param {number} type - The 7-bit FLAC metadata block type.
 * @returns {string} The known type name or an unknown-type label.
 */
export function getBlockTypeName(type) {
  return BLOCK_TYPE_NAMES[type] ?? `Unknown (${type})`;
}

function requireBytes(view, offset, length, context) {
  if (offset < 0 || length < 0 || offset + length > view.byteLength) {
    throw new Error(`Truncated FLAC ${context}.`);
  }
}

function readUint24(view, offset) {
  return (
    (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2)
  );
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeText(bytes) {
  return new TextDecoder().decode(bytes);
}

function parseStreamInfo(view, offset, length) {
  if (length !== STREAMINFO_LENGTH) {
    throw new Error(`Invalid STREAMINFO block length: expected ${STREAMINFO_LENGTH} bytes.`);
  }
  requireBytes(view, offset, length, 'STREAMINFO block');
  const packedHigh = view.getUint32(offset + 10);
  const packedLow = view.getUint32(offset + 14);
  const sampleRate = packedHigh >>> 12;
  const channels = ((packedHigh >>> 9) & 0x07) + 1;
  const bitsPerSample = ((packedHigh >>> 4) & 0x1f) + 1;
  const totalSamples = (packedHigh & 0x0f) * 2 ** 32 + packedLow;
  const md5 = bytesToHex(new Uint8Array(view.buffer, view.byteOffset + offset + 18, 16));

  return {
    minBlockSize: view.getUint16(offset),
    maxBlockSize: view.getUint16(offset + 2),
    minFrameSize: readUint24(view, offset + 4),
    maxFrameSize: readUint24(view, offset + 7),
    sampleRate,
    channels,
    bitsPerSample,
    totalSamples,
    durationSeconds: sampleRate > 0 ? totalSamples / sampleRate : null,
    md5,
  };
}

function parseVorbisComment(view, offset, length) {
  const end = offset + length;
  requireBytes(view, offset, length, 'VORBIS_COMMENT block');
  let cursor = offset;
  const readLength = (context) => {
    requireBytes(view, cursor, 4, context);
    const value = view.getUint32(cursor, true);
    cursor += 4;
    return value;
  };
  const readText = (byteLength, context) => {
    if (cursor + byteLength > end) {
      throw new Error(`Truncated FLAC ${context}.`);
    }
    const text = decodeText(new Uint8Array(view.buffer, view.byteOffset + cursor, byteLength));
    cursor += byteLength;
    return text;
  };

  const vendorLength = readLength('VORBIS_COMMENT vendor length');
  const vendor = readText(vendorLength, 'VORBIS_COMMENT vendor string');
  const commentCount = readLength('VORBIS_COMMENT comment count');
  const minimumCommentBytes = commentCount * 4;
  if (minimumCommentBytes > end - cursor) {
    throw new Error('Truncated FLAC VORBIS_COMMENT comment list.');
  }
  const comments = [];
  for (let index = 0; index < commentCount; index += 1) {
    const entry = readText(
      readLength(`VORBIS_COMMENT comment ${index + 1} length`),
      `VORBIS_COMMENT comment ${index + 1}`,
    );
    const separator = entry.indexOf('=');
    comments.push({
      key: separator === -1 ? entry : entry.slice(0, separator),
      value: separator === -1 ? '' : entry.slice(separator + 1),
    });
  }
  return { vendor, comments };
}

/**
 * Parses the metadata block chain in a FLAC file without decoding audio frames.
 *
 * @param {ArrayBuffer} buffer - Raw bytes selected by the user.
 * @returns {{blocks: Array<object>, streamInfo: object|null}} Parsed metadata details.
 * @throws {Error} When the file marker, metadata headers, or payloads are malformed.
 */
export function parseFlacMetadata(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('FLAC data must be an ArrayBuffer.');
  }
  const view = new DataView(buffer);
  requireBytes(view, 0, 4, 'header');
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== 'fLaC') {
    throw new Error('Not a FLAC file: expected the fLaC marker.');
  }

  const blocks = [];
  let streamInfo = null;
  let offset = 4;
  let isLastBlock = false;
  while (!isLastBlock) {
    requireBytes(view, offset, 4, 'metadata block header');
    const header = view.getUint8(offset);
    isLastBlock = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const length = readUint24(view, offset + 1);
    const payloadOffset = offset + 4;
    requireBytes(view, payloadOffset, length, `metadata block (${getBlockTypeName(type)})`);

    const block = { type, typeName: getBlockTypeName(type), length };
    if (type === 0) {
      block.streamInfo = parseStreamInfo(view, payloadOffset, length);
      streamInfo = block.streamInfo;
    } else if (type === 4) {
      block.vorbisComment = parseVorbisComment(view, payloadOffset, length);
    }
    blocks.push(block);
    offset = payloadOffset + length;
  }
  return { blocks, streamInfo };
}

/**
 * Formats a duration in seconds for display.
 *
 * @param {number|null} durationSeconds - The duration to format.
 * @returns {string} A human-readable duration.
 */
export function formatDuration(durationSeconds) {
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) return 'Unavailable';
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;
  const time = `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
  return hours > 0 ? `${hours}:${time}` : time;
}
