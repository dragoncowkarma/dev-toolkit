import { describe, expect, it } from 'vitest';
import { decodeBase64Bytes, parseKolyTrailer } from './dmgTrailer.utils.js';

function createTrailer() {
  const trailer = new Uint8Array(512);
  const view = new DataView(trailer.buffer);
  trailer.set([0x6b, 0x6f, 0x6c, 0x79]);
  view.setUint32(4, 4, false);
  view.setUint32(8, 512, false);
  view.setUint32(12, 0xa5, false);
  view.setBigUint64(24, 0n, false);
  view.setBigUint64(32, 1024n, false);
  view.setUint32(56, 0, false);
  view.setUint32(60, 1, false);
  view.setUint32(80, 1, false);
  view.setBigUint64(216, 1024n, false);
  view.setBigUint64(224, 64n, false);
  view.setUint32(352, 3, false);
  view.setUint32(488, 0, false);
  return trailer;
}

function metadataValue(result, label) {
  return result.metadata.find((item) => item.label === label)?.value;
}

describe('parseKolyTrailer', () => {
  it('parses a valid big-endian koly trailer', () => {
    const result = parseKolyTrailer(createTrailer(), 2048);

    expect(metadataValue(result, 'Signature')).toBe('koly');
    expect(metadataValue(result, 'Version')).toBe('4');
    expect(metadataValue(result, 'Flags')).toBe('0x000000a5');
    expect(metadataValue(result, 'Data fork length')).toBe('1024');
    expect(metadataValue(result, 'XML plist offset')).toBe('1024');
    expect(metadataValue(result, 'Data checksum type')).toBe('CRC-32 (1)');
    expect(metadataValue(result, 'Master checksum type')).toBe('SHA-1 (3)');
    expect(result.warnings).toEqual([]);
  });

  it('returns unavailable metadata and warnings for short or malformed input', () => {
    const shortResult = parseKolyTrailer(new Uint8Array(3));
    const malformed = createTrailer();
    malformed.set([0, 0, 0, 0], 0);
    const malformedResult = parseKolyTrailer(malformed, 512);

    expect(metadataValue(shortResult, 'Version')).toBe('Unavailable');
    expect(shortResult.warnings[0]).toMatch(/shorter/);
    expect(metadataValue(malformedResult, 'Signature')).toBe('Unavailable');
    expect(metadataValue(malformedResult, 'Version')).toBe('Unavailable');
    expect(malformedResult.warnings[0]).toMatch(/expected koly/);
  });

  it('warns for data and plist ranges outside the input without throwing', () => {
    const trailer = createTrailer();
    const result = parseKolyTrailer(trailer, 1000);

    expect(result.warnings).toContainEqual(expect.stringMatching(/Data fork range/));
    expect(result.warnings).toContainEqual(expect.stringMatching(/XML plist range/));
  });
});

describe('decodeBase64Bytes', () => {
  it('decodes Base64 trailer bytes for inspection', () => {
    const trailer = createTrailer();
    const base64 = btoa(String.fromCharCode(...trailer));
    const decoded = decodeBase64Bytes(base64);
    const result = parseKolyTrailer(decoded.bytes, decoded.bytes.length);

    expect(decoded.error).toBe('');
    expect(metadataValue(result, 'Signature')).toBe('koly');
  });

  it('reports malformed Base64 without throwing', () => {
    expect(decodeBase64Bytes('not Base64!').error).toMatch(/malformed/);
  });
});
