export const MAX_INPUT_SIZE = 1024 * 1024;
export const MAX_IFD_COUNT = 32;
const MAX_VALUE_COMPONENTS = 4096;

const TYPE_INFO = {
  1: { name: 'BYTE', size: 1 },
  2: { name: 'ASCII', size: 1 },
  3: { name: 'SHORT', size: 2 },
  4: { name: 'LONG', size: 4 },
  5: { name: 'RATIONAL', size: 8 },
  6: { name: 'SBYTE', size: 1 },
  7: { name: 'UNDEFINED', size: 1 },
  8: { name: 'SSHORT', size: 2 },
  9: { name: 'SLONG', size: 4 },
  10: { name: 'SRATIONAL', size: 8 },
  11: { name: 'FLOAT', size: 4 },
  12: { name: 'DOUBLE', size: 8 },
};

const IFD0_TAGS = {
  0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x0131: 'Software',
  0x0132: 'DateTime', 0x8769: 'ExifIFD', 0x8825: 'GPSInfo',
};
const EXIF_TAGS = {
  0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8827: 'ISOSpeedRatings',
  0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized', 0x9209: 'Flash',
  0x920a: 'FocalLength', 0x927c: 'MakerNote', 0xa002: 'PixelXDimension',
  0xa003: 'PixelYDimension',
};
const GPS_TAGS = {
  0x0000: 'GPSVersionID', 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude',
  0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude', 0x0005: 'GPSAltitudeRef',
  0x0006: 'GPSAltitude', 0x001d: 'GPSDateStamp',
};

function errorAt(offset, message) {
  return { error: `${message} at byte offset ${offset}.` };
}

function hex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join('');
}

function normalizedHex(input) {
  return input.trim().replace(/^0x/i, '').replace(/[\s:-]/g, '');
}

/**
 * Decodes a user-provided hexadecimal or base64 payload without throwing.
 *
 * @param {string} input Raw input text.
 * @param {'auto'|'hex'|'base64'} requestedFormat Requested input format.
 * @returns {{bytes: Uint8Array, format: 'hex'|'base64'}|{error: string, format: string}}
 */
export function decodeExifInput(input, requestedFormat = 'auto') {
  if (typeof input !== 'string') return { error: 'Input must be text.', format: requestedFormat };
  const compactHex = normalizedHex(input);
  const isHex = compactHex.length > 0 && /^[0-9a-fA-F]+$/.test(compactHex);
  const format = requestedFormat === 'auto' ? (isHex ? 'hex' : 'base64') : requestedFormat;
  if (!input.trim()) return { error: 'Paste a JPEG or TIFF payload first.', format };

  if (format === 'hex') {
    if (!/^[0-9a-fA-F]*$/.test(compactHex)) {
      return { error: 'Malformed hex: use only hexadecimal digits and separators.', format };
    }
    if (compactHex.length % 2 !== 0) {
      return { error: 'Malformed hex: an even number of digits is required.', format };
    }
    const bytes = new Uint8Array(compactHex.length / 2);
    for (const index of Array.from({ length: bytes.length }, (_, value) => value)) {
      bytes[index] = Number.parseInt(compactHex.slice(index * 2, index * 2 + 2), 16);
    }
    if (bytes.length > MAX_INPUT_SIZE) return { error: 'Payload too large (maximum is 1 MiB).', format };
    return { bytes, format };
  }

  const compact = input.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || /=[^=]/.test(compact)) {
    return { error: 'Malformed base64: invalid alphabet or padding.', format };
  }
  const unpadded = compact.replace(/=+$/, '');
  if (unpadded.length % 4 === 1) return { error: 'Malformed base64: invalid length.', format };
  try {
    const binary = atob(unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (bytes.length > MAX_INPUT_SIZE) return { error: 'Payload too large (maximum is 1 MiB).', format };
    return { bytes, format };
  } catch {
    return { error: 'Malformed base64: unable to decode payload.', format };
  }
}

function findTiff(bytes) {
  if (bytes.length > MAX_INPUT_SIZE) return errorAt(0, 'Payload too large (maximum is 1 MiB)');
  if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d)) {
    return { start: 0, end: bytes.length };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return errorAt(0, 'Expected a TIFF header or JPEG SOI');
  for (const markerState of [{ offset: 2 }]) {
    while (markerState.offset < bytes.length) {
      if (bytes[markerState.offset] !== 0xff) return errorAt(markerState.offset, 'Malformed JPEG marker');
      while (bytes[markerState.offset] === 0xff) markerState.offset += 1;
      if (markerState.offset >= bytes.length) return errorAt(markerState.offset - 1, 'Truncated JPEG marker');
      const marker = bytes[markerState.offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7 || marker === 0x01) continue;
      if (markerState.offset + 2 > bytes.length) {
        return errorAt(markerState.offset, 'Truncated JPEG segment length');
      }
      const length = (bytes[markerState.offset] << 8) | bytes[markerState.offset + 1];
      const payloadStart = markerState.offset + 2;
      const payloadEnd = markerState.offset + length;
      if (length < 2 || payloadEnd > bytes.length) return errorAt(markerState.offset, 'Truncated JPEG segment');
      if (marker === 0xe1 && bytes[payloadStart] === 0x45 && bytes[payloadStart + 1] === 0x78 &&
          bytes[payloadStart + 2] === 0x69 && bytes[payloadStart + 3] === 0x66 &&
          bytes[payloadStart + 4] === 0 && bytes[payloadStart + 5] === 0) {
        if (payloadStart + 6 >= payloadEnd) return errorAt(payloadStart + 6, 'Truncated EXIF TIFF header');
        return { start: payloadStart + 6, end: payloadEnd };
      }
      markerState.offset = payloadEnd;
    }
  }
  return errorAt(2, 'No EXIF data found in JPEG');
}

function createReader(bytes, start, end, littleEndian) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const inRange = (offset, length) => offset >= start && length >= 0 && offset <= end - length;
  const get = (method, offset, size) => inRange(offset, size) ? view[method](offset, littleEndian) : null;
  return {
    bytes,
    inRange,
    u8: (offset) => inRange(offset, 1) ? bytes[offset] : null,
    i8: (offset) => inRange(offset, 1) ? view.getInt8(offset) : null,
    u16: (offset) => get('getUint16', offset, 2), i16: (offset) => get('getInt16', offset, 2),
    u32: (offset) => get('getUint32', offset, 4), i32: (offset) => get('getInt32', offset, 4),
    f32: (offset) => get('getFloat32', offset, 4), f64: (offset) => get('getFloat64', offset, 8),
    start,
  };
}

function readValues(reader, type, count, dataOffset) {
  const byteLength = count * type.size;
  if (!Number.isSafeInteger(byteLength) || !reader.inRange(dataOffset, byteLength)) {
    return errorAt(dataOffset, 'EXIF value extends past the buffer');
  }
  if (count > MAX_VALUE_COMPONENTS) return errorAt(dataOffset, 'EXIF value component limit exceeded');
  const values = [];
  for (const index of Array.from({ length: count }, (_, value) => value)) {
    const offset = dataOffset + index * type.size;
    if (type.name === 'BYTE' || type.name === 'UNDEFINED') values.push(reader.u8(offset));
    if (type.name === 'SBYTE') values.push(reader.i8(offset));
    if (type.name === 'SHORT') values.push(reader.u16(offset));
    if (type.name === 'SSHORT') values.push(reader.i16(offset));
    if (type.name === 'LONG') values.push(reader.u32(offset));
    if (type.name === 'SLONG') values.push(reader.i32(offset));
    if (type.name === 'FLOAT') values.push(reader.f32(offset));
    if (type.name === 'DOUBLE') values.push(reader.f64(offset));
    if (type.name === 'RATIONAL' || type.name === 'SRATIONAL') {
      const numerator = type.name === 'RATIONAL' ? reader.u32(offset) : reader.i32(offset);
      const denominator = type.name === 'RATIONAL' ? reader.u32(offset + 4) : reader.i32(offset + 4);
      if (denominator === 0) return errorAt(offset + 4, 'EXIF rational has a zero denominator');
      values.push({ numerator, denominator, fraction: `${numerator}/${denominator}` });
    }
  }
  if (type.name === 'ASCII') {
    return { value: new TextDecoder('latin1').decode(reader.bytes.slice(dataOffset, dataOffset + count)).replace(/\0+$/, '') };
  }
  if (type.name === 'UNDEFINED') return { value: hex(reader.bytes.slice(dataOffset, dataOffset + count)) };
  const display = values.map((value) => typeof value === 'object' ? value.fraction : String(value)).join(', ');
  return { value: display, components: values };
}

function tagName(group, tag) {
  const tags = group === 'Exif SubIFD' ? EXIF_TAGS : group === 'GPS IFD' ? GPS_TAGS : IFD0_TAGS;
  return tags[tag] || `Tag 0x${tag.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Parses a bare TIFF payload or a JPEG containing an EXIF APP1 segment.
 * It never throws: malformed input is returned as an error with a byte offset.
 *
 * @param {Uint8Array} bytes TIFF or JPEG bytes.
 * @returns {{groups: Array<{name: string, fields: Array<object>}>, gpsCoordinates?: object}|{error: string}}
 */
export function parseExif(bytes) {
  try {
    if (!(bytes instanceof Uint8Array)) return errorAt(0, 'Expected a byte array');
    const located = findTiff(bytes);
    if (located.error) return located;
    const { start, end } = located;
    if (start + 8 > end) return errorAt(start, 'Truncated TIFF header');
    const order = String.fromCharCode(bytes[start], bytes[start + 1]);
    if (order !== 'II' && order !== 'MM') return errorAt(start, 'Unrecognized TIFF byte-order mark');
    const reader = createReader(bytes, start, end, order === 'II');
    if (reader.u16(start + 2) !== 42) return errorAt(start + 2, 'Invalid TIFF magic number');
    const firstOffset = reader.u32(start + 4);
    if (firstOffset === null) return errorAt(start + 4, 'Truncated TIFF IFD offset');
    const groups = [];
    const visited = new Set();
    const state = { count: 0, gps: {} };

    const parseIfd = (relativeOffset, group) => {
      if (state.count >= MAX_IFD_COUNT) return errorAt(start + relativeOffset, `IFD limit of ${MAX_IFD_COUNT} exceeded`);
      if (visited.has(relativeOffset)) return errorAt(start + relativeOffset, 'EXIF IFD cycle detected');
      const ifdOffset = start + relativeOffset;
      if (!reader.inRange(ifdOffset, 2)) return errorAt(ifdOffset, 'Truncated EXIF IFD entry count');
      visited.add(relativeOffset);
      state.count += 1;
      const entryCount = reader.u16(ifdOffset);
      const tableLength = 2 + entryCount * 12 + 4;
      if (!reader.inRange(ifdOffset, tableLength)) return errorAt(ifdOffset, 'Truncated EXIF IFD entries');
      const fields = [];
      const children = [];
      for (const index of Array.from({ length: entryCount }, (_, value) => value)) {
        const entryOffset = ifdOffset + 2 + index * 12;
        const tag = reader.u16(entryOffset);
        const typeCode = reader.u16(entryOffset + 2);
        const count = reader.u32(entryOffset + 4);
        const type = TYPE_INFO[typeCode];
        if (!type) return errorAt(entryOffset + 2, `Unsupported EXIF type ${typeCode}`);
        const byteLength = count * type.size;
        const valueOffset = byteLength <= 4 ? entryOffset + 8 : start + reader.u32(entryOffset + 8);
        const value = readValues(reader, type, count, valueOffset);
        if (value.error) return value;
        const name = tagName(group, tag);
        const raw = reader.bytes.slice(valueOffset, valueOffset + byteLength);
        const field = { name, tag, type: type.name, offset: entryOffset, value: tag === 0x927c ? hex(raw) : value.value };
        fields.push(field);
        if (group === 'GPS IFD') state.gps[tag] = { ...value, type: type.name };
        if (tag === 0x8769 && group === 'IFD0') children.push({
          offset: Number(value.components?.[0]), group: 'Exif SubIFD',
        });
        if (tag === 0x8825 && group === 'IFD0') children.push({
          offset: Number(value.components?.[0]), group: 'GPS IFD',
        });
      }
      groups.push({ name: group, fields });
      for (const child of children) {
        const nested = parseIfd(child.offset, child.group);
        if (nested?.error) return nested;
      }
      const nextOffset = reader.u32(ifdOffset + 2 + entryCount * 12);
      if (nextOffset) {
        const nested = parseIfd(nextOffset, group === 'IFD0' ? 'IFD1' : `${group} next IFD`);
        if (nested?.error) return nested;
      }
      return null;
    };

    const parsed = parseIfd(firstOffset, 'IFD0');
    if (parsed?.error) return parsed;
    const latitude = state.gps[0x0002];
    const longitude = state.gps[0x0004];
    if (latitude?.components?.length === 3 && longitude?.components?.length === 3) {
      const decimal = (coordinate, reference) => {
        const [degrees, minutes, seconds] = coordinate.components;
        const value = degrees.numerator / degrees.denominator +
          minutes.numerator / minutes.denominator / 60 +
          seconds.numerator / seconds.denominator / 3600;
        return reference?.value === 'S' || reference?.value === 'W' ? -value : value;
      };
      const lat = decimal(latitude, state.gps[0x0001]);
      const lon = decimal(longitude, state.gps[0x0003]);
      return { groups, gpsCoordinates: { latitude: lat, longitude: lon, text: `${lat}, ${lon}` } };
    }
    return { groups };
  } catch {
    return errorAt(0, 'Unable to parse EXIF data');
  }
}

/**
 * Converts parsed EXIF groups to copyable, readable plain text.
 *
 * @param {{groups: Array<{name: string, fields: Array<object>}>, gpsCoordinates?: object}} result Parsed EXIF result.
 * @returns {string} A formatted text representation.
 */
export function formatExifResult(result) {
  const groups = result.groups.map((group) => [group.name, ...group.fields.map((field) =>
    `${field.name} (${field.type}, offset ${field.offset}): ${field.value}`)].join('\n')).join('\n\n');
  return result.gpsCoordinates ? `${groups}\n\nGPS coordinates: ${result.gpsCoordinates.text}` : groups;
}
