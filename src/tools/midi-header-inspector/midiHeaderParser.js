const HEADER_MAGIC = 'MThd';
const TRACK_MAGIC = 'MTrk';
const HEADER_LENGTH = 6;

/**
 * Parses a Standard MIDI File header and its track chunk structure.
 *
 * @param {ArrayBuffer|Uint8Array} input - The MIDI file bytes.
 * @returns {{header: object, tracks: Array<object>}} Parsed MIDI chunk information.
 * @throws {Error} When the file does not contain a complete Standard MIDI File structure.
 */
export function parseMidiHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  requireBytes(bytes, 0, 14, 'The MThd header is truncated.');
  requireMagic(bytes, 0, HEADER_MAGIC, 'Expected an MThd header chunk.');

  const headerLength = view.getUint32(4, false);
  if (headerLength !== HEADER_LENGTH) {
    throw new Error('The MThd header length must be 6 bytes.');
  }

  const formatType = view.getUint16(8, false);
  if (![0, 1, 2].includes(formatType)) {
    throw new Error(`Unsupported MIDI format type: ${formatType}.`);
  }

  const trackCount = view.getUint16(10, false);
  const divisionValue = view.getUint16(12, false);
  const division = parseDivision(divisionValue);
  const tracks = [];
  let offset = 14;

  for (let index = 0; index < trackCount; index += 1) {
    requireBytes(bytes, offset, 8, `Track ${index + 1} header is truncated.`);
    requireMagic(bytes, offset, TRACK_MAGIC, `Expected MTrk for track ${index + 1}.`);
    const length = view.getUint32(offset + 4, false);
    const dataOffset = offset + 8;
    requireBytes(bytes, dataOffset, length, `Track ${index + 1} data is truncated.`);
    tracks.push({ index: index + 1, offset, length, dataOffset });
    offset = dataOffset + length;
  }

  if (offset !== bytes.byteLength) {
    throw new Error('Unexpected data follows the declared MTrk chunks.');
  }

  return {
    header: { offset: 0, length: headerLength, formatType, trackCount, division },
    tracks,
  };
}

function requireBytes(bytes, offset, length, message) {
  if (offset + length > bytes.byteLength) {
    throw new Error(message);
  }
}

function requireMagic(bytes, offset, magic, message) {
  const actual = String.fromCharCode(...bytes.slice(offset, offset + magic.length));
  if (actual !== magic) {
    throw new Error(message);
  }
}

function parseDivision(value) {
  if ((value & 0x8000) === 0) {
    return { type: 'ticks-per-quarter-note', ticksPerQuarterNote: value };
  }

  const framesByte = (value >> 8) - 256;
  return {
    type: 'smpte',
    framesPerSecond: -framesByte,
    ticksPerFrame: value & 0xff,
  };
}
