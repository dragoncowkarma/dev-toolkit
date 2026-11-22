const FOOTER_SIZE = 512;
const COOKIE = 'conectix';
const VHD_EPOCH_SECONDS = Date.UTC(2000, 0, 1) / 1000;

const DISK_TYPES = Object.freeze({
  0: 'None',
  2: 'Fixed',
  3: 'Dynamic',
  4: 'Differencing',
});

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError('VHD input must be an ArrayBuffer or Uint8Array.');
}

function readAscii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length)).replace(/\0+$/, '');
}

function readUint64(view, offset) {
  return view.getBigUint64(offset, false);
}

function formatUuid(bytes) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Computes the VHD footer checksum: the one's complement of the byte sum while
 * treating checksum bytes (64 through 67) as zero.
 *
 * @param {Uint8Array|ArrayBuffer} footer A complete 512-byte VHD footer.
 * @returns {number} The unsigned 32-bit VHD checksum.
 */
export function computeVhdFooterChecksum(footer) {
  const bytes = asBytes(footer);
  if (bytes.length !== FOOTER_SIZE) {
    throw new Error('A VHD footer must be exactly 512 bytes.');
  }

  let sum = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (index < 64 || index > 67) {
      sum = (sum + bytes[index]) >>> 0;
    }
  }
  return (~sum) >>> 0;
}

/**
 * Converts a hexadecimal byte string into a byte array.
 *
 * @param {string} value Hexadecimal bytes, with optional whitespace and 0x prefixes.
 * @returns {Uint8Array} Decoded bytes.
 */
export function hexToBytes(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Hex input must be a string.');
  }
  const normalized = value.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  if (!normalized || normalized.length % 2 !== 0) {
    throw new Error('Enter complete hexadecimal byte pairs.');
  }
  return Uint8Array.from(normalized.match(/.{2}/g), (pair) => Number.parseInt(pair, 16));
}

/**
 * Formats raw bytes in readable 16-byte hexadecimal rows.
 *
 * @param {Uint8Array|ArrayBuffer} input Bytes to format.
 * @returns {string} Hex dump with offsets.
 */
export function formatHexDump(input) {
  const bytes = asBytes(input);
  const rows = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const hex = Array.from(bytes.subarray(offset, offset + 16), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join(' ');
    rows.push(`${offset.toString(16).padStart(4, '0')}: ${hex}`);
  }
  return rows.join('\n');
}

/**
 * Parses the final 512 bytes of a classic VHD file, or an individual VHD footer.
 *
 * @param {Uint8Array|ArrayBuffer} input Full VHD bytes or a 512-byte footer.
 * @returns {{ok: true, footer: object, rawFooter: Uint8Array}|{ok: false, error: string}}
 *   A result object instead of an exception for malformed VHD data.
 */
export function parseVhdFooter(input) {
  let bytes;
  try {
    bytes = asBytes(input);
  } catch (error) {
    return { ok: false, error: error.message };
  }

  if (bytes.length < FOOTER_SIZE) {
    return { ok: false, error: 'VHD input is truncated: a footer requires at least 512 bytes.' };
  }

  const footerOffset = bytes.length - FOOTER_SIZE;
  const rawFooter = bytes.slice(footerOffset);
  const cookie = readAscii(rawFooter, 0, 8);
  if (cookie !== COOKIE) {
    return {
      ok: false,
      error: `Invalid VHD footer: expected the "${COOKIE}" cookie at byte ${footerOffset}.`,
    };
  }

  const view = new DataView(rawFooter.buffer, rawFooter.byteOffset, rawFooter.byteLength);
  const timestampSeconds = view.getUint32(24, false);
  const checksum = view.getUint32(64, false);
  const computedChecksum = computeVhdFooterChecksum(rawFooter);
  const diskTypeCode = view.getUint32(60, false);

  return {
    ok: true,
    rawFooter,
    footer: {
      offset: footerOffset,
      cookie,
      features: view.getUint32(8, false),
      fileFormatVersion: view.getUint32(12, false),
      dataOffset: readUint64(view, 16),
      timestampSeconds,
      timestampIso: new Date((VHD_EPOCH_SECONDS + timestampSeconds) * 1000).toISOString(),
      creatorApplication: readAscii(rawFooter, 28, 4),
      creatorVersion: view.getUint32(32, false),
      creatorHostOs: readAscii(rawFooter, 36, 4),
      originalSize: readUint64(view, 40),
      currentSize: readUint64(view, 48),
      geometry: {
        cylinders: view.getUint16(56, false),
        heads: rawFooter[58],
        sectorsPerTrack: rawFooter[59],
      },
      diskTypeCode,
      diskType: DISK_TYPES[diskTypeCode] ?? `Unknown (${diskTypeCode})`,
      checksum,
      computedChecksum,
      checksumValid: checksum === computedChecksum,
      uniqueId: formatUuid(rawFooter.subarray(68, 84)),
      savedState: rawFooter[84],
    },
  };
}
