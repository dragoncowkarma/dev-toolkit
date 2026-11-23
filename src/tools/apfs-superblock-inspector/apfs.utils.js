const LIMIT = 4096;
const MODULUS = 0xffffffffn;
const FEATURES = [[1n, 'NX_FEATURE_DEFRAG'], [2n, 'NX_FEATURE_LCFD']];
const INCOMPATIBLE = [
  [1n, 'NX_INCOMPAT_VERSION1'],
  [2n, 'NX_INCOMPAT_VERSION2'],
  [256n, 'NX_INCOMPAT_FUSION'],
];

function decodeFlags(value, known) {
  const labels = known.filter(([bit]) => (value & bit) !== 0n).map(([, label]) => label);
  const mask = known.reduce((result, [bit]) => result | bit, 0n);
  const unknown = value & ~mask;
  if (unknown) labels.push(`Unknown: 0x${unknown.toString(16)}`);
  return labels.length ? labels.join(', ') : 'None';
}

/** Parse a whitespace-separated or continuous hexadecimal byte string. */
export function parseHex(input) {
  if (!/^[\da-f\s]*$/i.test(input)) throw new Error('Hex input contains invalid characters.');
  const hex = input.replace(/\s/g, '');
  if (hex.length % 2) throw new Error('Hex input must contain complete byte pairs.');
  const length = Math.min(hex.length / 2, LIMIT);
  return Uint8Array.from({ length }, (_, index) =>
    parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

/** Calculate the APFS object checksum for a complete block. */
export function fletcher64(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum1 = 0n;
  let sum2 = 0n;
  for (let offset = 8; offset < bytes.length; offset += 4) {
    sum1 = (sum1 + BigInt(view.getUint32(offset, true))) % MODULUS;
    sum2 = (sum2 + sum1) % MODULUS;
  }
  const low = MODULUS - ((sum1 + sum2) % MODULUS);
  const high = MODULUS - ((sum1 + low) % MODULUS);
  return (high << 32n) | low;
}

/** Parse the first 4096 bytes of an APFS container superblock. */
export function parseSuperblock(bytes) {
  if (bytes.length < LIMIT) throw new Error('Truncated input: at least 4096 bytes are required.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, LIMIT);
  if (String.fromCharCode(...bytes.subarray(32, 36)) !== 'NXSB') {
    throw new Error('Invalid magic: expected NXSB at offset 32.');
  }
  const size = view.getUint32(36, true);
  if (size < 4096 || size > 65536 || (size & (size - 1)) !== 0) {
    throw new Error('Invalid block size: expected a power of two from 4096 to 65536.');
  }
  const u64 = (offset) => view.getBigUint64(offset, true);
  const u32 = (offset) => view.getUint32(offset, true);
  const uuid = Array.from(bytes.subarray(72, 88), (byte) =>
    byte.toString(16).padStart(2, '0')).join('');
  const checksum = u64(0);
  const computed = size === LIMIT ? fletcher64(bytes.subarray(0, LIMIT)) : null;
  const features = u64(48);
  const compatible = u64(56);
  const incompatible = u64(64);
  return {
    checksum, computed, checksumMatches: computed === null ? null : checksum === computed,
    oid: u64(8), xid: u64(16), type: u32(24), subtype: u32(28),
    magic: 'NXSB', blockSize: size, blockCount: u64(40),
    features, featureLabels: decodeFlags(features, FEATURES),
    compatible, compatibleLabels: decodeFlags(compatible, []),
    incompatible, incompatibleLabels: decodeFlags(incompatible, INCOMPATIBLE),
    uuid: `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-` +
      `${uuid.slice(16, 20)}-${uuid.slice(20)}`,
    nextOid: u64(88), nextXid: u64(96),
    descriptorBlocks: u32(104), dataBlocks: u32(108),
    descriptorBase: u64(112), dataBase: u64(120),
    descriptorNext: u32(128), dataNext: u32(132),
    descriptorIndex: u32(136), descriptorLength: u32(140),
    dataIndex: u32(144), dataLength: u32(148),
  };
}
