const IDS = {
  EBML: 0x1a45dfa3,
  EBML_VERSION: 0x4286,
  EBML_READ_VERSION: 0x42f7,
  DOC_TYPE: 0x4282,
  DOC_TYPE_VERSION: 0x4287,
  SEGMENT: 0x18538067,
  INFO: 0x1549a966,
  TIMECODE_SCALE: 0x2ad7b1,
  DURATION: 0x4489,
  MUXING_APP: 0x4d80,
  WRITING_APP: 0x5741,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  TRACK_NUMBER: 0xd7,
  TRACK_TYPE: 0x83,
  CODEC_ID: 0x86,
  VIDEO: 0xe0,
  PIXEL_WIDTH: 0xb0,
  PIXEL_HEIGHT: 0xba,
  AUDIO: 0xe1,
  SAMPLING_FREQUENCY: 0xb5,
  CHANNELS: 0x9f,
};

const TRACK_TYPES = { 1: "Video", 2: "Audio", 3: "Complex", 17: "Subtitle" };

/** Error raised for malformed EBML input with a user-displayable classification. */
export class EbmlParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EbmlParseError";
    this.code = code;
  }
}

function ensureRange(bytes, offset, length) {
  if (offset + length > bytes.length) {
    throw new EbmlParseError(
      "TRUNCATED_ELEMENT",
      "Truncated element: declared data extends past the file.",
    );
  }
}

/** Reads an EBML ID or size variable-length integer. */
export function readVint(bytes, offset, keepMarker = false) {
  if (offset >= bytes.length) {
    throw new EbmlParseError(
      "TRUNCATED_VINT",
      "Truncated vint: expected an EBML variable-length integer.",
    );
  }
  const first = bytes[offset];
  if (first === 0) {
    throw new EbmlParseError(
      "INVALID_VINT",
      "Invalid vint encoding: a variable-length integer cannot start with 0x00.",
    );
  }
  let length = 1;
  let marker = 0x80;
  while ((first & marker) === 0) {
    length += 1;
    marker >>= 1;
  }
  if (length > 8 || offset + length > bytes.length) {
    throw new EbmlParseError(
      "TRUNCATED_VINT",
      "Truncated vint: expected all bytes of an EBML variable-length integer.",
    );
  }
  let value = keepMarker ? first : first & (marker - 1);
  for (let index = 1; index < length; index += 1)
    value = value * 256 + bytes[offset + index];
  const unknown = !keepMarker && value === 2 ** (7 * length) - 1;
  return { length, value, unknown };
}

function readElement(bytes, offset, limit) {
  const id = readVint(bytes, offset, true);
  const size = readVint(bytes, offset + id.length);
  const dataStart = offset + id.length + size.length;
  const dataEnd = size.unknown ? limit : dataStart + size.value;
  if (dataEnd > limit) ensureRange(bytes, dataStart, size.value);
  return { id: id.value, dataStart, dataEnd, nextOffset: dataEnd };
}

function readUnsigned(bytes, start, end) {
  let value = 0;
  for (let index = start; index < end; index += 1)
    value = value * 256 + bytes[index];
  if (!Number.isSafeInteger(value)) {
    throw new EbmlParseError(
      "UNSAFE_INTEGER",
      "EBML integer is too large to inspect safely.",
    );
  }
  return value;
}

function readFloat(bytes, start, end) {
  const length = end - start;
  if (length !== 4 && length !== 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, length);
  return length === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false);
}

function readText(bytes, start, end) {
  return new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.subarray(start, end),
  );
}

function elementsIn(bytes, start, end) {
  const elements = [];
  let offset = start;
  while (offset < end) {
    const element = readElement(bytes, offset, end);
    elements.push(element);
    offset = element.nextOffset;
  }
  return elements;
}

function parseInfo(bytes, element) {
  const info = {};
  for (const child of elementsIn(bytes, element.dataStart, element.dataEnd)) {
    if (child.id === IDS.TIMECODE_SCALE)
      info.timecodeScale = readUnsigned(bytes, child.dataStart, child.dataEnd);
    if (child.id === IDS.DURATION)
      info.duration = readFloat(bytes, child.dataStart, child.dataEnd);
    if (child.id === IDS.MUXING_APP)
      info.muxingApp = readText(bytes, child.dataStart, child.dataEnd);
    if (child.id === IDS.WRITING_APP)
      info.writingApp = readText(bytes, child.dataStart, child.dataEnd);
  }
  return info;
}

function parseTrack(bytes, element) {
  const track = {};
  for (const child of elementsIn(bytes, element.dataStart, element.dataEnd)) {
    if (child.id === IDS.TRACK_NUMBER)
      track.number = readUnsigned(bytes, child.dataStart, child.dataEnd);
    if (child.id === IDS.TRACK_TYPE) {
      const type = readUnsigned(bytes, child.dataStart, child.dataEnd);
      track.type = TRACK_TYPES[type] ?? `Unknown (${type})`;
    }
    if (child.id === IDS.CODEC_ID)
      track.codecId = readText(bytes, child.dataStart, child.dataEnd);
    if (child.id === IDS.VIDEO) {
      for (const video of elementsIn(bytes, child.dataStart, child.dataEnd)) {
        if (video.id === IDS.PIXEL_WIDTH)
          track.width = readUnsigned(bytes, video.dataStart, video.dataEnd);
        if (video.id === IDS.PIXEL_HEIGHT)
          track.height = readUnsigned(bytes, video.dataStart, video.dataEnd);
      }
    }
    if (child.id === IDS.AUDIO) {
      for (const audio of elementsIn(bytes, child.dataStart, child.dataEnd)) {
        if (audio.id === IDS.SAMPLING_FREQUENCY)
          track.sampleRate = readFloat(bytes, audio.dataStart, audio.dataEnd);
        if (audio.id === IDS.CHANNELS)
          track.channels = readUnsigned(bytes, audio.dataStart, audio.dataEnd);
      }
    }
  }
  return track;
}

function parseTracks(bytes, element) {
  return elementsIn(bytes, element.dataStart, element.dataEnd)
    .filter((child) => child.id === IDS.TRACK_ENTRY)
    .map((child) => parseTrack(bytes, child));
}

function parseEbmlHeaderData(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (
    bytes.length < 4 ||
    ![0x1a, 0x45, 0xdf, 0xa3].every((byte, index) => bytes[index] === byte)
  ) {
    throw new EbmlParseError(
      "BAD_MAGIC",
      "Not an EBML file: expected magic bytes 0x1A45DFA3.",
    );
  }
  const header = readElement(bytes, 0, bytes.length);
  const result = {
    status: "decoded",
    ebml: {},
    segment: { info: {}, tracks: [] },
  };
  for (const child of elementsIn(bytes, header.dataStart, header.dataEnd)) {
    if (child.id === IDS.EBML_VERSION)
      result.ebml.version = readUnsigned(bytes, child.dataStart, child.dataEnd);
    if (child.id === IDS.EBML_READ_VERSION)
      result.ebml.readVersion = readUnsigned(bytes, child.dataStart, child.dataEnd);
    if (child.id === IDS.DOC_TYPE)
      result.ebml.docType = readText(bytes, child.dataStart, child.dataEnd);
    if (child.id === IDS.DOC_TYPE_VERSION)
      result.ebml.docTypeVersion = readUnsigned(
        bytes,
        child.dataStart,
        child.dataEnd,
      );
  }
  let offset = header.nextOffset;
  while (offset < bytes.length) {
    const element = readElement(bytes, offset, bytes.length);
    if (element.id === IDS.SEGMENT) {
      for (const child of elementsIn(
        bytes,
        element.dataStart,
        element.dataEnd,
      )) {
        if (child.id === IDS.INFO) result.segment.info = parseInfo(bytes, child);
        if (child.id === IDS.TRACKS) result.segment.tracks = parseTracks(bytes, child);
      }
      break;
    }
    offset = element.nextOffset;
  }
  return result;
}

/**
 * Parses selected Matroska/WebM metadata without throwing for malformed input.
 *
 * @param {ArrayBuffer|Uint8Array} input - Entire file, or its leading bytes.
 * @returns {{status: string, error?: string, ebml?: object, segment?: object}}
 * Parsed metadata or a structured undecoded result.
 */
export function parseEbmlHeader(input) {
  try {
    return parseEbmlHeaderData(input);
  } catch (error) {
    return {
      status: "undecoded",
      error: error.message || "Unable to decode EBML metadata.",
    };
  }
}

/** Decodes a Base64 string into raw bytes. */
export function base64ToBytes(value) {
  try {
    const binary = atob(value.replace(/\s/g, ""));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new EbmlParseError(
      "INVALID_BASE64",
      "Invalid Base64 input. Paste a valid Base64-encoded file.",
    );
  }
}
