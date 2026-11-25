export const IDNAME_RIGIDDISK = 0x5244534B; // 'RDSK'
export const IDNAME_PARTITION = 0x50415254; // 'PART'
export const RDB_LOCATION_LIMIT = 16;
export const STANDARD_BLOCK_BYTES = 512;
export const MAX_SCAN_BYTES = 16 * 512; // 8192 bytes
export const MAX_PARTITION_COUNT = 64;
export const NULL_BLOCK = 0xFFFFFFFF;

/**
 * Reads only the first 16 blocks (8192 bytes) of a disk image file via File.slice.
 *
 * @param {File|Blob} file - The disk image file to read.
 * @returns {Promise<Uint8Array>} Resolves with the sliced raw bytes.
 */
export async function readRdbSlice(file) {
  if (!file || typeof file.slice !== 'function') {
    throw new TypeError('A valid File or Blob object is required.');
  }
  const slice = file.slice(0, MAX_SCAN_BYTES);
  if (typeof slice.arrayBuffer === 'function') {
    const arrayBuffer = await slice.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    };
    reader.onerror = () => reject(new Error('Failed to read file slice.'));
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Formats a 32-bit DosType integer into a human-readable tag and hex representation.
 * e.g. 0x444F5303 -> "DOS\\3 (0x444F5303)"
 *
 * @param {number} dosTypeRaw - 32-bit unsigned integer.
 * @returns {string} Formatted DosType.
 */
export function formatDosType(dosTypeRaw) {
  if (typeof dosTypeRaw !== 'number' || Number.isNaN(dosTypeRaw)) {
    return 'Unknown';
  }
  const bytes = [
    (dosTypeRaw >>> 24) & 0xff,
    (dosTypeRaw >>> 16) & 0xff,
    (dosTypeRaw >>> 8) & 0xff,
    dosTypeRaw & 0xff,
  ];

  let tag = '';
  for (const byte of bytes) {
    if (byte >= 32 && byte <= 126) {
      tag += String.fromCharCode(byte);
    } else {
      tag += `\\${byte}`;
    }
  }

  const hex = `0x${(dosTypeRaw >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
  return `${tag} (${hex})`;
}

/**
 * Formats PartitionBlock flags into human-readable labels.
 *
 * @param {number} flags - 32-bit partition flags.
 * @returns {string} Formatted flags.
 */
export function formatPartitionFlags(flags) {
  const labels = [];
  if (flags & 0x01) labels.push('Bootable');
  if (flags & 0x02) labels.push('NoMount');
  const hex = `0x${(flags >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
  return labels.length > 0 ? `${hex} (${labels.join(', ')})` : hex;
}

/**
 * Formats RigidDiskBlock flags into human-readable labels.
 *
 * @param {number} flags - 32-bit RDSK flags.
 * @returns {string} Formatted flags.
 */
export function formatRdskFlags(flags) {
  const labels = [];
  if (flags & 0x01) labels.push('LAST');
  if (flags & 0x02) labels.push('LASTLUN');
  if (flags & 0x04) labels.push('LASTTID');
  if (flags & 0x08) labels.push('NORESELECT');
  if (flags & 0x10) labels.push('DISKID');
  if (flags & 0x20) labels.push('CTRLRID');
  if (flags & 0x40) labels.push('SYNCHRON');
  const hex = `0x${(flags >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
  return labels.length > 0 ? `${hex} (${labels.join(', ')})` : hex;
}

/**
 * Reads a fixed-length ASCII string from a Uint8Array, stopping at null bytes.
 *
 * @param {Uint8Array} uint8Array - Buffer.
 * @param {number} start - Byte offset.
 * @param {number} length - Number of bytes to read.
 * @returns {string} Decoded ASCII string.
 */
function readAscii(uint8Array, start, length) {
  if (start >= uint8Array.byteLength) return '';
  const end = Math.min(start + length, uint8Array.byteLength);
  let str = '';
  for (let i = start; i < end; i++) {
    const code = uint8Array[i];
    if (code === 0) break;
    if (code >= 32 && code <= 126) {
      str += String.fromCharCode(code);
    }
  }
  return str.trim();
}

/**
 * Reads a Pascal BSTR or null-terminated string from a Uint8Array.
 *
 * @param {Uint8Array} uint8Array - Buffer.
 * @param {number} start - Byte offset.
 * @param {number} maxBytes - Maximum byte length.
 * @returns {string} Decoded string.
 */
function readBstr(uint8Array, start, maxBytes) {
  if (start >= uint8Array.byteLength) return '';
  const lenByte = uint8Array[start];
  if (lenByte > 0 && lenByte < maxBytes && start + 1 + lenByte <= uint8Array.byteLength) {
    let str = '';
    for (let i = 0; i < lenByte; i++) {
      const code = uint8Array[start + 1 + i];
      if (code >= 32 && code <= 126) {
        str += String.fromCharCode(code);
      }
    }
    const trimmed = str.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return readAscii(uint8Array, start, maxBytes);
}

/**
 * Validates the checksum of an Amiga block.
 *
 * @param {DataView} view - DataView of the buffer.
 * @param {number} blockOffset - Byte offset of the block.
 * @param {number} summedLongs - Number of longwords summed.
 * @param {number} totalBytes - Total buffer length.
 * @returns {{ status: 'Valid' | 'Invalid' | 'Unknown', diagnostic: string | null }}
 */
function verifyBlockChecksum(view, blockOffset, summedLongs, totalBytes) {
  if (summedLongs < 3) {
    return {
      status: 'Unknown',
      diagnostic: `Invalid summed longwords count: ${summedLongs}.`,
    };
  }
  const neededBytes = summedLongs * 4;
  if (blockOffset + neededBytes > totalBytes) {
    return {
      status: 'Unknown',
      diagnostic:
        `Truncated block: needs ${neededBytes} bytes, got ${totalBytes - blockOffset}.`,
    };
  }
  let sum = 0;
  for (let i = 0; i < summedLongs; i++) {
    sum = (sum + view.getUint32(blockOffset + i * 4, false)) >>> 0;
  }
  if (sum === 0) {
    return { status: 'Valid', diagnostic: null };
  }
  const sumHex = `0x${sum.toString(16).toUpperCase().padStart(8, '0')}`;
  return {
    status: 'Invalid',
    diagnostic: `Checksum mismatch: longword sum is ${sumHex}, expected 0.`,
  };
}

/**
 * Parses an Amiga Rigid Disk Block and its partition chain.
 *
 * @param {Uint8Array|ArrayBuffer} input - Raw bytes of the first 16 disk blocks.
 * @returns {object} Parsed RDB details and partition entries.
 */
export function parseRdb(input) {
  if (!input) {
    return {
      status: 'Unknown',
      checksumStatus: 'Unknown',
      diagnostic: 'No disk image data provided.',
      rdsk: null,
      partitions: [],
    };
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < STANDARD_BLOCK_BYTES) {
    return {
      status: 'Unknown',
      checksumStatus: 'Unknown',
      diagnostic: `Truncated buffer: expected at least 512 bytes, got ${bytes.byteLength}.`,
      rdsk: null,
      partitions: [],
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Scan first 16 blocks (blocks 0 to 15) for RDSK magic (0x5244534B)
  const maxBlocksToScan = Math.min(RDB_LOCATION_LIMIT, Math.floor(bytes.byteLength / 512));
  let rdskBlockIndex = -1;
  let rdskOffset = -1;

  for (let i = 0; i < maxBlocksToScan; i++) {
    const offset = i * 512;
    if (view.getUint32(offset, false) === IDNAME_RIGIDDISK) {
      rdskBlockIndex = i;
      rdskOffset = offset;
      break;
    }
  }

  if (rdskBlockIndex === -1) {
    return {
      status: 'Unknown',
      checksumStatus: 'Unknown',
      diagnostic: 'RDSK magic (0x5244534B) not found in the first 16 blocks.',
      rdsk: null,
      partitions: [],
    };
  }

  if (rdskOffset + 256 > bytes.byteLength) {
    return {
      status: 'Unknown',
      checksumStatus: 'Unknown',
      diagnostic: `Truncated RDSK block header at block ${rdskBlockIndex}.`,
      rdsk: null,
      partitions: [],
    };
  }

  const summedLongs = view.getUint32(rdskOffset + 4, false);
  const chkSum = view.getUint32(rdskOffset + 8, false);
  const hostId = view.getUint32(rdskOffset + 12, false);
  const rawBlockBytes = view.getUint32(rdskOffset + 16, false);
  const blockSize = rawBlockBytes >= 256 && rawBlockBytes <= 8192 ? rawBlockBytes : 512;
  const flags = view.getUint32(rdskOffset + 20, false);
  const badBlockList = view.getUint32(rdskOffset + 24, false);
  const partitionList = view.getUint32(rdskOffset + 28, false);
  const fileSysHeaderList = view.getUint32(rdskOffset + 32, false);
  const driveInit = view.getUint32(rdskOffset + 36, false);

  const cylinders = view.getUint32(rdskOffset + 64, false);
  const sectors = view.getUint32(rdskOffset + 68, false);
  const heads = view.getUint32(rdskOffset + 72, false);
  const interleave = view.getUint32(rdskOffset + 76, false);
  const park = view.getUint32(rdskOffset + 80, false);

  const vendor = readAscii(bytes, rdskOffset + 160, 8);
  const product = readAscii(bytes, rdskOffset + 168, 16);
  const revision = readAscii(bytes, rdskOffset + 184, 4);

  const rdskChk = verifyBlockChecksum(view, rdskOffset, summedLongs, bytes.byteLength);

  const rdskInfo = {
    blockIndex: rdskBlockIndex,
    blockSize,
    flags,
    flagsFormatted: formatRdskFlags(flags),
    hostId,
    badBlockList,
    partitionList,
    fileSysHeaderList,
    driveInit,
    cylinders,
    sectors,
    heads,
    interleave,
    park,
    vendor: vendor || 'Unknown',
    product: product || 'Unknown',
    revision: revision || 'Unknown',
    summedLongs,
    chkSum,
    checksumStatus: rdskChk.status,
  };

  // Follow PART chain with hard cap and cycle detection
  const partitions = [];
  const visitedBlocks = new Set([rdskBlockIndex]);
  let currBlock = partitionList;
  let chainDiagnostic = rdskChk.diagnostic;

  while (currBlock !== NULL_BLOCK) {
    if (visitedBlocks.has(currBlock)) {
      chainDiagnostic = `Cyclic PART chain detected: block ${currBlock} was already visited.`;
      break;
    }
    visitedBlocks.add(currBlock);

    if (partitions.length >= MAX_PARTITION_COUNT) {
      chainDiagnostic = `Exceeded maximum partition count limit (${MAX_PARTITION_COUNT}).`;
      break;
    }

    const partOffset = currBlock * blockSize;
    if (partOffset < 0 || partOffset + 196 > bytes.byteLength) {
      chainDiagnostic = `PART block pointer ${currBlock} is out of range or truncated.`;
      break;
    }

    const partMagic = view.getUint32(partOffset, false);
    if (partMagic !== IDNAME_PARTITION) {
      const hex = `0x${partMagic.toString(16).toUpperCase().padStart(8, '0')}`;
      chainDiagnostic =
        `Block ${currBlock} has wrong magic ${hex}, expected PART (0x50415254).`;
      break;
    }

    const pbSummedLongs = view.getUint32(partOffset + 4, false);
    const pbChkSum = view.getUint32(partOffset + 8, false);
    const partChk = verifyBlockChecksum(view, partOffset, pbSummedLongs, bytes.byteLength);

    const pbNext = view.getUint32(partOffset + 16, false);
    const pbFlags = view.getUint32(partOffset + 20, false);
    const driveName = readBstr(bytes, partOffset + 36, 32);

    const envOffset = partOffset + 128;
    const tableSize = view.getUint32(envOffset, false);
    const lowCyl = tableSize >= 10 ? view.getUint32(envOffset + 36, false) : 0;
    const highCyl = tableSize >= 11 ? view.getUint32(envOffset + 40, false) : 0;
    const dosTypeRaw = tableSize >= 17 ? view.getUint32(envOffset + 64, false) : 0;

    partitions.push({
      blockNumber: currBlock,
      driveName: driveName || `DH${partitions.length}`,
      dosType: formatDosType(dosTypeRaw),
      dosTypeRaw,
      lowCyl,
      highCyl,
      flags: pbFlags,
      flagsFormatted: formatPartitionFlags(pbFlags),
      summedLongs: pbSummedLongs,
      chkSum: pbChkSum,
      checksumStatus: partChk.status,
    });

    if (partChk.status !== 'Valid' && !chainDiagnostic) {
      chainDiagnostic = partChk.diagnostic;
    }

    currBlock = pbNext;
  }

  // Determine overall status
  let overallStatus = 'Valid';
  if (
    chainDiagnostic &&
    (chainDiagnostic.includes('Cyclic') ||
     chainDiagnostic.includes('out of range') ||
     chainDiagnostic.includes('wrong magic') ||
     chainDiagnostic.includes('Truncated') ||
     chainDiagnostic.includes('Exceeded') ||
     rdskChk.status === 'Unknown')
  ) {
    overallStatus = 'Unknown';
  } else if (
    rdskChk.status === 'Invalid' ||
    partitions.some((p) => p.checksumStatus === 'Invalid')
  ) {
    overallStatus = 'Invalid';
  } else if (rdskChk.status === 'Valid') {
    overallStatus = 'Valid';
  } else {
    overallStatus = 'Unknown';
  }

  return {
    status: overallStatus,
    checksumStatus: rdskChk.status,
    diagnostic: chainDiagnostic,
    rdsk: rdskInfo,
    partitions,
  };
}

/**
 * Creates a valid Amiga RDB image buffer with 2 partitions.
 * All checksum values are hand-calculated:
 * - RDSK sum without chksum = 0xF1F91570 -> ChkSum = 0x0E06EA90
 * - PART 1 (DH0) sum without chksum = 0x18D4EF72 -> ChkSum = 0xE72B108E
 * - PART 2 (DH1) sum without chksum = 0x18D4F34E -> ChkSum = 0xE72B0CB2
 *
 * @returns {Uint8Array} 8192-byte buffer.
 */
export function createValidSample() {
  const buf = new Uint8Array(8192);
  const view = new DataView(buf.buffer);

  // Block 0: RDSK
  view.setUint32(0, IDNAME_RIGIDDISK); // 0x5244534B ('RDSK')
  view.setUint32(4, 64); // SummedLongs
  view.setUint32(8, 0x0E06EA90); // Hand-calculated ChkSum
  view.setUint32(12, 7); // HostID
  view.setUint32(16, 512); // BlockBytes
  view.setUint32(20, 0x12); // Flags: LASTLUN | DISKID
  view.setUint32(24, NULL_BLOCK); // BadBlockList
  view.setUint32(28, 1); // PartitionList -> Block 1
  view.setUint32(32, NULL_BLOCK); // FileSysHeaderList
  view.setUint32(36, NULL_BLOCK); // DriveInit
  view.setUint32(64, 1000); // Cylinders
  view.setUint32(68, 32); // Sectors
  view.setUint32(72, 4); // Heads
  view.setUint32(76, 1); // Interleave
  view.setUint32(80, 1000); // Park
  view.setUint32(96, 1000); // WritePreComp
  view.setUint32(100, 1000); // ReducedWrite
  view.setUint32(104, 3); // StepRate
  view.setUint32(128, 0); // RDBBlocksLo
  view.setUint32(132, 15); // RDBBlocksHi
  view.setUint32(136, 2); // LoCyl
  view.setUint32(140, 999); // HiCyl
  view.setUint32(144, 128); // CylBlocks
  view.setUint32(152, 15); // HighRDSK

  new TextEncoder().encodeInto('QUANTUM ', buf.subarray(160, 168));
  new TextEncoder().encodeInto('FIREBALL 1.0    ', buf.subarray(168, 184));
  new TextEncoder().encodeInto('1.00', buf.subarray(184, 188));

  // Block 1: PART 1 (DH0)
  const o1 = 512;
  view.setUint32(o1 + 0, IDNAME_PARTITION); // 0x50415254 ('PART')
  view.setUint32(o1 + 4, 64);
  view.setUint32(o1 + 8, 0xE72B108E); // Hand-calculated ChkSum
  view.setUint32(o1 + 12, 7);
  view.setUint32(o1 + 16, 2); // Next -> Block 2
  view.setUint32(o1 + 20, 1); // Flags (Bootable)
  buf[o1 + 36] = 3;
  buf[o1 + 37] = 0x44; // 'D'
  buf[o1 + 38] = 0x48; // 'H'
  buf[o1 + 39] = 0x30; // '0'
  view.setUint32(o1 + 128, 17); // TableSize
  view.setUint32(o1 + 132, 128);
  view.setUint32(o1 + 140, 4);
  view.setUint32(o1 + 148, 32);
  view.setUint32(o1 + 152, 2);
  view.setUint32(o1 + 160, 1);
  view.setUint32(o1 + 164, 2); // LowCyl
  view.setUint32(o1 + 168, 199); // HighCyl
  view.setUint32(o1 + 172, 30);
  view.setUint32(o1 + 180, 0x00FFFFFF);
  view.setUint32(o1 + 184, 0x7FFFFFFE);
  view.setUint32(o1 + 188, 5); // BootPri
  view.setUint32(o1 + 192, 0x444F5303); // DOS\3

  // Block 2: PART 2 (DH1)
  const o2 = 1024;
  view.setUint32(o2 + 0, IDNAME_PARTITION); // 0x50415254 ('PART')
  view.setUint32(o2 + 4, 64);
  view.setUint32(o2 + 8, 0xE72B0CB2); // Hand-calculated ChkSum
  view.setUint32(o2 + 12, 7);
  view.setUint32(o2 + 16, NULL_BLOCK); // Next -> End of list
  view.setUint32(o2 + 20, 0); // Flags
  buf[o2 + 36] = 3;
  buf[o2 + 37] = 0x44; // 'D'
  buf[o2 + 38] = 0x48; // 'H'
  buf[o2 + 39] = 0x31; // '1'
  view.setUint32(o2 + 128, 17); // TableSize
  view.setUint32(o2 + 132, 128);
  view.setUint32(o2 + 140, 4);
  view.setUint32(o2 + 148, 32);
  view.setUint32(o2 + 152, 2);
  view.setUint32(o2 + 160, 1);
  view.setUint32(o2 + 164, 200); // LowCyl
  view.setUint32(o2 + 168, 999); // HighCyl
  view.setUint32(o2 + 172, 30);
  view.setUint32(o2 + 180, 0x00FFFFFF);
  view.setUint32(o2 + 184, 0x7FFFFFFE);
  view.setUint32(o2 + 188, 0);
  view.setUint32(o2 + 192, 0x444F5301); // DOS\1

  return buf;
}

/**
 * Creates an Amiga RDB sample with an invalid checksum in the RDSK block.
 *
 * @returns {Uint8Array} Buffer with corrupted checksum.
 */
export function createBadChecksumSample() {
  const buf = createValidSample();
  const view = new DataView(buf.buffer);
  // Deliberately corrupt the checksum longword at offset 8
  view.setUint32(8, 0xDEADBEEF);
  return buf;
}

/**
 * Creates a sample without any RDSK magic.
 *
 * @returns {Uint8Array} Buffer containing zeroed blocks.
 */
export function createNoRdskSample() {
  return new Uint8Array(8192);
}

/**
 * Creates a truncated buffer sample (< 512 bytes).
 *
 * @returns {Uint8Array} Truncated buffer.
 */
export function createTruncatedSample() {
  const buf = new Uint8Array(128);
  // Set RDSK magic at start but cut off the rest of the block
  new DataView(buf.buffer).setUint32(0, IDNAME_RIGIDDISK);
  return buf;
}

/**
 * Creates an RDB sample with a cyclic PART chain (Block 1 -> Block 2 -> Block 1).
 *
 * @returns {Uint8Array} Buffer with a cyclic partition chain.
 */
export function createCyclicSample() {
  const buf = createValidSample();
  const view = new DataView(buf.buffer);
  // Change Block 2 pb_Next (offset 1024 + 16) from NULL_BLOCK to 1
  view.setUint32(1024 + 16, 1);
  // Recalculate Block 2 checksum for consistency:
  // Previous sum without chksum was 0x18D4F34E, where pb_Next was 0xFFFFFFFF (-1).
  // Now pb_Next is 1. The difference in sum is 1 - 0xFFFFFFFF = 2.
  // So new sum without chksum is 0x18D4F34E + 2 = 0x18D4F350.
  // New chksum = (-0x18D4F350) >>> 0 = 0xE72B0CB0.
  view.setUint32(1024 + 8, 0xE72B0CB0);
  return buf;
}
