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

function makeEthernetIpv6Packet({ protocol, extensionHeaders = [], ports = [] } = {}) {
  const extensionHeaderLength = extensionHeaders.reduce(
    (total, header) => total + header.length,
    0,
  );
  const payload = new Uint8Array(14 + 40 + extensionHeaderLength + ports.length);
  payload.set([0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187], 0);
  const view = new DataView(payload.buffer);
  view.setUint16(12, 0x86dd, false);
  payload.set([0x60, 0, 0, 0], 14);
  view.setUint16(18, extensionHeaderLength + ports.length, false);
  payload[20] = protocol;
  payload[21] = 64;
  payload.set([32, 1, 13, 184, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 22);
  payload.set([32, 1, 13, 184, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], 38);
  let payloadOffset = 54;
  for (const extensionHeader of extensionHeaders) {
    payload.set(extensionHeader, payloadOffset);
    payloadOffset += extensionHeader.length;
  }
  payload.set(ports, payloadOffset);
  return Array.from(payload);
}

function addVlanTags(packet, vlanTags) {
  const taggedPacket = new Uint8Array(packet.length + vlanTags.length * 4);
  taggedPacket.set(packet.slice(0, 12));
  const view = new DataView(taggedPacket.buffer);
  let tagOffset = 12;
  for (const { etherType, vlanId } of vlanTags) {
    view.setUint16(tagOffset, etherType, false);
    view.setUint16(tagOffset + 2, vlanId, false);
    tagOffset += 4;
  }
  taggedPacket.set(packet.slice(12), tagOffset);
  return Array.from(taggedPacket);
}

function joinBuffers(buffers) {
  const byteLength = buffers.reduce((total, buffer) => total + buffer.byteLength, 0);
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return result.buffer;
}

function makePcapngBlock(type, bodyLength, littleEndian, writeBody) {
  const blockLength = 12 + bodyLength;
  const buffer = new ArrayBuffer(blockLength);
  const view = new DataView(buffer);
  view.setUint32(0, type, littleEndian);
  view.setUint32(4, blockLength, littleEndian);
  writeBody(view);
  view.setUint32(blockLength - 4, blockLength, littleEndian);
  return buffer;
}

function makePcapng({
  littleEndian = true, payload, snaplen = 65535, malformedBlock = false, truncatedBlock = false,
  legacyPacket = false,
} = {}) {
  const section = makePcapngBlock(0x0a0d0d0a, 16, littleEndian, (view) => {
    view.setUint32(8, 0x1a2b3c4d, littleEndian);
    view.setUint16(12, 1, littleEndian);
    view.setUint16(14, 0, littleEndian);
  });
  const networkInterface = makePcapngBlock(1, 8, littleEndian, (view) => {
    view.setUint16(8, 1, littleEndian);
    view.setUint32(12, snaplen, littleEndian);
  });
  const paddedPayloadLength = Math.ceil(payload.length / 4) * 4;
  const packet = makePcapngBlock(
    legacyPacket ? 2 : 6,
    20 + paddedPayloadLength,
    littleEndian,
    (view) => {
      view.setUint32(8, 0, littleEndian);
      view.setUint32(12, 1700000000, littleEndian);
      view.setUint32(16, 123456, littleEndian);
      view.setUint32(20, payload.length, littleEndian);
      view.setUint32(24, payload.length + 4, littleEndian);
      new Uint8Array(view.buffer, 28, payload.length).set(payload);
    },
  );
  if (!malformedBlock && !truncatedBlock) return joinBuffers([section, networkInterface, packet]);

  const malformed = new ArrayBuffer(truncatedBlock ? 8 : 12);
  const malformedView = new DataView(malformed);
  malformedView.setUint32(0, 0x00000005, littleEndian);
  malformedView.setUint32(4, truncatedBlock ? 32 : 12, littleEndian);
  if (!truncatedBlock) malformedView.setUint32(8, 0, littleEndian);
  return joinBuffers([section, networkInterface, malformed, packet]);
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

  it('decodes 802.1Q-tagged Ethernet, IPv4, and TCP headers', () => {
    const result = parsePcap(makePcap({
      payload: addVlanTags(
        makeEthernetIpv4Packet({ protocol: 6, ports: [1, 187, 31, 144] }),
        [{ etherType: 0x8100, vlanId: 42 }],
      ),
    }));
    expect(result.packets[0]).toMatchObject({
      etherType: 0x0800, vlanId: 42, protocolName: 'TCP', sourcePort: 443, destPort: 8080,
    });
  });

  it('decodes 802.1Q-tagged Ethernet, IPv6, and UDP headers', () => {
    const result = parsePcap(makePcap({
      payload: addVlanTags(
        makeEthernetIpv6Packet({ protocol: 17, ports: [0, 53, 207, 8] }),
        [{ etherType: 0x8100, vlanId: 314 }],
      ),
    }));
    expect(result.packets[0]).toMatchObject({
      etherType: 0x86dd, vlanId: 314, protocolName: 'UDP', sourcePort: 53, destPort: 53000,
    });
  });

  it('decodes QinQ-tagged Ethernet, IPv4, and exposes both VLAN IDs', () => {
    const result = parsePcap(makePcap({
      payload: addVlanTags(
        makeEthernetIpv4Packet({ protocol: 6, ports: [1, 187, 31, 144] }),
        [
          { etherType: 0x88a8, vlanId: 100 },
          { etherType: 0x8100, vlanId: 200 },
        ],
      ),
    }));
    expect(result.packets[0]).toMatchObject({
      etherType: 0x0800, outerVlanId: 100, innerVlanId: 200, protocolName: 'TCP',
    });
  });

  it('leaves truncated VLAN-tagged Ethernet frames undecoded', () => {
    const payload = new Uint8Array(16);
    const view = new DataView(payload.buffer);
    view.setUint16(12, 0x8100, false);
    view.setUint16(14, 42, false);
    const result = parsePcap(makePcap({ payload: Array.from(payload) }));
    expect(result.packets).toHaveLength(1);
    expect(result.packets[0]).not.toHaveProperty('etherType');
    expect(result.packets[0]).not.toHaveProperty('vlanId');
  });

  it('leaves unsupported Ethernet packets undecoded', () => {
    const result = parsePcap(makePcap({
      payload: makeEthernetIpv4Packet({ etherType: 0x0806 }),
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

  it('decodes Ethernet, IPv6, and TCP headers', () => {
    const result = parsePcap(makePcap({
      payload: makeEthernetIpv6Packet({ protocol: 6, ports: [1, 187, 31, 144] }),
    }));
    expect(result.packets[0]).toMatchObject({
      destMac: '00:11:22:33:44:55', sourceMac: '66:77:88:99:aa:bb', etherType: 0x86dd,
      sourceIp: '2001:db8::1', destIp: '2001:db8::2', protocol: 6, protocolName: 'TCP',
      payloadLength: 4, sourcePort: 443, destPort: 8080,
    });
  });

  it('labels IPv6 ICMP packets without attempting to decode ports', () => {
    const result = parsePcap(makePcap({
      payload: makeEthernetIpv6Packet({ protocol: 58 }),
    }));
    expect(result.packets[0]).toMatchObject({ protocol: 58, protocolName: 'ICMPv6' });
    expect(result.packets[0]).not.toHaveProperty('sourcePort');
  });

  it('walks a Hop-by-Hop IPv6 extension header before decoding TCP ports', () => {
    const result = parsePcap(makePcap({
      payload: makeEthernetIpv6Packet({
        protocol: 0,
        extensionHeaders: [[6, 0, 0, 0, 0, 0, 0, 0]],
        ports: [1, 187, 31, 144],
      }),
    }));
    expect(result.packets[0]).toMatchObject({
      protocol: 6, protocolName: 'TCP', sourcePort: 443, destPort: 8080,
    });
  });

  it('walks an IPv6 Fragment header before decoding UDP ports', () => {
    const result = parsePcap(makePcap({
      payload: makeEthernetIpv6Packet({
        protocol: 44,
        extensionHeaders: [[17, 0, 0, 0, 0, 0, 0, 0]],
        ports: [0, 53, 207, 8],
      }),
    }));
    expect(result.packets[0]).toMatchObject({
      protocol: 17, protocolName: 'UDP', sourcePort: 53, destPort: 53000,
    });
  });

  it('leaves truncated IPv6 extension header chains undecoded without throwing', () => {
    const result = parsePcap(makePcap({
      payload: makeEthernetIpv6Packet({
        protocol: 0,
        extensionHeaders: [[6, 1, 0, 0, 0, 0, 0, 0]],
      }),
    }));
    expect(result.packets).toHaveLength(1);
    expect(result.packets[0]).not.toHaveProperty('sourceMac');
    expect(result.packets[0]).not.toHaveProperty('sourceIp');
  });

  it('leaves truncated IPv6 headers undecoded while parsing the file', () => {
    const truncatedPayload = makeEthernetIpv6Packet({ protocol: 6 }).slice(0, 30);
    const result = parsePcap(makePcap({ payload: truncatedPayload }));
    expect(result.packets).toHaveLength(1);
    expect(result.packets[0]).not.toHaveProperty('sourceMac');
    expect(result.packets[0]).not.toHaveProperty('sourceIp');
  });

  it('parses little-endian PCAPNG packets and decodes Ethernet, IPv4, and TCP headers', () => {
    const result = parsePcap(makePcapng({
      payload: makeEthernetIpv4Packet({ protocol: 6, ports: [1, 187, 31, 144] }),
    }));
    expect(result).toMatchObject({
      format: 'PCAPNG',
      header: { byteOrder: 'Little-endian', versionMajor: 1, versionMinor: 0 },
      interfaces: [{ index: 0, linkType: 1, linkTypeName: 'Ethernet', snaplen: 65535 }],
    });
    expect(result.packets[0]).toMatchObject({
      interfaceId: 0, timestampSeconds: 1700000000, timestampFraction: 123456,
      sourceIp: '192.0.2.1', destIp: '198.51.100.2', protocolName: 'TCP',
      sourcePort: 443, destPort: 8080,
    });
  });

  it('parses PCAPNG packets and decodes Ethernet, IPv6, and UDP headers', () => {
    const result = parsePcap(makePcapng({
      payload: makeEthernetIpv6Packet({ protocol: 17, ports: [0, 53, 207, 8] }),
    }));
    expect(result.packets[0]).toMatchObject({
      sourceIp: '2001:db8::1', destIp: '2001:db8::2', protocolName: 'UDP',
      payloadLength: 4, sourcePort: 53, destPort: 53000,
    });
  });

  it('parses big-endian PCAPNG packets', () => {
    const result = parsePcap(makePcapng({
      littleEndian: false,
      payload: makeEthernetIpv4Packet({ protocol: 17, ports: [0, 53, 207, 8] }),
    }));
    expect(result.header.byteOrder).toBe('Big-endian');
    expect(result.packets[0]).toMatchObject({
      protocolName: 'UDP', sourcePort: 53, destPort: 53000,
    });
  });

  it('parses legacy PCAPNG Packet Blocks', () => {
    const result = parsePcap(makePcapng({
      legacyPacket: true,
      payload: makeEthernetIpv4Packet({ protocol: 6, ports: [1, 187, 31, 144] }),
    }));
    expect(result.packets[0]).toMatchObject({
      interfaceId: 0, protocolName: 'TCP', sourcePort: 443, destPort: 8080,
    });
  });

  it('isolates malformed PCAPNG blocks and continues with subsequent packets', () => {
    const result = parsePcap(makePcapng({
      malformedBlock: true,
      payload: makeEthernetIpv4Packet({ protocol: 6, ports: [1, 187, 31, 144] }),
    }));
    expect(result.packets).toHaveLength(1);
    expect(result.packets[0].sourceIp).toBe('192.0.2.1');
  });

  it('isolates truncated PCAPNG blocks and continues with subsequent packets', () => {
    const result = parsePcap(makePcapng({
      truncatedBlock: true,
      payload: makeEthernetIpv4Packet({ protocol: 17, ports: [0, 53, 207, 8] }),
    }));
    expect(result.packets).toHaveLength(1);
    expect(result.packets[0].protocolName).toBe('UDP');
  });

  it('limits PCAPNG Ethernet decoding to the interface snaplen', () => {
    const result = parsePcap(makePcapng({
      snaplen: 14,
      payload: makeEthernetIpv4Packet({ protocol: 6, ports: [1, 187, 31, 144] }),
    }));
    expect(result.packets[0]).not.toHaveProperty('sourceIp');
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
