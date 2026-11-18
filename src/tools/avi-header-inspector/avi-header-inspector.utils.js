const RIFF_HEADER_SIZE = 12;
const CHUNK_HEADER_SIZE = 8;
const MAIN_AVI_HEADER_SIZE = 56;
const STREAM_HEADER_SIZE = 56;
const BITMAP_INFO_HEADER_SIZE = 20;

/**
 * Reads a FourCC identifier from a DataView.
 *
 * @param {DataView} view
 * @param {number} offset
 * @returns {string}
 */
function readFourCC(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Throws when a chunk's declared byte range cannot fit in its parent.
 *
 * @param {number} offset
 * @param {number} length
 * @param {number} limit
 * @param {string} label
 */
function requireRange(offset, length, limit, label) {
  if (offset < 0 || length < 0 || offset + length > limit) {
    throw new Error(`${label} is truncated or extends beyond its parent chunk.`);
  }
}

/**
 * Reads RIFF chunks between two byte offsets, enforcing RIFF word padding.
 *
 * @param {DataView} view
 * @param {number} start
 * @param {number} end
 * @returns {Array<{id: string, dataOffset: number, size: number, end: number}>}
 */
function readChunks(view, start, end) {
  const chunks = [];
  let offset = start;

  while (offset < end) {
    requireRange(offset, CHUNK_HEADER_SIZE, end, 'Chunk header');
    const id = readFourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    const dataOffset = offset + CHUNK_HEADER_SIZE;
    requireRange(dataOffset, size, end, `Chunk ${id}`);
    const chunkEnd = dataOffset + size;
    const paddedEnd = chunkEnd + (size % 2);
    requireRange(chunkEnd, size % 2, end, `Chunk ${id} padding`);
    chunks.push({ id, dataOffset, size, end: chunkEnd });
    offset = paddedEnd;
  }

  return chunks;
}

/**
 * Converts an AVI frame interval to a readable frames-per-second value.
 *
 * @param {number} microseconds
 * @returns {number|null}
 */
function frameRateFromMicroseconds(microseconds) {
  if (microseconds === 0) return null;
  return Number((1000000 / microseconds).toFixed(3));
}

/**
 * Parses an AVI RIFF container without reading media payload data.
 *
 * @param {ArrayBuffer} buffer
 * @returns {{mainHeader: object, streams: Array<object>}}
 * @throws {Error} When the buffer is not a complete, valid AVI header.
 */
export function parseAviHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < RIFF_HEADER_SIZE) {
    throw new Error('The file is too short to contain an AVI RIFF header.');
  }

  const view = new DataView(buffer);
  if (readFourCC(view, 0) !== 'RIFF') {
    throw new Error('Invalid RIFF magic. AVI files must begin with RIFF.');
  }

  const declaredSize = view.getUint32(4, true);
  const riffEnd = declaredSize + 8;
  if (declaredSize < 4 || riffEnd > buffer.byteLength) {
    throw new Error('The RIFF declared size is invalid or the file is truncated.');
  }
  if (readFourCC(view, 8) !== 'AVI ') {
    throw new Error('Invalid RIFF form type. This inspector requires an AVI file.');
  }

  const riffChunks = readChunks(view, RIFF_HEADER_SIZE, riffEnd);
  const headerList = riffChunks.find((chunk) => chunk.id === 'LIST' &&
    chunk.size >= 4 && readFourCC(view, chunk.dataOffset) === 'hdrl');
  if (!headerList) {
    throw new Error('The AVI header list (hdrl) is missing.');
  }

  const headerChunks = readChunks(view, headerList.dataOffset + 4, headerList.end);
  const mainChunk = headerChunks.find((chunk) => chunk.id === 'avih');
  if (!mainChunk || mainChunk.size < MAIN_AVI_HEADER_SIZE) {
    throw new Error('The Main AVI Header (avih) is missing or truncated.');
  }

  const mainHeader = {
    microsecondsPerFrame: view.getUint32(mainChunk.dataOffset, true),
    totalFrames: view.getUint32(mainChunk.dataOffset + 16, true),
    streamCount: view.getUint32(mainChunk.dataOffset + 24, true),
    width: view.getUint32(mainChunk.dataOffset + 32, true),
    height: view.getUint32(mainChunk.dataOffset + 36, true),
  };
  mainHeader.frameRate = frameRateFromMicroseconds(mainHeader.microsecondsPerFrame);

  const streams = headerChunks
    .filter((chunk) => chunk.id === 'LIST' && chunk.size >= 4 &&
      readFourCC(view, chunk.dataOffset) === 'strl')
    .map((listChunk, index) => parseStreamList(view, listChunk, index));

  return { mainHeader, streams };
}

/**
 * Parses one AVI stream list.
 *
 * @param {DataView} view
 * @param {{dataOffset: number, end: number}} listChunk
 * @param {number} index
 * @returns {object}
 */
function parseStreamList(view, listChunk, index) {
  const chunks = readChunks(view, listChunk.dataOffset + 4, listChunk.end);
  const headerChunk = chunks.find((chunk) => chunk.id === 'strh');
  if (!headerChunk || headerChunk.size < STREAM_HEADER_SIZE) {
    throw new Error(`Stream ${index + 1} has a missing or truncated stream header (strh).`);
  }

  const type = readFourCC(view, headerChunk.dataOffset);
  const stream = {
    index: index + 1,
    type,
    handler: readFourCC(view, headerChunk.dataOffset + 4),
  };

  if (type === 'vids') {
    const formatChunk = chunks.find((chunk) => chunk.id === 'strf');
    if (!formatChunk || formatChunk.size < BITMAP_INFO_HEADER_SIZE) {
      throw new Error(`Video stream ${index + 1} has a missing or truncated format header (strf).`);
    }
    stream.compression = readFourCC(view, formatChunk.dataOffset + 16);
    stream.bitDepth = view.getUint16(formatChunk.dataOffset + 14, true);
  }

  return stream;
}
