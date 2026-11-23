/**
 * VDI (VirtualBox Disk Image) header parsing utilities.
 * Pure logic with zero React/DOM dependencies.
 */

export const VDI_SIGNATURE = 0xbeda107f;
export const MIN_HEADER_SIZE = 456; // Up through uuid_parent (0x1B8 + 16 = 0x1C8 = 456 bytes)

export const IMAGE_TYPE_NAMES = {
  1: 'dynamic',
  2: 'fixed',
  3: 'undo',
  4: 'differencing',
};

/**
 * Formats a 16-byte UUID from DataView at the given byte offset according to
 * VirtualBox / COM layout.
 * The first 32-bit (time_low) and next two 16-bit fields (time_mid, time_hi_and_version)
 * are stored little-endian in VDI, while the clock sequence and node bytes are sequential.
 *
 * @param {DataView} view
 * @param {number} offset
 * @returns {string}
 */
export function formatUuid(view, offset) {
  const p1 = view.getUint32(offset, true).toString(16).padStart(8, '0');
  const p2 = view.getUint16(offset + 4, true).toString(16).padStart(4, '0');
  const p3 = view.getUint16(offset + 6, true).toString(16).padStart(4, '0');
  const b8 = view.getUint8(offset + 8).toString(16).padStart(2, '0');
  const b9 = view.getUint8(offset + 9).toString(16).padStart(2, '0');
  const p4 = `${b8}${b9}`;
  let p5 = '';
  for (let i = 10; i < 16; i += 1) {
    p5 += view.getUint8(offset + i).toString(16).padStart(2, '0');
  }
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

/**
 * Formats a byte number into a human-readable size string.
 *
 * @param {number|bigint} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  const num = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (!Number.isFinite(num) || num < 0) return '0 B';
  if (num < 1024) return `${num} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let val = num / 1024;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(2)} ${units[idx]}`;
}

/**
 * Parses raw hex text into a Uint8Array.
 * Tolerates whitespace, colons, commas, hyphens, and optional "0x" prefixes.
 * Rejects invalid non-hex characters and odd-length hex sequences.
 *
 * @param {string} hexStr
 * @returns {{ ok: true, data: Uint8Array } | { ok: false, error: string }}
 */
export function parseHexBytes(hexStr) {
  if (typeof hexStr !== 'string') {
    return { ok: false, error: 'Input must be a string of hexadecimal bytes.' };
  }
  const trimmed = hexStr.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Input is empty.' };
  }

  // Strip 0x prefixes
  const noPrefix = trimmed.replace(/\b0x/gi, '');

  // Check for invalid characters (anything not hex digits or allowed delimiters)
  const invalidMatch = noPrefix.match(/[^0-9a-fA-F\s,:-]/);
  if (invalidMatch) {
    return {
      ok: false,
      error: `Invalid character "${invalidMatch[0]}" in hexadecimal input.`,
    };
  }

  const cleaned = noPrefix.replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length === 0) {
    return { ok: false, error: 'No hex characters found in input.' };
  }
  if (cleaned.length % 2 !== 0) {
    return { ok: false, error: 'Hex string has an odd number of characters (incomplete byte).' };
  }

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
  }

  return { ok: true, data: bytes };
}

/**
 * Formats an ArrayBuffer or Uint8Array into a hex dump view (offset, hex, ASCII).
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {number} [maxBytes=512]
 * @returns {string}
 */
export function formatHexDump(buffer, maxBytes = 512) {
  const bytes = buffer instanceof Uint8Array
    ? buffer.subarray(0, maxBytes)
    : new Uint8Array(buffer, 0, Math.min(buffer.byteLength, maxBytes));

  const lines = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.subarray(offset, Math.min(offset + 16, bytes.length));
    const hexParts = [];
    let asciiPart = '';

    for (let i = 0; i < 16; i += 1) {
      if (i < chunk.length) {
        const b = chunk[i];
        hexParts.push(b.toString(16).padStart(2, '0'));
        asciiPart += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
      } else {
        hexParts.push('  ');
      }
    }

    const firstHalf = hexParts.slice(0, 8).join(' ');
    const secondHalf = hexParts.slice(8, 16).join(' ');
    const offsetStr = offset.toString(16).padStart(8, '0');
    lines.push(`${offsetStr}  ${firstHalf}  ${secondHalf}  |${asciiPart}|`);
  }

  return lines.join('\n');
}

/**
 * Parses a VirtualBox VDI image header.
 * Validates pre-header text and signature, decoding all standard fields.
 * Never throws; returns { ok: false, error } on invalid signature or truncated buffer.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ ok: true, header: object } | { ok: false, error: string }}
 */
export function parseVdiHeader(input) {
  if (!input || !(input instanceof ArrayBuffer || ArrayBuffer.isView(input))) {
    return { ok: false, error: 'Invalid input: expected an ArrayBuffer or Uint8Array.' };
  }

  const byteLength = input.byteLength;
  const buffer = input instanceof ArrayBuffer ? input : input.buffer;
  const byteOffset = input.byteOffset || 0;

  // Must have at least 68 bytes (0x44) to inspect pre-header and signature
  if (byteLength < 0x44) {
    return {
      ok: false,
      error: `Truncated buffer: got ${byteLength} bytes, ` +
        'expected at least 68 bytes for VDI signature.',
    };
  }

  const view = new DataView(buffer, byteOffset, byteLength);

  // 1. Pre-header text validation (0x00..0x3F, 64 bytes)
  const preHeaderBytes = new Uint8Array(buffer, byteOffset, 64);
  const rawPreText = new TextDecoder('latin1').decode(preHeaderBytes);
  const nullTermIdx = rawPreText.indexOf('\0');
  const preHeaderText = (nullTermIdx >= 0 ? rawPreText.slice(0, nullTermIdx) : rawPreText).trim();

  if (!preHeaderText.startsWith('<<<') || !preHeaderText.includes('>>>')) {
    return {
      ok: false,
      error: 'Invalid pre-header text: ' +
        'expected VDI banner beginning with "<<<" and containing ">>>".',
    };
  }

  // 2. Image signature check at offset 0x40 (little-endian: 0xBEDA107F)
  const signature = view.getUint32(0x40, true);
  if (signature !== VDI_SIGNATURE) {
    const foundHex = `0x${signature.toString(16).toUpperCase().padStart(8, '0')}`;
    return {
      ok: false,
      error: `Invalid VDI image signature: expected 0xBEDA107F, found ${foundHex}.`,
    };
  }

  // 3. Header fields bounds check (up to uuid_parent requires 456 bytes = 0x1C8)
  if (byteLength < MIN_HEADER_SIZE) {
    return {
      ok: false,
      error: `Truncated buffer: got ${byteLength} bytes, ` +
        `expected at least ${MIN_HEADER_SIZE} bytes for complete VDI header fields.`,
    };
  }

  // Version: Major (high 16 bits), Minor (low 16 bits)
  const rawVersion = view.getUint32(0x44, true);
  const versionMajor = rawVersion >> 16;
  const versionMinor = rawVersion & 0xffff;
  const version = `${versionMajor}.${versionMinor}`;

  // Header size (bytes)
  const headerSize = view.getUint32(0x48, true);

  // Image type: 1 = dynamic, 2 = fixed, 3 = differencing; raw preserved if unknown
  const imageTypeRaw = view.getUint32(0x4C, true);
  const imageType = IMAGE_TYPE_NAMES[imageTypeRaw] || `unknown (raw: ${imageTypeRaw})`;

  // Image flags
  const imageFlags = view.getUint32(0x50, true);

  // Description comment (256 bytes starting at 0x54)
  const descBytes = new Uint8Array(buffer, byteOffset + 0x54, 256);
  const descNullIdx = descBytes.indexOf(0);
  const descSlice = descNullIdx >= 0 ? descBytes.subarray(0, descNullIdx) : descBytes;
  const description = new TextDecoder('utf-8').decode(descSlice);

  // Block map and data offsets
  const offsetBlocks = view.getUint32(0x154, true);
  const offsetData = view.getUint32(0x158, true);

  // Disk geometry
  const cylinders = view.getUint32(0x15C, true);
  const heads = view.getUint32(0x160, true);
  const sectors = view.getUint32(0x164, true);
  const sectorSize = view.getUint32(0x168, true);

  // Disk size (64-bit uint)
  const diskSizeBytes = view.getBigUint64(0x170, true);

  // Block properties
  const blockSize = view.getUint32(0x178, true);
  const blockExtraData = view.getUint32(0x17C, true);
  const blocksCount = view.getUint32(0x180, true);
  const blocksAllocated = view.getUint32(0x184, true);

  // UUIDs
  const uuidImage = formatUuid(view, 0x188);
  const uuidLastSnapshot = formatUuid(view, 0x198);
  const uuidLink = formatUuid(view, 0x1A8);
  const uuidParent = formatUuid(view, 0x1B8);

  return {
    ok: true,
    header: {
      preHeaderText,
      signature: `0x${signature.toString(16).toUpperCase().padStart(8, '0')}`,
      version,
      versionMajor,
      versionMinor,
      headerSize,
      imageType,
      imageTypeRaw,
      imageFlags: `0x${imageFlags.toString(16).toUpperCase().padStart(8, '0')}`,
      imageFlagsRaw: imageFlags,
      description,
      offsetBlocks,
      offsetData,
      geometry: {
        cylinders,
        heads,
        sectors,
        sectorSize,
      },
      diskSizeBytes: diskSizeBytes.toString(),
      diskSizeFormatted: formatFileSize(diskSizeBytes),
      blockSize,
      blockSizeFormatted: formatFileSize(blockSize),
      blockExtraData,
      blocksCount,
      blocksAllocated,
      uuidImage,
      uuidLastSnapshot,
      uuidLink,
      uuidParent,
    },
  };
}

/**
 * Creates a synthetic VDI header buffer for testing or demo purposes.
 *
 * @param {object} [options={}]
 * @returns {ArrayBuffer}
 */
export function createSampleVdiHeader(options = {}) {
  const {
    preHeaderText = '<<< Oracle VM VirtualBox Disk Image >>>\n',
    signature = VDI_SIGNATURE,
    major = 1,
    minor = 1,
    headerSize = 512,
    imageType = 1, // 1 = dynamic, 2 = fixed, 3 = undo, 4 = differencing
    imageFlags = 0,
    description = 'VirtualBox VDI Test Disk',
    offsetBlocks = 512,
    offsetData = 1048576,
    cylinders = 1024,
    heads = 16,
    sectors = 63,
    sectorSize = 512,
    diskSize = 10737418240n, // 10 GB
    blockSize = 1048576, // 1 MB
    blockExtra = 0,
    blocksCount = 10240,
    blocksAllocated = imageType === 2 ? 10240 : 128,
    uuidImage = [
      0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
    ],
    uuidLastSnap = [
      0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
      0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
    ],
    uuidLink = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    uuidParent = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  } = options;

  const buffer = new ArrayBuffer(512);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Pre-header text
  const textBytes = new TextEncoder().encode(preHeaderText);
  bytes.set(textBytes.subarray(0, 64), 0);

  // Signature (0x40)
  view.setUint32(0x40, signature, true);

  // Version (0x44): major << 16 | minor
  const versionVal = (major << 16) | (minor & 0xffff);
  view.setUint32(0x44, versionVal, true);

  // Header size (0x48)
  view.setUint32(0x48, headerSize, true);

  // Image type (0x4C)
  view.setUint32(0x4C, imageType, true);

  // Image flags (0x50)
  view.setUint32(0x50, imageFlags, true);

  // Description (0x54, 256 bytes)
  const descBytes = new TextEncoder().encode(description);
  bytes.set(descBytes.subarray(0, 256), 0x54);

  // Offsets (0x154, 0x158)
  view.setUint32(0x154, offsetBlocks, true);
  view.setUint32(0x158, offsetData, true);

  // Geometry (0x15C, 0x160, 0x164, 0x168)
  view.setUint32(0x15C, cylinders, true);
  view.setUint32(0x160, heads, true);
  view.setUint32(0x164, sectors, true);
  view.setUint32(0x168, sectorSize, true);

  // Disk size (0x170, 8 bytes)
  view.setBigUint64(0x170, BigInt(diskSize), true);

  // Block properties (0x178, 0x17C, 0x180, 0x184)
  view.setUint32(0x178, blockSize, true);
  view.setUint32(0x17C, blockExtra, true);
  view.setUint32(0x180, blocksCount, true);
  view.setUint32(0x184, blocksAllocated, true);

  // UUIDs (0x188, 0x198, 0x1A8, 0x1B8)
  bytes.set(uuidImage, 0x188);
  bytes.set(uuidLastSnap, 0x198);
  bytes.set(uuidLink, 0x1A8);
  bytes.set(uuidParent, 0x1B8);

  return buffer;
}
