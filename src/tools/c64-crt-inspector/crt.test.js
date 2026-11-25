import { describe, expect, it } from 'vitest';
import { inspectCrt } from './crt.js';

function cartridge(banks = [0]) {
  const bytes = new Uint8Array(64 + banks.length * 20);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('C64 CARTRIDGE   '));
  view.setUint32(16, 64);
  view.setUint16(20, 0x0100);
  view.setUint16(22, 32);
  bytes[24] = 1;
  bytes.set(new TextEncoder().encode('Example'), 32);
  banks.forEach((bank, index) => {
    const offset = 64 + index * 20;
    bytes.set(new TextEncoder().encode('CHIP'), offset);
    view.setUint32(offset + 4, 20);
    view.setUint16(offset + 10, bank);
    view.setUint16(offset + 12, 0x8000);
    view.setUint16(offset + 14, 4);
  });
  return bytes;
}

const file = (bytes) => new File([bytes], 'test.crt');

describe('CRT inspection', () => {
  it('parses a single CHIP and header', async () => {
    const result = await inspectCrt(file(cartridge()));
    expect(result.warnings).toEqual([]);
    expect(result.header).toMatchObject({ name: 'Example', version: 0x100,
      hardwareName: 'EasyFlash', exrom: 1, game: 0 });
    expect(result.chips[0]).toMatchObject({ typeName: 'ROM', bank: 0,
      address: 0x8000, imageSize: 4, length: 20 });
  });
  it('walks multiple banks', async () => {
    expect((await inspectCrt(file(cartridge([0, 1, 2])))).chips.map((c) => c.bank))
      .toEqual([0, 1, 2]);
  });
  it('warns about an invalid signature', async () => {
    const bytes = cartridge(); bytes[0] = 0;
    expect((await inspectCrt(file(bytes))).warnings.join()).toMatch(/signature/i);
  });
  it('warns about a truncated header', async () => {
    expect((await inspectCrt(file(cartridge().slice(0, 20)))).warnings.join())
      .toMatch(/truncated/i);
  });
  it('stops at a packet extending beyond the file', async () => {
    const bytes = cartridge();
    const view = new DataView(bytes.buffer);
    view.setUint32(68, 40); view.setUint16(78, 24);
    const result = await inspectCrt(file(bytes));
    expect(result.chips).toHaveLength(0);
    expect(result.warnings.join()).toMatch(/exceeds file size/i);
  });
  it('reports unknown hardware without rejecting the file', async () => {
    const bytes = cartridge(); new DataView(bytes.buffer).setUint16(22, 65535);
    const result = await inspectCrt(file(bytes));
    expect(result.header.hardwareName).toBe('Unknown');
    expect(result.chips).toHaveLength(1);
    expect(result.warnings.join()).toMatch(/unknown hardware/i);
  });
  it('warns about inconsistent lengths and trailing bytes', async () => {
    const bytes = cartridge(); new DataView(bytes.buffer).setUint16(78, 3);
    expect((await inspectCrt(file(bytes))).warnings.join()).toMatch(/malformed/i);
    expect((await inspectCrt(file(new Uint8Array([...cartridge(), 1])))).warnings.join())
      .toMatch(/trailing/i);
  });
});
