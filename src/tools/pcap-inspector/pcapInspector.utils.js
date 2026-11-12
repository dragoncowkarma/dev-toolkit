export const MAX_INPUT_BYTES = 256 * 1024;

const MAGIC_FORMATS = new Map([
  [0xa1b2c3d4, { littleEndian: false, timestampResolution: 'microseconds' }],
  [0xd4c3b2a1, { littleEndian: true, timestampResolution: 'microseconds' }],
  [0xa1b23c4d, { littleEndian: false, timestampResolution: 'nanoseconds' }],
  [0x4d3cb2a1, { littleEndian: true, timestampResolution: 'nanoseconds' }],
]);

const LINKTYPE_NAMES = new Map([
  [0, 'NULL (BSD loopback)'],
  [1, 'Ethernet'],
  [101, 'Raw IP'],
  [113, 'Linux SLL'],
  [127, 'IEEE 802.11 radiotap'],
  [228, 'IPv4'],
  [229, 'IPv6'],
  [276, 'Linux SLL2'],
]);

function requireBytes(view, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
      offset < 0 || length < 0 || offset > view.byteLength - length) {
    throw new Error(`Truncated PCAP: ${label} extends beyond the end of the file.`);
  }
}

/**
 * Returns a readable name for a libpcap LINKTYPE value.
 * @param {number} linkType
 * @returns {string}
 */
export function getLinkTypeName(linkType) {
  return LINKTYPE_NAMES.get(linkType) ?? `Unknown LINKTYPE_${linkType}`;
}

/**
 * Parses the global header and packet record metadata from a classic libpcap buffer.
 * @param {ArrayBuffer} buffer
 * @returns {{header: object, packets: Array<object>}}
 */
export function parsePcap(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('PCAP input must be an ArrayBuffer.');
  }
  if (buffer.byteLength > MAX_INPUT_BYTES) {
    throw new Error(
      `File is too large. PCAP files must be ${MAX_INPUT_BYTES / 1024} KB or smaller.`,
    );
  }

  const view = new DataView(buffer);
  requireBytes(view, 0, 4, 'magic number');
  const firstWord = view.getUint32(0, false);
  if (firstWord === 0x0a0d0d0a) {
    throw new Error('Unsupported format: PCAPNG files are not supported. Please use classic PCAP.');
  }

  const format = MAGIC_FORMATS.get(firstWord);
  if (!format) {
    throw new Error('Unsupported format: this is not a classic PCAP file.');
  }

  requireBytes(view, 0, 24, 'global header');
  const { littleEndian, timestampResolution } = format;
  const versionMajor = view.getUint16(4, littleEndian);
  const versionMinor = view.getUint16(6, littleEndian);
  const timezoneOffset = view.getInt32(8, littleEndian);
  const timestampAccuracy = view.getUint32(12, littleEndian);
  const snaplen = view.getUint32(16, littleEndian);
  const linkType = view.getUint32(20, littleEndian);
  const packets = [];
  let offset = 24;

  while (offset < view.byteLength) {
    requireBytes(view, offset, 16, `packet header at offset ${offset}`);
    const timestampSeconds = view.getUint32(offset, littleEndian);
    const timestampFraction = view.getUint32(offset + 4, littleEndian);
    const capturedLength = view.getUint32(offset + 8, littleEndian);
    const originalLength = view.getUint32(offset + 12, littleEndian);
    const payloadOffset = offset + 16;
    requireBytes(view, payloadOffset, capturedLength, `packet payload at offset ${payloadOffset}`);
    packets.push({
      index: packets.length + 1,
      timestampSeconds,
      timestampFraction,
      capturedLength,
      originalLength,
    });
    offset = payloadOffset + capturedLength;
  }

  return {
    header: {
      magic: `0x${firstWord.toString(16).padStart(8, '0')}`,
      versionMajor,
      versionMinor,
      timezoneOffset,
      timestampAccuracy,
      snaplen,
      linkType,
      linkTypeName: getLinkTypeName(linkType),
      byteOrder: littleEndian ? 'Little-endian' : 'Big-endian',
      timestampResolution,
    },
    packets,
  };
}

/**
 * Reads and parses a selected PCAP file entirely in the browser.
 * @param {File|Blob} file
 * @returns {Promise<{header: object, packets: Array<object>}>}
 */
export async function parsePcapFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new TypeError('Select a PCAP file to inspect.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(
      `File is too large. PCAP files must be ${MAX_INPUT_BYTES / 1024} KB or smaller.`,
    );
  }
  return parsePcap(await file.arrayBuffer());
}

/**
 * Formats a packet timestamp without converting it through the local timezone.
 * @param {{timestampSeconds: number, timestampFraction: number}} packet
 * @param {'microseconds'|'nanoseconds'} resolution
 * @returns {string}
 */
export function formatPacketTimestamp(packet, resolution) {
  const digits = resolution === 'nanoseconds' ? 9 : 6;
  return `${packet.timestampSeconds}.${String(packet.timestampFraction).padStart(digits, '0')}`;
}
