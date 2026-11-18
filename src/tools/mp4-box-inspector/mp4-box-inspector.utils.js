const CONTAINER_TYPES = new Set([
  'moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'mvex', 'moof', 'traf',
  'mfra', 'udta', 'ilst', 'tref', 'ipro', 'sinf', 'schi',
]);

const META_CONTAINER_TYPES = new Set(['meta']);
const RECOGNIZED_TOP_LEVEL_TYPES = new Set([
  'ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'uuid', 'pnot', 'pict', 'cmov',
]);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Converts a byte count into a compact human-readable string.
 *
 * @param {number} bytes - Number of bytes to format.
 * @returns {string} A formatted byte count.
 */
export function formatByteSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Parses an ISOBMFF file into a tree of boxes. The parser only reads bytes in
 * the provided buffer and throws an Error with offset context for malformed data.
 *
 * @param {ArrayBuffer} buffer - Raw MP4, MOV, or M4A file contents.
 * @returns {{boxes: Array<object>, metadata: object}} Parsed box tree and summaries.
 * @throws {Error} When the buffer is not a complete, recognizable ISOBMFF file.
 */
export function parseMp4Boxes(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('Expected an ArrayBuffer.');
  }
  if (buffer.byteLength < 8) {
    throw new Error('File is too small to contain an MP4 box header.');
  }

  const view = new DataView(buffer);
  const boxes = parseBoxRange(view, 0, view.byteLength);
  if (!boxes.some((box) => RECOGNIZED_TOP_LEVEL_TYPES.has(box.type))) {
    throw new Error('This file does not contain recognizable MP4 or QuickTime boxes.');
  }

  return { boxes, metadata: collectMetadata(boxes, view) };
}

function parseBoxRange(view, start, end) {
  const boxes = [];
  let offset = start;

  while (offset < end) {
    if (end - offset < 8) {
      throw new Error(`Truncated box header at offset ${offset}.`);
    }
    const declaredSize = view.getUint32(offset);
    const type = readFourCc(view, offset + 4);
    let headerSize = 8;
    let size = declaredSize;

    if (declaredSize === 1) {
      if (end - offset < 16) {
        throw new Error(`Truncated extended-size header for ${type} at offset ${offset}.`);
      }
      size = readUint64(view, offset + 8, type, offset);
      headerSize = 16;
    } else if (declaredSize === 0) {
      size = end - offset;
    }

    let userType;
    if (type === 'uuid') {
      if (end - offset < headerSize + 16) {
        throw new Error(`Truncated UUID header at offset ${offset}.`);
      }
      userType = readUuid(view, offset + headerSize);
      headerSize += 16;
    }

    if (size < headerSize) {
      throw new Error(`Invalid ${type} box size at offset ${offset}.`);
    }
    if (size > end - offset) {
      throw new Error(`Truncated ${type} box at offset ${offset}: it extends past its parent.`);
    }

    const box = { type, offset, size, headerSize, dataOffset: offset + headerSize };
    if (userType) box.userType = userType;
    const boxEnd = offset + size;
    const childStart = getChildStart(box, view, boxEnd);
    if (childStart !== null) {
      box.children = parseBoxRange(view, childStart, boxEnd);
    }
    boxes.push(box);
    offset = boxEnd;
  }

  return boxes;
}

function getChildStart(box, view, boxEnd) {
  if (CONTAINER_TYPES.has(box.type)) return box.dataOffset;
  if (META_CONTAINER_TYPES.has(box.type)) {
    if (boxEnd - box.dataOffset < 4) {
      throw new Error(`Truncated meta box at offset ${box.offset}.`);
    }
    return box.dataOffset + 4;
  }
  return null;
}

function readUint64(view, offset, type, boxOffset) {
  const value = view.getBigUint64(offset);
  if (value > MAX_SAFE_BIGINT) {
    throw new Error(`The ${type} box at offset ${boxOffset} is too large to inspect safely.`);
  }
  return Number(value);
}

function readFourCc(view, offset) {
  let value = '';
  for (let index = 0; index < 4; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

function readUuid(view, offset) {
  const bytes = Array.from({ length: 16 }, (_, index) => view.getUint8(offset + index));
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function collectMetadata(boxes, view) {
  const metadata = {
    fileType: null,
    movie: null,
    tracks: [],
    media: [],
    sampleDescriptions: [],
  };
  walkBoxes(boxes, (box, parent) => {
    if (box.type === 'ftyp') metadata.fileType = parseFileType(box, view);
    if (box.type === 'mvhd') metadata.movie = parseMovieHeader(box, view);
    if (box.type === 'tkhd') metadata.tracks.push(parseTrackHeader(box, view));
    if (box.type === 'hdlr' && parent?.type === 'mdia') {
      metadata.media.push(parseHandler(box, view));
    }
    if (box.type === 'stsd') metadata.sampleDescriptions.push(parseSampleDescription(box, view));
  });
  return metadata;
}

function walkBoxes(boxes, callback, parent = null) {
  boxes.forEach((box) => {
    callback(box, parent);
    if (box.children) walkBoxes(box.children, callback, box);
  });
}

function parseFileType(box, view) {
  if (box.size - box.headerSize < 8) {
    throw new Error(`Truncated ftyp box at offset ${box.offset}.`);
  }
  const majorBrand = readFourCc(view, box.dataOffset);
  const minorVersion = view.getUint32(box.dataOffset + 4);
  const compatibleBrands = [];
  for (let offset = box.dataOffset + 8; offset + 4 <= box.offset + box.size; offset += 4) {
    compatibleBrands.push(readFourCc(view, offset));
  }
  return { majorBrand, minorVersion, compatibleBrands };
}

function parseMovieHeader(box, view) {
  const version = readFullBoxVersion(box, view);
  const timescaleOffset = box.dataOffset + (version === 1 ? 20 : 12);
  const durationOffset = box.dataOffset + (version === 1 ? 24 : 16);
  const durationLength = version === 1 ? 8 : 4;
  ensurePayload(box, timescaleOffset - box.dataOffset + 4 + durationLength, 'mvhd');
  return {
    timescale: view.getUint32(timescaleOffset),
    duration: durationLength === 8
      ? readUint64(view, durationOffset, 'mvhd', box.offset)
      : view.getUint32(durationOffset),
  };
}

function parseTrackHeader(box, view) {
  const version = readFullBoxVersion(box, view);
  const trackIdOffset = box.dataOffset + (version === 1 ? 20 : 12);
  ensurePayload(box, trackIdOffset - box.dataOffset + 4, 'tkhd');
  return { trackId: view.getUint32(trackIdOffset) };
}

function parseHandler(box, view) {
  ensurePayload(box, 12, 'hdlr');
  return { handlerType: readFourCc(view, box.dataOffset + 8) };
}

function parseSampleDescription(box, view) {
  ensurePayload(box, 8, 'stsd');
  const entryCount = view.getUint32(box.dataOffset + 4);
  const entries = [];
  let offset = box.dataOffset + 8;
  const end = box.offset + box.size;
  for (let index = 0; index < entryCount && offset + 8 <= end; index += 1) {
    const size = view.getUint32(offset);
    if (size < 8 || offset + size > end) break;
    entries.push(readFourCc(view, offset + 4));
    offset += size;
  }
  return { entryCount, entries };
}

function readFullBoxVersion(box, view) {
  ensurePayload(box, 4, box.type);
  return view.getUint8(box.dataOffset);
}

function ensurePayload(box, needed, name) {
  if (box.size - box.headerSize < needed) {
    throw new Error(`Truncated ${name} box at offset ${box.offset}.`);
  }
}
