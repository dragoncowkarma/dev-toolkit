/**
 * Lookup table of well-known partition type GUIDs in mixed-endian format.
 */
export const KNOWN_PARTITION_TYPES = {
  'C12A7328-F81F-11D2-BA4B-00A0C93EC93B': 'EFI System Partition',
  'E3C9E316-0B5C-4DB8-817D-F92DF00215AE': 'Microsoft Reserved (MSR)',
  'EBD0A0A2-B9E5-4433-87C0-68B6B72699C7': 'Microsoft Basic Data',
  '5808C8AA-7E8F-42E0-85D2-E1E90434CFB3': 'Microsoft LDM Metadata',
  'AF9B60A0-1431-4F62-BC68-3311714A69AD': 'Microsoft LDM Data',
  'DE94BBA4-06D1-4D40-A16A-BFD50179D6AC': 'Windows Recovery Environment',
  '0FC63DAF-8483-4772-8E79-3D69D8477DE4': 'Linux Filesystem Data',
  '0657FD6D-A4AB-43C4-84E5-0933C84B4F4F': 'Linux Swap',
  'E6D6D379-F507-44C2-A23C-238F2A3DF928': 'Linux LVM',
  'A19D880F-0572-4D7F-816C-BFB93E7F2178': 'Linux RAID',
  '4F68BCE3-E8CD-4DB1-96E7-FBCAF984B709': 'Linux Root (x86-64)',
  'B921B045-1DF0-41C3-AF44-4C6F280D3FAE': 'Linux Root (ARM64)',
  '933AC7E1-2EB4-4F13-B844-0E14E2AEF915': 'Linux Home',
  '3B8F8425-20E0-4F3B-907F-1A25A76F98E8': 'Linux Server Data',
  '7C3457EF-0000-11AA-AA11-00306543ECAC': 'Apple APFS',
  '48465300-0000-11AA-AA11-00306543ECAC': 'Apple HFS+',
  '426F6F74-0000-11AA-AA11-00306543ECAC': 'Apple Boot (Recovery)',
  '52414944-0000-11AA-AA11-00306543ECAC': 'Apple RAID',
  '516E7CB4-6ECF-11D6-8FF8-00022D09712B': 'FreeBSD Data',
  '83856500-E4D3-11DD-BA88-0050569DB020': 'FreeBSD Boot',
  '516E7CB5-6ECF-11D6-8FF8-00022D09712B': 'FreeBSD Swap',
  '516E7CBA-6ECF-11D6-8FF8-00022D09712B': 'FreeBSD ZFS',
  '21686148-6449-6E6F-744E-656564454649': 'BIOS Boot Partition',
  '6A82CB45-1DD2-11B2-99A6-080020736631': 'Solaris / illumos Root',
  'FE3A2A5D-4F32-41A7-B725-ACCC3285A309': 'ChromeOS Kernel',
  '3CB8E202-3B7E-47DD-8A3C-7FF24E135765': 'ChromeOS Root',
};

export const MAX_SECTORS_TO_READ = 34;
export const STANDARD_SECTOR_SIZE = 512;
export const MAX_GPT_BYTES = MAX_SECTORS_TO_READ * STANDARD_SECTOR_SIZE; // 17408 bytes

let crcTable = null;

/**
 * Initializes and returns the IEEE 802.3 CRC32 lookup table.
 *
 * @returns {Uint32Array} 256-entry CRC32 lookup table.
 */
function getCrcTable() {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/**
 * Computes the IEEE 802.3 CRC32 checksum of a byte sequence.
 *
 * @param {Uint8Array} bytes - Input byte array.
 * @returns {number} 32-bit unsigned CRC value.
 */
export function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Formats a 16-byte buffer slice as a mixed-endian GUID string.
 *
 * @param {Uint8Array} bytes - Source byte array.
 * @param {number} [offset=0] - Offset to the 16 GUID bytes.
 * @returns {string} Formatted GUID in XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX format.
 */
export function formatGuid(bytes, offset = 0) {
  const hex = (b) => b.toString(16).padStart(2, '0').toUpperCase();
  const d1 = [bytes[offset + 3], bytes[offset + 2], bytes[offset + 1], bytes[offset]];
  const d2 = [bytes[offset + 5], bytes[offset + 4]];
  const d3 = [bytes[offset + 7], bytes[offset + 6]];
  const d4 = [bytes[offset + 8], bytes[offset + 9]];
  const d5 = [
    bytes[offset + 10], bytes[offset + 11], bytes[offset + 12],
    bytes[offset + 13], bytes[offset + 14], bytes[offset + 15],
  ];

  const part1 = d1.map(hex).join('');
  const part2 = d2.map(hex).join('');
  const part3 = d3.map(hex).join('');
  const part4 = d4.map(hex).join('');
  const part5 = d5.map(hex).join('');

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

/**
 * Converts a hex string into a Uint8Array, truncating to MAX_GPT_BYTES (17408 bytes).
 *
 * @param {string} hex - Raw hex input string.
 * @returns {Uint8Array} Parsed byte array.
 */
export function parseHexToBytes(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('Hex input must be a string.');
  }
  // Remove non-hex characters and limit to MAX_GPT_BYTES * 2 hex digits.
  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '').slice(0, MAX_GPT_BYTES * 2);
  const length = Math.floor(cleanHex.length / 2);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Converts a Uint8Array to formatted hexadecimal string.
 *
 * @param {Uint8Array} bytes - Source byte array.
 * @returns {string} Formatted hex string.
 */
export function bytesToHex(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i++) {
    parts.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return parts.join('');
}

/**
 * Reads only the first 34 sectors (17408 bytes) from a File object using file.slice.
 *
 * @param {File} file - Selected File object.
 * @returns {Promise<Uint8Array>} Byte array of sliced content.
 */
export async function readGptSlice(file) {
  if (!file || typeof file.slice !== 'function') {
    throw new TypeError('Expected a File object with slice method.');
  }
  const slice = file.slice(0, MAX_GPT_BYTES);
  if (typeof slice.arrayBuffer === 'function') {
    const arrayBuffer = await slice.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file slice.'));
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Formats a byte count into a human-readable size string.
 *
 * @param {number|bigint} bytes - Byte count.
 * @returns {string} Formatted size (e.g. "100.0 MB").
 */
export function formatBytes(bytes) {
  const num = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  if (num < 1024 * 1024 * 1024 * 1024) {
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(num / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

/**
 * Formats a 32-bit integer as 0xXXXXXXXX hex.
 *
 * @param {number} num - 32-bit number.
 * @returns {string} Hex string.
 */
export function formatHex32(num) {
  return '0x' + (num >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Formats a 64-bit BigInt as 0xXXXXXXXXXXXXXXXX hex.
 *
 * @param {bigint} val - 64-bit BigInt.
 * @returns {string} Hex string.
 */
export function formatHex64(val) {
  return '0x' + val.toString(16).padStart(16, '0').toUpperCase();
}

/**
 * Parses partition attributes into boolean flags.
 *
 * @param {bigint} attrs - 64-bit attribute flags.
 * @returns {Array<string>} Active flag names.
 */
export function parseAttributeFlags(attrs) {
  const flags = [];
  if ((attrs & 1n) !== 0n) flags.push('System Partition');
  if ((attrs & 2n) !== 0n) flags.push('Ignore EFI Firmware');
  if ((attrs & 4n) !== 0n) flags.push('Legacy BIOS Bootable');
  if ((attrs & (1n << 60n)) !== 0n) flags.push('Read-Only');
  if ((attrs & (1n << 62n)) !== 0n) flags.push('Hidden');
  if ((attrs & (1n << 63n)) !== 0n) flags.push('Do Not Automount');
  return flags;
}

/**
 * Validates whether the 8 bytes starting at offset equal 'EFI PART'.
 *
 * @param {Uint8Array} bytes - Source byte array.
 * @param {number} offset - Offset to check.
 * @returns {boolean} True if signature matches.
 */
function isEfiPartSignature(bytes, offset) {
  if (offset + 8 > bytes.length) return false;
  // 'EFI PART' in ASCII: [0x45, 0x46, 0x49, 0x20, 0x50, 0x41, 0x52, 0x54]
  return (
    bytes[offset] === 0x45 &&
    bytes[offset + 1] === 0x46 &&
    bytes[offset + 2] === 0x49 &&
    bytes[offset + 3] === 0x20 &&
    bytes[offset + 4] === 0x50 &&
    bytes[offset + 5] === 0x41 &&
    bytes[offset + 6] === 0x52 &&
    bytes[offset + 7] === 0x54
  );
}

/**
 * Parses GPT header and partition entries from a raw byte buffer.
 *
 * @param {Uint8Array|ArrayBuffer} input - Binary data containing GPT.
 * @returns {object} Parsed GPT header and partition entries.
 */
export function parseGpt(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  // Minimum required bytes for checking LBA 1 (offset 512 + 92 header size).
  if (bytes.length < 512 + 92) {
    throw new Error(
      `Truncated input: length is ${bytes.length} bytes, minimum required is 604 bytes.`
    );
  }

  let sectorSize = 512;
  let headerOffset = 512;

  if (isEfiPartSignature(bytes, 512)) {
    sectorSize = 512;
    headerOffset = 512;
  } else if (bytes.length >= 4096 + 92 && isEfiPartSignature(bytes, 4096)) {
    sectorSize = 4096;
    headerOffset = 4096;
  } else {
    throw new Error('Invalid GPT signature. Expected "EFI PART" at offset 512 or 4096.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const revision = view.getUint32(headerOffset + 8, true);
  const revMajor = revision >> 16;
  const revMinor = revision & 0xFFFF;
  const revisionStr = `${revMajor}.${revMinor} (${formatHex32(revision)})`;

  const headerSize = view.getUint32(headerOffset + 12, true);
  if (headerSize < 92 || headerSize > sectorSize) {
    throw new Error(`Invalid GPT header size: ${headerSize} bytes.`);
  }

  if (bytes.length < headerOffset + headerSize) {
    throw new Error(
      `Truncated header: buffer has ${bytes.length} bytes, needs ${headerOffset + headerSize}.`
    );
  }

  const storedHeaderCrc = view.getUint32(headerOffset + 16, true);
  const reserved = view.getUint32(headerOffset + 20, true);
  const currentLba = view.getBigUint64(headerOffset + 24, true);
  const backupLba = view.getBigUint64(headerOffset + 32, true);
  const firstUsableLba = view.getBigUint64(headerOffset + 40, true);
  const lastUsableLba = view.getBigUint64(headerOffset + 48, true);
  const diskGuid = formatGuid(bytes, headerOffset + 56);
  const partitionEntryLba = view.getBigUint64(headerOffset + 72, true);
  const entryCount = view.getUint32(headerOffset + 80, true);
  const entrySize = view.getUint32(headerOffset + 84, true);
  const storedArrayCrc = view.getUint32(headerOffset + 88, true);

  // Compute Header CRC32 (with bytes 16..19 set to 0).
  const headerCopy = new Uint8Array(bytes.subarray(headerOffset, headerOffset + headerSize));
  headerCopy[16] = 0;
  headerCopy[17] = 0;
  headerCopy[18] = 0;
  headerCopy[19] = 0;
  const computedHeaderCrc = crc32(headerCopy);
  const headerCrcMatch = computedHeaderCrc === storedHeaderCrc;

  // Compute Partition Entry Array CRC32 if entries are fully within buffer.
  const entryStart = Number(partitionEntryLba) * sectorSize;
  const totalArrayBytes = entryCount * entrySize;
  const hasFullEntryArray = bytes.length >= entryStart + totalArrayBytes;

  let computedArrayCrc = null;
  let arrayCrcMatch = null;

  if (hasFullEntryArray && totalArrayBytes > 0) {
    computedArrayCrc = crc32(bytes.subarray(entryStart, entryStart + totalArrayBytes));
    arrayCrcMatch = computedArrayCrc === storedArrayCrc;
  }

  // Parse partition entries, skipping all-zero entries.
  const partitions = [];
  if (entrySize >= 128) {
    for (let i = 0; i < entryCount; i++) {
      const offset = entryStart + i * entrySize;
      if (offset + entrySize > bytes.length) break;

      // Check if type GUID is all zeros.
      let isZeroType = true;
      for (let b = 0; b < 16; b++) {
        if (bytes[offset + b] !== 0) {
          isZeroType = false;
          break;
        }
      }
      if (isZeroType) continue;

      const typeGuid = formatGuid(bytes, offset);
      const typeName = KNOWN_PARTITION_TYPES[typeGuid] || 'Unknown / Custom';
      const uniqueGuid = formatGuid(bytes, offset + 16);
      const firstLba = view.getBigUint64(offset + 32, true);
      const lastLba = view.getBigUint64(offset + 40, true);
      const attributes = view.getBigUint64(offset + 48, true);
      const attributeFlags = parseAttributeFlags(attributes);

      // Parse UTF-16LE partition name (up to 36 code units = 72 bytes).
      let name = '';
      for (let c = 0; c < 36; c++) {
        const charCode = view.getUint16(offset + 56 + c * 2, true);
        if (charCode === 0) break;
        name += String.fromCharCode(charCode);
      }

      const sectorCount = lastLba >= firstLba ? lastLba - firstLba + 1n : 0n;
      const sizeBytes = sectorCount * BigInt(sectorSize);

      partitions.push({
        index: i + 1,
        name: name.trim() || '(Unnamed)',
        typeGuid,
        typeName,
        uniqueGuid,
        firstLba,
        lastLba,
        sectorCount,
        sizeBytes,
        formattedSize: formatBytes(sizeBytes),
        attributes,
        attributeFlags,
      });
    }
  }

  return {
    sectorSize,
    headerOffset,
    signature: 'EFI PART',
    revision: revisionStr,
    rawRevision: revision,
    headerSize,
    headerCrc32: storedHeaderCrc,
    computedHeaderCrc32: computedHeaderCrc,
    headerCrcMatch,
    reserved,
    currentLba,
    backupLba,
    firstUsableLba,
    lastUsableLba,
    diskGuid,
    partitionEntryLba,
    entryCount,
    entrySize,
    partitionArrayCrc32: storedArrayCrc,
    computedArrayCrc32: computedArrayCrc,
    arrayCrcMatch,
    hasFullEntryArray,
    partitions,
  };
}

/**
 * Generates a valid sample GPT binary (17408 bytes) with two partition entries.
 *
 * @returns {Uint8Array} Sample GPT byte array.
 */
export function createSampleGptBytes() {
  const bytes = new Uint8Array(MAX_GPT_BYTES);
  const view = new DataView(bytes.buffer);

  // Sector 0 (0..511): Protective MBR signature at 510..511.
  bytes[510] = 0x55;
  bytes[511] = 0xAA;

  // Sector 1 (512..1023): GPT Header.
  // 0..7: 'EFI PART'
  const sig = [0x45, 0x46, 0x49, 0x20, 0x50, 0x41, 0x52, 0x54];
  sig.forEach((b, idx) => { bytes[512 + idx] = b; });

  // 8..11: Revision 1.0 (0x00010000)
  view.setUint32(512 + 8, 0x00010000, true);
  // 12..15: Header size (92 bytes)
  view.setUint32(512 + 12, 92, true);
  // 16..19: Header CRC (filled later)
  view.setUint32(512 + 16, 0, true);
  // 20..23: Reserved
  view.setUint32(512 + 20, 0, true);
  // 24..31: Current LBA (1)
  view.setBigUint64(512 + 24, 1n, true);
  // 32..39: Backup LBA (204799)
  view.setBigUint64(512 + 32, 204799n, true);
  // 40..47: First usable LBA (34)
  view.setBigUint64(512 + 40, 34n, true);
  // 48..55: Last usable LBA (204766)
  view.setBigUint64(512 + 48, 204766n, true);

  // 56..71: Disk GUID (A1B2C3D4-E5F6-7890-1234-56789ABCDEF0)
  const diskGuidBytes = [
    0xD4, 0xC3, 0xB2, 0xA1, 0xF6, 0xE5, 0x90, 0x78,
    0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
  ];
  diskGuidBytes.forEach((b, idx) => { bytes[512 + 56 + idx] = b; });

  // 72..79: Partition entry starting LBA (2)
  view.setBigUint64(512 + 72, 2n, true);
  // 80..83: Number of partition entries (128)
  view.setUint32(512 + 80, 128, true);
  // 84..87: Size of partition entry (128)
  view.setUint32(512 + 84, 128, true);

  // Partition Entry 1 at offset 1024: EFI System Partition
  // Type GUID: C12A7328-F81F-11D2-BA4B-00A0C93EC93B
  const espGuid = [
    0x28, 0x73, 0x2A, 0xC1, 0x1F, 0xF8, 0xD2, 0x11,
    0xBA, 0x4B, 0x00, 0xA0, 0xC9, 0x3E, 0xC9, 0x3B,
  ];
  espGuid.forEach((b, idx) => { bytes[1024 + idx] = b; });

  // Unique GUID: 6B29FC40-CA47-1067-B31D-00DD010662DA
  const part1Guid = [
    0x40, 0xFC, 0x29, 0x6B, 0x47, 0xCA, 0x67, 0x10,
    0xB3, 0x1D, 0x00, 0xDD, 0x01, 0x06, 0x62, 0xDA,
  ];
  part1Guid.forEach((b, idx) => { bytes[1024 + 16 + idx] = b; });
  // First LBA (2048)
  view.setBigUint64(1024 + 32, 2048n, true);
  // Last LBA (102399)
  view.setBigUint64(1024 + 40, 102399n, true);
  // Attributes: System Partition bit 0 set
  view.setBigUint64(1024 + 48, 1n, true);
  // Name: "EFI System"
  const name1 = 'EFI System';
  for (let c = 0; c < name1.length; c++) {
    view.setUint16(1024 + 56 + c * 2, name1.charCodeAt(c), true);
  }

  // Partition Entry 2 at offset 1152: Microsoft Basic Data
  // Type GUID: EBD0A0A2-B9E5-4433-87C0-68B6B72699C7
  const basicDataGuid = [
    0xA2, 0xA0, 0xD0, 0xEB, 0xE5, 0xB9, 0x33, 0x44,
    0x87, 0xC0, 0x68, 0xB6, 0xB7, 0x26, 0x99, 0xC7,
  ];
  basicDataGuid.forEach((b, idx) => { bytes[1152 + idx] = b; });
  // Unique GUID: EBD0A0A2-1111-2222-3333-444455556666
  const part2Guid = [
    0xA2, 0xA0, 0xD0, 0xEB, 0x11, 0x11, 0x22, 0x22,
    0x33, 0x33, 0x44, 0x44, 0x55, 0x55, 0x66, 0x66,
  ];
  part2Guid.forEach((b, idx) => { bytes[1152 + 16 + idx] = b; });
  // First LBA (102400)
  view.setBigUint64(1152 + 32, 102400n, true);
  // Last LBA (204766)
  view.setBigUint64(1152 + 40, 204766n, true);
  // Attributes: 0
  view.setBigUint64(1152 + 48, 0n, true);
  // Name: "Basic Data"
  const name2 = 'Basic Data';
  for (let c = 0; c < name2.length; c++) {
    view.setUint16(1152 + 56 + c * 2, name2.charCodeAt(c), true);
  }

  // Compute Partition Array CRC32 (128 entries * 128 bytes = 16384 bytes from offset 1024)
  const arrayBytes = bytes.subarray(1024, 1024 + 16384);
  const arrayCrc = crc32(arrayBytes);
  view.setUint32(512 + 88, arrayCrc, true);

  // Compute Header CRC32 (92 bytes from offset 512, with bytes 16..19 zeroed out)
  view.setUint32(512 + 16, 0, true);
  const headerBytes = bytes.subarray(512, 512 + 92);
  const headerCrc = crc32(headerBytes);
  view.setUint32(512 + 16, headerCrc, true);

  return bytes;
}
