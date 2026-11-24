const MARKER = 0x42494745;
const MAGIC = [[32, 0x42465331], [68, 0xdd121031], [112, 0x15b6830e]];
const SUPERBLOCK_SIZE = 512;

/** Convert whitespace-separated hexadecimal bytes into an array. */
export function parseHex(text) {
  const hex = text.replace(/\s/g, '');
  if (!hex || hex.length % 2 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('Enter an even number of hexadecimal digits.');
  }
  return Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
}

function byteOrder(view, offset) {
  if (view.byteLength < offset + 40) return null;
  if (view.getUint32(offset + 36, false) === MARKER) return false;
  if (view.getUint32(offset + 36, true) === MARKER) return true;
  return null;
}

function run(view, offset, little) {
  return {
    allocationGroup: view.getInt32(offset, little),
    start: view.getUint16(offset + 4, little),
    length: view.getUint16(offset + 6, little),
  };
}

/** Parse a raw superblock or the superblock at byte 512 in a disk image. */
export function inspectSuperblock(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawOrder = byteOrder(view, 0);
  const diskOrder = byteOrder(view, 512);
  const rawMagic = rawOrder !== null && view.getUint32(32, rawOrder) === MAGIC[0][1];
  const offset = diskOrder !== null && !rawMagic ? 512
    : rawOrder !== null || view.byteLength <= SUPERBLOCK_SIZE ? 0 : 512;
  if (view.byteLength < offset + SUPERBLOCK_SIZE) {
    throw new Error('Truncated input: a complete 512-byte superblock is required.');
  }
  const little = byteOrder(view, offset);
  if (little === null) throw new Error('Invalid byte order marker.');
  const warnings = MAGIC.flatMap(([position, expected], index) => (
    view.getUint32(offset + position, little) === expected ? [] : [`Invalid magic${index + 1}.`]
  ));
  const blockSize = view.getUint32(offset + 40, little);
  const blockShift = view.getUint32(offset + 44, little);
  if (blockSize === 0 || (BigInt(blockSize) & (BigInt(blockSize) - 1n)) !== 0n) {
    warnings.push('block_size is not a power of two.');
  }
  if (blockShift > 31 || 2 ** blockShift !== blockSize) {
    warnings.push('block_shift does not match block_size.');
  }
  const nameBytes = bytes.subarray(offset, offset + 32);
  const terminator = nameBytes.indexOf(0);
  return {
    offset,
    byteOrder: little ? 'Little-endian' : 'Big-endian',
    name: new TextDecoder().decode(terminator < 0 ? nameBytes : nameBytes.subarray(0, terminator)),
    blockSize,
    blockShift,
    numBlocks: view.getBigInt64(offset + 48, little),
    usedBlocks: view.getBigInt64(offset + 56, little),
    flags: view.getUint32(offset + 84, little),
    logBlocks: run(view, offset + 88, little),
    logStart: view.getBigInt64(offset + 96, little),
    logEnd: view.getBigInt64(offset + 104, little),
    rootDirectory: run(view, offset + 116, little),
    indices: run(view, offset + 124, little),
    warnings,
  };
}
