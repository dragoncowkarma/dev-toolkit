const MAGIC = 0x514649fb;

/** Parse a QCOW2 header and optionally use separately read backing path bytes. */
export function parseQcow2(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) {
    throw new Error('Truncated header: at least 8 bytes are required.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== MAGIC) throw new Error('Invalid QCOW2 magic bytes.');
  const version = view.getUint32(4);
  if (version !== 2 && version !== 3) throw new Error(`Unsupported QCOW2 version: ${version}.`);
  const required = version === 3 ? 104 : 72;
  if (bytes.length < required) throw new Error(`Truncated header: ${required} bytes are required.`);
  const u32 = (offset) => view.getUint32(offset);
  const u64 = (offset) => view.getBigUint64(offset);
  const backingOffset = u64(8);
  const backingSize = u32(16);
  const totalSize = BigInt(options.totalSize ?? bytes.length);
  let backingPath = '';
  if (backingSize > 0) {
    if (backingOffset === 0n || backingOffset + BigInt(backingSize) > totalSize) {
      throw new Error('Backing file offset and size are out of bounds.');
    }
    const pathBytes = options.backingBytes ?? bytes.subarray(
      Number(backingOffset), Number(backingOffset) + backingSize,
    );
    if (pathBytes.length !== backingSize) {
      throw new Error('Backing file offset and size are out of bounds.');
    }
    backingPath = new TextDecoder().decode(pathBytes);
  } else if (backingOffset > totalSize) {
    throw new Error('Backing file offset is out of bounds.');
  }
  const clusterBits = u32(20);
  // BigInt shifts on malformed uint32 values could allocate enormous amounts of memory.
  if (clusterBits > 63) throw new Error('Invalid cluster bits: must be at most 63.');
  const result = {
    version, backingOffset, backingSize, backingPath, clusterBits,
    clusterSize: 1n << BigInt(clusterBits), virtualSize: u64(24), encryption: u32(32),
    l1Size: u32(36), l1Offset: u64(40), refcountOffset: u64(48),
    refcountClusters: u32(56), snapshotCount: u32(60), snapshotsOffset: u64(64),
  };
  if (version === 3) {
    const refcountOrder = u32(96);
    if (refcountOrder > 63) throw new Error('Invalid refcount order: must be at most 63.');
    const headerLength = u32(100);
    if (headerLength < 104) throw new Error('Invalid version 3 header length.');
    if (headerLength >= 105 && bytes.length < 105) {
      throw new Error('Truncated header: compression type is missing.');
    }
    Object.assign(result, {
      incompatibleFeatures: u64(72), compatibleFeatures: u64(80), autoclearFeatures: u64(88),
      refcountOrder, refcountBits: 1n << BigInt(refcountOrder), headerLength,
      compressionType: headerLength >= 105 ? bytes[104] : null,
    });
  }
  return result;
}

/** Decode whitespace-separated hexadecimal or Base64 input. */
export function decodeInput(input, format) {
  const clean = input.replace(/\s/g, '');
  if (!clean) throw new Error('Enter hexadecimal or Base64 data.');
  if (format === 'hex') {
    if (!/^(?:[\da-fA-F]{2})+$/.test(clean)) throw new Error('Invalid hexadecimal data.');
    return Uint8Array.from(clean.match(/../g), (pair) => parseInt(pair, 16));
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean)) {
    throw new Error('Invalid Base64 data.');
  }
  try {
    return Uint8Array.from(atob(clean), (char) => char.charCodeAt(0));
  } catch {
    throw new Error('Invalid Base64 data.');
  }
}

/** Format an integer byte count without losing its original precision. */
export function formatSize(size) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
  let divisor = 1n;
  let unit = 0;
  while (size >= divisor * 1024n && unit < units.length - 1) {
    divisor *= 1024n;
    unit += 1;
  }
  if (unit === 0) return `${size} B`;
  const hundredths = size * 100n / divisor;
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')} ${units[unit]}`;
}
