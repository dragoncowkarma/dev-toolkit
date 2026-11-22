const MBR_SECTOR_SIZE = 512;
const PARTITION_TABLE_OFFSET = 0x1be;
const PARTITION_ENTRY_SIZE = 16;
const PARTITION_COUNT = 4;
const BOOT_SIGNATURE_OFFSET = 0x1fe;

const PARTITION_TYPES = {
  0x00: 'Empty',
  0x05: 'Extended',
  0x07: 'NTFS/exFAT',
  0x0b: 'FAT32',
  0x0c: 'FAT32 (LBA)',
  0x0f: 'Extended (LBA)',
  0x82: 'Linux swap',
  0x83: 'Linux',
  0xee: 'GPT protective',
};

/**
 * Converts an ArrayBuffer or byte view into a bounded DataView.
 *
 * @param {ArrayBuffer|Uint8Array} input - Bytes containing an MBR sector.
 * @returns {DataView|null} A view over exactly the supplied bytes, or null for invalid input.
 */
function toDataView(input) {
  if (input instanceof ArrayBuffer) return new DataView(input);
  if (input instanceof Uint8Array) {
    return new DataView(input.buffer, input.byteOffset, input.byteLength);
  }
  return null;
}

/**
 * Parses a three-byte cylinder-head-sector address from an MBR partition entry.
 *
 * @param {DataView} view - The bounded input view.
 * @param {number} offset - The CHS address offset.
 * @returns {{head: number, sector: number, cylinder: number}}
 */
function parseChs(view, offset) {
  const head = view.getUint8(offset);
  const sectorByte = view.getUint8(offset + 1);
  return {
    head,
    sector: sectorByte & 0x3f,
    cylinder: ((sectorByte & 0xc0) << 2) | view.getUint8(offset + 2),
  };
}

/**
 * Returns a label for a partition type byte.
 *
 * @param {number} type - The MBR partition type byte.
 * @returns {string} A known type label or "Unknown".
 */
export function getPartitionTypeName(type) {
  return PARTITION_TYPES[type] ?? 'Unknown';
}

/**
 * Parses the first sector of a classic Master Boot Record.
 *
 * @param {ArrayBuffer|Uint8Array} input - Disk or image bytes beginning at sector zero.
 * @returns {{ok: boolean, error?: string, bootSignature?: string, bootstrapCodeSize?: number,
 *   partitions?: Array<object>, isGptProtective?: boolean, note?: string}}
 */
export function parseMbr(input) {
  const view = toDataView(input);
  if (!view || view.byteLength < MBR_SECTOR_SIZE) {
    return { ok: false, error: 'The selected file is too short to contain a 512-byte MBR sector.' };
  }

  const signatureFirstByte = view.getUint8(BOOT_SIGNATURE_OFFSET);
  const signatureSecondByte = view.getUint8(BOOT_SIGNATURE_OFFSET + 1);
  if (signatureFirstByte !== 0x55 || signatureSecondByte !== 0xaa) {
    return { ok: false, error: 'Invalid MBR boot signature. Expected 0x55AA at offset 0x1FE.' };
  }

  const partitions = Array.from({ length: PARTITION_COUNT }, (_, index) => {
    const offset = PARTITION_TABLE_OFFSET + index * PARTITION_ENTRY_SIZE;
    const type = view.getUint8(offset + 4);
    return {
      index: index + 1,
      bootIndicator: view.getUint8(offset),
      chsStart: parseChs(view, offset + 1),
      type,
      typeName: getPartitionTypeName(type),
      chsEnd: parseChs(view, offset + 5),
      lbaStart: view.getUint32(offset + 8, true),
      sectorCount: view.getUint32(offset + 12, true),
    };
  });
  const populatedPartitions = partitions.filter((partition) => partition.type !== 0x00);
  const isGptProtective =
    populatedPartitions.length === 1 && populatedPartitions[0].type === 0xee;

  return {
    ok: true,
    bootSignature: '0x55AA',
    bootstrapCodeSize: PARTITION_TABLE_OFFSET,
    partitions,
    isGptProtective,
    note: isGptProtective
      ? 'GPT protective MBR detected. This disk uses GPT; GPT structures are not parsed here.'
      : undefined,
  };
}
