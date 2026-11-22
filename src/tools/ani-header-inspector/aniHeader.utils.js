const RIFF_HEADER_SIZE = 12;
const CHUNK_HEADER_SIZE = 8;
const ANIHEADER_SIZE = 36;
const AF_ICON = 0x1;

/**
 * Converts four consecutive bytes to an ASCII RIFF identifier.
 * @param {DataView} view The bytes to read.
 * @param {number} offset The first byte of the identifier.
 * @returns {string} A four-character RIFF identifier.
 */
function readFourCc(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

/**
 * Parses an ANIHEADER payload after its size has been validated.
 * @param {DataView} view The source data.
 * @param {number} offset The start of the ANIHEADER payload.
 * @returns {object} Parsed ANIHEADER values.
 */
function parseAniHeader(view, offset) {
  const flags = view.getUint32(offset + 32, true);
  return {
    frameCount: view.getUint32(offset + 4, true),
    stepCount: view.getUint32(offset + 8, true),
    width: view.getUint32(offset + 12, true),
    height: view.getUint32(offset + 16, true),
    bitCount: view.getUint32(offset + 20, true),
    planes: view.getUint32(offset + 24, true),
    defaultJiffyRate: view.getUint32(offset + 28, true),
    flags,
    framesAreIconImages: (flags & AF_ICON) !== 0,
  };
}

/**
 * Parses a chunk sequence, collecting ANI frame, rate, and sequence details.
 * @param {DataView} view The source data.
 * @param {number} start The first chunk offset.
 * @param {number} end The exclusive end offset.
 * @param {object} result The mutable parse result.
 * @param {boolean} [isFrameList=false] Whether chunks are inside a fram LIST.
 */
function walkChunks(view, start, end, result, isFrameList = false) {
  let offset = start;

  while (offset < end) {
    if (end - offset < CHUNK_HEADER_SIZE) {
      result.diagnostics.push(`Truncated chunk header at byte ${offset}.`);
      return;
    }

    const id = readFourCc(view, offset);
    const size = view.getUint32(offset + 4, true);
    const payloadOffset = offset + CHUNK_HEADER_SIZE;
    const payloadEnd = payloadOffset + size;
    if (payloadEnd > end) {
      const remaining = end - payloadOffset;
      result.diagnostics.push(
        `Chunk "${id}" at byte ${offset} declares ${size} bytes, ` +
        `exceeding ${remaining} remaining bytes.`
      );
      return;
    }

    result.chunks.push({ id, size, offset });
    if (isFrameList && id === 'icon') {
      result.frames.push({ index: result.frames.length, size, offset });
    } else if (id === 'anih') {
      if (size < ANIHEADER_SIZE) {
        result.diagnostics.push(
          `The anih chunk is truncated: expected ${ANIHEADER_SIZE} bytes but found ${size}.`
        );
      } else if (result.header) {
        result.diagnostics.push('Multiple anih chunks found; using the first one.');
      } else {
        result.header = parseAniHeader(view, payloadOffset);
      }
    } else if (id === 'rate' || id === 'seq ') {
      if (size % 4 !== 0) {
        result.diagnostics.push(`Chunk "${id}" has a size that is not a multiple of 4.`);
      }
      const values = [];
      for (let valueOffset = payloadOffset; valueOffset + 4 <= payloadEnd; valueOffset += 4) {
        values.push(view.getUint32(valueOffset, true));
      }
      if (id === 'rate') result.rates.push(...values);
      else result.sequence.push(...values);
    } else if (id === 'LIST') {
      if (size < 4) {
        result.diagnostics.push(`LIST chunk at byte ${offset} is missing its list type.`);
      } else if (readFourCc(view, payloadOffset) === 'fram') {
        walkChunks(view, payloadOffset + 4, payloadEnd, result, true);
      }
    }

    offset = payloadEnd;
    if (size % 2 !== 0) {
      if (offset >= end) {
        result.diagnostics.push(`Chunk "${id}" is missing its required padding byte.`);
        return;
      }
      offset += 1;
    }
  }
}

/**
 * Inspects a Windows ANI file's RIFF container and headers without decoding image pixels.
 * @param {ArrayBuffer} buffer ANI file contents.
 * @returns {object} Parsed ANI metadata and non-fatal diagnostics.
 */
export function inspectAniHeader(buffer) {
  const result = {
    diagnostics: [],
    riffSize: null,
    formType: null,
    header: null,
    frames: [],
    rates: [],
    sequence: [],
    chunks: [],
  };

  if (!(buffer instanceof ArrayBuffer)) {
    result.diagnostics.push('Input must be an ArrayBuffer.');
    return result;
  }

  const view = new DataView(buffer);
  if (view.byteLength < RIFF_HEADER_SIZE) {
    result.diagnostics.push('File is truncated before the 12-byte RIFF header.');
    return result;
  }
  if (readFourCc(view, 0) !== 'RIFF') {
    result.diagnostics.push('Missing RIFF marker at the start of the file.');
    return result;
  }

  result.riffSize = view.getUint32(4, true);
  result.formType = readFourCc(view, 8);
  if (result.formType !== 'ACON') {
    result.diagnostics.push(`Expected ACON RIFF form type but found "${result.formType}".`);
    return result;
  }

  const declaredEnd = result.riffSize + 8;
  const containerEnd = Math.min(declaredEnd, view.byteLength);
  if (declaredEnd > view.byteLength) {
    result.diagnostics.push(
      `RIFF declares ${declaredEnd} bytes but the file contains only ${view.byteLength} bytes.`
    );
  }
  walkChunks(view, RIFF_HEADER_SIZE, containerEnd, result);

  if (!result.header) result.diagnostics.push('Missing required anih chunk.');
  return result;
}
