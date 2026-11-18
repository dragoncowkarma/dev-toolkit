const OGG_CAPTURE_PATTERN = [0x4f, 0x67, 0x67, 0x53];
const PAGE_HEADER_BYTES = 27;

function parseError(path, message) {
  return new Error(`${path}: ${message}`);
}

function requireBytes(bytes, offset, length, path) {
  if (offset + length > bytes.length) {
    throw parseError(
      path,
      `requires ${length} byte(s) at offset ${offset}, file ends at ${bytes.length}.`,
    );
  }
}

function hasPrefix(bytes, prefix) {
  return prefix.every((value, index) => bytes[index] === value);
}

/**
 * Detects an Ogg codec from a completed BOS packet.
 *
 * @param {Uint8Array} packet First packet in a logical bitstream.
 * @returns {string} A display-ready codec label.
 */
export function detectCodec(packet) {
  if (hasPrefix(packet, [0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73])) return 'Vorbis';
  if (hasPrefix(packet, [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64])) return 'Opus';
  if (hasPrefix(packet, [0x80, 0x74, 0x68, 0x65, 0x6f, 0x72, 0x61])) return 'Theora';
  if (
    hasPrefix(packet, [0x66, 0x4c, 0x61, 0x43]) ||
    hasPrefix(packet, [0x7f, 0x46, 0x4c, 0x41, 0x43])
  ) {
    return 'FLAC';
  }
  return 'Unknown';
}

function firstPacketFragment(page, state) {
  if (state.complete || page.continued && state.parts.length === 0) return;
  let payloadOffset = page.payloadOffset;
  for (const segment of page.segments) {
    state.parts.push(page.bytes.slice(payloadOffset, payloadOffset + segment));
    payloadOffset += segment;
    if (segment < 255) {
      state.complete = true;
      state.codec = detectCodec(concatBytes(state.parts));
      return;
    }
  }
}

function concatBytes(chunks) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Parses every Ogg page in an ArrayBuffer or Uint8Array.
 *
 * @param {ArrayBuffer|Uint8Array} source Ogg container bytes.
 * @returns {{pages: Array<object>, codecs: Array<{serialNumber: number, codec: string}>}}
 * @throws {Error} When the input is not a complete Ogg page sequence.
 */
export function parseOgg(source) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.length === 0) throw parseError('Ogg file', 'is empty.');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pages = [];
  const bitstreams = new Map();
  let offset = 0;

  while (offset < bytes.length) {
    const pageIndex = pages.length;
    const path = `Ogg page ${pageIndex}`;
    requireBytes(bytes, offset, PAGE_HEADER_BYTES, `${path} header`);
    if (!hasPrefix(bytes.slice(offset, offset + 4), OGG_CAPTURE_PATTERN)) {
      throw parseError(`${path} header`, `expected capture pattern "OggS" at offset ${offset}.`);
    }

    const version = view.getUint8(offset + 4);
    if (version !== 0) {
      throw parseError(`${path} header`, `unsupported stream structure version ${version}.`);
    }
    const headerType = view.getUint8(offset + 5);
    const segmentCount = view.getUint8(offset + 26);
    const segmentTableOffset = offset + PAGE_HEADER_BYTES;
    requireBytes(bytes, segmentTableOffset, segmentCount, `${path} segment table`);

    const segments = Array.from(bytes.slice(segmentTableOffset, segmentTableOffset + segmentCount));
    const payloadSize = segments.reduce((total, segment) => total + segment, 0);
    const payloadOffset = segmentTableOffset + segmentCount;
    requireBytes(bytes, payloadOffset, payloadSize, `${path} payload`);

    const serialNumber = view.getUint32(offset + 14, true);
    const page = {
      index: pageIndex,
      offset,
      capturePattern: 'OggS',
      version,
      headerType,
      continued: Boolean(headerType & 0x01),
      beginningOfStream: Boolean(headerType & 0x02),
      endOfStream: Boolean(headerType & 0x04),
      granulePosition: view.getBigUint64(offset + 6, true).toString(),
      serialNumber,
      sequenceNumber: view.getUint32(offset + 18, true),
      checksum: `0x${view.getUint32(offset + 22, true).toString(16).padStart(8, '0')}`,
      segments,
      payloadSize,
      payloadOffset,
      bytes,
    };
    pages.push(page);

    if (page.beginningOfStream && !bitstreams.has(serialNumber)) {
      bitstreams.set(serialNumber, { parts: [], complete: false, codec: 'Unknown' });
    }
    const bitstream = bitstreams.get(serialNumber);
    if (bitstream) firstPacketFragment(page, bitstream);

    offset = payloadOffset + payloadSize;
  }

  return {
    pages: pages.map(({ bytes: unusedBytes, payloadOffset: unusedPayloadOffset, ...page }) => page),
    codecs: Array.from(bitstreams, ([serialNumber, state]) => ({
      serialNumber,
      codec: state.complete ? state.codec : 'Unknown (incomplete BOS packet)',
    })),
  };
}

/**
 * Decodes a Base64 string into bytes for local Ogg inspection.
 *
 * @param {string} value Base64 text, with optional whitespace.
 * @returns {Uint8Array} Decoded bytes.
 */
export function base64ToBytes(value) {
  const cleaned = value.replace(/\s/g, '');
  if (!cleaned || cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error('Base64 input is invalid.');
  }
  try {
    return Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Base64 input is invalid.');
  }
}
