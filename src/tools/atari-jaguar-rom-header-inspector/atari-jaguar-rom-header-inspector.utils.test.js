import { describe, expect, it } from 'vitest';
import {
  CART_ROM_BASE,
  CART_ROM_END,
  CART_START_OFFSET,
  COPIER_HEADER_SIZE,
  HEADER_SLICE_SIZE,
  MARKER_BOOT_TRACK,
  MARKER_TRACK_2,
  MIN_HEADER_SIZE,
  detectSizeClass,
  extractCartridgeStartAddress,
  findHeaderOffset,
  formatFileSize,
  isValidCartridgeAddress,
  parseJaguarRomHeader,
  readFileHeader,
} from './atari-jaguar-rom-header-inspector.utils.js';

function createCartridgeRomBuffer({
  bootAddress = 0x00802000,
  hasCopierHeader = false,
  swapped = false,
  totalSize = 2048,
} = {}) {
  const buf = new Uint8Array(totalSize);
  const baseOffset = hasCopierHeader ? COPIER_HEADER_SIZE : 0;
  const offset = baseOffset + CART_START_OFFSET;

  if (swapped) {
    buf[offset] = (bootAddress >>> 16) & 0xff;
    buf[offset + 1] = (bootAddress >>> 24) & 0xff;
    buf[offset + 2] = bootAddress & 0xff;
    buf[offset + 3] = (bootAddress >>> 8) & 0xff;
  } else {
    buf[offset] = (bootAddress >>> 24) & 0xff;
    buf[offset + 1] = (bootAddress >>> 16) & 0xff;
    buf[offset + 2] = (bootAddress >>> 8) & 0xff;
    buf[offset + 3] = bootAddress & 0xff;
  }

  return buf;
}

function createCdHeaderBuffer({
  marker = MARKER_TRACK_2,
  bootAddress = 0x00802000,
  bootCodeLength = 0x00010000,
  offset = 0,
  totalSize = 2048,
  swapped = false,
} = {}) {
  const buf = new Uint8Array(totalSize);
  for (let i = 0; i < marker.length; i++) {
    buf[offset + i] = marker.charCodeAt(i);
  }
  buf[offset + 32] = (bootAddress >>> 24) & 0xff;
  buf[offset + 33] = (bootAddress >>> 16) & 0xff;
  buf[offset + 34] = (bootAddress >>> 8) & 0xff;
  buf[offset + 35] = bootAddress & 0xff;

  buf[offset + 36] = (bootCodeLength >>> 24) & 0xff;
  buf[offset + 37] = (bootCodeLength >>> 16) & 0xff;
  buf[offset + 38] = (bootCodeLength >>> 8) & 0xff;
  buf[offset + 39] = bootCodeLength & 0xff;

  if (swapped) {
    const swappedBuf = new Uint8Array(buf.length);
    for (let i = 0; i < buf.length; i += 2) {
      swappedBuf[i] = buf[i + 1];
      swappedBuf[i + 1] = buf[i];
    }
    return swappedBuf;
  }

  return buf;
}

describe('findHeaderOffset', () => {
  it('identifies standard exclamation marker (track 2)', () => {
    const bytes = new Uint8Array(100);
    for (let i = 0; i < MARKER_TRACK_2.length; i++) {
      bytes[10 + i] = MARKER_TRACK_2.charCodeAt(i);
    }
    const match = findHeaderOffset(bytes);
    expect(match).not.toBeNull();
    expect(match.offset).toBe(10);
    expect(match.swapped).toBe(false);
    expect(match.marker).toBe(MARKER_TRACK_2);
  });

  it('identifies standard space-terminated marker (boot track)', () => {
    const bytes = new Uint8Array(100);
    for (let i = 0; i < MARKER_BOOT_TRACK.length; i++) {
      bytes[20 + i] = MARKER_BOOT_TRACK.charCodeAt(i);
    }
    const match = findHeaderOffset(bytes);
    expect(match).not.toBeNull();
    expect(match.offset).toBe(20);
    expect(match.swapped).toBe(false);
    expect(match.marker).toBe(MARKER_BOOT_TRACK);
  });

  it('rejects invalid marker terminators like question mark', () => {
    const invalidMarker = 'ATARI APPROVED DATA HEADER ATRI?';
    const bytes = new Uint8Array(100);
    for (let i = 0; i < invalidMarker.length; i++) {
      bytes[i] = invalidMarker.charCodeAt(i);
    }
    expect(findHeaderOffset(bytes)).toBeNull();
  });

  it('handles competing matches where an invalid prefix precedes a valid marker', () => {
    const invalidPrefix = 'ATARI APPROVED DATA HEADER ATRI?';
    const bytes = new Uint8Array(200);
    for (let i = 0; i < invalidPrefix.length; i++) {
      bytes[10 + i] = invalidPrefix.charCodeAt(i);
    }
    for (let i = 0; i < MARKER_TRACK_2.length; i++) {
      bytes[80 + i] = MARKER_TRACK_2.charCodeAt(i);
    }
    const match = findHeaderOffset(bytes);
    expect(match).not.toBeNull();
    expect(match.offset).toBe(80);
    expect(match.marker).toBe(MARKER_TRACK_2);
  });

  it('identifies byte-swapped header markers', () => {
    const normal = new Uint8Array(100);
    for (let i = 0; i < MARKER_TRACK_2.length; i++) {
      normal[i] = MARKER_TRACK_2.charCodeAt(i);
    }
    const swapped = new Uint8Array(100);
    for (let i = 0; i < 100; i += 2) {
      swapped[i] = normal[i + 1];
      swapped[i + 1] = normal[i];
    }
    const match = findHeaderOffset(swapped);
    expect(match).not.toBeNull();
    expect(match.offset).toBe(0);
    expect(match.swapped).toBe(true);
    expect(match.marker).toBe(MARKER_TRACK_2);
  });

  it('returns null if bytes are below MIN_HEADER_SIZE', () => {
    const small = new Uint8Array(MIN_HEADER_SIZE - 1);
    expect(findHeaderOffset(small)).toBeNull();
  });
});

describe('parseJaguarRomHeader - Cartridge ROMs', () => {
  it('parses a representative retail cartridge ROM fixture (.j64)', () => {
    const bytes = createCartridgeRomBuffer({
      bootAddress: 0x00802000,
      totalSize: 2048,
    });

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.markerPresent).toBe(false);
    expect(result.marker).toBe('Unknown');
    expect(result.bootAddress).toBe(0x00802000);
    expect(result.bootAddressHex).toBe('0x00802000');
    expect(result.romSizeField).toBeNull();
    expect(result.romSizeFormatted).toBe('Unknown');
    expect(result.sizeClass).toBe('2 MB');
  });

  it('parses a word-swapped retail cartridge ROM fixture', () => {
    const bytes = createCartridgeRomBuffer({
      bootAddress: 0x00802000,
      swapped: true,
      totalSize: 2048,
    });

    const result = parseJaguarRomHeader(bytes, 4194304);

    expect(result.markerPresent).toBe(false);
    expect(result.bootAddress).toBe(0x00802000);
    expect(result.bootAddressHex).toBe('0x00802000');
    expect(result.sizeClass).toBe('4 MB');
  });

  it('parses a cartridge ROM with a 512-byte copier header (.jag)', () => {
    const bytes = createCartridgeRomBuffer({
      bootAddress: 0x00802000,
      hasCopierHeader: true,
      totalSize: 2048,
    });

    const result = parseJaguarRomHeader(bytes, 2097152 + 512);

    expect(result.markerPresent).toBe(false);
    expect(result.bootAddress).toBe(0x00802000);
    expect(result.bootAddressHex).toBe('0x00802000');
    expect(result.sizeClass).toBe('2 MB');
  });

  it('reports Unknown for boot address when cartridge offset 0x404 is empty', () => {
    const bytes = new Uint8Array(2048);

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.markerPresent).toBe(false);
    expect(result.bootAddress).toBeNull();
    expect(result.bootAddressHex).toBe('Unknown');
    expect(result.sizeClass).toBe('2 MB');
  });

  it('handles irregular file sizes without call stack overflow when raw address is zeroed', () => {
    // 2049-byte file with a zeroed 2048-byte header
    const bytes = new Uint8Array(2048);

    const result = parseJaguarRomHeader(bytes, 2049);

    expect(result.markerPresent).toBe(false);
    expect(result.bootAddress).toBeNull();
    expect(result.bootAddressHex).toBe('Unknown');
    expect(result.sizeClass).toBe('Unknown');
  });

  it('handles irregular file sizes without stack overflow when raw address is 0xffffffff', () => {
    const bytes = new Uint8Array(2048);
    bytes.fill(0xff, CART_START_OFFSET, CART_START_OFFSET + 4);

    const result = parseJaguarRomHeader(bytes, 2049);

    expect(result.markerPresent).toBe(false);
    expect(result.bootAddress).toBeNull();
    expect(result.bootAddressHex).toBe('Unknown');
  });

  it('detects copier header on irregular file sizes when offset 0x404 is absent', () => {
    // 2049-byte file with absent raw address at 0x404 but valid copier address at 512 + 0x404
    const bytes = createCartridgeRomBuffer({
      bootAddress: 0x00802000,
      hasCopierHeader: true,
      totalSize: 2048,
    });
    // Ensure raw offset 0x404 is zeroed
    bytes.fill(0, CART_START_OFFSET, CART_START_OFFSET + 4);

    const result = parseJaguarRomHeader(bytes, 2049);

    expect(result.markerPresent).toBe(false);
    expect(result.bootAddress).toBe(0x00802000);
    expect(result.bootAddressHex).toBe('0x00802000');
  });

  it('reads cartridge start address from copier-header offset in standard copier-sized ROM ' +
    'when raw offset is zeroed', () => {
    const bytes = createCartridgeRomBuffer({
      bootAddress: 0x00802000,
      hasCopierHeader: true,
      totalSize: 2048,
    });
    bytes.fill(0, CART_START_OFFSET, CART_START_OFFSET + 4);

    const result = parseJaguarRomHeader(bytes, 2097152 + 512);

    expect(result.bootAddress).toBe(0x00802000);
    expect(result.bootAddressHex).toBe('0x00802000');
  });

  it('does not fall back to copier offset for raw-sized image when actual 0x404 is zeroed ' +
    'and 0x604 has plausible address', () => {
    const bytes = new Uint8Array(2048);
    const copierOffset = COPIER_HEADER_SIZE + CART_START_OFFSET;
    bytes[copierOffset] = 0x00;
    bytes[copierOffset + 1] = 0x80;
    bytes[copierOffset + 2] = 0x20;
    bytes[copierOffset + 3] = 0x00;

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.bootAddress).toBeNull();
    expect(result.bootAddressHex).toBe('Unknown');
  });

  it('does not fall back to raw offset for copier-sized image when actual copier offset ' +
    '0x604 is zeroed and 0x404 has plausible address', () => {
    const bytes = new Uint8Array(2048);
    bytes[CART_START_OFFSET] = 0x00;
    bytes[CART_START_OFFSET + 1] = 0x80;
    bytes[CART_START_OFFSET + 2] = 0x20;
    bytes[CART_START_OFFSET + 3] = 0x00;

    const result = parseJaguarRomHeader(bytes, 2097152 + 512);

    expect(result.bootAddress).toBeNull();
    expect(result.bootAddressHex).toBe('Unknown');
  });

  it('rejects invalid raw start address (e.g. byte 0x407 = 1 resulting in 0x00000001)', () => {
    const bytes = new Uint8Array(2048);
    bytes[CART_START_OFFSET + 3] = 0x01; // raw = 0x00000001

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.bootAddress).toBeNull();
    expect(result.bootAddressHex).toBe('Unknown');
  });

  it('rejects invalid raw start address exceeding the cartridge ROM size', () => {
    // 2 MB cartridge (range 0x00800000 - 0x009FFFFF), address at 0x00A50000
    const bytes = createCartridgeRomBuffer({
      bootAddress: 0x00a50000,
      totalSize: 2048,
    });

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.bootAddress).toBeNull();
    expect(result.bootAddressHex).toBe('Unknown');
  });

  it('rejects word-swapped address when neither byte order is a valid cartridge address', () => {
    const bytes = new Uint8Array(2048);
    // raw = 0x01000000, swapped = 0x00010000 (neither is in cartridge ROM space)
    bytes[CART_START_OFFSET] = 0x01;
    bytes[CART_START_OFFSET + 1] = 0x00;
    bytes[CART_START_OFFSET + 2] = 0x00;
    bytes[CART_START_OFFSET + 3] = 0x00;

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.bootAddress).toBeNull();
    expect(result.bootAddressHex).toBe('Unknown');
  });

  it('rejects word-swapped address exceeding the cartridge ROM size', () => {
    // Word-swapped 0x00A50000 for a 2 MB cartridge
    const bytes = createCartridgeRomBuffer({
      bootAddress: 0x00a50000,
      swapped: true,
      totalSize: 2048,
    });

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.bootAddress).toBeNull();
    expect(result.bootAddressHex).toBe('Unknown');
  });
});

describe('parseJaguarRomHeader - CD boot-tracks', () => {
  it('parses a CD track 2 header with exclamation terminator', () => {
    const bytes = createCdHeaderBuffer({
      marker: MARKER_TRACK_2,
      bootAddress: 0x00802000,
      bootCodeLength: 0x00010000,
    });

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.markerPresent).toBe(true);
    expect(result.marker).toBe(MARKER_TRACK_2);
    expect(result.bootAddress).toBe(0x00802000);
    expect(result.bootAddressHex).toBe('0x00802000');
    expect(result.romSizeField).toBeNull();
    expect(result.romSizeFormatted).toBe('Unknown');
    expect(result.sizeClass).toBe('2 MB');
  });

  it('parses a CD boot track header with space terminator', () => {
    const bytes = createCdHeaderBuffer({
      marker: MARKER_BOOT_TRACK,
      bootAddress: 0x00004000,
      bootCodeLength: 0x00008000,
    });

    const result = parseJaguarRomHeader(bytes, 1048576);

    expect(result.markerPresent).toBe(true);
    expect(result.marker).toBe(MARKER_BOOT_TRACK);
    expect(result.bootAddressHex).toBe('0x00004000');
    expect(result.romSizeField).toBeNull();
    expect(result.romSizeFormatted).toBe('Unknown');
    expect(result.sizeClass).toBe('1 MB');
  });

  it('parses a byte-swapped CD header', () => {
    const bytes = createCdHeaderBuffer({
      marker: MARKER_TRACK_2,
      bootAddress: 0x00802000,
      bootCodeLength: 0x00010000,
      swapped: true,
    });

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.markerPresent).toBe(true);
    expect(result.bootAddressHex).toBe('0x00802000');
    expect(result.romSizeField).toBeNull();
    expect(result.romSizeFormatted).toBe('Unknown');
    expect(result.sizeClass).toBe('2 MB');
  });

  it('ignores invalid terminator and matches subsequent real marker', () => {
    const bytes = new Uint8Array(200);
    const invalid = 'ATARI APPROVED DATA HEADER ATRI?';
    for (let i = 0; i < invalid.length; i++) {
      bytes[10 + i] = invalid.charCodeAt(i);
    }
    for (let i = 0; i < MARKER_TRACK_2.length; i++) {
      bytes[60 + i] = MARKER_TRACK_2.charCodeAt(i);
    }
    bytes[60 + 32] = 0x00;
    bytes[60 + 33] = 0x80;
    bytes[60 + 34] = 0x20;
    bytes[60 + 35] = 0x00;

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.markerPresent).toBe(true);
    expect(result.marker).toBe(MARKER_TRACK_2);
    expect(result.bootAddressHex).toBe('0x00802000');
  });
});

describe('parseJaguarRomHeader - Validation & Errors', () => {
  it('reports truncated file when header bytes are below MIN_HEADER_SIZE', () => {
    const truncated = new Uint8Array(MIN_HEADER_SIZE - 1);
    expect(() => parseJaguarRomHeader(truncated)).toThrow(/truncated/i);
  });

  it('reports truncated file when buffer is empty', () => {
    const empty = new Uint8Array(0);
    expect(() => parseJaguarRomHeader(empty)).toThrow(/truncated/i);
  });

  it('reports truncated file when fileSize is smaller than MIN_HEADER_SIZE', () => {
    const bytes = new Uint8Array(MIN_HEADER_SIZE);
    expect(() => parseJaguarRomHeader(bytes, MIN_HEADER_SIZE - 1)).toThrow(/truncated/i);
  });

  it('reports truncated file when marker offset leaves insufficient bytes for fields', () => {
    const buf = new Uint8Array(50);
    for (let i = 0; i < MARKER_TRACK_2.length; i++) {
      buf[15 + i] = MARKER_TRACK_2.charCodeAt(i);
    }
    expect(() => parseJaguarRomHeader(buf)).toThrow(/truncated/i);
  });
});

describe('detectSizeClass', () => {
  it('detects standard cartridge sizes from romSizeField', () => {
    expect(detectSizeClass(524288)).toBe('512 KB');
    expect(detectSizeClass(1048576)).toBe('1 MB');
    expect(detectSizeClass(2097152)).toBe('2 MB');
    expect(detectSizeClass(3145728)).toBe('3 MB');
    expect(detectSizeClass(4194304)).toBe('4 MB');
    expect(detectSizeClass(6291456)).toBe('6 MB');
    expect(detectSizeClass(8388608)).toBe('8 MB');
  });

  it('detects size class from copier-headered file size (+512 bytes)', () => {
    expect(detectSizeClass(null, 2097152 + 512)).toBe('2 MB');
    expect(detectSizeClass(null, 4194304 + 512)).toBe('4 MB');
  });

  it('returns Unknown for unrecognized size values', () => {
    expect(detectSizeClass(123456, 123456)).toBe('Unknown');
    expect(detectSizeClass(null, 0)).toBe('Unknown');
    expect(detectSizeClass(null, null)).toBe('Unknown');
  });
});

describe('formatFileSize', () => {
  it('formats bytes, KB, and MB', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(2097152)).toBe('2.0 MB');
    expect(formatFileSize(-1)).toBe('Unknown');
  });
});

describe('readFileHeader', () => {
  it('reads bounded header slice (HEADER_SLICE_SIZE) from a larger blob', async () => {
    const largeData = new Uint8Array(5000);
    largeData[0] = 0xaa;
    largeData[HEADER_SLICE_SIZE - 1] = 0xbb;
    largeData[HEADER_SLICE_SIZE] = 0xcc;
    const blob = new Blob([largeData]);

    const headerBytes = await readFileHeader(blob);

    expect(headerBytes.length).toBe(HEADER_SLICE_SIZE);
    expect(headerBytes[0]).toBe(0xaa);
    expect(headerBytes[HEADER_SLICE_SIZE - 1]).toBe(0xbb);
  });

  it('throws an error if no file is provided', async () => {
    await expect(readFileHeader(null)).rejects.toThrow('No file provided.');
  });
});

describe('isValidCartridgeAddress', () => {
  it('accepts standard cartridge boot addresses within range', () => {
    expect(isValidCartridgeAddress(0x00802000)).toBe(true);
    expect(isValidCartridgeAddress(CART_ROM_BASE)).toBe(true);
    expect(isValidCartridgeAddress(CART_ROM_END)).toBe(true);
  });

  it('validates against specific ROM sizes when provided', () => {
    // 2 MB cartridge (0x00800000 to 0x009FFFFF)
    expect(isValidCartridgeAddress(0x00802000, 2097152)).toBe(true);
    expect(isValidCartridgeAddress(0x009fffff, 2097152)).toBe(true);
    expect(isValidCartridgeAddress(0x00a00000, 2097152)).toBe(false);

    // 2 MB cartridge with 512-byte copier header
    expect(isValidCartridgeAddress(0x00802000, 2097152 + 512)).toBe(true);
    expect(isValidCartridgeAddress(0x00a00000, 2097152 + 512)).toBe(false);
  });

  it('rejects addresses below CART_ROM_BASE or above CART_ROM_END', () => {
    expect(isValidCartridgeAddress(0x00000001)).toBe(false);
    expect(isValidCartridgeAddress(0x00004000)).toBe(false);
    expect(isValidCartridgeAddress(0x007fffff)).toBe(false);
    expect(isValidCartridgeAddress(0x01000000)).toBe(false);
    expect(isValidCartridgeAddress(0xffffffff)).toBe(false);
    expect(isValidCartridgeAddress(0)).toBe(false);
    expect(isValidCartridgeAddress(-1)).toBe(false);
  });

  it('rejects invalid inputs such as non-numbers or non-integers', () => {
    expect(isValidCartridgeAddress(null)).toBe(false);
    expect(isValidCartridgeAddress(undefined)).toBe(false);
    expect(isValidCartridgeAddress(NaN)).toBe(false);
    expect(isValidCartridgeAddress(8396800.5)).toBe(false);
  });
});

describe('extractCartridgeStartAddress', () => {
  it('returns null when buffer is smaller than CART_START_OFFSET + 4', () => {
    const small = new Uint8Array(100);
    expect(extractCartridgeStartAddress(small)).toBeNull();
  });

  it('extracts valid address from raw dump offset 0x404', () => {
    const bytes = createCartridgeRomBuffer({ bootAddress: 0x00802000 });
    expect(extractCartridgeStartAddress(bytes, 2097152)).toBe(0x00802000);
  });

  it('extracts valid address from copier header offset 512 + 0x404', () => {
    const bytes = createCartridgeRomBuffer({
      bootAddress: 0x00802000,
      hasCopierHeader: true,
    });
    expect(extractCartridgeStartAddress(bytes, 2097152 + 512)).toBe(0x00802000);
  });

  it('probes copier header fallback at most once without recursion on irregular size', () => {
    const bytes = new Uint8Array(2048);
    // Irregular file size with zeroed header
    expect(extractCartridgeStartAddress(bytes, 2049)).toBeNull();
  });

  it('does not read copier offset for raw-sized image when 0x404 is zeroed and 0x604 ' +
    'has plausible address', () => {
    const bytes = new Uint8Array(2048);
    const copierOffset = COPIER_HEADER_SIZE + CART_START_OFFSET;
    bytes[copierOffset] = 0x00;
    bytes[copierOffset + 1] = 0x80;
    bytes[copierOffset + 2] = 0x20;
    bytes[copierOffset + 3] = 0x00;
    expect(extractCartridgeStartAddress(bytes, 2097152)).toBeNull();
  });

  it('does not read raw offset for copier-sized image when copier offset 0x604 is zeroed ' +
    'and 0x404 has plausible address', () => {
    const bytes = new Uint8Array(2048);
    bytes[CART_START_OFFSET] = 0x00;
    bytes[CART_START_OFFSET + 1] = 0x80;
    bytes[CART_START_OFFSET + 2] = 0x20;
    bytes[CART_START_OFFSET + 3] = 0x00;
    expect(extractCartridgeStartAddress(bytes, 2097152 + 512)).toBeNull();
  });
});
