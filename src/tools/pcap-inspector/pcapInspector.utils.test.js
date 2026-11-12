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

function makeEthernetIpv4Packet({ protocol, ports = [], etherType = 0x0800 } = {}) {
  const payload = new Uint8Array(14 + 20 + ports.length);
  payload.set([0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187], 0);
  new DataView(payload.buffer).setUint16(12, etherType, false);
  if (etherType !== 0x0800) return Array.from(payload);

  payload.set([0x45, 0, 0, payload.length - 14, 0, 0, 0, 0, 64, protocol, 0, 0], 14);
  payload.set([192, 0, 2, 1, 198, 51, 100, 2], 26);
  payload.set(ports, 34);
  return Array.from(payload);
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

  it('decodes Ethernet, IPv4, and TCP headers', () => {
    const result = parsePcap(makePcap({
      payload: makeEthernetIpv4Packet({ protocol: 6, ports: [1, 187, 31, 144] }),
    }));
    expect(result.packets[0]).toMatchObject({
      destMac: '00:11:22:33:44:55', sourceMac: '66:77:88:99:aa:bb', etherType: 0x0800,
      sourceIp: '192.0.2.1', destIp: '198.51.100.2', protocol: 6, protocolName: 'TCP',
      totalLength: 24, sourcePort: 443, destPort: 8080,
    });
  });

  it('decodes Ethernet, IPv4, and UDP headers', () => {
    const result = parsePcap(makePcap({
      payload: makeEthernetIpv4Packet({ protocol: 17, ports: [0, 53, 207, 8] }),
    }));
    expect(result.packets[0]).toMatchObject({
      protocol: 17, protocolName: 'UDP', sourcePort: 53, destPort: 53000,
    });
  });

  it('leaves non-IPv4 Ethernet packets undecoded', () => {
    const result = parsePcap(makePcap({
      payload: makeEthernetIpv4Packet({ etherType: 0x86dd }),
    }));
    expect(result.packets[0]).not.toHaveProperty('etherType');
    expect(result.packets[0]).not.toHaveProperty('sourceIp');
  });

  it('leaves a truncated inner header undecoded while parsing the file', () => {
    const truncatedPayload = makeEthernetIpv4Packet({ protocol: 6 }).slice(0, 20);
    const result = parsePcap(makePcap({ payload: truncatedPayload }));
    expect(result.packets).toHaveLength(1);
    expect(result.packets[0]).not.toHaveProperty('sourceMac');
    expect(result.packets[0]).not.toHaveProperty('sourceIp');
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
