import { describe, expect, it } from 'vitest';
import { computeVhdFooterChecksum, parseVhdFooter } from './vhd-footer.utils.js';

function writeAscii(bytes, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function makeFooter({ diskType = 2 } = {}) {
  const bytes = new Uint8Array(512);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, 'conectix');
  view.setUint32(8, 2, false);
  view.setUint32(12, 0x00010000, false);
  view.setBigUint64(16, 0xffffffffffffffffn, false);
  view.setUint32(24, 86400, false);
  writeAscii(bytes, 28, 'TEST');
  view.setUint32(32, 0x00010002, false);
  writeAscii(bytes, 36, 'Wi2k');
  view.setBigUint64(40, 1073741824n, false);
  view.setBigUint64(48, 1073741824n, false);
  view.setUint16(56, 1024, false);
  bytes[58] = 16;
  bytes[59] = 63;
  view.setUint32(60, diskType, false);
  bytes.set(
    [
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
      0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
    ],
    68
  );
  bytes[84] = 1;
  view.setUint32(64, computeVhdFooterChecksum(bytes), false);
  return bytes;
}

describe('parseVhdFooter', () => {
  it('parses a valid fixed-disk footer', () => {
    const result = parseVhdFooter(makeFooter());

    expect(result.ok).toBe(true);
    expect(result.footer).toMatchObject({
      cookie: 'conectix',
      diskType: 'Fixed',
      checksumValid: true,
      timestampIso: '2000-01-02T00:00:00.000Z',
      uniqueId: '00112233-4455-6677-8899-aabbccddeeff',
    });
    expect(result.footer.originalSize).toBe(1073741824n);
  });

  it('uses the trailing footer from a valid dynamic-disk image', () => {
    const image = new Uint8Array(1024);
    image.set(makeFooter({ diskType: 3 }), 512);
    const result = parseVhdFooter(image);

    expect(result.ok).toBe(true);
    expect(result.footer.offset).toBe(512);
    expect(result.footer.diskType).toBe('Dynamic');
  });

  it('returns a clear error for an invalid cookie', () => {
    const footer = makeFooter();
    footer[0] = 0;

    expect(parseVhdFooter(footer)).toEqual({
      ok: false,
      error: 'Invalid VHD footer: expected the "conectix" cookie at byte 0.',
    });
  });

  it('returns a clear error for truncated input', () => {
    expect(parseVhdFooter(new Uint8Array(511))).toEqual({
      ok: false,
      error: 'VHD input is truncated: a footer requires at least 512 bytes.',
    });
  });

  it('detects a checksum mismatch', () => {
    const footer = makeFooter();
    footer[40] ^= 1;
    const result = parseVhdFooter(footer);

    expect(result.ok).toBe(true);
    expect(result.footer.checksumValid).toBe(false);
  });
});
