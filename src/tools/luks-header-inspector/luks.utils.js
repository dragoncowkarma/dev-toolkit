const MAGIC = [0x4c, 0x55, 0x4b, 0x53, 0xba, 0xbe];

/** Decode a fixed-width, NUL-terminated header string. */
function readString(bytes, offset, length) {
  const field = bytes.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return new TextDecoder().decode(end === -1 ? field : field.subarray(0, end));
}

/** Encode a fixed-width salt or checksum as hexadecimal. */
function readHex(bytes, offset, length) {
  return Array.from(bytes.subarray(offset, offset + length), (byte) =>
    byte.toString(16).padStart(2, '0')).join('');
}

/** Parse the fixed fields and eight key slot descriptors in a LUKS1 header. */
function parseLuks1(bytes, view) {
  return {
    version: 1,
    fields: {
      'Cipher name': readString(bytes, 8, 32),
      'Cipher mode': readString(bytes, 40, 32),
      'Hash spec': readString(bytes, 72, 32),
      'Payload offset (sectors)': view.getUint32(104),
      'Key bytes': view.getUint32(108),
      UUID: readString(bytes, 168, 40),
    },
    slots: Array.from({ length: 8 }, (_, index) => {
      const offset = 208 + index * 48;
      return {
        active: view.getUint32(offset),
        iterations: view.getUint32(offset + 4),
        stripes: view.getUint32(offset + 44),
      };
    }),
  };
}

/** Parse the fixed binary fields of a LUKS2 header without verifying its checksum. */
function parseLuks2(bytes, view) {
  return {
    version: 2,
    fields: {
      'Header size (bytes)': view.getBigUint64(8).toString(),
      'Sequence ID': view.getBigUint64(16).toString(),
      Label: readString(bytes, 24, 48),
      'Checksum algorithm': readString(bytes, 72, 32),
      Salt: readHex(bytes, 104, 64),
      UUID: readString(bytes, 168, 40),
      Subsystem: readString(bytes, 208, 48),
      'Header offset (bytes)': view.getBigUint64(256).toString(),
      'Checksum (not verified)': readHex(bytes, 448, 64),
    },
  };
}

/**
 * Parse a LUKS1 or LUKS2 primary header from a bounded file prefix.
 * @param {ArrayBuffer} buffer Header bytes.
 * @returns {object} Displayable metadata, excluding key material.
 * @throws {Error} If the header is truncated, invalid, or unsupported.
 */
export function parseLuksHeader(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8) throw new Error('Truncated LUKS header.');
  if (!MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw new Error('Invalid LUKS magic.');
  }
  const view = new DataView(buffer);
  const version = view.getUint16(6);
  if (version !== 1 && version !== 2) throw new Error(`Unsupported LUKS version: ${version}.`);
  if (bytes.length < (version === 1 ? 592 : 4096)) {
    throw new Error(`Truncated LUKS${version} header.`);
  }
  return version === 1 ? parseLuks1(bytes, view) : parseLuks2(bytes, view);
}
