import { describe, expect, it } from 'vitest';
import { parseElf } from './elf-header-inspector.utils.js';

function makeElf({ is64, littleEndian }) {
  const bytes = new Uint8Array(600);
  const view = new DataView(bytes.buffer);
  const set16 = (offset, value) => view.setUint16(offset, value, littleEndian);
  const set32 = (offset, value) => view.setUint32(offset, value, littleEndian);
  const set64 = (offset, value) => view.setBigUint64(offset, BigInt(value), littleEndian);
  const width = is64 ? 8 : 4;
  const headerSize = is64 ? 64 : 52;
  const programSize = is64 ? 56 : 32;
  const sectionSize = is64 ? 64 : 40;
  const programOffset = headerSize;
  const sectionOffset = 320;
  const stringOffset = 256;
  const writeWord = (offset, value) => (is64 ? set64(offset, value) : set32(offset, value));

  bytes.set([0x7f, 0x45, 0x4c, 0x46, is64 ? 2 : 1, littleEndian ? 1 : 2, 1, 0, 0]);
  set16(16, 2);
  set16(18, is64 ? 62 : 3);
  set32(20, 1);
  writeWord(24, 0x401000);
  writeWord(24 + width, programOffset);
  writeWord(24 + width * 2, sectionOffset);
  set32(24 + width * 3, 0);
  set16(28 + width * 3, headerSize);
  set16(30 + width * 3, programSize);
  set16(32 + width * 3, 1);
  set16(34 + width * 3, sectionSize);
  set16(36 + width * 3, 3);
  set16(38 + width * 3, 1);

  set32(programOffset, 1);
  if (is64) set32(programOffset + 4, 5);
  writeWord(programOffset + (is64 ? 8 : 4), 0);
  writeWord(programOffset + (is64 ? 16 : 8), 0x401000);
  writeWord(programOffset + (is64 ? 24 : 12), 0x401000);
  writeWord(programOffset + (is64 ? 32 : 16), 32);
  writeWord(programOffset + (is64 ? 40 : 20), 32);
  if (!is64) set32(programOffset + 24, 5);
  writeWord(programOffset + (is64 ? 48 : 28), 0x1000);

  bytes.set(new TextEncoder().encode('\0.shstrtab\0.text\0'), stringOffset);
  const sectionOne = sectionOffset + sectionSize;
  set32(sectionOne, 1);
  set32(sectionOne + 4, 3);
  writeWord(sectionOne + 8, 0);
  writeWord(sectionOne + (is64 ? 24 : 16), stringOffset);
  writeWord(sectionOne + (is64 ? 32 : 20), 16);
  writeWord(sectionOne + (is64 ? 48 : 32), 1);
  const sectionTwo = sectionOne + sectionSize;
  set32(sectionTwo, 11);
  set32(sectionTwo + 4, 1);
  writeWord(sectionTwo + 8, 6);
  writeWord(sectionTwo + (is64 ? 16 : 12), 0x401000);
  writeWord(sectionTwo + (is64 ? 24 : 16), 0x100);
  writeWord(sectionTwo + (is64 ? 32 : 20), 32);
  writeWord(sectionTwo + (is64 ? 48 : 32), 16);
  return bytes;
}

describe('parseElf', () => {
  it.each([
    [false, true, 'ELF32', 'Little endian'],
    [false, false, 'ELF32', 'Big endian'],
    [true, true, 'ELF64', 'Little endian'],
    [true, false, 'ELF64', 'Big endian'],
  ])('parses %s-bit %s ELF headers', (is64, littleEndian, elfClass, data) => {
    const result = parseElf(makeElf({ is64, littleEndian }));

    expect(result.identification.class).toBe(elfClass);
    expect(result.identification.data).toBe(data);
    expect(result.header.type).toMatch(/^ET_EXEC/);
    expect(result.programHeaders[0].type).toMatch(/^PT_LOAD/);
    expect(result.sectionHeaders[1].name).toBe('.shstrtab');
    expect(result.sectionHeaders[2].name).toBe('.text');
  });

  it('reports a path-qualified warning for truncated input', () => {
    expect(parseElf(new Uint8Array([0x7f, 0x45])).warnings[0]).toMatch(/^ELF identification:/);
  });

  it('reports a path-qualified warning for invalid magic', () => {
    const bytes = new Uint8Array(16);
    expect(parseElf(bytes).warnings[0]).toMatch(/^ELF identification\.magic:/);
  });

  it('reports an out-of-range section name table as a warning', () => {
    const bytes = makeElf({ is64: true, littleEndian: true });
    new DataView(bytes.buffer).setUint16(62, 5, true);
    expect(parseElf(bytes).warnings[0]).toMatch(/^ELF header\.e_shstrndx:/);
  });
});
