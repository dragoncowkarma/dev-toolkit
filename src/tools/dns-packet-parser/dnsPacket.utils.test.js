import { describe, expect, it } from 'vitest';
import {
  decodeDnsName,
  decodePacketInput,
  parseDnsPacket,
  parseDnsPacketInput,
} from './dnsPacket.utils.js';

const QUERY = '1a2b01000001000000000000076578616d706c6503636f6d0000010001';
const QUESTION = QUERY.slice(24);
const RESPONSE = `1a2b81800001000100000000${QUESTION}c00c000100010000012c00045db8d822`;

function packetWithAnswer(type, rdataHex, owner = 'c00c') {
  const rdLength = (rdataHex.length / 2).toString(16).padStart(4, '0');
  const recordType = type.toString(16).padStart(4, '0');
  return (
    `1a2b81800001000100000000${QUESTION}${owner}${recordType}` +
    `00010000003c${rdLength}${rdataHex}`
  );
}

describe('parseDnsPacket', () => {
  it('parses a header, question, and compressed A answer', () => {
    const packet = parseDnsPacketInput(RESPONSE, 'hex');

    expect(packet.header).toMatchObject({ id: 0x1a2b, questionCount: 1, answerCount: 1 });
    expect(packet.header.flags).toMatchObject({
      qr: true,
      rd: true,
      ra: true,
      rcodeName: 'NOERROR',
    });
    expect(packet.questions[0]).toMatchObject({
      name: 'example.com',
      typeName: 'A',
      className: 'IN',
    });
    expect(packet.answers[0]).toMatchObject({
      name: 'example.com',
      data: '93.184.216.34',
      ttl: 300,
    });
  });

  it('decodes RFC 1035 flags including NXDOMAIN', () => {
    const packet = parseDnsPacketInput(`1a2b81830001000000000000${QUESTION}`, 'hex');
    expect(packet.header.flags).toMatchObject({
      qr: true,
      rd: true,
      ra: true,
      rcode: 3,
      rcodeName: 'NXDOMAIN',
    });
  });

  it('decodes every header flag field', () => {
    const packet = parseDnsPacketInput('1a2b97d50000000000000000', 'hex');

    expect(packet.header.flags).toMatchObject({
      qr: true,
      opcode: 2,
      aa: true,
      tc: true,
      rd: true,
      ra: true,
      z: 5,
      rcode: 5,
      rcodeName: 'REFUSED',
    });
  });

  it('parses AAAA, CNAME, MX, and TXT records', () => {
    const aaaa = parseDnsPacketInput(
      packetWithAnswer(28, '20010db8000000000000000000000001'),
      'hex',
    );
    const cname = parseDnsPacketInput(packetWithAnswer(5, '0363646ec00c'), 'hex');
    const mx = parseDnsPacketInput(packetWithAnswer(15, '000a046d61696cc00c'), 'hex');
    const txt = parseDnsPacketInput(packetWithAnswer(16, '0568656c6c6f05776f726c64'), 'hex');

    expect(aaaa.answers[0].data).toBe('2001:db8::1');
    expect(cname.answers[0].data).toBe('cdn.example.com');
    expect(mx.answers[0].data).toEqual({ preference: 10, exchange: 'mail.example.com' });
    expect(txt.answers[0].data).toEqual(['hello', 'world']);
  });

  it('parses an SOA record with compressed names and numeric fields', () => {
    const data = '036e7331c00c0a686f73746d6173746572c00c0000000100000002000000030000000400000005';
    const answer = parseDnsPacketInput(packetWithAnswer(6, data), 'hex').answers[0];
    expect(answer.data).toMatchObject({
      primaryNameserver: 'ns1.example.com',
      serial: 1,
      minimum: 5,
    });
  });

  it('keeps Answer, Authority, and Additional records in their DNS sections', () => {
    const answer = 'c00c000100010000003c00045db8d822';
    const authority = 'c00c000200010000003c0002c00c';
    const additional = 'c00c000100010000003c0004c0000201';
    const packet = parseDnsPacketInput(
      `1a2b81800001000100010001${QUESTION}${answer}${authority}${additional}`,
      'hex',
    );

    expect(packet.answers[0].data).toBe('93.184.216.34');
    expect(packet.authorities[0]).toMatchObject({ typeName: 'NS', data: 'example.com' });
    expect(packet.additionals[0].data).toBe('192.0.2.1');
  });

  it('rejects malformed input and truncated messages', () => {
    expect(() => decodePacketInput('0xz', 'hex')).toThrow(/hex input/);
    expect(() => decodePacketInput('abc', 'base64')).toThrow(/Base64 input/);
    expect(() => parseDnsPacketInput('0001', 'hex')).toThrow(/truncated DNS header/);
    expect(() => parseDnsPacket(new Uint8Array(12))).not.toThrow();
  });

  it('accepts Base64 packet bytes and rejects out-of-range pointers', () => {
    const binary = String.fromCharCode(...decodePacketInput(QUERY, 'hex'));
    expect(parseDnsPacketInput(btoa(binary), 'base64').questions[0].name).toBe('example.com');
    const invalidPointer = '000001000001000000000000c0ff00010001';
    expect(() => parseDnsPacketInput(invalidPointer, 'hex')).toThrow(/points outside/);
  });
});

describe('decodeDnsName', () => {
  it('follows a compression pointer and preserves the post-pointer offset', () => {
    const bytes = decodePacketInput(`${QUERY}c00c`, 'hex');
    expect(decodeDnsName(bytes, QUERY.length / 2)).toEqual({
      value: 'example.com',
      nextOffset: QUERY.length / 2 + 2,
    });
  });

  it('guards against circular compression pointers', () => {
    const circular = decodePacketInput('000001000001000000000000c00c00010001', 'hex');
    expect(() => parseDnsPacket(circular)).toThrow(/circular compression pointer/);
  });
});
