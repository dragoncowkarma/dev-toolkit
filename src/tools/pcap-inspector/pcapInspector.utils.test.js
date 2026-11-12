import { describe, expect, it } from 'vitest';
import {
  MAX_INPUT_BYTES,
  formatPacketTimestamp,
  getLinkTypeName,
  parsePcap,
  parsePcapFile,
} from './pcapInspector.utils.js';

function makePcap({ littleEndian = true, payload = [1, 2, 3], declaredLength = null } = {}) {
  const buffer = new ArrayBuffer(24 + 16 + payload.length);
  const view = new DataView(buffer);
  view.setUint32(0, littleEndian ? 0xd4c3b2a1 : 0xa1b2c3d4, false);
  view.setUint16(4, 2, littleEndian);
  view.setUint16(6, 4, littleEndian);
  view.setInt32(8, -3600, littleEndian);
  view.setUint32(12, 0, littleEndian);
  view.setUint32(16, 65535, littleEndian);
  view.setUint32(20, 1, littleEndian);
  view.setUint32(24, 1700000000, littleEndian);
  view.setUint32(28, 123456, littleEndian);
  view.setUint32(32, declaredLength ?? payload.length, littleEndian);
  view.setUint32(36, payload.length + 4, littleEndian);
  new Uint8Array(buffer, 40).set(payload);
  return buffer;
}

describe('parsePcap', () => {
  it('parses a little-endian classic PCAP global header and packet metadata', () => {
    const result = parsePcap(makePcap());
    expect(result.header).toMatchObject({
      magic: '0xd4c3b2a1', versionMajor: 2, versionMinor: 4, timezoneOffset: -3600,
      snaplen: 65535, linkTypeName: 'Ethernet', byteOrder: 'Little-endian',
    });
    expect(result.packets).toEqual([{
      index: 1, timestampSeconds: 1700000000, timestampFraction: 123456,
      capturedLength: 3, originalLength: 7,
    }]);
  });

  it('parses big-endian classic PCAP files', () => {
    const result = parsePcap(makePcap({ littleEndian: false }));
    expect(result.header.byteOrder).toBe('Big-endian');
    expect(result.packets[0].capturedLength).toBe(3);
  });

  it('rejects PCAPNG distinctly', () => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, 0x0a0d0d0a, false);
    expect(() => parsePcap(buffer)).toThrow(/PCAPNG files are not supported/);
  });

  it('rejects non-PCAP and truncated PCAP input without reading beyond the buffer', () => {
    expect(() => parsePcap(new ArrayBuffer(4))).toThrow(/not a classic PCAP/);
    expect(() => parsePcap(makePcap({ declaredLength: 20 }))).toThrow(/packet payload/);
  });

  it('rejects a truncated global header', () => {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setUint32(0, 0xd4c3b2a1, false);
    expect(() => parsePcap(buffer)).toThrow(/global header/);
  });
});

describe('PCAP display helpers', () => {
  it('resolves common link-layer types and formats both timestamp precisions', () => {
    expect(getLinkTypeName(101)).toBe('Raw IP');
    expect(getLinkTypeName(999)).toBe('Unknown LINKTYPE_999');
    expect(formatPacketTimestamp({ timestampSeconds: 1, timestampFraction: 2 }, 'microseconds'))
      .toBe('1.000002');
    expect(formatPacketTimestamp({ timestampSeconds: 1, timestampFraction: 2 }, 'nanoseconds'))
      .toBe('1.000000002');
  });

  it('rejects oversized files before allocating their buffers', async () => {
    const file = {
      size: MAX_INPUT_BYTES + 1,
      arrayBuffer: () => { throw new Error('must not read'); },
    };
    await expect(parsePcapFile(file)).rejects.toThrow(/too large/);
  });
});
