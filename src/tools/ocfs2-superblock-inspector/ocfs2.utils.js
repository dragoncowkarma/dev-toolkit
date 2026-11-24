// Offsets follow Linux fs/ocfs2/ocfs2_fs.h; id2 starts at byte 0xc0.
const SIZES = [512, 1024, 2048, 4096];
const READ_LENGTH = 0x160;
const SIGNATURE = [79, 67, 70, 83, 86, 50];
const FEATURES = {
  compat: { 1: 'BACKUP_SB', 2: 'JBD2_SB' },
  incompat: {
    2: 'HEARTBEAT_DEV', 4: 'RESIZE_INPROG', 8: 'LOCAL_MOUNT', 16: 'SPARSE_ALLOC',
    32: 'TUNEFS_INPROG', 64: 'INLINE_DATA', 128: 'USERSPACE_STACK',
    256: 'EXTENDED_SLOT_MAP', 512: 'XATTR', 1024: 'INDEXED_DIRS', 2048: 'META_ECC',
    4096: 'REFCOUNT_TREE', 8192: 'DISCONTIG_BG', 16384: 'CLUSTERINFO',
    32768: 'APPEND_DIO',
  },
  roCompat: { 1: 'UNWRITTEN', 2: 'USRQUOTA', 4: 'GRPQUOTA' },
};

function readNumber(view, offset, size) {
  if (offset + size > view.byteLength) return null;
  if (size === 2) return view.getUint16(offset, true);
  if (size === 4) return view.getUint32(offset, true);
  return view.getBigUint64(offset, true);
}

function featureFlags(value, names) {
  if (value === null) return null;
  const known = Object.entries(names)
    .filter(([bit]) => (value & Number(bit)) !== 0)
    .map(([, name]) => name);
  const mask = Object.keys(names).reduce((result, bit) => result | Number(bit), 0);
  const unknown = (value & ~mask) >>> 0;
  return { value, known, unknown };
}

function decodeBlock(bytes, blockSize) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const get = (offset, size) => readNumber(view, 0xc0 + offset, size);
  const string = (offset, length) => {
    const start = 0xc0 + offset;
    if (start + length > bytes.length) return null;
    return bytes.subarray(start, start + length);
  };
  const labelBytes = string(0x50, 64);
  const uuidBytes = string(0x90, 16);
  const uuidHex = uuidBytes && Array.from(uuidBytes, (byte) => byte.toString(16).padStart(2, '0'));
  const uuid = uuidHex && [uuidHex.slice(0, 4), uuidHex.slice(4, 6), uuidHex.slice(6, 8),
    uuidHex.slice(8, 10), uuidHex.slice(10, 16)].map((part) => part.join('')).join('-');
  const label = labelBytes && new TextDecoder().decode(labelBytes).split('\0')[0];
  return {
    offset: blockSize * 2,
    blockSize,
    major: get(0, 2),
    minor: get(2, 2),
    blockBits: get(0x38, 4),
    clusterBits: get(0x3c, 4),
    maxSlots: get(0x40, 2),
    root: get(0x28, 8),
    systemDir: get(0x30, 8),
    label,
    uuid,
    compat: featureFlags(get(0x1c, 4), FEATURES.compat),
    incompat: featureFlags(get(0x20, 4), FEATURES.incompat),
    roCompat: featureFlags(get(0x24, 4), FEATURES.roCompat),
  };
}

/** Inspect block 2 using a bounded async slice reader. */
export async function inspectOcfs2(readSlice) {
  try {
    for (const size of SIZES) {
      const bytes = await readSlice(size * 2, READ_LENGTH);
      if (!(bytes instanceof Uint8Array)) continue;
      if (SIGNATURE.every((byte, index) => bytes[index] === byte)) {
        return { data: decodeBlock(bytes, size), error: null };
      }
    }
    return { data: null, error: 'OCFSV2 signature not found at any supported block 2 offset.' };
  } catch {
    return { data: null, error: 'Unable to read the input.' };
  }
}

/** Read only candidate superblock ranges from a file. */
export function inspectFile(file) {
  return inspectOcfs2(async (offset, length) => (
    new Uint8Array(await file.slice(offset, offset + length).arrayBuffer())
  ));
}

/** Inspect a hex-encoded disk image without decoding the entire image. */
export async function inspectHex(input) {
  if (typeof input !== 'string' || /[^\da-f\s]/i.test(input)) {
    return { data: null, error: 'Hex input must contain only hexadecimal digits and whitespace.' };
  }
  // Scan digits without constructing a second copy of a potentially large image.
  const ranges = SIZES.map((size) => ({ start: size * 4, end: (size * 2 + READ_LENGTH) * 2 }));
  const buffers = ranges.map(() => []);
  let digits = 0;
  let high = 0;
  for (const char of input) {
    if (/\s/.test(char)) continue;
    const value = parseInt(char, 16);
    if (digits % 2 === 0) high = value;
    else {
      ranges.forEach((range, index) => {
        if (digits >= range.start && digits < range.end) buffers[index].push(high * 16 + value);
      });
    }
    digits += 1;
  }
  if (digits % 2) return { data: null, error: 'Hex input must contain complete bytes.' };
  return inspectOcfs2(async (offset) => new Uint8Array(buffers[SIZES.indexOf(offset / 2)]));
}
