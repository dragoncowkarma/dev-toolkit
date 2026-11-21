const FLV_HEADER_SIZE = 9;
const PREVIOUS_TAG_SIZE_LENGTH = 4;
const TAG_HEADER_SIZE = 11;

const TAG_TYPES = {
  8: 'Audio',
  9: 'Video',
  18: 'Script data',
};

const FRAME_TYPES = {
  1: 'Key frame',
  2: 'Inter frame',
  3: 'Disposable inter frame',
  4: 'Generated key frame',
  5: 'Video info/command frame',
};

const VIDEO_CODECS = {
  2: 'Sorenson H.263',
  3: 'Screen video',
  4: 'On2 VP6',
  5: 'On2 VP6 with alpha',
  6: 'Screen video version 2',
  7: 'AVC',
  12: 'HEVC',
};

const SOUND_FORMATS = {
  0: 'Linear PCM, platform endian',
  1: 'ADPCM',
  2: 'MP3',
  3: 'Linear PCM, little endian',
  4: 'Nellymoser 16 kHz mono',
  5: 'Nellymoser 8 kHz mono',
  6: 'Nellymoser',
  7: 'G.711 A-law logarithmic PCM',
  8: 'G.711 mu-law logarithmic PCM',
  9: 'Reserved',
  10: 'AAC',
  11: 'Speex',
  14: 'MP3 8 kHz',
  15: 'Device-specific sound',
};

const SOUND_RATES = ['5.5 kHz', '11 kHz', '22 kHz', '44 kHz'];

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array();
}

function canRead(bytes, offset, length) {
  return Number.isInteger(offset) && length >= 0 && offset >= 0 && offset + length <= bytes.length;
}

function readUInt24(bytes, offset) {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function readUInt32(bytes, offset) {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function addDiagnostic(diagnostics, level, message, offset) {
  diagnostics.push({ level, message, offset });
}

/**
 * Decodes the first payload byte of a video tag without reading the payload itself.
 * @param {number} value
 * @returns {{frameType: number, frameTypeLabel: string, codecId: number, codecLabel: string}}
 */
export function decodeVideoTagByte(value) {
  const frameType = value >> 4;
  const codecId = value & 0x0f;
  return {
    frameType,
    frameTypeLabel: FRAME_TYPES[frameType] ?? 'Reserved/unknown',
    codecId,
    codecLabel: VIDEO_CODECS[codecId] ?? 'Reserved/unknown',
  };
}

/**
 * Decodes the first payload byte of an audio tag without reading the payload itself.
 * @param {number} value
 * @returns {{soundFormat: number, soundFormatLabel: string, soundRate: string, soundSize: string,
 * soundType: string}}
 */
export function decodeAudioTagByte(value) {
  const soundFormat = value >> 4;
  return {
    soundFormat,
    soundFormatLabel: SOUND_FORMATS[soundFormat] ?? 'Reserved/unknown',
    soundRate: SOUND_RATES[(value >> 2) & 0x03],
    soundSize: value & 0x02 ? '16-bit' : '8-bit',
    soundType: value & 0x01 ? 'Stereo' : 'Mono',
  };
}

/**
 * Parses an FLV container header and tag metadata with bounds checks for every read.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{header: object|null, tags: object[], diagnostics: object[]}}
 */
export function parseFlv(input) {
  const bytes = asBytes(input);
  const diagnostics = [];
  const tags = [];

  if (!canRead(bytes, 0, FLV_HEADER_SIZE)) {
    addDiagnostic(
      diagnostics,
      'error',
      `Truncated FLV header: expected ${FLV_HEADER_SIZE} bytes, found ${bytes.length}.`,
      0
    );
    return { header: null, tags, diagnostics };
  }

  const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  const version = bytes[3];
  const flags = bytes[4];
  const dataOffset = readUInt32(bytes, 5);
  const header = {
    signature,
    version,
    hasAudio: (flags & 0x04) !== 0,
    hasVideo: (flags & 0x01) !== 0,
    dataOffset,
  };

  if (signature !== 'FLV') {
    addDiagnostic(diagnostics, 'error', 'Malformed signature: expected "FLV".', 0);
  }
  if (version !== 1) {
    addDiagnostic(diagnostics, 'warning', `Unexpected FLV version ${version}; expected 1.`, 3);
  }
  if (dataOffset < FLV_HEADER_SIZE) {
    addDiagnostic(
      diagnostics,
      'error',
      `Invalid DataOffset ${dataOffset}: it must be at least ${FLV_HEADER_SIZE}.`,
      5
    );
    return { header, tags, diagnostics };
  }
  if (dataOffset > bytes.length) {
    addDiagnostic(
      diagnostics,
      'error',
      `DataOffset ${dataOffset} is beyond the ${bytes.length}-byte file.`,
      5
    );
    return { header, tags, diagnostics };
  }

  let offset = dataOffset;
  let previousTagLength = null;
  while (offset < bytes.length) {
    const tagOffset = offset;
    if (!canRead(bytes, offset, PREVIOUS_TAG_SIZE_LENGTH)) {
      addDiagnostic(
        diagnostics,
        'error',
        `Truncated PreviousTagSize at byte ${offset}: ${bytes.length - offset} byte(s) remain.`,
        offset
      );
      break;
    }

    const previousTagSize = readUInt32(bytes, offset);
    offset += PREVIOUS_TAG_SIZE_LENGTH;
    if (previousTagLength !== null && previousTagSize !== previousTagLength) {
      addDiagnostic(
        diagnostics,
        'warning',
        `PreviousTagSize ${previousTagSize} does not match prior tag size ` +
          `${previousTagLength}.`,
        tagOffset
      );
    }

    if (!canRead(bytes, offset, TAG_HEADER_SIZE)) {
      addDiagnostic(
        diagnostics,
        'error',
        `Truncated tag header at byte ${offset}: expected ${TAG_HEADER_SIZE} bytes.`,
        offset
      );
      break;
    }

    const tagTypeCode = bytes[offset];
    const dataSize = readUInt24(bytes, offset + 1);
    const timestamp = readUInt24(bytes, offset + 4) + bytes[offset + 7] * 0x1000000;
    const streamId = readUInt24(bytes, offset + 8);
    const payloadOffset = offset + TAG_HEADER_SIZE;
    const availablePayloadSize = bytes.length - payloadOffset;
    const tag = {
      offset: tagOffset,
      previousTagSize,
      tagTypeCode,
      tagType: TAG_TYPES[tagTypeCode] ?? 'Unknown',
      dataSize,
      timestamp,
      streamId,
    };

    if (dataSize > availablePayloadSize) {
      addDiagnostic(
        diagnostics,
        'error',
        `Tag at byte ${tagOffset} declares ${dataSize} payload bytes, ` +
          `but only ${availablePayloadSize} remain.`,
        payloadOffset
      );
      tags.push(tag);
      break;
    }

    if (dataSize > 0 && tagTypeCode === 9) {
      tag.video = decodeVideoTagByte(bytes[payloadOffset]);
    }
    if (dataSize > 0 && tagTypeCode === 8) {
      tag.audio = decodeAudioTagByte(bytes[payloadOffset]);
    }
    if (dataSize === 0 && (tagTypeCode === 8 || tagTypeCode === 9)) {
      addDiagnostic(
        diagnostics,
        'warning',
        `${tag.tagType} tag at byte ${tagOffset} has no codec header byte.`,
        payloadOffset
      );
    }

    tags.push(tag);
    previousTagLength = TAG_HEADER_SIZE + dataSize;
    offset = payloadOffset + dataSize;
  }

  return { header, tags, diagnostics };
}
