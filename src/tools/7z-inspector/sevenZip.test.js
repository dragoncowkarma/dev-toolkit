import { describe, expect, it } from 'vitest';
import { formatCrc32, formatUint64, parse7zSignatureHeader } from './sevenZip.utils.js';

function createHeader({ offset = 0n, size = 0n, totalLength = 32 } = {}) {
  const buffer = new ArrayBuffer(totalLength);
  const bytes = new Uint8Array(buffer);
  bytes.set([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4]);
  const view = new DataView(buffer);
  view.setUint32(8, 0x12345678, true);
  view.setBigUint64(12, offset, true);
  view.setBigUint64(20, size, true);
  view.setUint32(28, 0x90abcdef, true);
  return buffer;
}

describe('parse7zSignatureHeader', () => {
  it('parses a valid signature header and its little-endian fields', () => {
    const buffer = createHeader({ offset: 8n, size: 16n, totalLength: 56 });
    const result = parse7zSignatureHeader(buffer);

    expect(result.is7z).toBe(true);
    expect(result.version).toBe('0.4');
    expect(result.startHeaderCrc).toBe(0x12345678);
    expect(result.nextHeaderOffset).toBe(8n);
    expect(result.nextHeaderSize).toBe(16n);
    expect(result.nextHeaderCrc).toBe(0x90abcdef);
    expect(result.nextHeaderFits).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('reports a next-header range that extends beyond the file', () => {
    const result = parse7zSignatureHeader(createHeader({ offset: 5n, size: 1n }));

    expect(result.is7z).toBe(true);
    expect(result.nextHeaderFits).toBe(false);
    expect(result.warnings).toContain('Next header range exceeds the actual file length.');
  });

  it('reports truncated fields without throwing', () => {
    const result = parse7zSignatureHeader(new Uint8Array([0x37, 0x7a, 0xbc]).buffer);

    expect(result.is7z).toBe(false);
    expect(result.version).toBeNull();
    expect(result.nextHeaderOffset).toBeNull();
    expect(result.nextHeaderFits).toBeNull();
    expect(result.warnings).toContain(
      'Signature is truncated: the 7z magic value requires 6 bytes.'
    );
  });

  it('distinguishes an invalid signature from a truncated file', () => {
    const result = parse7zSignatureHeader(new ArrayBuffer(32));

    expect(result.is7z).toBe(false);
    expect(result.warnings).toContain(
      'Invalid 7z signature: this file does not begin with the 7z magic bytes.'
    );
  });
});

describe('7z value formatting', () => {
  it('preserves full 64-bit values and formats CRC fields', () => {
    expect(formatUint64(18446744073709551615n)).toBe('18446744073709551615');
    expect(formatCrc32(0xabc)).toBe('0x00000ABC');
  });
});
