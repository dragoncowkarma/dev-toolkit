const HEADER_SIZE = 752;
const OFFSET = 4096;
const MAX_SIZE = 16 * 1024 * 1024;
const MAGIC = [0xc6, 0x85, 0x73, 0xf6, 0x66, 0xce, 0x90, 0xa9,
  0xd9, 0x6a, 0x60, 0xcf, 0x80, 0x3d, 0xf7, 0xef];
const TYPES = ['none', 'crc32c_nonzero', 'crc64_nonzero', 'chacha20_poly1305_80',
  'chacha20_poly1305_128', 'crc32c', 'crc64', 'xxhash'];
const MASK64 = (1n << 64n) - 1n;

function uuid(bytes) {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function checksum(bytes, type) {
  if (type === 5) {
    let crc = 0;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i += 1) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0x82f63b78 : 0);
      }
    }
    return BigInt(crc >>> 0);
  }
  let crc = 0n;
  for (const byte of bytes) {
    crc ^= BigInt(byte) << 56n;
    for (let i = 0; i < 8; i += 1) {
      crc = ((crc << 1n) ^ (crc & (1n << 63n) ? 0x42f0e1eba9ea3693n : 0n)) & MASK64;
    }
  }
  return crc;
}

function header(bytes) {
  if (bytes.length < HEADER_SIZE) throw new Error('Truncated superblock header.');
  if (!MAGIC.every((value, i) => bytes[24 + i] === value)) {
    throw new Error('Not a bcachefs superblock: incorrect magic.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = HEADER_SIZE + view.getUint32(124, true) * 8;
  if (size > MAX_SIZE) throw new Error('Superblock exceeds the 16 MiB inspection limit.');
  return { view, size };
}

/** Parse a superblock beginning at sector 8. */
export function parseSuperblock(buffer) {
  const bytes = new Uint8Array(buffer);
  const { view, size } = header(bytes);
  if (bytes.length < size) throw new Error('Truncated superblock field area.');
  const type = Number((view.getBigUint64(144, true) >> 2n) & 63n);
  const fields = [];
  let members = null;
  for (let pos = HEADER_SIZE; pos < size;) {
    const fieldSize = view.getUint32(pos, true) * 8;
    const fieldType = view.getUint32(pos + 4, true);
    if (fieldSize < 8 || pos + fieldSize > size) {
      throw new Error('Invalid or truncated superblock field.');
    }
    fields.push({ type: fieldType, size: fieldSize });
    if ((fieldType === 1 && members === null) || fieldType === 11) {
      const stride = fieldType === 1 ? 56 : fieldSize >= 16 ? view.getUint16(pos + 8, true) : 0;
      const start = pos + (fieldType === 1 ? 8 : 16);
      const count = view.getUint8(123);
      if (stride < 28 || start + stride * count > pos + fieldSize) {
        throw new Error('Invalid or truncated member field.');
      }
      members = Array.from({ length: count }, (_, i) => {
        const member = start + i * stride;
        return view.getBigUint64(member + 16, true) * BigInt(view.getUint16(member + 26, true));
      });
    }
    pos += fieldSize;
  }
  const verified = type === 5 || type === 6;
  const match = verified && checksum(bytes.subarray(16, size), type) === view.getBigUint64(0, true)
    && view.getBigUint64(8, true) === 0n;
  const labelBytes = bytes.subarray(72, 104);
  const end = labelBytes.indexOf(0);
  return {
    version: view.getUint16(16, true), versionMin: view.getUint16(18, true),
    blockSize: view.getUint16(120, true) * 512,
    offset: view.getBigUint64(104, true), sequence: view.getBigUint64(112, true),
    uuid: uuid(bytes.subarray(40, 56)), userUuid: uuid(bytes.subarray(56, 72)),
    label: new TextDecoder().decode(labelBytes.subarray(0, end < 0 ? 32 : end)),
    devices: view.getUint8(123), members, fields,
    checksumType: TYPES[type] ?? `unknown (${type})`,
    checksumStatus: verified ? (match ? 'Match' : 'Mismatch') : 'Unverified',
  };
}

function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Read only the primary superblock range from a file. */
export async function inspectFile(file) {
  const first = new Uint8Array(await readBlob(file.slice(OFFSET, OFFSET + HEADER_SIZE)));
  const { size } = header(first);
  if (file.size < OFFSET + size) throw new Error('Truncated superblock field area.');
  const buffer = size === HEADER_SIZE ? first.buffer :
    await readBlob(file.slice(OFFSET, OFFSET + size));
  return parseSuperblock(buffer);
}

/** Construct an example superblock for interactive inspection. */
export function sampleSuperblock() {
  const bytes = new Uint8Array(HEADER_SIZE + 64);
  const view = new DataView(bytes.buffer);
  bytes.set(MAGIC, 24);
  bytes.set(new TextEncoder().encode('Example volume'), 72);
  view.setUint16(16, 1024, true);
  view.setUint16(18, 1024, true);
  view.setBigUint64(104, 8n, true);
  view.setUint16(120, 8, true);
  view.setUint8(123, 1);
  view.setUint32(124, 8, true);
  view.setBigUint64(144, 5n << 2n, true);
  view.setUint32(752, 8, true);
  view.setUint32(756, 1, true);
  view.setBigUint64(776, 65536n, true);
  view.setUint16(786, 128, true);
  view.setBigUint64(0, checksum(bytes.subarray(16), 5), true);
  return bytes.buffer;
}
