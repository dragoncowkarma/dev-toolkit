import { describe, expect, it } from 'vitest';
import {
  HEADER_SLICE_SIZE,
  MIN_HEADER_SIZE,
  detectSizeClass,
  findHeaderOffset,
  formatFileSize,
  parseJaguarRomHeader,
  readFileHeader,
} from './atari-jaguar-rom-header-inspector.utils.js';

function createValidHeaderBuffer({
  marker = 'ATARI APPROVED DATA HEADER ATRI!',
  bootAddress = 0x00802000,
  romSize = 0x00200000,
  offset = 0,
  totalSize = 1024,
} = {}) {
  const buf = new Uint8Array(totalSize);
  for (let i = 0; i < marker.length; i++) {
    buf[offset + i] = marker.charCodeAt(i);
  }
  buf[offset + 32] = (bootAddress >>> 24) & 0xff;
  buf[offset + 33] = (bootAddress >>> 16) & 0xff;
  buf[offset + 34] = (bootAddress >>> 8) & 0xff;
  buf[offset + 35] = bootAddress & 0xff;

  buf[offset + 36] = (romSize >>> 24) & 0xff;
  buf[offset + 37] = (romSize >>> 16) & 0xff;
  buf[offset + 38] = (romSize >>> 8) & 0xff;
  buf[offset + 39] = romSize & 0xff;

  return buf;
}

describe('parseJaguarRomHeader', () => {
  it('parses a valid header with standard exclamation marker', () => {
    const bytes = createValidHeaderBuffer({
      bootAddress: 0x00802000,
      romSize: 2097152,
    });

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.markerPresent).toBe(true);
    expect(result.marker).toBe('ATARI APPROVED DATA HEADER ATRI!');
    expect(result.bootAddress).toBe(0x00802000);
    expect(result.bootAddressHex).toBe('0x00802000');
    expect(result.romSizeField).toBe(2097152);
    expect(result.romSizeFormatted).toBe('2,097,152 bytes');
    expect(result.sizeClass).toBe('2 MB');
  });

  it('parses a valid header with space-terminated marker', () => {
    const bytes = createValidHeaderBuffer({
      marker: 'ATARI APPROVED DATA HEADER ATRI ',
      bootAddress: 0x00800000,
      romSize: 4194304,
    });

    const result = parseJaguarRomHeader(bytes, 4194304);

    expect(result.markerPresent).toBe(true);
    expect(result.bootAddressHex).toBe('0x00800000');
    expect(result.romSizeField).toBe(4194304);
    expect(result.sizeClass).toBe('4 MB');
  });

  it('parses a valid header located at an offset in the sector', () => {
    const bytes = createValidHeaderBuffer({
      offset: 0x42,
      bootAddress: 0x00004000,
      romSize: 1048576,
    });

    const result = parseJaguarRomHeader(bytes, 1048576);

    expect(result.markerPresent).toBe(true);
    expect(result.bootAddressHex).toBe('0x00004000');
    expect(result.romSizeField).toBe(1048576);
    expect(result.sizeClass).toBe('1 MB');
  });

  it('parses a byte-swapped header', () => {
    const normal = createValidHeaderBuffer({
      marker: 'ATARI APPROVED DATA HEADER ATRI!',
      bootAddress: 0x00802000,
      romSize: 2097152,
    });
    const swapped = new Uint8Array(normal.length);
    for (let i = 0; i < normal.length; i += 2) {
      swapped[i] = normal[i + 1];
      swapped[i + 1] = normal[i];
    }

    const result = parseJaguarRomHeader(swapped, 2097152);

    expect(result.markerPresent).toBe(true);
    expect(result.bootAddressHex).toBe('0x00802000');
    expect(result.romSizeField).toBe(2097152);
    expect(result.sizeClass).toBe('2 MB');
  });

  it('handles a missing marker by reporting unknown values without throwing', () => {
    const bytes = new Uint8Array(1024);

    const result = parseJaguarRomHeader(bytes, 1024);

    expect(result.markerPresent).toBe(false);
    expect(result.marker).toBe('Unknown');
    expect(result.bootAddress).toBeNull();
    expect(result.bootAddressHex).toBe('Unknown');
    expect(result.romSizeField).toBeNull();
    expect(result.romSizeFormatted).toBe('Unknown');
    expect(result.sizeClass).toBe('Unknown');
  });

  it('detects ROM size class from file size when marker is missing', () => {
    const bytes = new Uint8Array(1024);

    const result = parseJaguarRomHeader(bytes, 2097152);

    expect(result.markerPresent).toBe(false);
    expect(result.marker).toBe('Unknown');
    expect(result.sizeClass).toBe('2 MB');
  });

  it('reports truncated file when header bytes are below minimum size', () => {
    const truncated = new Uint8Array(20);
    expect(() => parseJaguarRomHeader(truncated)).toThrow(/truncated/i);
  });

  it('reports truncated file when buffer is empty', () => {
    const empty = new Uint8Array(0);
    expect(() => parseJaguarRomHeader(empty)).toThrow(/truncated/i);
  });

  it('reports truncated file when fileSize is smaller than minimum header size', () => {
    const bytes = new Uint8Array(40);
    expect(() => parseJaguarRomHeader(bytes, 30)).toThrow(/truncated/i);
  });

  it('reports truncated file when marker offset leaves insufficient bytes for fields', () => {
    const buf = new Uint8Array(50);
    const marker = 'ATARI APPROVED DATA HEADER ATRI!';
    for (let i = 0; i < marker.length; i++) {
      buf[15 + i] = marker.charCodeAt(i);
    }
    expect(() => parseJaguarRomHeader(buf)).toThrow(/truncated/i);
  });

  it('shows unknown for zero or invalid boot address and ROM size', () => {
    const bytes = createValidHeaderBuffer({
      bootAddress: 0,
      romSize: 0,
    });

    const result = parseJaguarRomHeader(bytes);

    expect(result.markerPresent).toBe(true);
    expect(result.bootAddress).toBeNull();
    expect(result.bootAddressHex).toBe('Unknown');
    expect(result.romSizeField).toBeNull();
    expect(result.romSizeFormatted).toBe('Unknown');
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
  it('reads only the first 1024 bytes from a larger blob', async () => {
    const largeData = new Uint8Array(5000);
    largeData[0] = 0xaa;
    largeData[1023] = 0xbb;
    largeData[1024] = 0xcc;
    const blob = new Blob([largeData]);

    const headerBytes = await readFileHeader(blob);

    expect(headerBytes.length).toBe(HEADER_SLICE_SIZE);
    expect(headerBytes[0]).toBe(0xaa);
    expect(headerBytes[1023]).toBe(0xbb);
  });

  it('throws an error if no file is provided', async () => {
    await expect(readFileHeader(null)).rejects.toThrow('No file provided.');
  });
});
