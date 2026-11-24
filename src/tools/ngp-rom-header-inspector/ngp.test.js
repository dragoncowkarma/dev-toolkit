import { describe, expect, it } from 'vitest';
import { parseNgpHeader } from './ngp.utils.js';

function header(license, mode) {
  const bytes = new Uint8Array(64);
  bytes.set(new TextEncoder().encode(license), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(28, 0x12345678, true);
  view.setUint16(32, 0xabcd, true);
  bytes[34] = 2;
  bytes[35] = mode;
  bytes.set(new TextEncoder().encode('  GAME  '), 36);
  return bytes.buffer;
}

describe('parseNgpHeader', () => {
  it('parses a monochrome header and little-endian numeric fields', () => {
    expect(parseNgpHeader(header('COPYRIGHT BY SNK CORPORATION', 0))).toEqual({
      license: 'COPYRIGHT BY SNK CORPORATION',
      startupAddress: '0x12345678',
      softwareId: '0xABCD',
      version: '0x02',
      colorMode: 'Monochrome NGP',
      title: 'GAME',
    });
  });

  it('recognizes an NGPC header and the licensed signature', () => {
    const result = parseNgpHeader(header('LICENSED BY SNK CORPORATION', 0x10));
    expect(result.license).toBe('LICENSED BY SNK CORPORATION');
    expect(result.colorMode).toBe('NGPC');
  });

  it('rejects a truncated header', () => {
    expect(() => parseNgpHeader(new ArrayBuffer(63))).toThrow(/truncated/i);
  });

  it('reports invalid license, color mode and title as Unknown', () => {
    const buffer = header('INVALID', 1);
    new Uint8Array(buffer)[36] = 0xff;
    expect(parseNgpHeader(buffer)).toMatchObject({
      license: 'Unknown', colorMode: 'Unknown', title: 'Unknown',
    });
  });
});
