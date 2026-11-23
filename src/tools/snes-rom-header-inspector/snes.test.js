import { describe, expect, it } from 'vitest';
import { parseSnesHeader } from './snes.utils.js';

function rom(mapping = 'LoROM', copier = false) {
  const bytes = new Uint8Array(0x10000 + (copier ? 512 : 0));
  const offset = (mapping === 'LoROM' ? 0x7fc0 : 0xffc0) + (copier ? 512 : 0);
  bytes.set(new TextEncoder().encode('TEST GAME            '), offset);
  bytes.set([mapping === 'LoROM' ? 0x20 : 0x21, 2, 10, 3, 1, 0x33, 1,
    0xcb, 0xed, 0x34, 0x12], offset + 21);
  return bytes;
}

describe('parseSnesHeader', () => {
  it('parses LoROM fields', () => {
    expect(parseSnesHeader(rom())).toMatchObject({ mapping: 'LoROM', title: 'TEST GAME',
      mapMode: '0x20', romType: '0x02', romSize: '1 MiB', ramSize: '8 KiB',
      destination: 'North America (0x01)', developerId: '0x33', version: '0x01',
      complement: '0xEDCB', checksum: '0x1234', checksumValid: true });
  });
  it('selects HiROM by scoring', () => {
    expect(parseSnesHeader(rom('HiROM'))).toMatchObject({ mapping: 'HiROM', mapMode: '0x21' });
  });
  it('accounts for a copier header', () => {
    expect(parseSnesHeader(rom('HiROM', true))).toMatchObject({
      mapping: 'HiROM', copierHeader: true, headerOffset: '0x101C0',
    });
  });
  it('reports a bad checksum complement', () => {
    const bytes = rom();
    bytes[0x7fde] = 0;
    expect(parseSnesHeader(bytes).checksumValid).toBe(false);
  });
  it('rejects truncated input', () => {
    expect(() => parseSnesHeader(new Uint8Array(0x7fdf))).toThrow(/too small/);
  });
});
