import { describe, expect, it } from 'vitest';
import { parseNesRomHeader } from './nesRom.utils.js';

function romHeader(overrides = {}, payloadSize = 0) {
  const header = new Uint8Array(16 + payloadSize);
  header.set([0x4e, 0x45, 0x53, 0x1a]);
  Object.entries(overrides).forEach(([index, value]) => {
    header[Number(index)] = value;
  });
  return header;
}

describe('parseNesRomHeader', () => {
  it('parses a valid minimal iNES header', () => {
    const result = parseNesRomHeader(romHeader());

    expect(result).toMatchObject({
      format: 'iNES 1.0',
      prgRomSize: 0,
      chrRomSize: 0,
      mapperNumber: 0,
      mirroring: 'Horizontal',
      consoleType: 'NES/Famicom',
    });
  });

  it('parses NES 2.0 extended metadata', () => {
    const result = parseNesRomHeader(romHeader({ 7: 0x08, 8: 0x30, 10: 0x21, 11: 0x43, 12: 0x03 }));

    expect(result).toMatchObject({
      format: 'NES 2.0',
      submapper: 3,
      prgRamSize: 128,
      prgNvramSize: 256,
      chrRamSize: 512,
      chrNvramSize: 1024,
      cpuPpuTiming: 'Dendy',
    });
  });

  it('rejects a file without the iNES magic signature', () => {
    expect(() => parseNesRomHeader(new Uint8Array(16))).toThrow(/magic signature/);
  });

  it('rejects a truncated header', () => {
    expect(() => parseNesRomHeader(new Uint8Array(15))).toThrow(/requires at least 16 bytes/);
  });

  it('rejects a truncated trainer', () => {
    expect(() => parseNesRomHeader(romHeader({ 6: 0x04 }))).toThrow(/trainer flag/);
  });

  it('rejects a ROM whose actual length differs from declared PRG-ROM size', () => {
    expect(() => parseNesRomHeader(romHeader({ 4: 1 }))).toThrow(/size does not match/);
  });

  it('assembles mapper bits for iNES and NES 2.0 headers', () => {
    expect(parseNesRomHeader(romHeader({ 6: 0xc0, 7: 0xa0 })).mapperNumber).toBe(0xac);
    expect(parseNesRomHeader(romHeader({ 6: 0xc0, 7: 0xb8, 8: 0x3a })).mapperNumber)
      .toBe(0xabc);
  });
});
