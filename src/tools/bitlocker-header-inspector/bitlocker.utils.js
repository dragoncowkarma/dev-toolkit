const FVE = '-FVE-FS-';
const TO_GO_GUID = [
  0x3b, 0xd6, 0x67, 0x49, 0x29, 0x2e, 0xd8, 0x4a,
  0x83, 0x99, 0xf6, 0xa3, 0x39, 0xe3, 0xd0, 0x01,
];

/**
 * Converts whitespace-separated or contiguous hexadecimal bytes to a buffer.
 * @param {string} input Hexadecimal input.
 * @returns {Uint8Array} Decoded bytes.
 */
export function parseHex(input) {
  const hex = input.replace(/\s/g, '');
  if (!hex) throw new Error('Enter hexadecimal data.');
  if (hex.length % 2 || !/^[\da-f]+$/i.test(hex)) {
    throw new Error('Enter complete hexadecimal byte pairs.');
  }
  return Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/**
 * Parses a BitLocker volume boot sector and any supplied metadata block headers.
 * @param {Uint8Array} bytes Bytes starting at the beginning of the volume.
 * @returns {object} Decoded boot sector and metadata details.
 */
export function inspectBitlocker(bytes) {
  if (bytes.length < 512) throw new Error('Truncated input: at least 512 bytes are required.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const oem = ascii(bytes, 3, 8);
  const toGo = oem === 'MSWIN4.1';
  if (oem !== FVE && !toGo) throw new Error('Not a BitLocker volume: unknown OEM ID.');
  if (toGo && !TO_GO_GUID.every((byte, index) => bytes[424 + index] === byte)) {
    throw new Error('Not a BitLocker To Go volume: BitLocker identifier is missing.');
  }
  const offsets = [0, 1, 2].map((index) =>
    view.getBigUint64((toGo ? 440 : 176) + index * 8, true));
  const blocks = offsets.map (offset => {
    if (offset === 0n) return { status: 'Not specified' };
    if (offset >= BigInt(bytes.length)) return { status: 'Not included in input' };
    if (offset + 12n > BigInt(bytes.length)) return { status: 'Truncated metadata header' };
    const start = Number(offset);
    const signature = ascii(bytes, start, 8);
    if (signature !== FVE) return { status: 'Invalid metadata signature', signature };
    return {
      status: 'Available',
      signature,
      size: view.getUint16(start + 8, true),
      version: view.getUint16(start + 10, true),
    };
  });
  const total16 = view.getUint16(19, true);
  const total32 = view.getUint32(32, true);
  return {
    oem,
    variant: toGo ? 'BitLocker To Go' : 'BitLocker',
    bytesPerSector: view.getUint16(11, true),
    sectorsPerCluster: view.getUint8(13),
    totalSectors: String(total16 || total32),
    offsets: offsets.map(String),
    blocks,
  };
}
