import { describe, expect, it } from 'vitest';
import { decodeBase64, decodeHex, parseDer, resolveOid } from './asn1.utils.js';

describe('ASN.1 DER parser', () => {
  it('parses a BOOLEAN TLV with its decoded value', () => {
    const [node] = parseDer(decodeHex('01 01 ff'));
    expect(node).toMatchObject({
      tagClass: 'Universal',
      tagName: 'BOOLEAN',
      tagNumber: '1',
      constructed: false,
      length: 1,
      value: 'true',
    });
  });

  it('parses nested SEQUENCE and SET nodes recursively', () => {
    const [sequence] = parseDer(decodeHex('30 07 31 05 02 01 2a 05 00'));
    expect(sequence.tagName).toBe('SEQUENCE');
    expect(sequence.constructed).toBe(true);
    expect(sequence.children[0].tagName).toBe('SET');
    expect(sequence.children[0].children[0].value).toBe('42');
    expect(sequence.children[0].children[1].value).toBe('NULL');
  });

  it('decodes and resolves a known object identifier', () => {
    const [node] = parseDer(decodeHex('06 03 55 04 03'));
    expect(node.value).toBe('2.5.4.3 (commonName)');
    expect(resolveOid('1.2.840.113549.1.1.11')).toBe('sha256WithRSAEncryption');
  });

  it('accepts Base64 source bytes', () => {
    const [node] = parseDer(decodeBase64('MAMCAQE='));
    expect(node.children[0].value).toBe('1');
  });

  it('decodes common primitive universal values', () => {
    const nodes = parseDer(
      decodeHex(
        '03 02 04 a0 04 02 ca fe 0c 02 68 69 13 02 41 5a 17 0d 3236313032373132333435365a ' +
          '18 0f 32303236313032373132333435365a'
      )
    );

    expect(nodes[0].value).toContain('4 unused bit(s)');
    expect(nodes[1].value).toBe('2 byte(s): ca fe');
    expect(nodes[2].value).toBe('hi');
    expect(nodes[3].value).toBe('AZ');
    expect(nodes[4].value).toBe('261027123456Z');
    expect(nodes[5].value).toBe('20261027123456Z');
  });

  it('reports malformed and truncated input clearly', () => {
    expect(() => parseDer(decodeHex('30 03 02 01'))).toThrow(/truncated/i);
    expect(() => parseDer(decodeHex('02 80'))).toThrow(/Indefinite length/i);
    expect(() => parseDer(decodeHex('01 01 01'))).toThrow(/00 or ff/i);
    expect(() => parseDer(decodeHex('02 02 00 01'))).toThrow(/minimally/i);
    expect(() => parseDer(decodeHex('30 00'))).not.toThrow();
    expect(() => parseDer(decodeHex('10 00'))).toThrow(/constructed/i);
    expect(() => decodeHex('0')).toThrow(/even number/i);
  });
});
