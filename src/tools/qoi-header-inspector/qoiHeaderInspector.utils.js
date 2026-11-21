const HEADER_LENGTH = 14;
const END_MARKER_LENGTH = 8;
const MINIMUM_FILE_LENGTH = HEADER_LENGTH + END_MARKER_LENGTH;
const QOI_MAGIC = [0x71, 0x6f, 0x69, 0x66];
const QOI_END_MARKER = [0, 0, 0, 0, 0, 0, 0, 1];

function hasBytesAt(bytes, expected, offset) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function describeChannels(channels) {
  if (channels === 3) return 'RGB';
  if (channels === 4) return 'RGBA';
  return `Unknown (${channels})`;
}

function describeColorspace(colorspace) {
  if (colorspace === 0) return 'sRGB with linear alpha';
  if (colorspace === 1) return 'All channels linear';
  return `Unknown (${colorspace})`;
}

/**
 * Parses a QOI header and verifies its end marker without decoding pixel chunks.
 *
 * @param {ArrayBuffer|Uint8Array} input - Bytes from a potential QOI file.
 * @returns {{error: string, header: object|null, warnings: string[]}} Parsed metadata or an error.
 */
export function parseQoiHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytes.byteLength < MINIMUM_FILE_LENGTH) {
    return {
      error: `QOI files must contain at least ${MINIMUM_FILE_LENGTH} bytes for a header and `
        + 'end marker.',
      header: null,
      warnings: [],
    };
  }

  if (!hasBytesAt(bytes, QOI_MAGIC, 0)) {
    return {
      error: 'This file does not begin with the QOI magic bytes "qoif".',
      header: null,
      warnings: [],
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = bytes[12];
  const colorspace = bytes[13];
  const endMarkerPresent = hasBytesAt(bytes, QOI_END_MARKER, bytes.byteLength - END_MARKER_LENGTH);
  const warnings = [];

  if (channels !== 3 && channels !== 4) {
    warnings.push(`Unknown channel value: ${channels}. Expected 3 (RGB) or 4 (RGBA).`);
  }
  if (colorspace !== 0 && colorspace !== 1) {
    warnings.push(`Unknown colorspace value: ${colorspace}. Expected 0 or 1.`);
  }
  if (!endMarkerPresent) {
    warnings.push('The required QOI end marker is missing or invalid.');
  }

  return {
    error: '',
    header: {
      magic: 'qoif',
      width: view.getUint32(4, false),
      height: view.getUint32(8, false),
      channels,
      channelsDescription: describeChannels(channels),
      colorspace,
      colorspaceDescription: describeColorspace(colorspace),
      endMarkerPresent,
    },
    warnings,
  };
}
